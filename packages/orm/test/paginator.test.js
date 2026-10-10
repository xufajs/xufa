// The Paginator: pages of a QuerySet or a list, as Django's (its tests of pages, orphans, errors, ranges).
import { Database, Model, fields, Paginator, PageNotAnInteger, EmptyPage, InvalidPage } from '../index.js';

class PagedBook extends Model {
  static fields = { title: fields.string({ maxLength: 20 }) };

  static options = { ordering: ['title'] };
}

let db;
beforeAll(async () => {
  db = new Database({ backend: 'memory' }).register(PagedBook);
  await db.sync();
  for (let i = 1; i <= 23; i += 1) await PagedBook.objects.create({ title: `book ${String(i).padStart(2, '0')}` });
});
afterAll(() => db.close());

describe('Paginator', () => {
  it('pages of a QuerySet: their objects, numbers and neighbors, counted once', async () => {
    const paginator = new Paginator(PagedBook.objects.all(), 10);
    expect([await paginator.count(), await paginator.numPages(), await paginator.pageRange()]).toEqual([23, 3, [1, 2, 3]]);
    const first = await paginator.page();
    expect(first.objectList.map((book) => book.title)).toEqual(Array.from({ length: 10 }, (x, i) => `book ${String(i + 1).padStart(2, '0')}`));
    expect([first.number, first.hasNext, first.hasPrevious, first.nextPageNumber, first.startIndex, first.endIndex]).toEqual([1, true, false, 2, 1, 10]);
    const last = await paginator.page('3');
    expect([last.length, last.hasNext, last.previousPageNumber, last.startIndex, last.endIndex]).toEqual([3, false, 2, 21, 23]);
    expect(() => last.nextPageNumber).toThrow(EmptyPage);
    expect([...last].map((book) => book.title)).toEqual(['book 21', 'book 22', 'book 23']);
    expect(JSON.parse(JSON.stringify(last))).toEqual({ number: 3, numPages: 3, count: 23, hasNext: false, hasPrevious: true, startIndex: 21, endIndex: 23 });
  });

  it('orphans: a short last page joins the one before it', async () => {
    const paginator = new Paginator(PagedBook.objects.all(), 10, { orphans: 3 });
    expect(await paginator.numPages()).toBe(2);
    expect((await paginator.page(2)).length).toBe(13);
    expect(await new Paginator([1, 2, 3], 2, { orphans: 1 }).numPages()).toBe(1);
  });

  it('page(): PageNotAnInteger and EmptyPage (404); getPage(): the first or the last page instead', async () => {
    const paginator = new Paginator(PagedBook.objects.all(), 10);
    await expect(paginator.page('x')).rejects.toThrow(PageNotAnInteger);
    await expect(paginator.page('1.5')).rejects.toThrow(PageNotAnInteger);
    await expect(paginator.page(0)).rejects.toThrow('That page number is less than 1');
    await expect(paginator.page(4)).rejects.toThrow('That page contains no results');
    const err = await paginator.page(4).catch((e) => e);
    expect([err instanceof InvalidPage, err.statusCode, err.code]).toEqual([true, 404, 'XUFA_ORM_ERR_INVALID_PAGE']);
    expect((await paginator.getPage('nope')).number).toBe(1);
    expect((await paginator.getPage(99)).number).toBe(3);
    expect((await paginator.getPage()).number).toBe(1);
  });

  it('no objects: one empty page, or none with allowEmptyFirstPage false', async () => {
    const empty = new Paginator(PagedBook.objects.filter({ title: 'none' }), 10);
    const page = await empty.page(1);
    expect([page.length, await empty.numPages(), page.startIndex, page.endIndex, page.hasOtherPages]).toEqual([0, 1, 0, 0, false]);
    const strict = new Paginator([], 10, { allowEmptyFirstPage: false });
    expect(await strict.numPages()).toBe(0);
    await expect(strict.page(1)).rejects.toThrow(EmptyPage);
  });

  it('elidedPageRange(): the pages near the page, those at the ends, and … between', async () => {
    const paginator = new Paginator(Array.from({ length: 100 }, (x, i) => i), 2);
    expect(await paginator.elidedPageRange(25)).toEqual([1, 2, '…', 22, 23, 24, 25, 26, 27, 28, '…', 49, 50]);
    expect(await paginator.elidedPageRange(1)).toEqual([1, 2, 3, 4, '…', 49, 50]);
    expect(await paginator.elidedPageRange(50, { onEachSide: 1, onEnds: 1 })).toEqual([1, '…', 49, 50]);
    expect(await new Paginator([1, 2, 3], 1).elidedPageRange(2)).toEqual([1, 2, 3]);
  });

  it('wrong options', () => {
    expect(() => new Paginator([], 0)).toThrow('perPage');
    expect(() => new Paginator([], 2, { orphans: -1 })).toThrow('orphans');
    expect(() => new Paginator('books', 2)).toThrow('A Paginator pages a QuerySet or a list');
  });
});
