// The associations of Sequelize: belongsTo, hasOne, hasMany and belongsToMany, with their foreign keys (added to the
// attributes of the model that has them, named as Sequelize names them: AuthorId, or author_id when underscored) and
// the accessors of the instances (getAuthor, setAuthor, getBooks, addBook, countBooks...).
const { Op } = require('./operators');
const { normalizeType } = require('./data-types');
const { AssociationError } = require('./errors');
const { pluralize, singularize, upperFirst, camelize, underscore, isPlainObject } = require('./utils');

const ON_DELETE = { CASCADE: 'cascade', 'SET NULL': 'setNull', RESTRICT: 'restrict', 'NO ACTION': 'noAction' };

// The options of a foreign key: a name, or { name, field, allowNull, ... }.
function foreignKeyOption(option) {
  if (!option) return {};
  if (typeof option === 'string') return { name: option };
  return { ...option, name: option.name || option.fieldName };
}

function nameOf(model, as, plural) {
  if (as) {
    if (typeof as === 'object')
      return { singular: as.singular, plural: as.plural, as: plural ? as.plural : as.singular };
    return { singular: plural ? singularize(as) : as, plural: plural ? as : pluralize(as), as };
  }
  const { singular, plural: plurals } = model.options.name;
  return { singular, plural: plurals, as: plural ? plurals : singular };
}

// The key a model of `owner` points with: [name, primary key] camelized (AuthorId), or underscored.
// As Sequelize 6: keys are camelCase attributes (underscored models underscore their fields only).
function defaultKey(name, pk) {
  return camelize(`${name}_${pk}`);
}

class Association {
  constructor(source, target, options) {
    this.source = source;
    this.target = target;
    this.options = options;
    this.scope = options.scope;
    this.isSelfAssociation = source === target;
    this.isAliased = Boolean(options.as);
  }

  // Adds the foreign key attribute to `model` (unless it has it) and records it for the schema.
  addForeignKey(model, other, key, options, extra = {}) {
    // A model in use gets the key when it is built again (before the next query).
    // Built again: the model, or (for a copy in a schema) the models of its attributes (its base, its copies).
    const base = model.xufaBase || model;
    if (model.xufaBuilt || base.xufaBuilt) model.sequelize.xufaRebuild(model.xufaBuilt ? model : base);
    const existing = model.rawAttributes[key.name];
    const allowNull = key.allowNull !== undefined ? key.allowNull : existing ? existing.allowNull !== false : true;
    // As Sequelize: SET NULL when the key can be null, else NO ACTION (belongsTo) or CASCADE (the others).
    const onDelete = options.onDelete || (allowNull ? 'SET NULL' : extra.notNullOnDelete || 'CASCADE');
    // And CASCADE when the key it points to changes.
    const onUpdate = options.onUpdate || (existing && existing.onUpdate) || 'CASCADE';
    // The key holds the primary key of the other model, or the attribute given (targetKey, sourceKey).
    const toField = extra.toField && extra.toField !== other.primaryKeyAttribute ? extra.toField : undefined;
    if (toField && !other.rawAttributes[toField]) {
      throw new Error(
        `Unknown attribute "${toField}" passed as targetKey, define this attribute on model "${other.name}" first`
      );
    }
    const pk = other.rawAttributes[toField || other.primaryKeyAttribute];
    // The options of the key given (defaultValue, comment...) are of the attribute.
    // index (as Sequelize 7): whether the key is indexed (true, false, or the options of its index).
    const { name: keyName, fieldName, index, ...keyOptions } = key; // eslint-disable-line no-unused-vars
    const attribute = {
      ...(existing || { type: options.keyType ? normalizeType(options.keyType) : pk.type }),
      ...keyOptions,
      type: keyOptions.type
        ? normalizeType(keyOptions.type)
        : (existing && existing.type) || (options.keyType ? normalizeType(options.keyType) : pk.type),
      allowNull,
      field: key.field || (existing && existing.field) || (model.options.underscored ? underscore(key.name) : key.name),
      // As Sequelize: the column of the key it points to (the deferrable of the attribute kept).
      references: {
        ...(existing && existing.references && existing.references.deferrable
          ? { deferrable: existing.references.deferrable }
          : {}),
        model: other.getTableName(),
        key: pk.field || toField || other.primaryKeyAttribute,
      },
      onDelete,
      onUpdate,
    };
    model.rawAttributes[key.name] = attribute;
    model.refreshAttributes();
    const previous = model.xufaForeignKeys.get(key.name);
    // A key of associations to several models (polymorphic: commentable_id of posts and images, by scopes) is no
    // relation of @xufa/orm: a column, that its associations query.
    const loose = Boolean(previous && (previous.loose || previous.target !== other));
    model.xufaForeignKeys.set(key.name, {
      target: other,
      loose,
      allowNull,
      dbOnDelete: ON_DELETE[String(onDelete).toUpperCase()],
      dbOnUpdate: ON_DELETE[String(onUpdate).toUpperCase()],
      constraint: options.constraints !== false && (!previous || previous.constraint !== false),
      toField: toField || (previous && previous.toField),
      // A key of several associations keeps the names given first (both sides: the name of its field and of its
      // reverse relation).
      fieldName: (previous && previous.fieldName) || extra.fieldName,
      relatedName: (previous && previous.relatedName) || extra.relatedName,
      index: index !== undefined ? index : previous && previous.index,
      deferrable: (attribute.references && attribute.references.deferrable) || (previous && previous.deferrable),
    });
    return model.xufaForeignKeys.get(key.name);
  }

