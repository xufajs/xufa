const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database, Model, fields, backends, setEncryptionKeys, generateEncryptionKey } = require('..');
const { defineSuite } = require('./suite');

const { FsBackend } = backends;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-fs-'));
let folders = 0;
const folder = () => path.join(root, `db${(folders += 1)}`);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

// A backend that reads its files again before each query out of a transaction: the suite then checks that what is
// written is read back as it was.
class ReloadingFsBackend extends FsBackend {
  async reload() {
    if (this.inTransaction || this.snapshots.length) return;
    await this.writing;
    this.tables = new Map();
    this.written = new Map();
    this.rowKeys = new WeakMap();
    this.load();
  }

  async select(query) {
    await this.reload();
    return super.select(query);
  }

  async count(query) {
    await this.reload();
    return super.count(query);
  }

  async aggregate(...args) {
    await this.reload();
    return super.aggregate(...args);
  }
}

defineSuite('fs', () => new Database({ backend: 'fs', dir: folder() }));
// A file for each object: the bulk test writes 2400 files (and reads them back), which takes 2 to 4 s on Windows (NTFS
// and the antivirus look at each new file; Linux writes them in about 0.1 s).
defineSuite(
  'fs (files, read back)',
  () => new Database({ backend: ReloadingFsBackend, dir: folder(), layout: 'files' }),
  { bulkTimeout: 30000 }
);
defineSuite('fs (read back)', () => new Database({ backend: ReloadingFsBackend, dir: folder() }));

function makeModels() {
  class Owner extends Model {
    static fields = { name: fields.string() };
  }
  class Item extends Model {
    static fields = {
      name: fields.string(),
      owner: fields.foreignKey(() => Owner, { relatedName: 'items', null: true }),
      at: fields.datetime({ null: true }),
      data: fields.json({ null: true }),
      blob: fields.bytes({ null: true }),
      big: fields.bigint({ null: true, mode: 'bigint' }),
    };
  }
  return { Owner, Item };
}

async function open(options) {
  const { Owner, Item } = makeModels();
  const db = new Database({ backend: 'fs', ...options });
  db.register(Owner, Item);
  await db.connect();
  await db.sync();
  return { db, Owner, Item };
}

