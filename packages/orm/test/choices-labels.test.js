// Fields with choices and labels (Django's choices and get_FOO_display()), labels and help texts (verbose_name,
// help_text), and blank.
import { Database, Model, fields, ValidationError } from '../index.js';

class LoanCopy extends Model {
  static fields = {
    status: fields.string({
      maxLength: 1,
      choices: [
        ['d', 'Maintenance'],
        ['o', 'On loan'],
        ['a', 'Available'],
      ],
      default: 'd',
      label: 'Availability',
      help: 'Whether the copy can be borrowed',
    }),
    format: fields.string({ choices: { hb: 'Hardback', pb: 'Paperback' }, null: true }),
    shelf: fields.string({ choices: ['A', 'B'], null: true }),
    imprint: fields.string({ blank: false }),
    note: fields.string({ default: '' }),
    died: fields.date({ null: true, label: 'died' }),
  };
}

let db;
beforeAll(async () => {
  db = new Database({ backend: 'memory' }).register(LoanCopy);
  await db.sync();
});
afterAll(() => db.close());

describe('choices with labels', () => {
  it('choices as [value, label] or an object: the values are checked, display() gives the labels', async () => {
    const field = (name) => LoanCopy.meta.fields.find((item) => item.name === name);
    expect(field('status').choices).toEqual(['d', 'o', 'a']);
    expect([...field('format').choiceLabels]).toEqual([
      ['hb', 'Hardback'],
      ['pb', 'Paperback'],
    ]);
    expect(field('shelf').choiceLabels).toBe(null);
    const copy = await LoanCopy.objects.create({ status: 'o', format: 'pb', shelf: 'B', imprint: 'Penguin' });
    expect([copy.display('status'), copy.display('format'), copy.display('shelf'), copy.display('died')]).toEqual([
      'On loan',
      'Paperback',
      'B',
      null,
    ]);
    expect(() => copy.display('nope')).toThrow('LoanCopy has no field nope');
    const wrong = await LoanCopy.objects.create({ status: 'x', imprint: 'y' }).catch((err) => err);
    expect(wrong).toBeInstanceOf(ValidationError);
    expect(wrong.errors.status).toEqual(['The value "x" is not a valid choice.']);
    expect(() => fields.string({ choices: 'abc' })).toThrow('choices are a list');
  });

  it('label and help (and in the JSON schema); blank: false refuses an empty text', async () => {
    const status = LoanCopy.meta.fields.find((item) => item.name === 'status');
    expect([status.label, status.help, status.blank]).toEqual(['Availability', 'Whether the copy can be borrowed', false]);
    expect(LoanCopy.meta.fields.find((item) => item.name === 'died').blank).toBe(true);
    const schema = LoanCopy.schema();
    expect(schema.properties.status).toMatchObject({ title: 'Availability', description: 'Whether the copy can be borrowed', enum: ['d', 'o', 'a'] });
    const empty = await LoanCopy.objects.create({ imprint: '' }).catch((err) => err);
    expect(empty.errors).toEqual({ imprint: ['This field is required.'] });
    // Without blank, an empty text is a value (as before).
    expect((await LoanCopy.objects.create({ imprint: 'x', note: '' })).note).toBe('');
  });
});

describe('the text of an object and the names of a model', () => {
  class TextAuthor extends Model {
    static fields = { first: fields.string(), last: fields.string() };
    static options = { display: '{last}, {first}', label: 'writer' };
  }
  class TextCopy extends Model {
    static fields = { author: fields.foreignKey(() => TextAuthor, { null: true }) };
    static options = { display: '{id} ({author.last})' };
  }
  class TextLoanRecord extends Model {
    static fields = { note: fields.string() };
  }

  it("options.display: {field} and {relation.field} of loaded relations; a function; else Django's text", async () => {
    const db = new Database({ backend: 'memory' }).register(TextAuthor, TextCopy, TextLoanRecord);
    await db.sync();
    const ada = await TextAuthor.objects.create({ first: 'Ada', last: 'Lovelace' });
    expect(String(ada)).toBe('Lovelace, Ada');
    const copy = await TextCopy.objects.create({ author: ada });
    expect(String(await TextCopy.objects.get({ pk: copy.pk }))).toBe(`${copy.pk} ()`);
    expect(String(await TextCopy.objects.selectRelated('author').get({ pk: copy.pk }))).toBe(`${copy.pk} (Lovelace)`);
    const record = await TextLoanRecord.objects.create({ note: 'x' });
    expect(String(record)).toBe(`TextLoanRecord object (${record.pk})`);
    class Named extends Model {
      static fields = { note: fields.string() };
      static options = { display: (object) => `#${object.note}` };
    }
    expect(String(new Named({ note: 'a' }))).toBe('#a');
  });

  it("label and labelPlural (Django's verbose_name): given, or of the name", () => {
    expect([TextAuthor.meta.label, TextAuthor.meta.labelPlural]).toEqual(['writer', 'writers']);
    expect([TextLoanRecord.meta.label, TextLoanRecord.meta.labelPlural]).toEqual(['text loan record', 'text loan records']);
    class Shelved extends Model {
      static fields = { note: fields.string() };
      static options = { permissions: { markReturned: 'Set book as returned' } };
    }
    expect(Shelved.meta.permissions.map((item) => item.name)).toEqual([
      'Shelved.add',
      'Shelved.change',
      'Shelved.delete',
      'Shelved.view',
      'Shelved.markReturned',
    ]);
    expect(Shelved.meta.permissions[4].label).toBe('Set book as returned');
    expect(Shelved.meta.permissions[0].label).toBe('Can add shelved');
  });
});
