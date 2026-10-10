// The designer of the data model page (lib/designer.js): the models of an app's models.yaml edited as a draft,
// tried in a process of its own (the migration it makes, with renames that keep the rows), and written (models.yaml
// and the migration); and the routes of the admin that use it, in development.
import fs from 'node:fs';
import path from 'node:path';
import { loadProject } from '../project.js';
import { designerOf } from '../lib/designer.js';

const root = path.join(import.meta.dirname, `.tmp-designer-${process.pid}`);
const put = (name, content) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const AUTHOR = { fields: { name: { type: 'string', maxLength: 100 } } };
let initial;
beforeAll(async () => {
  put(
    'xufa.yaml',
    "name: Shelf\napps: [people, catalog]\ndatabase: { url: 'memory:' }\nadmin: { authorize: development }\n"
  );
  put(
    'people/models.js',
    "import { Model, fields } from '@xufa/orm';\nexport class Person extends Model {\n  static fields = { name: fields.string({ maxLength: 100 }) };\n}\n"
  );
  put('catalog/models.yaml', 'Author:\n  fields:\n    name: { type: string, maxLength: 100 }\n');
  // The first migration, by the designer itself.
  const made = await designerOf(await loadProject(root)).publish({ apps: { catalog: { Author: AUTHOR } } });
  expect(made.files).toEqual(['catalog/models.yaml', 'catalog/migrations/0001_initial.js']);
  initial = read('catalog/models.yaml');
}, 30000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the designer of the models', () => {
  let designer;
  beforeAll(async () => {
    designer = designerOf(await loadProject(root));
  });

  it('the apps of models.yaml and their models; those of code are not editable', async () => {
    const project = await loadProject(root);
    const own = designerOf(project);
    expect(own.apps()).toEqual([
      { app: 'people', file: 'people/models.yaml', spec: {}, models: [] },
      { app: 'catalog', file: 'catalog/models.yaml', spec: { Author: AUTHOR }, models: ['Author'] },
    ]);
    expect(own.editable(project.model('Author'))).toBe(true);
    expect(own.editable(project.model('Person'))).toBe(false);
  });

  it('preview: the migration of a draft (a field renamed keeps its rows), nothing written', async () => {
    const draft = {
      apps: {
        catalog: {
          Author: { fields: { fullName: { type: 'string', maxLength: 100 }, born: { type: 'date', null: true } } },
          Book: {
            fields: {
              title: { type: 'string', maxLength: 200 },
              author: { type: 'foreignKey', to: 'Author', null: true },
              editor: { type: 'foreignKey', to: 'people.Person', null: true },
            },
          },
        },
      },
      renames: { catalog: { fields: { Author: { name: 'fullName' } } } },
      name: 'books',
    };
    const { apps } = await designer.preview(draft);
    expect(apps).toHaveLength(1);
    const { migration, risks } = apps[0];
    expect(migration.name).toBe('0002_books');
    expect(migration.operations.map((op) => op.op)).toEqual(['renameColumn', 'createTable', 'addColumn']);
    expect(migration.operations[0]).toEqual({
      op: 'renameColumn',
      table: 'catalog_author',
      from: 'name',
      to: 'fullName',
    });
    expect(migration.operations[1].spec.table).toBe('catalog_book');
    expect(risks).toEqual([]);
    expect(fs.existsSync(path.join(root, 'catalog/migrations/0002_books.js'))).toBe(false);
    expect(read('catalog/models.yaml')).toBe(initial);
  });

  it('a field dropped is a risk; a draft that cannot be is an error', async () => {
    const { apps } = await designer.preview({ apps: { catalog: { Author: { fields: {} } } } });
    expect(apps[0].risks).toEqual([
      {
        level: 'danger',
        kind: 'dropColumn',
        table: 'catalog_author',
        column: 'name',
        text: 'drops the column catalog_author.name and its values',
      },
    ]);
    await expect(designer.preview({ apps: { catalog: { Author: { fields: { name: 'strin' } } } } })).rejects.toThrow(
      'type strin is not one of'
    );
    await expect(designer.preview({ apps: { nope: {} } })).rejects.toThrow('There is no app nope');
    await expect(
      designer.preview({ apps: { catalog: { Book: { fields: { author: { type: 'foreignKey', to: 'Nobody' } } } } } })
    ).rejects.toThrow('there is no model Nobody');
  });

  it('publish: models.yaml and the migration written; the project loads them', async () => {
    const result = await designer.publish({
      apps: { catalog: { Author: { ...AUTHOR, ordering: ['name'] }, Genre: { fields: { name: 'text' } } } },
      name: 'genres',
    });
    expect(result.files).toEqual(['catalog/models.yaml', 'catalog/migrations/0002_genres.js']);
    expect(read('catalog/models.yaml')).toBe(
      [
        "# The models of catalog as data (@xufa/orm's modelsFromSpec): written by the data model page of the admin, and",
        '# yours to edit too (comments are not kept when the page writes it again).',
        'Author:',
        '  ordering: [name]',
        '  fields:',
        '    name: { type: string, maxLength: 100 }',
        'Genre:',
        '  fields:',
        '    name: text',
        '',
      ].join('\n')
    );
    expect(read('catalog/migrations/0002_genres.js')).toContain('"op": "createTable"');
    const project = await loadProject(root);
    expect(project.APPS.get('catalog').models.map((model) => model.name)).toEqual(['Author', 'Genre']);
    // Nothing changed since: no migration to make.
    const again = await designerOf(project).preview({ apps: { catalog: project.APPS.get('catalog').design.spec } });
    expect(again.apps[0].migration).toBe(null);
  });

  it('the admin of a project in development: the models editable, and the draft tried by its routes', async () => {
    const project = await loadProject(root, { environment: { SECRET_KEY: 'a secret of thirty two characters!' } });
    const app = await project.build({ logger: false });
    await app.ready();
    const schema = (await app.inject('/admin/api/_schema')).json();
    expect(schema.design.apps.map((item) => item.app)).toEqual(['people', 'catalog']);
    expect(schema.models.filter((model) => model.editable).map((model) => model.name)).toEqual(['Author', 'Genre']);
    const headers = { 'x-xufa-admin': '1' };
    const draft = { apps: { catalog: { Author: AUTHOR } } };
    const preview = await app.inject({ method: 'POST', url: '/admin/api/_schema/preview', headers, payload: draft });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().apps[0].risks[0].text).toBe('drops the table catalog_genre and its rows');
    const bad = await app.inject({
      method: 'POST',
      url: '/admin/api/_schema/preview',
      headers,
      payload: { apps: { catalog: { author: {} } } },
    });
    expect([bad.statusCode, bad.json().error]).toEqual([
      400,
      "catalog/models.yaml: author: a model's name starts with a capital (Book)",
    ]);
    await app.close();
  });
});
