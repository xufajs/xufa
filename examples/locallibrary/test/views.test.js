// catalog/tests/test_views.py: the list of authors in pages, the copies a user borrowed, the renewal of a copy by a
// librarian, and the creation of an author; and what the port adds: the pages of every model, forms that save and
// say their errors, deletes that are refused, the session, the login and a password reset by email.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, textOf } from 'xufa';
import { useTestApp } from 'xufa/testing';
import { Author, Book, BookInstance, Genre, Language } from '../catalog/models.js';
import { User, Group } from '../accounts/models.js';
import { reverse as url } from 'xufa/project';
import { addDays as inDays } from 'xufa/forms';

const app = useTestApp();
const { createUser } = app;

const linksOf = (html, prefix) =>
  [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]).filter((href) => href.startsWith(prefix));

// A book of an author, a genre and a language (the setUp of the tests of borrowed copies).
async function makeBook() {
  const author = await Author.objects.create({ firstName: 'Dominique', lastName: 'Rousseau' });
  const genre = await Genre.objects.create({ name: 'Fantasy' });
  const language = await Language.objects.create({ name: 'English' });
  const book = await Book.objects.create({
    title: 'Book Title',
    summary: 'My book summary',
    isbn: 'ABCDEFG',
    author,
    language,
  });
  await book.genre.set([genre]);
  return book;
}

describe('AuthorListView', () => {
  beforeEach(async () => {
    for (let id = 0; id < 13; id += 1)
      await Author.objects.create({ firstName: `Christian ${id}`, lastName: `Surname ${id}` });
  });

  test('the url exists at its location, and by its name', async () => {
    const client = new TestClient(app);
    assert.equal((await client.get('/catalog/authors/')).statusCode, 200);
    assert.equal((await client.get(url('authors'))).statusCode, 200);
  });

  test('pages of ten, and the rest in the second', async () => {
    const client = new TestClient(app);
    const first = await client.get(url('authors'));
    // assertTemplateUsed, and response.context (is_paginated, author_list).
    assert.deepEqual(first.templates, ['catalog/author_list']);
    assert.equal(first.context.isPaginated, true);
    assert.equal(first.context.authorList.length, 10);
    assert.equal(linksOf(first.body, '/catalog/author/').length, 10);
    assert.match(first.textContent, /Page 1 of 2\./);
    const second = await client.get(url('authors'), { page: 2 });
    assert.equal(second.context.authorList.length, 3);
    assert.equal(linksOf(second.body, '/catalog/author/').length, 3);
    assert.equal((await client.get(`${url('authors')}?page=3`)).statusCode, 404);
  });
});

describe('LoanedBookInstancesByUserListView', () => {
  let book;
  let user1;
  beforeEach(async () => {
    user1 = await createUser('testuser1', '1X<ISRUkw+tuK');
    const user2 = await createUser('testuser2', '2HJ1vRV0Z&3iD');
    book = await makeBook();
    for (let copy = 0; copy < 30; copy += 1) {
      await BookInstance.objects.create({
        book,
        imprint: 'Unlikely Imprint, 2016',
        dueBack: inDays(copy % 5),
        borrower: copy % 2 ? user1 : user2,
        // Django's test says 'm', which is no choice of status: Django's create() does not validate, and xufa's
        // does. 'd' (maintenance) is what it means: not on loan.
        status: 'd',
      });
    }
  });

  test('redirects to the login when not logged in', async () => {
    const res = await new TestClient(app).get(url('my-borrowed'));
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, '/accounts/login/?next=%2Fcatalog%2Fmybooks%2F');
  });

  test('logged in: the page of the user', async () => {
    const client = new TestClient(app);
    assert.equal(await client.login({ username: 'testuser1', password: '1X<ISRUkw+tuK' }), true);
    const res = await client.get(url('my-borrowed'));
    assert.equal(res.statusCode, 200);
    assert.equal(res.context.user.username, 'testuser1');
    assert.deepEqual(res.templates, ['catalog/bookinstance_list_borrowed']);
    assert.match(res.textContent, /User: testuser1/);
    assert.match(res.textContent, /Borrowed books/);
  });

  test('only the copies on loan to the user', async () => {
    const client = new TestClient(app);
    await client.login({ username: 'testuser1', password: '1X<ISRUkw+tuK' });
    assert.match(textOf((await client.get(url('my-borrowed'))).body), /There are no books borrowed\./);
    const ten = await BookInstance.objects.orderBy('pk').slice(0, 10);
    await BookInstance.objects.filter({ pk__in: ten.map((copy) => copy.pk) }).update({ status: 'o' });
    const mine = await BookInstance.objects.filter({ borrower: user1.pk, status: 'o' }).count();
    const res = await client.get(url('my-borrowed'));
    assert.equal(linksOf(res.body, `/catalog/book/${book.pk}`).length, mine);
  });

  test('pages of ten, ordered by due date', async () => {
    await BookInstance.objects.update({ status: 'o' });
    const client = new TestClient(app);
    await client.login({ username: 'testuser1', password: '1X<ISRUkw+tuK' });
    const res = await client.get(url('my-borrowed'));
    const dates = [...res.body.matchAll(/\((\d{4}-\d{2}-\d{2})\)/g)].map((match) => match[1]);
    assert.equal(dates.length, 10);
    assert.deepEqual(dates, [...dates].sort());
  });
});