  // Accessors on the prototype of `model`: name -> function.
  defineAccessors(model, accessors) {
    Object.entries(accessors).forEach(([name, fn]) => {
      if (!Object.hasOwn(model.prototype, name)) {
        Object.defineProperty(model.prototype, name, { value: fn, configurable: true, writable: true });
      }
    });
  }

  // Whether an alias of an include names this association (a string, { singular } or { plural }, or none for an
  // association without alias).
  verifyAssociationAlias(alias) {
    if (typeof alias === 'string') return this.as === alias;
    const name = alias && (this.isMultiAssociation ? alias.plural : alias.singular);
    if (name) return this.as === name;
    return !this.isAliased;
  }

  // The target as getters take it: with the scope given (scope: false for none, or the names of scopes), or its
  // default scope.
  // The target in options.schema (its copy there, as Sequelize reads it), and in options.scope.
  scopedTarget(options = {}) {
    const target = options.schema ? this.target.schema(options.schema, options.schemaDelimiter) : this.target;
    if (options.scope === false || options.scope === null) return target.unscoped();
    if (options.scope !== undefined) return target.scope(options.scope);
    return target;
  }

  // Whether its key is polymorphic (of associations to several models): it is then a column, not a relation.
  get xufaLoose() {
    if (this.associationType === 'BelongsToMany') {
      const keys = this.throughModel.xufaForeignKeys;
      return Boolean((keys.get(this.foreignKey) || {}).loose || (keys.get(this.otherKey) || {}).loose);
    }
    const holder = this.associationType === 'BelongsTo' ? this.source : this.target;
    const key = holder.xufaForeignKeys.get(this.foreignKey);
    return Boolean(key && key.loose);
  }

  // An alias cannot be the name of an attribute of the source.
  checkNamingCollision() {
    if (Object.hasOwn(this.source.rawAttributes, this.as)) {
      throw new Error(
        `Naming collision between attribute '${this.as}' and association '${this.as}' on model ${this.source.name}` +
          '. To remedy this, change either foreignKey or as in your association definition'
      );
    }
  }

  toInstanceArray(items) {
    return [].concat(items).filter((item) => item !== null && item !== undefined);
  }

  // As Sequelize 7: the plain objects of the items given to set() and add() are targets to create (the others, keys
  // and instances, as they are). `make(records)` creates them, as the association makes its targets.
  async createPlain(items, make) {
    const list = this.toInstanceArray(items);
    const plain = list.filter((item) => isPlainObject(item));
    if (plain.length === 0) return items;
    const created = await make(plain);
    let next = 0;
    return list.map((item) => (isPlainObject(item) ? created[next++] : item)); // eslint-disable-line no-plusplus
  }

  // The accessor that creates several targets (createTasks), when its name is not that of the one of one target.
  createManyAccessor(source, plural, singular) {
    if (plural === singular) return;
    const association = this;
    this.accessors.createMultiple = `create${plural}`;
    this.defineAccessors(source, {
      [this.accessors.createMultiple](records = [], opts = {}) {
        return association.createMany(this, records, opts);
      },
    });
  }
}

