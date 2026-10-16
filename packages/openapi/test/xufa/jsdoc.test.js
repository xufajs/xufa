// Documents from comments (@xufa/openapi/jsdoc): what swagger-jsdoc 6.2.8 makes of the same files (fixtures/jsdoc,
// its documents in expected.json, written by swagger-jsdoc itself): paths at the top level and under paths, merged
// when written twice (arrays item by item, null keeping what was there), tags once, components, an anchor of one
// comment used in another, YAML files, CoffeeScript, hidden files left out, comments with wrong YAML reported.
const path = require('node:path');
const yaml = require('@xufa/yaml');
const xufa = require('@xufa/http');
const openapi = require('../..');
const jsdoc = require('../../lib/xufa/jsdoc');

const FIXTURES = path.join(__dirname, 'fixtures/jsdoc').replace(/\\/g, '/');
const EXPECTED = require('./fixtures/jsdoc/expected.json');
const APIS = [`${FIXTURES}/api/**/*.routes.js`, `${FIXTURES}/api/*.yaml`, `${FIXTURES}/api/*.coffee`];
const OPENAPI = { definition: { openapi: '3.0.3', info: { title: 'Library', version: '1.0.0' } }, apis: APIS };

describe('jsdoc()', () => {
  let errors;
  beforeEach(() => {
    errors = [];
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((text) => errors.push(text));
  });
  afterEach(() => vi.restoreAllMocks());

  it('makes the document swagger-jsdoc makes (OpenAPI 3), the same keys in the same order', () => {
    const document = jsdoc(OPENAPI);
    expect(JSON.stringify(document)).toBe(JSON.stringify(EXPECTED.openapi));
    expect(document.paths['/hidden']).toBeUndefined();
    expect(document.components.schemas.Book.properties.published.example).toBe('2024-01-31');
    expect(document.paths['/authors/{authorId}'].get.parameters[0]).toEqual({
      in: 'path',
      name: 'authorId',
      required: true,
    });
  });

  it('and a Swagger 2 document', () => {
    const options = {
      swaggerDefinition: { info: { title: 'Library', version: '1.0.0' }, basePath: '/api' },
      apis: [`${FIXTURES}/swagger2/*.js`],
    };
    expect(JSON.stringify(jsdoc(options))).toBe(JSON.stringify(EXPECTED.swagger2));
  });

  it('reports the comments whose YAML is wrong, or throws them with failOnErrors', () => {
    jsdoc(OPENAPI);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/authors\.routes\.js/);
    expect(() => jsdoc({ ...OPENAPI, failOnErrors: true })).toThrow(/Error in .*authors\.routes\.js/);
    jsdoc({ ...OPENAPI, verbose: true });
    expect(errors[1]).toMatch(/Imbedded within:[\s\S]*get: \[unclosed/);
  });

  it('writes YAML with format .yaml', () => {
    const text = jsdoc({ ...OPENAPI, format: '.yaml' });
    expect(typeof text).toBe('string');
    expect(yaml.load(text, { schema: yaml.CORE_SCHEMA })).toEqual(EXPECTED.openapi);
  });

  it('checks its options as swagger-jsdoc does', () => {
    expect(() => jsdoc()).toThrow("Missing or invalid input: 'options' is required");
    expect(() => jsdoc({ apis: [] })).toThrow(/'options.swaggerDefinition' or 'options.definition' is required/);
    expect(() => jsdoc({ definition: {} })).toThrow(/'options.apis' is required and it should be an array/);
  });
});

describe('the pieces', () => {
  it('yamlOfComment: the text of each @openapi or @swagger tag, as doctrine reads it', () => {
    const comment = ['/**', ' * A description.', ' * @openapi', ' * - a', ' * - b', ' * @swagger', ' * c: 1', ' */'];
    expect(jsdoc.yamlOfComment(comment.join('\n'))).toEqual(['a\n- b', 'c: 1']);
    expect(jsdoc.yamlOfComment('/** @param {string} x */')).toEqual([]);
  });

  it('mergeDeep: objects key by key, arrays item by item, null keeps what was there', () => {
    expect(jsdoc.mergeDeep({ a: [1, { b: 1 }], c: 1, d: { e: 1 } }, { a: [2, { f: 2 }], c: null, d: null, g: null })).toEqual(
      { a: [2, { b: 1, f: 2 }], c: 1, d: { e: 1 }, g: null }
    );
  });

  it('globSync: matches sorted, hidden names and folders left out', () => {
    const files = jsdoc.globSync(`${FIXTURES}/api/**/*.routes.js`).map((file) => file.slice(FIXTURES.length));
    expect(files).toEqual(['/api/books.routes.js', '/api/nested/authors.routes.js']);
    expect(jsdoc.globSync(`${FIXTURES}/api/extra.yaml`)).toEqual([`${FIXTURES}/api/extra.yaml`]);
    expect(jsdoc.globSync(`${FIXTURES}/api/missing.yaml`)).toEqual([]);
  });
});

describe('a document made when first needed', () => {
  it('static mode calls specification.document once, when the document is read', async () => {
    const app = xufa();
    const make = vi.fn(() => ({ openapi: '3.0.3', info: { title: 'Lazy', version: '1.0.0' }, paths: {} }));
    await app.register(openapi, { mode: 'static', specification: { document: make } });
    await app.ready();
    expect(make).not.toHaveBeenCalled();
    expect(app.swagger().info.title).toBe('Lazy');
    expect(app.swagger({ yaml: true })).toMatch(/title: Lazy/);
    expect(make).toHaveBeenCalledTimes(1);
  });
});