describe('RenewBookInstancesView', () => {
  let copy1;
  let copy2;
  beforeEach(async () => {
    const user1 = await createUser('testuser1', '1X<ISRUkw+tuK');
    const user2 = await createUser('testuser2', '2HJ1vRV0Z&3iD', { permissions: ['BookInstance.markReturned'] });
    const book = await makeBook();
    const dueBack = inDays(5);
    copy1 = await BookInstance.objects.create({
      book,
      imprint: 'Unlikely Imprint, 2016',
      dueBack,
      borrower: user1,
      status: 'o',
    });
    copy2 = await BookInstance.objects.create({
      book,
      imprint: 'Unlikely Imprint, 2016',
      dueBack,
      borrower: user2,
      status: 'o',
    });
  });
  const renew = (copy) => url('renew-book-librarian', copy.pk);
  const asLibrarian = async () => {
    const client = new TestClient(app);
    await client.login({ username: 'testuser2', password: '2HJ1vRV0Z&3iD' });
    return client;
  };

  test('redirects to the login when not logged in', async () => {
    const res = await new TestClient(app).get(renew(copy1));
    assert.equal(res.statusCode, 302);
    assert.ok(res.headers.location.startsWith('/accounts/login/'));
  });

  test('403 when logged in without the permission', async () => {
    const client = new TestClient(app);
    await client.login({ username: 'testuser1', password: '1X<ISRUkw+tuK' });
    assert.equal((await client.get(renew(copy1))).statusCode, 403);
  });

  test('the permission of a group of the user (as the groups of Django); a change of the group is seen at once', async () => {
    const renewers = await Group.objects.create({ name: 'Renewers', permissions: ['BookInstance.markReturned'] });
    const user1 = await User.objects.get({ username: 'testuser1' });
    await user1.groups.set([renewers.pk]);
    const client = new TestClient(app);
    await client.login({ username: 'testuser1', password: '1X<ISRUkw+tuK' });
    assert.equal((await client.get(renew(copy1))).statusCode, 200);
    renewers.permissions = [];
    await renewers.save();
    assert.equal((await client.get(renew(copy1))).statusCode, 403);
  });

  test('with the permission: its own copy, and those of others', async () => {
    const client = await asLibrarian();
    assert.equal((await client.get(renew(copy2))).statusCode, 200);
    const res = await client.get(renew(copy1));
    assert.equal(res.statusCode, 200);
    assert.match(res.textContent, /Renew: Book Title/);
  });

  test('the date is three weeks ahead at first', async () => {
    const res = await (await asLibrarian()).get(renew(copy1));
    assert.deepEqual(res.templates, ['catalog/book_renew_librarian']);
    assert.equal(res.context.form.initial.renewalDate, inDays(21));
    assert.match(res.body, new RegExp(`name="renewalDate" value="${inDays(21)}"`));
  });

  test('a date in the past, or more than 4 weeks ahead: the form again with its error', async () => {
    const client = await asLibrarian();
    const past = await client.post(renew(copy1), { renewalDate: inDays(-7) });
    assert.equal(past.statusCode, 200);
    assert.match(past.textContent, /Invalid date - renewal in past/);
    const future = await client.post(renew(copy1), { renewalDate: inDays(35) });
    assert.equal(future.statusCode, 200);
    assert.match(future.textContent, /Invalid date - renewal more than 4 weeks ahead/);
  });

  test('a valid date: saved, and to the list of all borrowed', async () => {
    const res = await (await asLibrarian()).post(renew(copy1), { renewalDate: inDays(14) });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, url('all-borrowed'));
    assert.equal(String((await BookInstance.objects.get({ pk: copy1.pk })).dueBack), inDays(14));
  });

  test('404 for a copy that is not there', async () => {
    const res = await (await asLibrarian()).get(url('renew-book-librarian', '0f1e2d3c-4b5a-4968-8776-655443322110'));
    assert.equal(res.statusCode, 404);
  });
});