class BelongsTo extends Association {
  constructor(source, target, options = {}) {
    super(source, target, options);
    this.associationType = 'BelongsTo';
    this.isSingleAssociation = true;
    const names = nameOf(target, options.as, false);
    this.as = names.as;
    this.options.name = names;
    const key = foreignKeyOption(options.foreignKey);
    this.targetKey = options.targetKey || target.primaryKeyAttribute;
    this.foreignKey = key.name || defaultKey(this.as, target.primaryKeyAttribute);
    this.identifier = this.foreignKey;
    this.addForeignKey(source, target, { ...key, name: this.foreignKey }, options, {
      fieldName: this.as,
      notNullOnDelete: 'NO ACTION',
      toField: this.targetKey,
    });
    this.checkNamingCollision();
    const suffix = upperFirst(this.as);
    const association = this;
    this.accessors = { get: `get${suffix}`, set: `set${suffix}`, create: `create${suffix}` };
    this.defineAccessors(source, {
      [this.accessors.get](opts = {}) {
        return association.get(this, opts);
      },
      [this.accessors.set](value, opts = {}) {
        return association.set(this, value, opts);
      },
      [this.accessors.create](values = {}, opts = {}) {
        return association.create(this, values, opts);
      },
    });
  }

  async get(instance, options = {}) {
    // Of several instances: their targets by their primary keys.
    if (Array.isArray(instance)) {
      const keys = [...new Set(instance.map((item) => item.get(this.foreignKey, { raw: true })))].filter(
        (key) => key != null
      );
      const where = { ...options.where, [this.targetKey]: keys };
      const found = keys.length ? await this.scopedTarget(options).findAll({ ...options, where }) : [];
      const byKey = new Map(found.map((item) => [item.get(this.targetKey, { raw: true }), item]));
      const result = {};
      instance.forEach((item) => {
        const target = byKey.get(item.get(this.foreignKey, { raw: true }));
        if (target) result[item.get(item.constructor.primaryKeyAttribute)] = target;
      });
      return result;
    }
    const key = instance.get(this.foreignKey, { raw: true });
    if (key === null || key === undefined) return null;
    return this.scopedTarget(options).findOne({ ...options, where: { ...options.where, [this.targetKey]: key } });
  }

  async set(instance, value, options) {
    const key = value && typeof value === 'object' ? value.get(this.targetKey, { raw: true }) : value;
    instance.set(this.foreignKey, key === undefined ? null : key);
    if (options.save === false) return undefined;
    return instance.save({ ...options, fields: [this.foreignKey] });
  }

  async create(instance, values, options) {
    const created = await this.target.create(values, options);
    await this.set(instance, created, options);
    return created;
  }
}

class HasMany extends Association {
  constructor(source, target, options = {}) {
    super(source, target, options);
    this.associationType = 'HasMany';
    this.isMultiAssociation = true;
    const names = nameOf(target, options.as, true);
    this.as = names.as;
    this.options.name = names;
    const key = foreignKeyOption(options.foreignKey);
    this.sourceKey = options.sourceKey || source.primaryKeyAttribute;
    this.foreignKey = key.name || defaultKey(source.options.name.singular, source.primaryKeyAttribute);
    this.identifier = this.foreignKey;
    // The reverse relation of the foreign key in @xufa/orm (to filter the source by its targets).
    // A key of a model to itself has a field of its own name (not the name of its reverse relation).
    this.relatedName = this.addForeignKey(target, source, { ...key, name: this.foreignKey }, options, {
      relatedName: this.as,
      fieldName: target === source ? `xufa_${this.as}_owner` : undefined,
      toField: this.sourceKey,
    }).relatedName;
    this.checkNamingCollision();
    const singular = upperFirst(names.singular);
    const plural = upperFirst(names.plural);
    const association = this;
    this.accessors = {
      get: `get${plural}`,
      set: `set${plural}`,
      addMultiple: `add${plural}`,
      add: `add${singular}`,
      create: `create${singular}`,
      remove: `remove${singular}`,
      removeMultiple: `remove${plural}`,
      hasSingle: `has${singular}`,
      hasAll: `has${plural}`,
      count: `count${plural}`,
    };
    this.defineAccessors(source, {
      [this.accessors.get](opts = {}) {
        return association.get(this, opts);
      },
      [this.accessors.count](opts = {}) {
        return association.count(this, opts);
      },
      [this.accessors.hasSingle](items, opts = {}) {
        return association.has(this, items, opts);
      },
      [this.accessors.hasAll](items, opts = {}) {
        return association.has(this, items, opts);
      },
      [this.accessors.set](items, opts = {}) {
        return association.set(this, items, opts);
      },
      [this.accessors.add](items, opts = {}) {
        return association.add(this, items, opts);
      },
      [this.accessors.addMultiple](items, opts = {}) {
        return association.add(this, items, opts);
      },
      [this.accessors.remove](items, opts = {}) {
        return association.remove(this, items, opts);
      },
      [this.accessors.removeMultiple](items, opts = {}) {
        return association.remove(this, items, opts);
      },
      [this.accessors.create](values = {}, opts = {}) {
        return association.create(this, values, opts);
      },
    });
    this.createManyAccessor(source, plural, singular);
  }

