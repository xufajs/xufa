// Compiles the descriptions of queries (lib/query.js) to MongoDB: filter documents and aggregation pipelines. The
// foreign keys a query follows are $lookup stages (with $unwind), whose documents are under `__<name>`
// (`__author.__publisher` for chains). The primary key is always `_id`.
//
// It keeps the semantics of the SQL backends: lookups compare values of their type only, NOT of a condition on a null
// is true ($nor), nulls sort first, json fields are compared as wholes, and missing fields are nulls.
const { collectJoins, eachLeaf, eachExists, hasExists, lastOf, likeToRegex } = require('../../query');
const { QueryError } = require('../../errors');

const COMPARISONS = { exact: '$eq', gt: '$gt', gte: '$gte', lt: '$lt', lte: '$lte' };
const ARITHMETIC = { '+': '$add', '-': '$subtract', '*': '$multiply', '/': '$divide' };
// The BSON types of the values of every type of field, so unique indexes ignore nulls as SQL does.
const BSON_TYPES = {
  id: 'objectId',
  string: 'string',
  text: 'string',
  uuid: 'string',
  integer: 'number',
  float: 'number',
  bigint: 'number',
  decimal: 'decimal',
  date: 'string',
  bytes: 'binData',
  boolean: 'bool',
  datetime: 'date',
};

const JSON_VALUE = { dbType: 'jsonValue' };

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function column(field) {
  return field.primaryKey ? '_id' : field.column;
}

// The prefix of the documents joined by a chain of foreign keys: '__author.__publisher.'.
function prefix(chain) {
  return chain.map((field) => `__${field.name}.`).join('');
}

function path(fields) {
  return `${prefix(fields.slice(0, -1))}${column(lastOf(fields))}`;
}

class MongoCompiler {
  // encode(field, value) gives the value stored for a field (ObjectIds for keys...).
  constructor(encode) {
    this.encode = encode;
    // The fields of the $lookup stages of the conditions across reverse relations, by their node.
    this.existsNames = new WeakMap();
    this.existsCount = 0;
  }

  // $lookup stages for the conditions across reverse relations: the related documents whose foreign key is the key of
  // the document and that match (one is enough), in a field the filter then checks (MongoDB 5.0 or later).
  existsLookups(where) {
    const stages = [];
    eachExists(where, (node) => {
      const { through, relation } = node;
      this.existsCount += 1;
      const name = `__e${this.existsCount}`;
      this.existsNames.set(node, name);
      const sub = { meta: relation.model.meta, where: node.where, orderBy: [], values: null, related: [] };
      const pipeline = [
        ...this.match(sub, { withOrder: false, withSlice: false }),
        { $limit: 1 },
        { $project: { _id: 1 } },
      ];
      stages.push({
        $lookup: {
          from: relation.model.meta.key,
          localField: `${prefix(through)}${column(relation.targetField)}`,
          foreignField: column(relation),
          pipeline,
          as: name,
        },
      });
    });
    return stages;
  }

  expression(value, field) {
    if (value && value.kind === 'F') {
      let result = `$${path(value.fields)}`;
      value.ops.forEach(({ op, value: operand }) => {
        result = { [ARITHMETIC[op]]: [result, this.expression(operand, field)] };
      });
      return result;
    }
    return { $literal: field ? this.encode(field, value) : value };
  }

  filter(node) {
    if (!node) return {};
    if (node.op === 'raw') throw new Error('Fragments of SQL (Raw) are not supported by the mongodb backend');
    if (node.op === 'and') return { $and: node.children.map((child) => this.filter(child)) };
    if (node.op === 'or') return { $or: node.children.map((child) => this.filter(child)) };
    if (node.op === 'not') return { $nor: [this.filter(node.children[0])] };
    if (node.op === 'exists') return { [this.existsNames.get(node)]: { $ne: [] } };
    return this.leaf(node);
  }

