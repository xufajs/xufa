// fields.extend(Parent, own): the fields of a parent with those of a child, as the ORM merges them (so TypeScript knows
// them): the same model as with the child's own fields only, null removing one, and Model.schema() with them all.
import { Database, Model, fields } from '../index.js';

class Timestamped extends Model {
  static options = { abstract: true };
  static fields = { createdAt: fields.datetime({ autoNowAdd: true }), updatedAt: fields.datetime({ autoNow: true }) };
}

describe('fields.extend()', () => {
  it('the fields of the parent, then those of the child (replacing the same names)', () => {
    const merged = fields.extend(Timestamped, { title: fields.string(), updatedAt: null });
    expect(Object.keys(merged)).toEqual(['createdAt', 'updatedAt', 'title']);
    expect(merged.createdAt).toBe(Timestamped.fields.createdAt);
    expect(merged.updatedAt).toBe(null);
  });

  it('the model is the one the ORM makes without it: same fields, same order; null removes one', async () => {
    class Merged extends Timestamped {
      static fields = fields.extend(Timestamped, { title: fields.string() });
    }
    class Own extends Timestamped {
      static fields = { title: fields.string() };
    }
    class Removed extends Timestamped {
      static fields = fields.extend(Timestamped, { title: fields.string(), updatedAt: null });
    }
    const db = new Database({ backend: 'memory' });
    db.register(Merged, Own, Removed);
    await db.connect();
    await db.sync();
    const names = (model) => model.meta.fields.map((field) => field.name);
    expect(names(Merged)).toEqual(['id', 'createdAt', 'updatedAt', 'title']);
    expect(names(Merged)).toEqual(names(Own));
    expect(names(Removed)).toEqual(['id', 'createdAt', 'title']);
    expect(Object.keys(Merged.schema().properties)).toEqual(['id', 'createdAt', 'updatedAt', 'title']);
    const made = await Merged.objects.create({ title: 'a' });
    expect(made.createdAt).toBeInstanceOf(Date);
    // Grandchildren: the fields of every parent.
    class Article extends Merged {
      static fields = fields.extend(Merged, { body: fields.text() });
    }
    expect(Object.keys(Article.fields)).toEqual(['createdAt', 'updatedAt', 'title', 'body']);
    await db.close();
  });

  it('errors of its arguments', () => {
    expect(() => fields.extend({}, {})).toThrow(/parent is a model/);
    expect(() => fields.extend(Timestamped, 1)).toThrow(/fields is an object/);
  });
});