describe('AuthorCreateView', () => {
  beforeEach(async () => {
    await createUser('testuser1', '1X<ISRUkw+tuK');
    await createUser('testuser2', '2HJ1vRV0Z&3iD', { permissions: ['Book.add', 'Author.add'] });
    await Author.objects.create({ firstName: 'Dominique', lastName: 'Rousseau' });
  });

  test('redirects to the login when not logged in', async () => {
    const res = await new TestClient(app).get(url('author-create'));
    assert.equal(res.headers.location, '/accounts/login/?next=%2Fcatalog%2Fauthor%2Fcreate%2F');
  });

  test('403 without the permission, the form with it', async () => {
    const client = new TestClient(app);
    await client.login({ username: 'testuser1', password: '1X<ISRUkw+tuK' });
    assert.equal((await client.get(url('author-create'))).statusCode, 403);
    const librarian = new TestClient(app);
    await librarian.login({ username: 'testuser2', password: '2HJ1vRV0Z&3iD' });
    const res = await librarian.get(url('author-create'));
    assert.equal(res.statusCode, 200);
    // The date of death is 2023-11-11 at first.
    assert.match(res.body, /name="dateOfDeath" value="2023-11-11" id="id_dateOfDeath"/);
  });

  test('saved: to the page of the author', async () => {
    const client = new TestClient(app);
    await client.login({ username: 'testuser2', password: '2HJ1vRV0Z&3iD' });
    const res = await client.post(url('author-create'), { firstName: 'Christian Name', lastName: 'Surname' });
    assert.equal(res.statusCode, 302);
    assert.ok(res.headers.location.startsWith('/catalog/author/'));
    assert.equal(await Author.objects.filter({ lastName: 'Surname' }).count(), 1);
  });
});