  leaf({ fields, lookup, value, path: jsonPath }) {
    // A value inside json values is compared as it is.
    const field = jsonPath ? JSON_VALUE : lastOf(fields);
    // MongoDB reads dots as steps of a path and $ as operators: keys with them cannot be reached by a path.
    if (
      jsonPath &&
      jsonPath.some((step) => String(step).includes('.') || String(step).startsWith('$') || step === '')
    ) {
      throw new QueryError(`MongoDB cannot compare keys of json with dots or $, or empty: ${JSON.stringify(jsonPath)}`);
    }
    const key = jsonPath ? `${path(fields)}.${jsonPath.join('.')}` : path(fields);
    const regex = (pattern, insensitive) => ({ [key]: { $regex: pattern, $options: insensitive ? 'i' : '' } });
    if (value && value.kind === 'F') {
      // Comparisons of expressions order null before every value: both sides must have one.
      const other = this.expression(value, field);
      return {
        $expr: {
          $and: [{ $gt: [`$${key}`, null] }, { $gt: [other, null] }, { [COMPARISONS[lookup]]: [`$${key}`, other] }],
        },
      };
    }
    switch (lookup) {
      case 'exact':
        // Arrays and documents are equal as wholes (a filter on an array would match its elements).
        if (
          ['json', 'array', 'geometry', 'hstore'].includes(field.dbType) &&
          value !== null &&
          typeof value === 'object'
        ) {
          return { $expr: { $eq: [`$${key}`, { $literal: this.encode(field, value) }] } };
        }
        return { [key]: { $eq: this.encode(field, value) } };
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return { [key]: { [COMPARISONS[lookup]]: this.encode(field, value) } };
      case 'isnull':
        // Of arrays (and json values) as wholes: { key: null } would match arrays with a null element.
        if (['json', 'array', 'geometry', 'hstore'].includes(field.dbType)) {
          const missing = { $eq: [{ $ifNull: [`$${key}`, null] }, null] };
          return { $expr: value ? missing : { $not: [missing] } };
        }
        return value ? { [key]: null } : { [key]: { $ne: null } };
      case 'in':
        return { [key]: { $in: value.map((item) => this.encode(field, item)) } };
      case 'range':
        return { [key]: { $gte: this.encode(field, value[0]), $lte: this.encode(field, value[1]) } };
      case 'iexact':
        return regex(`^${escapeRegex(value)}$`, true);
      case 'contains':
      case 'icontains':
        return value === '' ? { [key]: { $ne: null } } : regex(escapeRegex(value), lookup === 'icontains');
      case 'startswith':
      case 'istartswith':
        return regex(`^${escapeRegex(value)}`, lookup === 'istartswith');
      case 'endswith':
      case 'iendswith':
        return regex(`${escapeRegex(value)}$`, lookup === 'iendswith');
      case 'like':
      case 'ilike':
        return regex(likeToRegex(value), lookup === 'ilike');
      case 'regex':
      case 'iregex':
        return regex(value, lookup === 'iregex');
      default:
        throw new Error(`Unknown lookup ${lookup}`);
    }
  }