  // The targets of an instance: its key, and the scope of the association.
  where(instance, options) {
    const own = { ...this.scope, [this.foreignKey]: instance.get(this.sourceKey, { raw: true }) };
    return options.where ? { [Op.and]: [own, options.where] } : own;
  }

  async get(instance, options = {}) {
    // Of several instances: their targets (with limit, the first of each) by the source keys of the instances.
    if (Array.isArray(instance)) {
      const keys = instance.map((item) => item.get(this.sourceKey, { raw: true }));
      const own = { ...this.scope, [this.foreignKey]: keys };
      const where = options.where ? { [Op.and]: [own, options.where] } : own;
      const { limit, ...rest } = options;
      const found = await this.scopedTarget(options).findAll({ ...rest, where });
      const result = Object.fromEntries(keys.map((key) => [key, []]));
      found.forEach((item) => {
        const group = result[item.get(this.foreignKey, { raw: true })];
        if (group && (!limit || group.length < limit)) group.push(item);
      });
      return result;
    }
    return this.scopedTarget(options).findAll({ ...options, where: this.where(instance, options) });
  }

  // A number, also with group (the count of the first group, as Sequelize gives it).
  async count(instance, options) {
    const result = await this.scopedTarget(options).count({ ...options, where: this.where(instance, options) });
    if (!Array.isArray(result)) return result;
    return result.length ? Number(result[0].count) : 0;
  }

  keysOf(items) {
    return this.toInstanceArray(items).map((item) =>
      typeof item === 'object' ? item.get(this.target.primaryKeyAttribute) : item
    );
  }

  async has(instance, items, options) {
    const keys = this.keysOf(items);
    const where = { [Op.and]: [this.where(instance, {}), { [this.target.primaryKeyAttribute]: keys }] };
    const count = await this.target.unscoped().count({ ...options, where });
    return count === keys.length;
  }

  async set(instance, items, options) {
    items = await this.createPlain(items || [], (records) => this.createMany(instance, records, options));
    const keys = this.keysOf(items || []);
    const pk = this.target.primaryKeyAttribute;
    const unlink = { [Op.and]: [this.where(instance, {}), keys.length ? { [pk]: { [Op.notIn]: keys } } : {}] };
    await this.target.unscoped().update({ [this.foreignKey]: null }, { ...options, where: unlink });
    if (keys.length) await this.add(instance, keys, options);
    return instance;
  }

  async add(instance, items, options) {
    items = await this.createPlain(items, (records) => this.createMany(instance, records, options));
    const keys = this.keysOf(items);
    if (keys.length === 0) return instance;
    const value = instance.get(this.sourceKey, { raw: true });
    await this.target
      .unscoped()
      .update(
        { ...this.scope, [this.foreignKey]: value },
        { ...options, where: { [this.target.primaryKeyAttribute]: keys } }
      );
    this.toInstanceArray(items).forEach((item) => {
      if (typeof item === 'object') item.set({ ...this.scope, [this.foreignKey]: value }, { raw: true });
    });
    return instance;
  }

  async remove(instance, items, options) {
    const keys = this.keysOf(items);
    if (keys.length === 0) return instance;
    const where = { [Op.and]: [this.where(instance, {}), { [this.target.primaryKeyAttribute]: keys }] };
    await this.target.unscoped().update({ [this.foreignKey]: null }, { ...options, where });
    return instance;
  }

  // The key and the scope are values of the target created (and fields of it, when fields are given).
  create(instance, values, options) {
    const own = { ...this.scope, [this.foreignKey]: instance.get(this.sourceKey, { raw: true }) };
    const fields = options.fields ? [...new Set([...options.fields, ...Object.keys(own)])] : undefined;
    return this.target.create({ ...values, ...own }, fields ? { ...options, fields } : options);
  }

  // Several targets created at once (as Sequelize 7: createTasks), with the key and the scope.
  createMany(instance, records, options = {}) {
    const own = { ...this.scope, [this.foreignKey]: instance.get(this.sourceKey, { raw: true }) };
    const fields = options.fields ? [...new Set([...options.fields, ...Object.keys(own)])] : undefined;
    const rows = [].concat(records).map((values) => ({ ...values, ...own }));
    return this.target.bulkCreate(rows, { validate: true, ...(fields ? { ...options, fields } : options) });
  }
}