describe('fs backend: files', () => {
  it('keeps the objects in files, and reads them back with their types', async () => {
    const dir = folder();
    const at = new Date('2026-01-02T03:04:05.678Z');
    {
      const { db, Owner, Item } = await open({ dir });
      const ada = await Owner.objects.create({ name: 'Ada' });
      await Item.objects.create({
        name: 'first',
        owner: ada,
        at,
        data: { $xufa: 'not a tag', list: [1, 'two'] },
        blob: Buffer.from([0, 1, 255]),
        big: 9007199254740993n,
      });
      await db.close();
    }
    expect(fs.readdirSync(dir).sort()).toEqual(['item.json', 'owner.json']);
    const { db, Item } = await open({ dir });
    const [item] = await Item.objects.selectRelated('owner');
    expect(item.owner.name).toBe('Ada');
    expect(item.at).toEqual(at);
    expect(item.data).toEqual({ $xufa: 'not a tag', list: [1, 'two'] });
    expect(Buffer.from(item.blob)).toEqual(Buffer.from([0, 1, 255]));
    expect(item.big).toBe(9007199254740993n);
    // The ids go on from those written.
    expect((await Item.objects.create({ name: 'second' })).id).toBe(2);
    await db.close();
  });

  it('writes what a transaction did when it commits, and nothing when it rolls back', async () => {
    const dir = folder();
    const { db, Owner } = await open({ dir });
    const file = path.join(dir, 'owner.json');
    await db.transaction(async () => {
      await Owner.objects.create({ name: 'Ada' });
      expect(fs.readFileSync(file, 'utf8')).not.toContain('Ada');
    });
    expect(fs.readFileSync(file, 'utf8')).toContain('Ada');
    await expect(
      db.transaction(async () => {
        await Owner.objects.create({ name: 'Grace' });
        throw new Error('undone');
      })
    ).rejects.toThrow('undone');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('Grace');
    await db.close();
    const again = await open({ dir });
    expect(await again.Owner.objects.valuesList('name', { flat: true })).toEqual(['Ada']);
    await again.db.close();
  });

  it('keeps a file for each object in the layout files', async () => {
    const dir = folder();
    const { db, Owner } = await open({ dir, layout: 'files' });
    const ada = await Owner.objects.create({ name: 'Ada' });
    await Owner.objects.create({ name: 'Grace' });
    expect(fs.readdirSync(path.join(dir, 'owner')).sort()).toEqual(['1.json', '2.json', '_table.json']);
    const before = fs.statSync(path.join(dir, 'owner', '2.json')).mtimeMs;
    ada.name = 'Ada Lovelace';
    await ada.save();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'owner', '1.json'), 'utf8')).row.name).toBe('Ada Lovelace');
    expect(fs.statSync(path.join(dir, 'owner', '2.json')).mtimeMs).toBe(before);
    await ada.delete();
    expect(fs.readdirSync(path.join(dir, 'owner')).sort()).toEqual(['2.json', '_table.json']);
    await db.drop();
    expect(fs.existsSync(path.join(dir, 'owner'))).toBe(false);
    await db.close();
  });

  it('refuses a folder another process uses', async () => {
    const dir = folder();
    fs.mkdirSync(dir, { recursive: true });
    // The process of this test runner's parent is alive.
    fs.writeFileSync(path.join(dir, '.xufa.lock'), JSON.stringify({ pid: process.ppid, host: os.hostname() }));
    const db = new Database({ backend: 'fs', dir });
    await expect(db.connect()).rejects.toThrow(`is used by the process ${process.ppid}`);
    // A lock of a process that ended is taken.
    fs.writeFileSync(path.join(dir, '.xufa.lock'), JSON.stringify({ pid: 2 ** 22 + 7, host: os.hostname() }));
    await db.connect();
    await db.close();
    expect(fs.existsSync(path.join(dir, '.xufa.lock'))).toBe(false);
  });

  it('writes the values of encrypted fields encrypted', async () => {
    setEncryptionKeys({ keys: { k1: generateEncryptionKey() } });
    try {
      class Patient extends Model {
        static fields = { name: fields.string(), ssn: fields.encrypted(fields.string()) };
      }
      const dir = folder();
      const db = new Database({ backend: 'fs', dir, layout: 'files' });
      db.register(Patient);
      await db.connect();
      await db.sync();
      await Patient.objects.create({ name: 'Ada', ssn: '123-45-6789' });
      const text = fs.readFileSync(path.join(dir, 'patient', '1.json'), 'utf8');
      expect(text).toContain('Ada');
      expect(text).not.toContain('123-45-6789');
      await db.close();
      await db.connect();
      expect((await Patient.objects.get({ name: 'Ada' })).ssn).toBe('123-45-6789');
      await db.close();
    } finally {
      setEncryptionKeys(null);
    }
  });

  it('needs a folder and a known layout', () => {
    expect(() => new Database({ backend: 'fs' })).toThrow('needs a dir');
    expect(() => new Database({ backend: 'fs', dir: folder(), layout: 'rows' })).toThrow('collection or files');
  });
});

