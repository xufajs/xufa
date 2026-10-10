// ModelForm: forms of models of @xufa/orm (the books of the LocalLibrary): fields made of the model's, labels, help and
// choices with labels, objects of foreign keys and many-to-many, the model's checks and its unique values, and save().
import { Database, Model, fields, Lower } from '@xufa/orm';
import { ModelForm, Form, modelFormOf, fields as formFields } from '../index.js';

class FormGenre extends Model {
  static fields = { name: fields.string({ maxLength: 200, help: 'Enter a book genre' }) };

  static options = {
    table: 'form_genre',
    constraints: [{ unique: [Lower('name')], message: 'Genre already exists (case insensitive match)' }],
  };

  toString() {
    return this.name;
  }
}

class FormAuthor extends Model {
  static fields = {
    firstName: fields.string({ maxLength: 100 }),
    lastName: fields.string({ maxLength: 100 }),
    dateOfDeath: fields.date({ null: true, label: 'died' }),
  };

  static options = { table: 'form_author' };

  toString() {
    return `${this.lastName}, ${this.firstName}`;
  }
}

class FormBook extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    author: fields.foreignKey(() => FormAuthor, { null: true, onDelete: 'protect' }),
    summary: fields.text({ maxLength: 1000 }),
    isbn: fields.string({ maxLength: 13, unique: true, label: 'ISBN' }),
    genre: fields.manyToMany(() => FormGenre),
    status: fields.string({ maxLength: 1, choices: [['a', 'Available'], ['o', 'On loan']], default: 'a' }),
    pages: fields.integer({ null: true, validate: 'value > 0' }),
    published: fields.boolean({ default: false }),
    createdAt: fields.datetime({ autoNowAdd: true }),
  };

  static options = { table: 'form_book', rules: [{ rule: "status !== 'o' || pages !== null", message: 'A book on loan has pages', field: 'pages' }] };
}

class BookForm extends ModelForm {
  static meta = {
    model: FormBook,
    fields: ['title', 'author', 'summary', 'isbn', 'genre', 'status', 'pages', 'published'],
    help: { title: 'As on the cover' },
  };
}

class GenreForm extends ModelForm {
  static meta = { model: FormGenre, fields: '__all__' };
}

let db;
let ada;
let genres;
beforeAll(async () => {
  db = new Database({ backend: 'memory' }).register(FormGenre, FormAuthor, FormBook);
  await db.sync();
  ada = await FormAuthor.objects.create({ firstName: 'Ada', lastName: 'Lovelace' });
  genres = [await FormGenre.objects.create({ name: 'Fantasy' }), await FormGenre.objects.create({ name: 'Poetry' })];
});
afterAll(() => db.close());