class HasOne extends Association {
  constructor(source, target, options = {}) {
    super(source, target, options);
    this.associationType = 'HasOne';
    this.isSingleAssociation = true;
    const names = nameOf(target, options.as, false);
    this.as = names.as;
    this.options.name = names;
    const key = foreignKeyOption(options.foreignKey);
    this.sourceKey = options.sourceKey || source.primaryKeyAttribute;
    // As Sequelize: named by the alias of the association (or the name of the source).
    const named = typeof options.as === 'string' ? options.as : (options.as && options.as.singular) || source.name;
    this.foreignKey = key.name || defaultKey(singularize(named), source.primaryKeyAttribute);
    this.identifier = this.foreignKey;
    // A key of a model to itself has a field of its own name (not the name of its reverse relation).
    this.relatedName = this.addForeignKey(target, source, { ...key, name: this.foreignKey }, options, {
      relatedName: this.as,
      fieldName: target === source ? `xufa_${this.as}_owner` : undefined,
      toField: this.sourceKey,
    }).relatedName;
    this.checkNamingCollision();
    const suffix = upperFirst(this.as);
    const association = this;
    this.accessors = { get: `get${suffix}`, set: `set${suffix}`, create: `create${suffix}` };
    this.defineAccessors(source, {
      [this.accessors.get](opts = {}) {
        return association.get(this, opts);
      },
      [this.accessors.set](value, opts = {}) {
        return association.set(this, value, opts);
      },
      [this.accessors.create](values = {}, opts = {}) {
        return association.create(this, values, opts);
      },
    });
  }

  async get(instance, options = {}) {
    // Of several instances: their targets (or null) by their primary keys.
    if (Array.isArray(instance)) {
      const keys = instance.map((item) => item.get(this.sourceKey, { raw: true }));
      const own = { ...this.scope, [this.foreignKey]: keys };
      const where = options.where ? { [Op.and]: [own, options.where] } : own;
      const found = await this.scopedTarget(options).findAll({ ...options, where });
      const byKey = new Map(found.map((item) => [item.get(this.foreignKey, { raw: true }), item]));
      return Object.fromEntries(
        instance.map((item) => [
          item.get(item.constructor.primaryKeyAttribute),
          byKey.get(item.get(this.sourceKey, { raw: true })) || null,
        ])
      );
    }
    const own = { ...this.scope, [this.foreignKey]: instance.get(this.sourceKey, { raw: true }) };
    const where = options.where ? { [Op.and]: [own, options.where] } : own;
    return this.scopedTarget(options).findOne({ ...options, where });
  }

  // The target linked before (in the scope of the association) is unlinked; the new one gets the key and the scope.
  async set(instance, value, options) {
    const link = { ...this.scope, [this.foreignKey]: instance.get(this.sourceKey, { raw: true }) };
    const pk = this.target.primaryKeyAttribute;
    const key = value && typeof value === 'object' ? value.get(pk) : value;
    const others = key === null || key === undefined ? link : { [Op.and]: [link, { [pk]: { [Op.ne]: key } }] };
    await this.target.unscoped().update({ [this.foreignKey]: null }, { ...options, where: others });
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      value.set(link);
      return value.save(options);
    }
    await this.target.unscoped().update(link, { ...options, where: { [pk]: key } });
    return null;
  }

  // The key and the scope are values of the target created (and fields of it, when fields are given).
  create(instance, values, options) {
    const own = { ...this.scope, [this.foreignKey]: instance.get(this.sourceKey, { raw: true }) };
    const fields = options.fields ? [...new Set([...options.fields, ...Object.keys(own)])] : undefined;
    return this.target.create({ ...values, ...own }, fields ? { ...options, fields } : options);
  }
}