describe('fs backend: watching the folder', () => {
  const pause = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  async function until(check, ms = 5000) {
    const end = Date.now() + ms;
    for (;;) {
      if (await check()) return;
      if (Date.now() > end) throw new Error('not in time');
      await pause(20);
    }
  }
  const watching = (layout) => {
    const changes = [];
    const errors = [];
    const options = { dir: folder(), layout, watch: { delay: 20 } };
    options.onChange = (tables) => changes.push(tables);
    options.onError = (err) => errors.push(err);
    return { options, changes, errors };
  };

  it('reads a collection changed from outside, and not its own writes', async () => {
    const { options, changes } = watching('collection');
    const { db, Owner } = await open(options);
    await Owner.objects.create({ name: 'Ada' });
    await Owner.objects.create({ name: 'Grace' });
    await pause(150);
    expect(changes).toEqual([]);
    const file = path.join(options.dir, 'owner.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.rows[0][1].name = 'Ada Lovelace';
    data.rows.push([7, { id: 7, name: 'Hedy' }]);
    fs.writeFileSync(file, JSON.stringify(data));
    await until(() => changes.length > 0);
    expect(changes).toEqual([['owner']]);
    expect(await Owner.objects.orderBy('id').valuesList('name', { flat: true })).toEqual([
      'Ada Lovelace',
      'Grace',
      'Hedy',
    ]);
    // Numbers go on after those added by hand.
    expect((await Owner.objects.create({ name: 'Joan' })).id).toBe(8);
    await db.close();
  });

  it('reads the objects changed, added and removed from outside in the layout files', async () => {
    const { options, changes } = watching('files');
    const { db, Owner } = await open(options);
    await Owner.objects.create({ name: 'Ada' });
    await Owner.objects.create({ name: 'Grace' });
    const folderOf = path.join(options.dir, 'owner');
    fs.writeFileSync(path.join(folderOf, '1.json'), JSON.stringify({ key: 1, row: { id: 1, name: 'Ada Lovelace' } }));
    fs.writeFileSync(path.join(folderOf, 'hedy.json'), JSON.stringify({ key: 5, row: { id: 5, name: 'Hedy' } }));
    fs.rmSync(path.join(folderOf, '2.json'));
    await until(async () => (await Owner.objects.count()) === 2 && changes.length > 0);
    expect(await Owner.objects.orderBy('id').valuesList('name', { flat: true })).toEqual(['Ada Lovelace', 'Hedy']);
    expect((await Owner.objects.create({ name: 'Joan' })).id).toBe(6);
    // The objects are written again in their files.
    await Owner.objects.filter({ id: 5 }).update({ name: 'Hedy Lamarr' });
    expect(JSON.parse(fs.readFileSync(path.join(folderOf, 'hedy.json'), 'utf8')).row.name).toBe('Hedy Lamarr');
    // A file removed by hand: its object goes.
    fs.rmSync(path.join(folderOf, 'hedy.json'));
    await until(async () => (await Owner.objects.count()) === 2);
    await db.close();
  });

  it('reads what changed while a transaction was open when it ends', async () => {
    const { options, changes } = watching('collection');
    const { db, Owner } = await open(options);
    await Owner.objects.create({ name: 'Ada' });
    const file = path.join(options.dir, 'owner.json');
    await db.transaction(async () => {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      data.rows[0][1].name = 'Ada Lovelace';
      fs.writeFileSync(file, JSON.stringify(data));
      await pause(150);
      expect(changes).toEqual([]);
      expect(await Owner.objects.valuesList('name', { flat: true })).toEqual(['Ada']);
    });
    await until(() => changes.length > 0);
    expect(await Owner.objects.valuesList('name', { flat: true })).toEqual(['Ada Lovelace']);
    await db.close();
  });

  it('keeps what it had while a file cannot be read, and reads it when it can', async () => {
    const { options, changes, errors } = watching('collection');
    const { db, Owner } = await open(options);
    await Owner.objects.create({ name: 'Ada' });
    const file = path.join(options.dir, 'owner.json');
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, text.slice(0, 10));
    await until(() => errors.length > 0);
    expect(errors[0].message).toContain('cannot read owner');
    expect(await Owner.objects.valuesList('name', { flat: true })).toEqual(['Ada']);
    fs.writeFileSync(file, text.replace('Ada', 'Grace'));
    await until(() => changes.length > 0);
    expect(await Owner.objects.valuesList('name', { flat: true })).toEqual(['Grace']);
    await db.close();
  });

  it('drops the cached objects of the tables changed', async () => {
    class Setting extends Model {
      static fields = { name: fields.string({ unique: true }), value: fields.string() };

      static options = { cache: true };
    }
    const { options, changes } = watching('files');
    const db = new Database({ backend: 'fs', ...options });
    db.register(Setting);
    await db.connect();
    await db.sync();
    const setting = await Setting.objects.create({ name: 'theme', value: 'light' });
    expect((await Setting.objects.get({ pk: setting.pk })).value).toBe('light');
    const file = path.join(options.dir, 'setting', '1.json');
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.row.value = 'dark';
    fs.writeFileSync(file, JSON.stringify(record));
    await until(() => changes.length > 0);
    expect((await Setting.objects.get({ pk: setting.pk })).value).toBe('dark');
    await db.close();
  });
});

