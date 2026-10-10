// Pages by keys (keyset, or cursor, pagination, as Django REST framework's CursorPagination): a page is the objects
// after (or before) those of the page shown, by the order of the QuerySet, not an OFFSET: a page far away costs what
// the first one does (with an index of that order), and objects added meanwhile do not shift the pages. There are no
// page numbers nor a count: links to the next and previous pages, by their cursors.
//
//   const paginator = new KeysetPaginator(Book.objects.orderBy('title'), 10);
//   const page = await paginator.page(request.query.cursor);   // InvalidPage (404) when the cursor is not one
//   page.objectList; page.hasNext; page.nextCursor; page.hasPrevious; page.previousCursor
//
// The order is that of the QuerySet (or its model's), with the primary key last, so every object has a place of its
// own; its names are fields of the model (a foreign key orders by its key). NULLs go first going up and last going
// down, as the ORM orders them.
import { or, and } from './query.js';
import { InvalidPage } from './paginator.js';

// The values of a cursor as JSON: dates and bigints keep their type.
function encodeCursor(direction, values) {
  const json = JSON.stringify([
    direction,
    values.map((value) => {
      if (value instanceof Date) return { d: value.toISOString() };
      if (typeof value === 'bigint') return { b: value.toString() };
      return value;
    }),
  ]);
  return Buffer.from(json).toString('base64url');
}

function decodeCursor(cursor, count) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
  } catch {
    parsed = null;
  }
  const [direction, values] = Array.isArray(parsed) ? parsed : [];
  if ((direction !== 'n' && direction !== 'p') || !Array.isArray(values) || values.length !== count) {
    throw new InvalidPage('That cursor is not one of these pages');
  }
  return {
    direction,
    values: values.map((value) => {
      if (value && typeof value === 'object' && typeof value.d === 'string') return new Date(value.d);
      if (value && typeof value === 'object' && typeof value.b === 'string') return BigInt(value.b);
      return value;
    }),
  };
}

class KeysetPage {
  constructor(paginator, objectList, { hasNext, hasPrevious }) {
    this.paginator = paginator;
    this.objectList = objectList;
    this.hasNext = hasNext;
    this.hasPrevious = hasPrevious;
    const { keys } = paginator;
    const last = objectList[objectList.length - 1];
    const first = objectList[0];
    this.nextCursor =
      hasNext && last
        ? encodeCursor(
            'n',
            keys.map((key) => key.valueOf(last))
          )
        : null;
    this.previousCursor =
      hasPrevious && first
        ? encodeCursor(
            'p',
            keys.map((key) => key.valueOf(first))
          )
        : null;
  }

  get hasOtherPages() {
    return this.hasNext || this.hasPrevious;
  }

  get length() {
    return this.objectList.length;
  }

  [Symbol.iterator]() {
    return this.objectList[Symbol.iterator]();
  }
}

class KeysetPaginator {
  constructor(queryset, perPage) {
    if (!Number.isInteger(perPage) || perPage < 1)
      throw new TypeError('The objects of a page (perPage) are an integer, 1 or more');
    if (!queryset || !queryset.model || typeof queryset.orderBy !== 'function') {
      throw new TypeError('A KeysetPaginator pages a QuerySet');
    }
    const { model } = queryset;
    const { meta } = model;
    if (!meta.pk || meta.pk.composite) throw new TypeError(`${model.name} has no primary key of one field to page by`);
    this.queryset = queryset;
    this.perPage = perPage;
    // The order: the QuerySet's (or the model's), and the primary key to end ties.
    const names = [...(queryset.state.orderBy || meta.ordering || [])];
    this.keys = names.map((name) => {
      if (typeof name !== 'string') throw new TypeError('A KeysetPaginator orders by names of fields, not Raw');
      const desc = name.startsWith('-');
      const path = desc ? name.slice(1) : name;
      const field = path === 'pk' ? meta.pk : meta.field(path);
      if (!field) {
        throw new TypeError(`A KeysetPaginator orders by fields of ${model.name}: ${path} is not one (no relations)`);
      }
      return {
        name: field.name,
        attname: field.attname,
        desc,
        nullable: Boolean(field.null),
        valueOf: (object) => object[field.attname] ?? null,
      };
    });
    if (!this.keys.some((key) => key.attname === meta.pk.attname)) {
      const { pk } = meta;
      this.keys.push({ name: pk.name, attname: pk.attname, desc: false, nullable: false, valueOf: (o) => o.pk });
    }
  }

  // The condition of the objects after `values` (by `keys`, with `reversed` to go backwards): the first key after its
  // value, or equal and the second after, and so on.
  after(values, reversed) {
    const terms = [];
    const equal = [];
    this.keys.forEach((key, i) => {
      const desc = key.desc !== reversed;
      const value = values[i];
      // NULLs: first going up (before every value), last going down.
      let greater;
      if (value === null) greater = desc ? null : { [`${key.attname}__isnull`]: false };
      else if (desc) {
        greater = key.nullable
          ? or({ [`${key.attname}__lt`]: value }, { [`${key.attname}__isnull`]: true })
          : { [`${key.attname}__lt`]: value };
      } else greater = { [`${key.attname}__gt`]: value };
      if (greater !== null) terms.push(equal.length ? and(...equal, greater) : greater);
      equal.push(value === null ? { [`${key.attname}__isnull`]: true } : { [key.attname]: value });
    });
    return terms.length ? or(...terms) : null;
  }

  ordered(reversed) {
    const names = this.keys.map((key) => (key.desc !== reversed ? `-${key.name}` : key.name));
    return this.queryset.orderBy(...names);
  }

  // A page: the first (no cursor), or the one a cursor of another page leads to.
  async page(cursor) {
    const given =
      cursor === undefined || cursor === null || cursor === '' ? null : decodeCursor(cursor, this.keys.length);
    const backwards = given !== null && given.direction === 'p';
    let queryset = this.ordered(backwards);
    if (given !== null) {
      const condition = this.after(given.values, backwards);
      if (condition !== null) queryset = queryset.filter(condition);
      else return new KeysetPage(this, [], { hasNext: backwards, hasPrevious: !backwards });
    }
    const rows = await queryset.limit(this.perPage + 1);
    const more = rows.length > this.perPage;
    const objects = more ? rows.slice(0, this.perPage) : rows;
    if (backwards) {
      objects.reverse();
      return new KeysetPage(this, objects, { hasNext: true, hasPrevious: more });
    }
    return new KeysetPage(this, objects, { hasNext: more, hasPrevious: given !== null });
  }
}

export { KeysetPaginator, KeysetPage, encodeCursor, decodeCursor };
