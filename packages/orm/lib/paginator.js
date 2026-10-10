// Pages of a QuerySet (or a list), as Django's Paginator: the objects of a page, how many pages there are, which come
// before and after, and the numbers to show in a pager (elided: 1 2 … 9 10 11 … 49 50).
//
//   const paginator = new Paginator(Book.objects.orderBy('title'), 10);
//   const page = await paginator.page(request.query.page);    // EmptyPage or PageNotAnInteger (404) when wrong
//   const page = await paginator.getPage(request.query.page); // the first or the last page instead
//   page.objectList; page.number; page.hasNext; page.nextPageNumber; page.paginator.numPages
//
// orphans: a last page with that many objects or fewer joins the one before it. allowEmptyFirstPage (true): with no
// objects there is one empty page (else page(1) is EmptyPage). A queryset without an order is paged as the backend
// gives it: order it (Django warns, UnorderedObjectListWarning).
class InvalidPage extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPage';
    this.statusCode = 404;
    this.code = 'XUFA_ORM_ERR_INVALID_PAGE';
  }
}

class PageNotAnInteger extends InvalidPage {
  constructor(message) {
    super(message);
    this.name = 'PageNotAnInteger';
  }
}

class EmptyPage extends InvalidPage {
  constructor(message) {
    super(message);
    this.name = 'EmptyPage';
  }
}

const ELLIPSIS = '…';

class Paginator {
  constructor(objects, perPage, { orphans = 0, allowEmptyFirstPage = true } = {}) {
    if (!Number.isInteger(perPage) || perPage < 1)
      throw new TypeError('The objects of a page (perPage) are an integer, 1 or more');
    if (!Number.isInteger(orphans) || orphans < 0) throw new TypeError('orphans is an integer, 0 or more');
    if (!objects || (typeof objects.count !== 'function' && !Array.isArray(objects))) {
      throw new TypeError('A Paginator pages a QuerySet or a list');
    }
    this.objects = objects;
    this.perPage = perPage;
    this.orphans = orphans;
    this.allowEmptyFirstPage = allowEmptyFirstPage;
    this.counted = null;
  }

  // The number of objects (counted once).
  async count() {
    if (this.counted === null) {
      this.counted = Array.isArray(this.objects) ? this.objects.length : await this.objects.count();
    }
    return this.counted;
  }

  async numPages() {
    const count = await this.count();
    if (count === 0 && !this.allowEmptyFirstPage) return 0;
    const hits = Math.max(1, count - this.orphans);
    return Math.ceil(hits / this.perPage);
  }

  // The numbers of the pages: [1, 2, ..., numPages].
  async pageRange() {
    return Array.from({ length: await this.numPages() }, (item, index) => index + 1);
  }

  // A page number checked: an integer (or its text), and a page that there is.
  async validateNumber(given) {
    const number =
      typeof given === 'number' ? given : typeof given === 'string' && /^\s*\d+\s*$/.test(given) ? Number(given) : NaN;
    if (!Number.isInteger(number)) throw new PageNotAnInteger(`That page number is not an integer: ${given}`);
    if (number < 1) throw new EmptyPage('That page number is less than 1');
    const pages = await this.numPages();
    if (number > pages) {
      if (number === 1 && this.allowEmptyFirstPage) return number;
      throw new EmptyPage('That page contains no results');
    }
    return number;
  }

  // A page by its number (1 when none is given): PageNotAnInteger or EmptyPage when there is no such page.
  async page(given = 1) {
    const number = await this.validateNumber(given === undefined || given === null || given === '' ? 1 : given);
    const count = await this.count();
    const bottom = (number - 1) * this.perPage;
    let top = bottom + this.perPage;
    if (top + this.orphans >= count) top = count;
    const objectList = Array.isArray(this.objects)
      ? this.objects.slice(bottom, top)
      : top > bottom
        ? await this.objects.slice(bottom, top)
        : [];
    return new Page(objectList, number, this, await this.numPages());
  }

  // A page that is always there: the first for a number that is not one, the last past the end.
  async getPage(given) {
    try {
      return await this.page(given === undefined || given === null || given === '' ? 1 : given);
    } catch (err) {
      if (err instanceof PageNotAnInteger) return this.page(1);
      if (err instanceof EmptyPage) return this.page(Math.max(1, await this.numPages()));
      throw err;
    }
  }

  // The numbers of a pager around a page: those near it (onEachSide), those at the ends (onEnds), and … between them.
  async elidedPageRange(number = 1, { onEachSide = 3, onEnds = 2 } = {}) {
    const pages = await this.numPages();
    const current = await this.validateNumber(number);
    if (pages <= (onEachSide + onEnds) * 2) return this.pageRange();
    const range = [];
    if (current > 1 + onEachSide + onEnds + 1) {
      for (let i = 1; i <= onEnds; i += 1) range.push(i);
      range.push(ELLIPSIS);
      for (let i = current - onEachSide; i <= current; i += 1) range.push(i);
    } else for (let i = 1; i <= current; i += 1) range.push(i);
    if (current < pages - onEachSide - onEnds - 1) {
      for (let i = current + 1; i <= current + onEachSide; i += 1) range.push(i);
      range.push(ELLIPSIS);
      for (let i = pages - onEnds + 1; i <= pages; i += 1) range.push(i);
    } else for (let i = current + 1; i <= pages; i += 1) range.push(i);
    return range;
  }
}

// A page: its objects, its number, and its place among the others (the counts of the paginator are known by then).
class Page {
  constructor(objectList, number, paginator, numPages) {
    this.objectList = objectList;
    this.number = number;
    this.paginator = paginator;
    this.numPages = numPages;
    this.count = paginator.counted;
  }

  get length() {
    return this.objectList.length;
  }

  [Symbol.iterator]() {
    return this.objectList[Symbol.iterator]();
  }

  get hasNext() {
    return this.number < this.numPages;
  }

  get hasPrevious() {
    return this.number > 1;
  }

  get hasOtherPages() {
    return this.hasNext || this.hasPrevious;
  }

  get nextPageNumber() {
    if (!this.hasNext) throw new EmptyPage('That page contains no results');
    return this.number + 1;
  }

  get previousPageNumber() {
    if (!this.hasPrevious) throw new EmptyPage('That page number is less than 1');
    return this.number - 1;
  }

  // The index (from 1) of its first object among all, and of its last (0 and 0 on an empty page).
  get startIndex() {
    return this.count === 0 ? 0 : this.paginator.perPage * (this.number - 1) + 1;
  }

  get endIndex() {
    return this.count === 0 ? 0 : this.startIndex + this.objectList.length - 1;
  }

  toJSON() {
    return {
      number: this.number,
      numPages: this.numPages,
      count: this.count,
      hasNext: this.hasNext,
      hasPrevious: this.hasPrevious,
      startIndex: this.startIndex,
      endIndex: this.endIndex,
    };
  }
}

export { Paginator, Page, InvalidPage, PageNotAnInteger, EmptyPage, ELLIPSIS };