  lookups(chains) {
    const stages = [];
    chains.forEach((chain) => {
      const field = lastOf(chain);
      const parent = prefix(chain.slice(0, -1));
      const as = `${parent}__${field.name}`;
      stages.push({
        $lookup: {
          from: field.target.meta.table,
          localField: `${parent}${field.column}`,
          foreignField: column(field.targetField),
          as,
        },
      });
      stages.push({ $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } });
    });
    return stages;
  }

  // The stages that select the documents of a query: the $lookup stages its conditions and order need come first;
  // those only selectRelated needs, after $limit.
  match(query, { withOrder = true, withSlice = true } = {}) {
    const needed = collectJoins({ where: query.where, orderBy: withOrder ? query.orderBy : [], values: query.values });
    const all = collectJoins(query);
    const stages = this.lookups(needed);
    stages.push(...this.existsLookups(query.where));
    if (query.where) stages.push({ $match: this.filter(query.where) });
    if (withOrder && query.orderBy && query.orderBy.length) {
      const sort = {};
      query.orderBy.forEach(({ fields, desc, jsonPath }) => {
        sort[jsonPath ? `${path(fields)}.${jsonPath.join('.')}` : path(fields)] = desc ? -1 : 1;
      });
      stages.push({ $sort: sort });
    }
    if (withSlice && query.offset) stages.push({ $skip: query.offset });
    if (withSlice && query.limit !== null && query.limit !== undefined) stages.push({ $limit: query.limit });
    const neededKeys = new Set(needed.map((chain) => prefix(chain)));
    stages.push(...this.lookups(all.filter((chain) => !neededKeys.has(prefix(chain)))));
    return stages;
  }

  // The pipeline of a select, and how to make the rows of the backend from its documents.
  select(query, decode) {
    const pipeline = this.match(query);
    if (query.values) {
      const project = { _id: 0 };
      query.values.forEach(({ fields, jsonPath }, i) => {
        project[`v${i}`] = `$${path(fields)}${jsonPath ? `.${jsonPath.join('.')}` : ''}`;
      });
      pipeline.push({ $project: project });
      const toRow = (doc) => {
        const row = {};
        query.values.forEach(({ key, fields, jsonPath }, i) => {
          const value = doc[`v${i}`];
          row[key] = jsonPath ? (value === undefined ? null : value) : decode(lastOf(fields), value);
        });
        return row;
      };
      return { pipeline, toRow };
    }
    if (query.only) {
      const project = {};
      query.only.forEach((field) => {
        project[column(field)] = 1;
      });
      query.related
        .filter((chain) => chain.length === 1)
        .forEach(([field]) => {
          project[`__${field.name}`] = 1;
        });
      pipeline.push({ $project: project });
    }
    const children = (chain) =>
      query.related.filter(
        (other) => other.length === chain.length + 1 && chain.every((field, i) => other[i] === field)
      );
    const toRow = (doc, meta = query.meta, chain = []) => {
      const row = {};
      const fields = chain.length === 0 && query.only ? query.only : meta.fields;
      fields.forEach((field) => {
        row[field.attname] = decode(field, doc[column(field)]);
      });
      children(chain).forEach((next) => {
        const field = lastOf(next);
        const related = doc[`__${field.name}`];
        row[`$${field.name}`] = related ? toRow(related, field.target.meta, next) : null;
      });
      return row;
    };
    return { pipeline, toRow: (doc) => toRow(doc) };
  }

  count(query) {
    return [...this.match({ ...query, related: [] }, { withOrder: false }), { $count: 'n' }];
  }

  aggregate(query, aggregates, groupBy) {
    const aggregated = aggregates.filter((item) => item.fields).map((item) => item.fields);
    const pipeline = this.lookups(collectJoins({ where: query.where, values: groupBy || [] }, aggregated));
    pipeline.push(...this.existsLookups(query.where));
    if (query.where) pipeline.push({ $match: this.filter(query.where) });
    const group = { _id: null };
    if (groupBy && groupBy.length) {
      group._id = {};
      groupBy.forEach(({ fields }, i) => {
        // Missing fields are grouped with nulls.
        group._id[`g${i}`] = { $ifNull: [`$${path(fields)}`, null] };
      });
    }
    aggregates.forEach((item, i) => {
      const value = item.fields ? `$${path(item.fields)}` : null;
      const present = { $cond: [{ $gt: [value, null] }, 1, 0] };
      if (!item.fields) group[`a${i}`] = { $sum: 1 };
      else if (item.fn === 'count' && item.distinct) group[`a${i}`] = { $addToSet: value };
      else if (item.fn === 'count') group[`a${i}`] = { $sum: present };
      else if (item.distinct) group[`a${i}`] = { $addToSet: value };
      else {
        group[`a${i}`] = { [`$${item.fn}`]: value };
        // The number of values, so a sum of no values is null as in SQL.
        if (item.fn === 'sum') group[`n${i}`] = { $sum: present };
      }
    });
    pipeline.push({ $group: group });
    if (query.groupOrder && query.groupOrder.length) {
      const sort = {};
      query.groupOrder.forEach(({ key, desc }) => {
        const index = (groupBy || []).findIndex((item) => item.key === key);
        sort[index === -1 ? `a${aggregates.findIndex((item) => item.key === key)}` : `_id.g${index}`] = desc ? -1 : 1;
      });
      pipeline.push({ $sort: sort });
    }
    if (query.offset) pipeline.push({ $skip: query.offset });
    if (query.limit !== null && query.limit !== undefined) pipeline.push({ $limit: query.limit });
    return pipeline;
  }

  // The filter of an update or a delete, or null when its conditions follow relations (the backend selects the keys).
  writeFilter(query) {
    let joins = false;
    eachLeaf(query.where, (leaf) => {
      if (leaf.fields.length > 1 || (leaf.value && leaf.value.kind === 'F' && leaf.value.fields.length > 1))
        joins = true;
    });
    return joins || hasExists(query.where) ? null : this.filter(query.where);
  }

  // The update document: $set, or a pipeline when values are F expressions.
  update(assignments) {
    if (assignments.some(({ value }) => value && value.kind === 'F')) {
      const set = {};
      assignments.forEach(({ field, value }) => {
        set[column(field)] = this.expression(value, field);
      });
      return [{ $set: set }];
    }
    const set = {};
    assignments.forEach(({ field, value }) => {
      set[column(field)] = this.encode(field, value);
    });
    return { $set: set };
  }

  // The indexes of the schema of a table (schema.js): unique indexes of one column ignore nulls (partial), as unique
  // columns in SQL.
  indexesOf(spec) {
    const columnOf = (name) => (spec.columns[name] && spec.columns[name].primaryKey ? '_id' : name);
    return spec.indexes.map((index) => {
      const key = {};
      index.columns.forEach((name) => {
        key[columnOf(name)] = 1;
      });
      const options = { name: index.name };
      // TTL indexes: MongoDB deletes the documents that expired (its monitor runs every minute).
      if (index.expireAfter !== undefined) options.expireAfterSeconds = index.expireAfter;
      if (index.unique) {
        options.unique = true;
        const type =
          index.columns.length === 1 &&
          spec.columns[index.columns[0]] &&
          BSON_TYPES[spec.columns[index.columns[0]].type];
        if (type) options.partialFilterExpression = { [columnOf(index.columns[0])]: { $type: type } };
      }
      return { key, options };
    });
  }
}

module.exports = { MongoCompiler, column, path, escapeRegex };