class BelongsToMany extends Association {
  constructor(source, target, options = {}) {
    super(source, target, options);
    this.associationType = 'BelongsToMany';
    this.isMultiAssociation = true;
    if (!options.through) throw new AssociationError(`${source.name}.belongsToMany(${target.name}) needs a through`);
    const names = nameOf(target, options.as, true);
    this.as = names.as;
    this.options.name = names;
    this.checkNamingCollision();
    this.sourceKey = options.sourceKey || source.primaryKeyAttribute;
    this.targetKey = options.targetKey || target.primaryKeyAttribute;
    const key = foreignKeyOption(options.foreignKey);
    const other = foreignKeyOption(options.otherKey);
    // The other side of the same through model, when it is defined: its keys the other way round.
    const throughName =
      typeof (options.through.model || options.through) === 'string'
        ? options.through.model || options.through
        : (options.through.model || options.through).name;
    const paired = Object.values(target.associations).find(
      (item) =>
        item.associationType === 'BelongsToMany' &&
        item.target === source &&
        item.throughModel &&
        item.throughModel.name === throughName
    );
    this.foreignKeyDefault = !key.name;
    this.otherKeyDefault = !other.name;
    this.targetKeyDefault = !options.targetKey;
    // As Sequelize: the keys of the targets of a side are the source keys of the other (when not given).
    if (paired && !this.isSelfAssociation) {
      if (this.targetKeyDefault) this.targetKey = paired.sourceKey;
      if (paired.targetKeyDefault && paired.targetKey !== this.sourceKey) {
        paired.targetKey = this.sourceKey;
        if (paired.otherKeyDefault) {
          paired.renameKey('otherKey', defaultKey(source.options.name.singular, this.sourceKey));
          paired.otherKeyDefault = true;
        }
      }
    }
    if (paired) {
      // A key named here is the key of the other side too (when it took its default one).
      if (key.name && paired.otherKeyDefault && paired.otherKey !== key.name) paired.renameKey('otherKey', key.name);
      if (other.name && paired.foreignKeyDefault && paired.foreignKey !== other.name) {
        paired.renameKey('foreignKey', other.name);
      }
      if (!key.name) key.name = paired.otherKey;
      if (!other.name) other.name = paired.foreignKey;
    }
    this.paired = paired;
    if (paired) paired.paired = this;
    this.foreignKey = key.name || defaultKey(source.options.name.singular, this.sourceKey);
    this.otherKey =
      other.name ||
      defaultKey(this.isSelfAssociation ? singularize(this.as) : target.options.name.singular, this.targetKey);
    const through = options.through.model || options.through;
    const sequelize = source.sequelize;
    if (typeof through === 'string') {
      this.throughModel = sequelize.isDefined(through)
        ? sequelize.model(through)
        : sequelize.define(
            through,
            {},
            {
              tableName: through,
              timestamps: source.options.timestamps,
              underscored: source.options.underscored,
              paranoid: Boolean(typeof options.through === 'object' && options.through.paranoid),
            }
          );
    } else this.throughModel = through;
    this.throughOptions = typeof options.through === 'object' && options.through.model ? options.through : {};
    // As Sequelize: through is { model, ...its options }.
    this.through = { ...this.throughOptions, model: this.throughModel };
    this.throughScope = this.throughOptions.scope;
    // The foreign keys of the through model in @xufa/orm, and their reverse relations: from the source (to filter
    // sources by their targets) and from the target (to filter targets by their sources).
    const from = this.addForeignKey(
      this.throughModel,
      source,
      { ...key, name: this.foreignKey },
      { onDelete: 'CASCADE', ...options },
      {
        fieldName: `xufa_${this.as}_from`,
        relatedName: `xufa_${this.throughModel.name}_${this.as}_from`,
        toField: this.sourceKey,
      }
    );
    // As Sequelize: the key of the targets keeps the onDelete it has (from the other side).
    const otherAttribute = this.throughModel.rawAttributes[this.otherKey];
    const to = this.addForeignKey(
      this.throughModel,
      target,
      { ...other, name: this.otherKey },
      { ...options, onDelete: (otherAttribute && otherAttribute.onDelete) || options.onDelete || 'CASCADE' },
      {
        fieldName: `xufa_${this.as}_to`,
        relatedName: `xufa_${this.throughModel.name}_${this.as}_to`,
        toField: this.targetKey,
      }
    );
    this.sourceField = from.fieldName;
    this.sourceRelation = from.relatedName;
    this.targetField = to.fieldName;
    this.targetRelation = to.relatedName;
    if (paired) {
      paired.targetField = from.fieldName;
      paired.targetRelation = from.relatedName;
      paired.sourceField = to.fieldName;
      paired.sourceRelation = to.relatedName;
    }
    const pair = [this.foreignKey, this.otherKey];
    // As Sequelize: the id Sequelize gave the through model goes away, and both keys are its primary key. The
    // association that takes it away makes no unique key of them (the other side does, as Sequelize).
    const throughModel = this.throughModel;
    let primaryKeyDeleted = false;
    if (throughModel.rawAttributes.id && throughModel.rawAttributes.id._autoGenerated) {
      delete throughModel.rawAttributes.id;
      throughModel.xufaKeyPair = true;
      primaryKeyDeleted = true;
    }
    if (throughModel.xufaKeyPair) {
      Object.values(throughModel.rawAttributes).forEach((attribute) => {
        if (attribute.xufaPairKey) attribute.primaryKey = false;
      });
      pair.forEach((name) => {
        const attribute = throughModel.rawAttributes[name];
        attribute.primaryKey = true;
        attribute.allowNull = false;
        attribute.xufaPairKey = true;
      });
    }
    if (
      !primaryKeyDeleted &&
      this.throughOptions.unique !== false &&
      !throughModel.xufaUniqueKeys.some((keys) => keys.length === 2 && keys.every((name) => pair.includes(name)))
    ) {
      // Both keys are a unique key (uniqueKey, or <table>_<foreignKey>_<otherKey>_unique).
      const uniqueKey =
        typeof options.uniqueKey === 'string' && options.uniqueKey
          ? options.uniqueKey
          : [throughModel.tableName, this.foreignKey, this.otherKey, 'unique'].join('_');
      pair.forEach((name) => {
        throughModel.rawAttributes[name].unique = uniqueKey;
      });
    }
    throughModel.refreshAttributes();
    const singular = upperFirst(names.singular);
    const plural = upperFirst(names.plural);
    const association = this;
    this.accessors = {
      get: `get${plural}`,
      set: `set${plural}`,
      addMultiple: `add${plural}`,
      add: `add${singular}`,
      create: `create${singular}`,
      remove: `remove${singular}`,
      removeMultiple: `remove${plural}`,
      hasSingle: `has${singular}`,
      hasAll: `has${plural}`,
      count: `count${plural}`,
    };
    this.defineAccessors(source, {
      [this.accessors.get](opts = {}) {
        return association.get(this, opts);
      },
      [this.accessors.count](opts = {}) {
        return association.count(this, opts);
      },
      [this.accessors.hasSingle](items, opts = {}) {
        return association.has(this, items, opts);
      },
      [this.accessors.hasAll](items, opts = {}) {
        return association.has(this, items, opts);
      },
      [this.accessors.set](items, opts = {}) {
        return association.set(this, items, opts);
      },
      [this.accessors.add](items, opts = {}) {
        return association.add(this, items, opts);
      },
      [this.accessors.addMultiple](items, opts = {}) {
        return association.add(this, items, opts);
      },
      [this.accessors.remove](items, opts = {}) {
        return association.remove(this, items, opts);
      },
      [this.accessors.removeMultiple](items, opts = {}) {
        return association.remove(this, items, opts);
      },
      [this.accessors.create](values = {}, opts = {}) {
        return association.create(this, values, opts);
      },
    });
    this.createManyAccessor(source, plural, singular);
  }

