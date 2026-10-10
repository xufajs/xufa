// Constraints of models (Django's Meta.constraints): unique ones of fields together and of Lower() (without case), with
// their messages, on every backend; and checks (rules). PostgreSQL with XUFA_PG_URL, MongoDB with XUFA_MONGO_URL.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Database, Model, fields, Lower, UniqueError, ValidationError } from '../index.js';
import * as schemaModule from '../lib/schema.js';

const dirs = [];
afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const BACKENDS = [
  ['memory', () => ({ backend: 'memory' })],
  [
    'fs',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-constraints-'));
      dirs.push(dir);
      return { backend: 'fs', dir };
    },
  ],
  [
    'sqlite',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-constraints-'));
      dirs.push(dir);
      return { backend: 'sqlite', filename: path.join(dir, 'c.db') };
    },
  ],
];
if (process.env.XUFA_PG_URL) BACKENDS.push(['postgres', () => ({ backend: 'postgres', url: process.env.XUFA_PG_URL })]);
if (process.env.XUFA_MONGO_URL) BACKENDS.push(['mongodb', () => ({ backend: 'mongodb', url: process.env.XUFA_MONGO_URL })]);

describe.each(BACKENDS)('constraints on %s', (name, options) => {
  class CiGenre extends Model {
    static fields = { name: fields.string({ maxLength: 100 }) };

    static options = {
      table: 'constraints_genre',
      constraints: [{ unique: [Lower('name')], name: 'constraints_genre_name_ci', message: 'Genre already exists (case insensitive match)' }],
    };
  }
  // unique: 'ci' on the field: the same constraint, named by the model and the field.
  class CiLanguage extends Model {
    static fields = {
      name: fields.string({
        maxLength: 100,
        unique: 'ci',
        messages: { unique: 'Language already exists (case insensitive match)' },
      }),
    };

    static options = { table: 'constraints_language' };
  }
  class CiShelfBook extends Model {
    static fields = {
      shelf: fields.string({ maxLength: 10 }),
      position: fields.integer(),
      code: fields.string({ maxLength: 20, null: true }),
      pages: fields.integer({ default: 1 }),
    };

    static options = {
      table: 'constraints_shelf_book',
      constraints: [
        { unique: ['shelf', 'position'], message: 'That place of the shelf is taken' },
        { unique: [Lower('code')] },
        { check: 'pages > 0', name: 'positive_pages', message: 'A book has pages', field: 'pages' },
      ],
    };
  }

  let db;
  beforeAll(async () => {
    db = new Database(options()).register(CiGenre, CiLanguage, CiShelfBook);
    await db.connect();
    await db.sync();
    // Tables of an earlier run (PostgreSQL, MongoDB) start empty.
    await CiShelfBook.objects.delete();
    await CiGenre.objects.delete();
    await CiLanguage.objects.delete();
  });
  afterAll(async () => {
    await db.close();
  });

  it('unique without case: the message of the constraint, and its fields', async () => {
    await CiGenre.objects.create({ name: 'Fantasy' });
    const err = await CiGenre.objects.create({ name: 'FANTASY' }).catch((e) => e);
    expect(err).toBeInstanceOf(UniqueError);
    expect([err.message, err.fields, err.statusCode]).toEqual(['Genre already exists (case insensitive match)', ['name'], 409]);
    await CiGenre.objects.create({ name: 'Poetry' });
    // An update too.
    const poetry = await CiGenre.objects.get({ name: 'Poetry' });
    poetry.name = 'fantasy';
    await expect(poetry.save()).rejects.toThrow('Genre already exists');
    expect(await CiGenre.objects.filter({ name__iexact: 'fantasy' }).count()).toBe(1);
  });

  it("unique: 'ci' of a field: its lower case unique, its message; no plain unique", async () => {
    const field = CiLanguage.meta.field('name');
    expect([field.unique, field.uniqueCi]).toEqual([false, true]);
    expect(CiLanguage.meta.indexes).toContainEqual(
      expect.objectContaining({ name: 'ci_language_name_case_insensitive_unique', lower: ['name'], unique: true })
    );
    await CiLanguage.objects.create({ name: 'English' });
    const err = await CiLanguage.objects.create({ name: 'english' }).catch((e) => e);
    expect(err).toBeInstanceOf(UniqueError);
    expect([err.message, err.fields]).toEqual(['Language already exists (case insensitive match)', ['name']]);
    await CiLanguage.objects.create({ name: 'French' });
    expect(await CiLanguage.objects.count()).toBe(2);
  });

  it('unique of fields together (nulls apart), Lower() without a message; checks are rules', async () => {
    await CiShelfBook.objects.create({ shelf: 'A', position: 1, code: 'X-1' });
    await CiShelfBook.objects.create({ shelf: 'A', position: 2, code: null });
    await CiShelfBook.objects.create({ shelf: 'B', position: 1, code: null });
    const taken = await CiShelfBook.objects.create({ shelf: 'A', position: 1 }).catch((e) => e);
    expect([taken.message, taken.fields]).toEqual(['That place of the shelf is taken', ['shelf', 'position']]);
    const code = await CiShelfBook.objects.create({ shelf: 'C', position: 9, code: 'x-1' }).catch((e) => e);
    expect([code instanceof UniqueError, code.fields]).toEqual([true, ['code']]);
    const check = await CiShelfBook.objects.create({ shelf: 'C', position: 3, pages: 0 }).catch((e) => e);
    expect(check).toBeInstanceOf(ValidationError);
    expect(check.errors).toEqual({ pages: ['A book has pages'] });
  });
});

describe('constraints: options', () => {
  it('wrong constraints and indexes are errors when the model is registered', () => {
    class Wrong extends Model {
      static fields = { name: fields.string() };

      static options = { constraints: [{ nope: true }] };
    }
    expect(() => new Database({ backend: 'memory' }).register(Wrong)).toThrow('is { unique: [...] } or { check: rule }');
    expect(() => Lower('')).toThrow('the name of a field');
    class WrongIndex extends Model {
      static fields = { name: fields.string() };

      static options = { indexes: [{ fields: [] }] };
    }
    expect(() => new Database({ backend: 'memory' }).register(WrongIndex)).toThrow('has fields');
  });

  it('the spec of the table (migrations): the index of LOWER(name)', async () => {
    const { specOf } = schemaModule;
    class Tag extends Model {
      static fields = { name: fields.string() };

      static options = { table: 'constraints_tag', constraints: [{ unique: [Lower('name')] }] };
    }
    const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(Tag);
    expect(specOf(Tag.meta).indexes).toEqual([{ name: 'constraints_tag_lower_name_uniq', columns: ['name'], unique: true, lower: ['name'] }]);
    await db.connect();
    await db.sync();
    await Tag.objects.create({ name: 'Rust' });
    await expect(Tag.objects.create({ name: 'RUST' })).rejects.toThrow(UniqueError);
    await db.close();
  });
});
