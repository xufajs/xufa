// Migrations of apps (Django's makemigrations <app>): each app has its folder with the migrations of its models (and
// of the tables of their many-to-many), recorded with its label, so apps can have the same numbers; the apps are
// migrated one after the other, those pointed to first. On SQLite, PostgreSQL and MongoDB, each in a database of its
// own (the migrations of other tests are in theirs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database, Model, fields } from '../index.js';
import * as pg from '../../pg/test/server.js';
import * as mongo from '../../mongo/test/server.js';

const NAME = 'xufa_apps_test';
const pgUrl = pg.url.replace(/\/[^/?]+(\?|$)/, `/${NAME}$1`);
const mongoUrl = mongo.url.replace(/\/[^/?]+(\?|$)/, `/${NAME}$1`);

function models() {
  class Member extends Model {
    static fields = { username: fields.string({ maxLength: 150 }) };

    static options = { table: 'accounts_member' };
  }
  class Tag extends Model {
    static fields = { name: fields.string() };

    static options = { table: 'catalog_tag' };
  }
  class Loan extends Model {
    static fields = {
      title: fields.string(),
      member: fields.foreignKey(() => Member, { null: true }),
      tags: fields.manyToMany(() => Tag),
    };

    static options = { table: 'catalog_loan' };
  }
  return { Member, Tag, Loan };
}

const backends = [
  ['sqlite', true],
  ['postgres', pg.available],
  ['mongodb', mongo.available],
];

describe.each(backends)('migrations of apps on %s', (kind, available) => {
  let root;
  const optionsOf = () => {
    if (kind === 'sqlite') return { backend: 'sqlite', filename: ':memory:' };
    if (kind === 'postgres') return { backend: 'postgres', url: pgUrl, max: 2 };
    return { backend: 'mongodb', url: mongoUrl };
  };
  // A database of its own, empty.
  const fresh = async () => {
    if (kind === 'postgres') {
      const admin = new Database({ backend: 'postgres', url: pg.url, max: 1 });
      await admin.connect();
      const found = await admin.backend.raw('SELECT 1 FROM pg_database WHERE datname = $1', [NAME]);
      if (!found.length) await admin.backend.raw(`CREATE DATABASE ${NAME}`);
      await admin.close();
      const db = new Database(optionsOf());
      await db.connect();
      await db.backend.raw(
        'DROP TABLE IF EXISTS catalog_loan_tags, catalog_loan, catalog_tag, accounts_member, xufa_migrations CASCADE'
      );
      await db.close();
    } else if (kind === 'mongodb') {
      const db = new Database(optionsOf());
      await db.connect();
      await db.backend.db.dropDatabase();
      await db.close();
    }
  };

  beforeAll(async () => {
    if (!available) return;
    root = fs.mkdtempSync(path.join(os.tmpdir(), `xufa-app-migrations-${kind}-`));
    await fresh();
  });
  afterAll(async () => {
    if (!available) return;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.skipIf(!available)('each app its tables, in its folder, recorded with its label', async () => {
    const { Member, Tag, Loan } = models();
    const db = new Database(optionsOf()).register(Member, Tag, Loan);
    await db.connect();
    try {
      const accounts = path.join(root, 'accounts');
      const catalog = path.join(root, 'catalog');
      const one = await db.makeMigrations({ dir: accounts, models: [Member] });
      expect(one.name).toBe('0001_initial');
      expect(one.operations.map((op) => op.spec.table)).toEqual(['accounts_member']);
      const two = await db.makeMigrations({ dir: catalog, models: [Tag, Loan] });
      expect(two.name).toBe('0001_initial');
      expect(two.operations.map((op) => op.spec.table).sort()).toEqual([
        'catalog_loan',
        'catalog_loan_tags',
        'catalog_tag',
      ]);
      // Nothing more to make for either.
      expect(await db.makeMigrations({ dir: accounts, models: [Member] })).toBe(null);
      expect(await db.makeMigrations({ dir: catalog, models: [Tag, Loan] })).toBe(null);

      expect(await db.migrate({ dir: accounts, label: 'accounts' })).toEqual(['0001_initial']);
      expect(await db.migrate({ dir: catalog, label: 'catalog' })).toEqual(['0001_initial']);
      expect(await db.migrate({ dir: catalog, label: 'catalog' })).toEqual([]);
      expect(await db.showMigrations({ dir: catalog, label: 'catalog' })).toEqual([
        { name: '0001_initial', applied: true },
      ]);
      // Without the label it is another migration (that of a project without apps).
      expect(await db.showMigrations({ dir: catalog })).toEqual([{ name: '0001_initial', applied: false }]);

      const ada = await Member.objects.create({ username: 'ada' });
      const tag = await Tag.objects.create({ name: 'new' });
      const loan = await Loan.objects.create({ title: 'Dune', memberId: ada.pk });
      await loan.tags.set([tag.pk]);
      expect((await loan.tags.all()).map((item) => item.name)).toEqual(['new']);
    } finally {
      await db.close();
    }
  });
});