  // The names Sequelize also gives the keys of the through model.
  get identifier() {
    return this.foreignKey;
  }

  get foreignIdentifier() {
    return this.otherKey;
  }

  // Renames a key (foreignKey or otherKey) of the through model: the attribute of the old name goes away.
  renameKey(which, name) {
    const model = this.throughModel;
    const old = this[which];
    delete model.rawAttributes[old];
    model.xufaForeignKeys.delete(old);
    model.xufaUniqueKeys = model.xufaUniqueKeys.map((keys) => keys.map((item) => (item === old ? name : item)));
    model.refreshAttributes();
    this[which] = name;
    this[`${which}Default`] = false;
  }

  // The condition on the targets of an instance: those linked to it through the through model.
  linkedWhere(instance, options) {
    const own = {
      ...this.scope,
      [`$xufa:${this.targetRelation}__${this.foreignKey}$`]: instance.get(this.sourceKey, { raw: true }),
    };
    // The conditions on the through rows: of its scope and of options.through.where.
    const throughWhere = { ...(options.through && options.through.where), ...this.throughScope };
    // Soft-deleted links are not links (unless through: { paranoid: false }).
    const { deletedAt } = this.throughModel.xufaTimestamps;
    if (deletedAt && !(options.through && options.through.paranoid === false)) throughWhere[deletedAt] = null;
    Object.entries(throughWhere).forEach(([key, value]) => {
      own[`$xufa:${this.targetRelation}__${key}$`] = value;
    });
    return options.where ? { [Op.and]: [own, options.where] } : own;
  }

  async get(instance, options) {
    const ready = this.target.xufaReady();
    if (ready) await ready;
    // The scope of the target (its where and order) as options of the load.
    const scoped = this.scopedTarget(options).xufaScoped({ ...options });
    // The scope of the association: conditions on its targets.
    if (this.scope) scoped.where = scoped.where ? { [Op.and]: [this.scope, scoped.where] } : { ...this.scope };
    const [loaded] = await this.target.sequelize.xufaRun(options, () =>
      this.target.xufaLoadThrough(this, [instance], scoped)
    );
    return loaded;
  }

  count(instance, options) {
    return this.scopedTarget(options).count({ ...options, where: this.linkedWhere(instance, options) });
  }

  keysOf(items) {
    return this.toInstanceArray(items).map((item) =>
      typeof item === 'object' ? item.get(this.targetKey, { raw: true }) : item
    );
  }