describe('fs backend: writes and changes from outside', () => {
  // The watcher waits long here: the changes from outside are found by the writes.
  const slow = (layout) => {
    const changes = [];
    const errors = [];
    const options = { dir: folder(), layout, watch: { delay: 60000 } };
    options.onChange = (tables) => changes.push(tables);
    options.onError = (err) => errors.push(err);
    return { options, changes, errors };
  };
  const edit = (file, fn) => {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    fn(data);
    fs.writeFileSync(file, JSON.stringify(data));
  };
  const names = (Owner) => Owner.objects.orderBy('id').valuesList('name', { flat: true });

  it('serializes again only the objects that changed', async () => {
    const { db, Owner } = await open({ dir: folder() });
    await Owner.objects.bulkCreate(Array.from({ length: 50 }, (_, i) => ({ name: `owner ${i}` })));
    let serialized = 0;
    const texts = db.backend.rowTexts;
    db.backend.rowTexts = {
      get: (row) => texts.get(row),
      set: (row, entry) => {
        serialized += 1;
        return texts.set(row, entry);
      },
    };
    await Owner.objects.filter({ id: 7 }).update({ name: 'seven' });
    expect(serialized).toBe(1);
    await db.close();
    const again = await open({ dir: db.backend.dir });
    expect(await again.Owner.objects.get({ id: 7 })).toMatchObject({ name: 'seven' });
    expect(await again.Owner.objects.count()).toBe(50);
    await again.db.close();
  });

  it('writes indented JSON that reads back', async () => {
    const dir = folder();
    const { db, Owner } = await open({ dir, pretty: true });
    expect(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')).toBe('{\n  "sequence": 0,\n  "rows": []\n}');
    await Owner.objects.create({ name: 'Ada' });
    await Owner.objects.create({ name: 'Grace' });
    const text = fs.readFileSync(path.join(dir, 'owner.json'), 'utf8');
    expect(text).toContain('\n    [\n      1,\n');
    expect(JSON.parse(text).rows.map(([, row]) => row.name)).toEqual(['Ada', 'Grace']);
    await db.close();
    const again = await open({ dir, pretty: true });
    expect(await names(again.Owner)).toEqual(['Ada', 'Grace']);
    await again.db.close();
  });

  it('takes the changes from outside to other objects when it writes a collection', async () => {
    const { options, changes, errors } = slow('collection');
    const { db, Owner } = await open(options);
    await Owner.objects.bulkCreate([{ name: 'Ada' }, { name: 'Grace' }, { name: 'Hedy' }]);
    const file = path.join(options.dir, 'owner.json');
    edit(file, (data) => {
      data.rows[0][1].name = 'Ada Lovelace'; // changed
      data.rows.splice(2, 1); // Hedy removed
      data.rows.push([9, { id: 9, name: 'Joan' }]); // added
    });
    await Owner.objects.filter({ id: 2 }).update({ name: 'Grace Hopper' });
    expect(errors).toEqual([]);
    expect(changes).toEqual([['owner']]);
    expect(await names(Owner)).toEqual(['Ada Lovelace', 'Grace Hopper', 'Joan']);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).rows.map(([, row]) => row.name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Joan',
    ]);
    expect((await Owner.objects.create({ name: 'Mary' })).id).toBe(10);
    await db.close();
  });

  it('keeps its own change to an object changed from outside too, and says so', async () => {
    const { options, errors } = slow('collection');
    const { db, Owner } = await open(options);
    await Owner.objects.bulkCreate([{ name: 'Ada' }, { name: 'Grace' }]);
    edit(path.join(options.dir, 'owner.json'), (data) => {
      data.rows[0][1].name = 'Ada from outside';
      data.rows[1][1].name = 'Grace from outside';
    });
    await Owner.objects.filter({ id: 1 }).update({ name: 'Ada from here' });
    expect(await names(Owner)).toEqual(['Ada from here', 'Grace from outside']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'XUFA_ORM_ERR_FS_CONFLICT', table: 'owner', keys: [1] });
    await db.close();
  });

  it('leaves to the watcher the objects changed from outside in the layout files, and says when it writes over one', async () => {
    const { options, changes, errors } = slow('files');
    const { db, Owner } = await open(options);
    await Owner.objects.bulkCreate([{ name: 'Ada' }, { name: 'Grace' }, { name: 'Hedy' }]);
    const folderOf = path.join(options.dir, 'owner');
    edit(path.join(folderOf, '1.json'), (record) => {
      record.row.name = 'Ada from outside';
    });
    edit(path.join(folderOf, '2.json'), (record) => {
      record.row.name = 'Grace from outside';
    });
    await Owner.objects.filter({ id: 1 }).update({ name: 'Ada from here' });
    await Owner.objects.filter({ id: 3 }).delete();
    expect(errors.map((err) => err.keys)).toEqual([[1]]);
    expect(JSON.parse(fs.readFileSync(path.join(folderOf, '1.json'), 'utf8')).row.name).toBe('Ada from here');
    expect(JSON.parse(fs.readFileSync(path.join(folderOf, '2.json'), 'utf8')).row.name).toBe('Grace from outside');
    await db.backend.readOutside();
    expect(changes).toEqual([['owner']]);
    expect(await names(Owner)).toEqual(['Ada from here', 'Grace from outside']);
    await db.close();
  });
});
