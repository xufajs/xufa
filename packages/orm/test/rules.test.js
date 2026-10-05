// Validation rules: expressions (or functions) on fields (validate) and on models (options.rules).
const { Database, Model, fields, ValidationError, ModelError } = require('..');

async function database(...models) {
  const db = new Database({ backend: 'memory' });
  db.register(...models);
  await db.connect();
  await db.sync();
  return db;
}

// The errors of a ValidationError thrown by fn, by field.
async function errorsOf(fn) {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof Error) || err.code !== 'XUFA_ORM_ERR_VALIDATION') throw err;
    return err.errors;
  }
  throw new Error('no ValidationError was thrown');
}

describe('validation rules', () => {
  class Event extends Model {
    static fields = {
      name: fields.string({ validate: { rule: 'value.trim().length >= 3', message: 'At least 3 characters.' } }),
      seats: fields.integer({ validate: ['value >= 1', 'value <= 100 || "100 seats at most."'] }),
      start: fields.date(),
      end: fields.date(),
      code: fields.string({ null: true, validate: (value) => value.startsWith('EV') || 'Codes start with EV.' }),
    };

    static options = {
      rules: [
        { rule: 'end >= start', message: 'The end cannot come before the start.', field: 'end' },
        'seats <= 10 || !name.startsWith("Small") || "A small event has 10 seats at most."',
        (event) => event.name !== 'cancelled',
      ],
    };
  }
  let db;

  beforeAll(async () => {
    db = await database(Event);
  });

  afterAll(() => db.close());

  const valid = { name: 'Meetup', seats: 30, start: '2026-10-05', end: '2026-10-06' };

  it('accepts an object that follows the rules', async () => {
    const event = await Event.objects.create({ ...valid, code: 'EV-1' });
    expect(event.pk).toBeDefined();
  });

  it('gives the messages of the rules of the fields', async () => {
    expect(await errorsOf(() => Event.objects.create({ ...valid, name: 'ab', seats: 0 }))).toEqual({
      name: ['At least 3 characters.'],
      seats: ['The value is not valid.'],
    });
    expect(await errorsOf(() => Event.objects.create({ ...valid, seats: 500, code: 'X-1' }))).toEqual({
      seats: ['100 seats at most.'],
      code: ['Codes start with EV.'],
    });
  });

  it('gives the messages of the rules of the model, on a field or on the object', async () => {
    expect(await errorsOf(() => Event.objects.create({ ...valid, start: '2026-10-07' }))).toEqual({
      end: ['The end cannot come before the start.'],
    });
    expect(await errorsOf(() => Event.objects.create({ ...valid, name: 'Small talk', seats: 20 }))).toEqual({
      __all__: ['A small event has 10 seats at most.'],
    });
    expect(await errorsOf(() => Event.objects.create({ ...valid, name: 'cancelled' }))).toEqual({
      __all__: ['The object is not valid.'],
    });
  });

  it('runs the rules of the model only on objects whose fields are valid', async () => {
    // The end before the start, but a field not valid: only the field.
    expect(await errorsOf(() => Event.objects.create({ ...valid, seats: 0, start: '2026-10-09' }))).toEqual({
      seats: ['The value is not valid.'],
    });
  });

  it('runs the rules on save, bulkCreate and update (the rules of the fields only)', async () => {
    const event = await Event.objects.create({ ...valid, name: 'Saved' });
    event.end = '2026-10-01';
    expect(await errorsOf(() => event.save())).toEqual({ end: ['The end cannot come before the start.'] });
    expect(await errorsOf(() => Event.objects.bulkCreate([valid, { ...valid, seats: 0 }]))).toEqual({
      seats: ['The value is not valid.'],
    });
    expect(await errorsOf(() => Event.objects.filter({ pk: event.pk }).update({ seats: 1000 }))).toEqual({
      seats: ['100 seats at most.'],
    });
    // update() does not load the objects: the rules of the model are not run (as Django's clean()).
    expect(await Event.objects.filter({ pk: event.pk }).update({ end: '2026-10-01' })).toBe(1);
    // save({ validate: false }) skips them all.
    event.end = '2026-10-01';
    await event.save({ validate: false });
  });

  it('keeps the rules of the parents', async () => {
    class Dated extends Model {
      static fields = { start: fields.date(), end: fields.date() };

      static options = { abstract: true, rules: [{ rule: 'end >= start', field: 'end' }] };
    }
    class Trip extends Dated {
      static fields = { place: fields.string() };

      static options = { rules: ['place !== "nowhere"'] };
    }
    const tripDb = await database(Trip);
    try {
      expect(
        await errorsOf(() => Trip.objects.create({ place: 'nowhere', start: '2026-10-05', end: '2026-10-01' }))
      ).toEqual({ end: ['The object is not valid.'], __all__: ['The object is not valid.'] });
    } finally {
      await tripDb.close();
    }
  });

  it('refuses rules that cannot be compiled, or that name no field', () => {
    class Broken extends Model {
      static fields = { name: fields.string({ validate: 'value >' }) };
    }
    expect(() => Broken.meta).toThrow(ModelError);
    class Unknown extends Model {
      static fields = { name: fields.string() };

      static options = { rules: [{ rule: 'true', field: 'nothing' }] };
    }
    expect(() => Unknown.meta).toThrow(/names the field nothing/);
  });

  it('lets the errors of a rule that throws go up, as mistakes of the rule', async () => {
    class Note extends Model {
      static fields = { text: fields.string({ null: true }) };

      static options = { rules: ['text.length > 0'] };
    }
    const noteDb = await database(Note);
    try {
      await expect(Note.objects.create({ text: null })).rejects.toThrow(/Cannot read length of text/);
      expect(await errorsOf(() => Note.objects.create({ text: '' }))).toEqual({
        __all__: ['The object is not valid.'],
      });
    } finally {
      await noteDb.close();
    }
  });

  it('is a ValidationError with the status code 400', async () => {
    let error;
    try {
      await Event.objects.create({ ...valid, seats: 0 });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(400);
    expect(typeof ValidationError).toBe('function');
  });
});