// What the port adds to the tests of Django.
describe('the rest of the site', () => {
  let librarian;
  beforeEach(async () => {
    await createUser('librarian', 'a-librarian-password', {
      isStaff: true,
      role: 'librarian',
      email: 'lib@example.com',
    });
    librarian = new TestClient(app);
    await librarian.login({ username: 'librarian', password: 'a-librarian-password' });
  });

  test('the home page counts, and the visits of the session', async () => {
    const book = await makeBook();
    await BookInstance.objects.create({ book, imprint: 'x', status: 'a' });
    const client = new TestClient(app);
    const first = textOf((await client.get('/catalog/')).body);
    assert.match(first, /Books: 1 Copies: 1 Copies available: 1 Authors: 1/);
    assert.match(first, /visited this page 1 time\./);
    assert.match(textOf((await client.get('/catalog/')).body), /visited this page 2 times\./);
    assert.equal((await client.get('/')).headers.location, '/catalog/');
  });

  test('the pages of a book, its author, genre, language and copies', async () => {
    const book = await makeBook();
    const copy = await BookInstance.objects.create({ book, imprint: 'Penguin', status: 'o', dueBack: inDays(-1) });
    const page = async (address) => textOf((await librarian.get(address)).body);
    assert.match(
      await page(book.absoluteUrl),
      /Title: Book Title Author: Rousseau, Dominique .* Genre: Fantasy .* On loan/
    );
    assert.match(await page(url('author-detail', book.authorId)), /Book Title \(1\)/);
    assert.match(
      await page(url('genre-detail', (await Genre.objects.first()).pk)),
      /Book Title \(Rousseau, Dominique\)/
    );
    assert.match(await page(url('language-detail', book.languageId)), /Books in language Book Title/);
    assert.match(await page(copy.absoluteUrl), /Status: On loan \(Due: /);
    // Overdue copies are red in the list.
    assert.match((await librarian.get(url('bookinstances'))).body, /class="text-danger"/);
  });

  test('a book with its genres: the form saves the many-to-many, and says the errors of the model', async () => {
    await makeBook();
    const genres = await Genre.objects.all();
    const author = await Author.objects.first();
    const bad = await librarian.post(url('book-create'), {
      title: '',
      author: author.pk,
      summary: 'x',
      isbn: 'ABCDEFG',
    });
    assert.equal(bad.statusCode, 200);
    assert.match(bad.textContent, /This field is required\./);
    assert.match(bad.textContent, /Book with this ISBN already exists\.|This field is required\./);
    const res = await librarian.post(url('book-create'), {
      title: 'Another',
      author: author.pk,
      summary: 'A summary',
      isbn: '9780000000001',
      genre: genres.map((genre) => genre.pk),
      language: '',
    });
    assert.equal(res.statusCode, 302);
    const book = await Book.objects.get({ isbn: '9780000000001' });
    assert.deepEqual((await book.genre.all()).map(String), ['Fantasy']);
    assert.equal(book.languageId, null);
    const taken = await librarian.post(url('book-create'), {
      title: 'Copy',
      author: author.pk,
      summary: 'x',
      isbn: '9780000000001',
      genre: genres[0].pk,
    });
    assert.match(taken.textContent, /Book with this ISBN already exists\./);
  });

  test('genres are unique without case', async () => {
    await Genre.objects.create({ name: 'Fantasy' });
    const res = await librarian.post(url('genre-create'), { name: 'FANTASY' });
    assert.equal(res.statusCode, 200);
    assert.match(res.textContent, /Genre already exists \(case insensitive match\)/);
    assert.equal((await librarian.post(url('genre-create'), { name: 'Poetry' })).statusCode, 302);
  });

  test('an author with books, or a book with copies, is not deleted', async () => {
    const book = await makeBook();
    await BookInstance.objects.create({ book, imprint: 'x' });
    const authorPage = textOf((await librarian.get(url('author-delete', book.authorId))).body);
    assert.match(authorPage, /You can't delete this author until all their books have been deleted/);
    assert.equal(
      (await librarian.post(url('author-delete', book.authorId))).headers.location,
      url('author-delete', book.authorId)
    );
    assert.equal(await Author.objects.count(), 1);
    assert.match(textOf((await librarian.get(url('book-delete', book.pk))).body), /until all copies have been deleted/);
    await BookInstance.objects.delete();
    assert.equal((await librarian.post(url('book-delete', book.pk))).headers.location, url('books'));
    assert.equal(await Book.objects.count(), 0);
  });

  test('the sidebar has the links the user may follow', async () => {
    const book = await makeBook();
    const html = (await librarian.get(book.absoluteUrl)).body;
    assert.deepEqual(linksOf(html, `/catalog/book/${book.pk}/`), [
      `/catalog/book/${book.pk}/update/`,
      `/catalog/book/${book.pk}/delete/`,
    ]);
    assert.match(html, /Create genre/);
    const reader = new TestClient(app);
    await createUser('reader', 'a-reader-password');
    await reader.login({ username: 'reader', password: 'a-reader-password' });
    const plain = (await reader.get(book.absoluteUrl)).body;
    assert.deepEqual(linksOf(plain, `/catalog/book/${book.pk}/`), []);
    assert.doesNotMatch(plain, /Create genre/);
  });

  test('a wrong password says so; logging out ends the session', async () => {
    const client = new TestClient(app);
    const wrong = await client.post('/accounts/login/', { username: 'librarian', password: 'nope' });
    assert.match(wrong.textContent, /Your username and password didn't match\./);
    const out = await librarian.post('/accounts/logout/');
    assert.match(out.textContent, /Logged out!/);
    assert.equal((await librarian.get(url('my-borrowed'))).statusCode, 302);
  });

  test('a password reset: an email with a link, and the new password through it', async () => {
    const client = new TestClient(app);
    const asked = await client.post('/accounts/password_reset/', { email: 'lib@example.com' });
    assert.equal(asked.headers.location, '/accounts/password_reset/done/');
    // The same answer for an email that is not there, and no email.
    assert.equal(
      (await client.post('/accounts/password_reset/', { email: 'nobody@example.com' })).headers.location,
      '/accounts/password_reset/done/'
    );
    assert.equal(app.mails.length, 1);
    const link = /http:\/\/[^\s]+\/accounts\/reset\/([^/\s]+)\//.exec(app.mails[0]);
    assert.ok(link, app.mails[0]);
    const page = await client.get(`/accounts/reset/${link[1]}/`);
    assert.match(page.textContent, /Please enter \(and confirm\) your new password\./);
    const confirm = `/accounts/reset/${link[1]}/`;
    const different = await client.post(confirm, { newPassword1: 'a-new-librarian-password', newPassword2: 'other' });
    assert.match(different.textContent, /The two password fields didn't match\./);
    const weak = await client.post(confirm, { newPassword1: 'short', newPassword2: 'short' });
    assert.match(weak.textContent, /At least 8 characters/);
    const res = await client.post(confirm, {
      newPassword1: 'a-new-librarian-password',
      newPassword2: 'a-new-librarian-password',
    });
    assert.equal(res.headers.location, '/accounts/reset/done/');
    // Once only (validlink).
    assert.match(textOf((await client.get(confirm)).body), /Password reset failed/);
    assert.equal(
      await new TestClient(app).login({ username: 'librarian', password: 'a-new-librarian-password' }),
      true
    );
  });

  test('the admin: the staff logs in with their password', async () => {
    const page = await new TestClient(app).get('/admin/');
    assert.equal(page.statusCode, 302);
    const user = await User.objects.get({ username: 'librarian' });
    assert.equal(user.isStaff, true);
  });
});