  async has(instance, items, options) {
    const keys = this.keysOf(items);
    const where = { [Op.and]: [this.linkedWhere(instance, { through: options.through }), { [this.targetKey]: keys }] };
    const count = await this.target.unscoped().count({ ...options, where });
    return count === keys.length;
  }

  // `current`: the links of the instance there are (set() reads them), so they are not read again.
  async add(instance, items, options = {}, current = null) {
    items = await this.createPlain(items, (records) => this.createTargets(records, options));
    const keys = [...new Set(this.keysOf(items))];
    if (keys.length === 0) return [];
    const value = instance.get(this.sourceKey, { raw: true });
    const existing =
      current ||
      (await this.throughModel.findAll({
        ...options,
        where: { ...this.throughScope, [this.foreignKey]: value, [this.otherKey]: keys },
        raw: true,
      }));
    const linked = new Map(existing.map((row) => [row[this.otherKey], row]));
    // As Sequelize: the values of options.through, and over them those of each item (item.Through = { ... }); the
    // through instances items have from finds are not values to give.
    const defaults = options.through || {};
    const byKey = new Map();
    this.toInstanceArray(items).forEach((item) => {
      if (!item || typeof item !== 'object' || !item.dataValues) return;
      const own = item.dataValues[this.throughModel.name];
      if (own && typeof own === 'object' && !own.dataValues) byKey.set(item.get(this.targetKey, { raw: true }), own);
    });
    const valuesOf = (key) => ({ ...defaults, ...byKey.get(key) });
    const rows = keys
      .filter((key) => !linked.has(key))
      .map((key) => ({ ...valuesOf(key), ...this.throughScope, [this.foreignKey]: value, [this.otherKey]: key }));
    // Links there already are updated with the values given that changed.
    for (const key of keys.filter((item) => linked.has(item))) {
      const values = valuesOf(key);
      const row = linked.get(key);
      if (!Object.keys(values).some((name) => !Object.hasOwn(row, name) || row[name] !== values[name])) continue;
      await this.throughModel.update(values, {
        ...options,
        where: { ...this.throughScope, [this.foreignKey]: value, [this.otherKey]: key },
      });
    }
    // The rows of the through model made (as Sequelize gives them).
    return rows.length ? this.throughModel.bulkCreate(rows, { ...options, validate: true }) : [];
  }

  async remove(instance, items, options = {}) {
    const keys = this.keysOf(items);
    if (keys.length === 0) return;
    await this.throughModel.destroy({
      ...options,
      where: {
        ...this.throughScope,
        [this.foreignKey]: instance.get(this.sourceKey, { raw: true }),
        [this.otherKey]: keys,
      },
    });
  }

  // As Sequelize: the links there are read once; those not given are deleted, and the new ones made (each in one
  // query, when there are any).
  async set(instance, items, options = {}) {
    items = await this.createPlain(items || [], (records) => this.createTargets(records, options));
    const keys = this.keysOf(items || []).map(String);
    const value = instance.get(this.sourceKey, { raw: true });
    const own = { ...this.throughScope, [this.foreignKey]: value };
    const current = await this.throughModel.findAll({ ...options, where: own, raw: true });
    const obsolete = current.filter((row) => !keys.includes(String(row[this.otherKey])));
    if (obsolete.length) {
      const where = { ...own, [this.otherKey]: obsolete.map((row) => row[this.otherKey]) };
      await this.throughModel.destroy({ ...options, where });
    }
    const kept = current.filter((row) => !obsolete.includes(row));
    return this.add(instance, items || [], options, kept);
  }

  async create(instance, values, options = {}) {
    // The values of the scope of the association are those of the target created.
    const created = await this.target.create({ ...values, ...this.scope }, options);
    // The fields given are those of the target: the through row has its own.
    const { fields, ...rest } = options; // eslint-disable-line no-unused-vars
    await this.add(instance, created, rest);
    return created;
  }

  // Targets created (with the scope of the association), not linked yet.
  createTargets(records, options = {}) {
    const { through, ...rest } = options; // eslint-disable-line no-unused-vars
    const rows = [].concat(records).map((values) => ({ ...values, ...this.scope }));
    return this.target.bulkCreate(rows, { validate: true, ...rest });
  }

  // Several targets created and linked at once (as Sequelize 7: createTags).
  async createMany(instance, records, options = {}) {
    const created = await this.createTargets(records, options);
    const { fields, ...rest } = options; // eslint-disable-line no-unused-vars
    await this.add(instance, created, rest);
    return created;
  }
}

module.exports = { Association, BelongsTo, HasMany, HasOne, BelongsToMany };
