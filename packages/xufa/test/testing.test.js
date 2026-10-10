// xufa/testing: useTestApp() builds the project of a folder for a file of tests (SQLite in memory, migrated), rolls
// back each test, loads fixtures before each; the fixtures themselves ($key, $refs, dates, passwords, $unless).
import fs from 'node:fs';
import path from 'node:path';
import { useTestApp, loadFixture } from '../testing.js';
import * as formsModule from '@xufa/forms';

const root = path.join(import.meta.dirname, `.tmp-testing-${process.pid}`);
const put = (name, content) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

put(
  'xufa.yaml',
  [
    'name: Shelf',
    'apps: [shelf]',
    "database: { url: 'memory:' }",
    'auth: { user: shelf.Member, loginBy: username }',
    "mail: { from: 'Shelf <shelf@example.com>', layout: false }",
    '',
  ].join('\n')
);
put(
  'shelf/models.js',
  `import { Model, fields } from '@xufa/orm';
import { AbstractUser } from '@xufa/auth';
export class Member extends AbstractUser(Model, fields) {}
export class Tag extends Model {
  static fields = { name: fields.string({ maxLength: 50 }) };
  static options = { display: '{name}' };
}
export class Book extends Model {
  static fields = {
    title: fields.string({ maxLength: 100 }),
    due: fields.date({ null: true }),
    born: fields.date({ null: true }),
    reader: fields.foreignKey(() => Member, { null: true }),
    tags: fields.manyToMany(() => Tag),
  };
}
`
);
put(
  'shelf/views.js',
  `export default async function views(app) {
  app.get('/mail', async () => {
    await app.mailer.send({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' });
    return { sent: true };
  });
}
`
);
put(
  'fixtures/shelf.yaml',
  [
    '$unless: { Member: { username: keeper } }',
    'Member:',
    '  - { $key: ada, username: ada, password: a-password }',
    'Tag:',
    '  - { $key: old, name: Old }',
    '  - { $key: new, name: New }',
    'Book:',
    '  - { title: Notes, due: +3d, born: 1843-07-01, reader: $ada, tags: [$old, $new] }',
    '',
  ].join('\n')
);

const app = useTestApp({ root, fixtures: ['shelf'] });

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('useTestApp', () => {
  it('the app of the project, migrated, with the fixtures of each test', async () => {
    const Book = app.project.model('Book');
    const [book] = await Book.objects.prefetchRelated('tags').selectRelated('reader');
    const { addDays } = formsModule;
    expect([book.title, book.due, book.born, book.reader.username]).toEqual(['Notes', addDays(3), '1843-07-01', 'ada']);
    expect([...book.tags].map(String).sort()).toEqual(['New', 'Old']);
    await Book.objects.create({ title: 'Only in this test' });
    expect(await Book.objects.count()).toBe(2);
  });

  it('each test rolled back: what the last one made is not here', async () => {
    expect(await app.project.model('Book').objects.count()).toBe(1);
  });

  it('createUser and a client that logs in; the emails of the test', async () => {
    await app.createUser('grace', 'another-password', { firstName: 'Grace' });
    const client = app.client();
    expect(await client.login({ username: 'grace', password: 'another-password' })).toBe(true);
    expect(await client.login({ username: 'ada', password: 'a-password' })).toBe(true);
    expect(app.mails).toEqual([]);
    expect((await client.get('/mail')).json()).toEqual({ sent: true });
    expect(app.mails).toHaveLength(1);
    expect(app.mails[0]).toContain('Subject: Hi');
  });

  it('the emails start empty in each test', () => {
    expect(app.mails).toEqual([]);
  });
});

describe('fixtures', () => {
  const models = () => (name) => app.project.model(name);

  it('$unless skips the file; mistakes say where', async () => {
    const modelOf = models();
    expect((await loadFixture({ $unless: { Member: { username: 'ada' } }, Tag: [{ name: 'x' }] }, { modelOf })).skipped).toBe(true);
    await expect(loadFixture({ Book: [{ reader: '$nobody' }] }, { modelOf, where: 'f.yaml' })).rejects.toThrow(
      'f.yaml: Book[0].reader: no object named $nobody before it'
    );
    await expect(loadFixture({ Book: [{ pages: 1 }] }, { modelOf, where: 'f.yaml' })).rejects.toThrow(
      'f.yaml: Book[0]: Book has no field pages'
    );
    await expect(loadFixture({ Tag: [{ name: 'x', password: 'p' }] }, { modelOf, where: 'f.yaml' })).rejects.toThrow(
      'password is for users'
    );
    await expect(loadFixture({ $once: true }, { modelOf, where: 'f.yaml' })).rejects.toThrow('$once is no option');
  });
});