describe('ModelForm', () => {
  it('its fields: those of the model, in order, with labels, help, choices with labels and what is required', async () => {
    const form = new BookForm();
    expect(Object.keys(form.fields)).toEqual(['title', 'author', 'summary', 'isbn', 'genre', 'status', 'pages', 'published']);
    await form.prepare();
    const html = form.asTable();
    expect(html).toContain('<label for="id_isbn">ISBN:</label>');
    expect(html).toContain('<span class="helptext" id="id_title_helptext">As on the cover</span>');
    expect(html).toContain('<select name="author" id="id_author"><option value="">---------</option><option value="1">Lovelace, Ada</option></select>');
    expect(html).toContain('<select name="genre" multiple id="id_genre" required><option value="1">Fantasy</option><option value="2">Poetry</option></select>');
    // A choice with a default: no empty option, the default chosen.
    expect(html).toContain('<select name="status" id="id_status" required><option value="a" selected>Available</option><option value="o">On loan</option></select>');
    expect(html).toContain('<textarea name="summary" cols="40" rows="10" maxlength="1000" id="id_summary" required>');
    expect(html).toContain('<input type="checkbox" name="published" id="id_published">');
    expect(form.fields.pages.required).toBe(false);
    expect(Object.keys(new GenreForm().fields)).toEqual(['name']);
    expect(new (class extends ModelForm {
      static meta = { model: FormAuthor, exclude: ['dateOfDeath'] };
    })().fields).not.toHaveProperty('dateOfDeath');
    expect(new (class extends ModelForm {
      static meta = { model: FormAuthor };
    })().field('dateOfDeath').label).toBe('Died');
  });

  it('saves a new object and its many-to-many; the objects of choices; the model\'s checks and unique values', async () => {
    const form = new BookForm({
      data: { title: 'Notes', author: String(ada.pk), summary: 'On the engine', isbn: '9780000000001', genre: [String(genres[0].pk), String(genres[1].pk)], status: 'a', published: 'on' },
    });
    expect(await form.isValid()).toBe(true);
    expect(form.cleanedData.author).toBe(form.fields.author.objects[0]);
    const book = await form.save();
    expect([book.title, book.authorId, book.published, (await book.genre.all()).map(String)]).toEqual(['Notes', ada.pk, true, ['Fantasy', 'Poetry']]);
    // The unique ISBN, the model's rules and validators, choices that are not there.
    const again = new BookForm({ data: { title: 'Copy', summary: 's', isbn: '9780000000001', genre: [String(genres[0].pk)], status: 'o', pages: '-3', author: '99' } });
    expect(await again.isValid()).toBe(false);
    expect(again.errors).toEqual({
      author: ['Select a valid choice. 99 is not one of the available choices.'],
      pages: ['The value is not valid.'],
      isbn: ['Form book with this ISBN already exists.'], // the unique values of the fields without errors
    });
    const rule = new BookForm({ data: { title: 'Copy', summary: 's', isbn: '9780000000001', genre: [String(genres[0].pk)], status: 'o' } });
    expect(await rule.isValid()).toBe(false);
    expect(rule.errors).toEqual({
      pages: ['A book on loan has pages'],
      isbn: ['Form book with this ISBN already exists.'],
    });
    const unique = new BookForm({ data: { title: 'Copy', summary: 's', isbn: '9780000000001', genre: [String(genres[0].pk)], status: 'a' } });
    expect(await unique.isValid()).toBe(false);
    expect(unique.errors).toEqual({ isbn: ['Form book with this ISBN already exists.'] });
    await expect(unique.save()).rejects.toThrow('The form is not valid');
  });

  it('changes an instance: its values shown (its many-to-many too); its own value is not a duplicate; constraints without case', async () => {
    const book = await FormBook.objects.get({ isbn: '9780000000001' });
    const shown = new BookForm({ instance: book });
    await shown.prepare();
    expect(shown.field('title').widget()).toContain('value="Notes"');
    expect(shown.field('genre').widget()).toContain('<option value="1" selected>Fantasy</option><option value="2" selected>Poetry</option>');
    expect(shown.field('author').widget()).toContain('<option value="1" selected>Lovelace, Ada</option>');
    const changed = new BookForm({ instance: book, data: { title: 'Notes II', author: '', summary: 'x', isbn: '9780000000001', genre: [String(genres[1].pk)], status: 'a' } });
    expect(await changed.isValid()).toBe(true);
    const saved = await changed.save();
    expect([saved.pk, saved.title, saved.authorId, saved.published, (await saved.genre.all()).map(String)]).toEqual([book.pk, 'Notes II', null, false, ['Poetry']]);
    // UniqueConstraint(Lower('name')): its message under the field.
    const genre = new GenreForm({ data: { name: 'FANTASY' } });
    expect(await genre.isValid()).toBe(false);
    expect(genre.errors).toEqual({ name: ['Genre already exists (case insensitive match)'] });
    const fantasy = await FormGenre.objects.get({ name: 'Fantasy' });
    expect(await new GenreForm({ instance: fantasy, data: { name: 'FANTASY' } }).isValid()).toBe(true);
    expect(new GenreForm().field('name').help).toBe('Enter a book genre');
  });

  it('fields of the form over those of the model; save({ commit: false })', async () => {
    class ShortBookForm extends ModelForm {
      static meta = { model: FormBook, fields: ['title', 'summary', 'isbn', 'genre'] };

      static fields = { title: formFields.string({ maxLength: 5, label: 'Short title' }), agree: formFields.boolean() };
    }
    const form = new ShortBookForm({ data: { title: 'Toolong', summary: 's', isbn: '1', genre: [String(genres[0].pk)] } });
    expect(Object.keys(form.fields)).toEqual(['summary', 'isbn', 'genre', 'title', 'agree']);
    expect(await form.isValid()).toBe(false);
    expect(Object.keys(form.errors).sort()).toEqual(['agree', 'title']);
    const ok = new ShortBookForm({ data: { title: 'Short', summary: 's', isbn: '2', genre: [String(genres[0].pk)], agree: 'on' } });
    expect(await ok.isValid()).toBe(true);
    const object = await ok.save({ commit: false });
    expect([object.title, object.pk === undefined || object.pk === null]).toEqual(['Short', true]);
    expect(() => new (class extends ModelForm {})()).toThrow('static meta = { model, fields }');
    expect(Form).toBeDefined();
  });

  it('modelFormOf makes the ModelForm of a model and its meta (modelform_factory)', async () => {
    const AuthorForm = modelFormOf(FormAuthor, { fields: ['firstName', 'dateOfDeath'], labels: { firstName: 'Name' } });
    expect(AuthorForm.name).toBe('FormAuthorForm');
    const form = new AuthorForm({ data: { firstName: 'Ursula', dateOfDeath: '' } });
    expect([form.field('firstName').label, form.field('dateOfDeath').label]).toEqual(['Name', 'Died']);
    expect(await form.isValid()).toBe(true);
    expect(form.cleanedData).toEqual({ firstName: 'Ursula', dateOfDeath: null });
  });
});
