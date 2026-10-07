'use strict';

// The slots of the nodes of pools shared by several machines (each with its primary and its pool), kept in a database
// of @xufa/orm (any backend): a row by slot of a node, taken with an update only one machine can make (a free or
// expired row to its token), so a node never gets more works at once than its slots among every machine. The machine
// renews the slots it holds (every ttl / 3); those of a machine that died are free again when their ttl passes.
//
//   createPool('converters', { nodes: discovery, shared: ormSlots(db, { ttl: '30s' }) });
const os = require('node:os');
const { randomBytes } = require('node:crypto');

const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };
function duration(value) {
  if (typeof value === 'number') return value;
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/.exec(String(value).trim());
  if (!match) throw new TypeError(`ormSlots: '${value}' is not a duration (as '30s')`);
  return Number(match[1]) * UNITS[match[2]];
}

const isUnique = (err) => Boolean(err) && (err.code === 'XUFA_ORM_ERR_UNIQUE' || Array.isArray(err.unique));

function slotModel(orm, table, name) {
  const { Model, fields } = orm;
  return {
    [name]: class extends Model {
      static fields = {
        // pool, node and slot: one row by slot of a node (unique on every backend as one field).
        key: fields.string({ maxLength: 500, unique: true }),
        pool: fields.string({ maxLength: 200 }),
        node: fields.string({ maxLength: 200 }),
        slot: fields.integer(),
        // The lease that holds it (null: free), its machine, and until when it is its own.
        holder: fields.string({ maxLength: 100, null: true, index: true }),
        owner: fields.string({ maxLength: 200, null: true }),
        expiresAt: fields.datetime({ null: true }),
      };

      static options = { table };
    },
  }[name];
}

// A store of slots in db: claim(pool, node, slots) gives a token (or null: every slot is taken), release(token),
// renew(tokens). Options: ttl ('30s'), table ('xufa_pool_slots'), model ('XufaPoolSlot'), owner (this machine).
function ormSlots(db, options = {}) {
  let orm;
  try {
    orm = require('@xufa/orm'); // eslint-disable-line global-require
  } catch (err) {
    throw new Error(`ormSlots needs @xufa/orm (${err.message})`);
  }
  if (!db || typeof db.register !== 'function') throw new TypeError('ormSlots(db): db is a Database of @xufa/orm');
  const Slot =
    options.model && typeof options.model === 'function'
      ? options.model
      : slotModel(orm, options.table || 'xufa_pool_slots', options.model || 'XufaPoolSlot');
  if (typeof options.model !== 'function') db.register(Slot);
  const ttl = duration(options.ttl === undefined ? '30s' : options.ttl);
  const owner = options.owner || `${os.hostname()}:${process.pid}:${randomBytes(4).toString('hex')}`;
  // Rows known to be there (they are made the first time a slot is claimed).
  const known = new Set();

  async function claim(pool, node, slots) {
    for (let slot = 0; slot < slots; slot += 1) {
      const key = JSON.stringify([pool, String(node), slot]);
      const token = `${randomBytes(9).toString('base64url')}`;
      const now = Date.now();
      const taken = { holder: token, owner, expiresAt: new Date(now + ttl) };
      if (!known.has(key)) {
        try {
          await Slot.objects.create({ key, pool, node: String(node), slot, ...taken });
          known.add(key);
          return token;
        } catch (err) {
          if (!isUnique(err)) throw err;
          known.add(key);
        }
      }
      let won = await Slot.objects.filter({ key, holder: null }).update(taken);
      if (!won) won = await Slot.objects.filter({ key, expiresAt__lt: new Date(now) }).update(taken);
      if (won) return token;
    }
    return null;
  }

  async function release(token) {
    await Slot.objects.filter({ holder: token }).update({ holder: null, owner: null, expiresAt: null });
  }

  async function renew(tokens) {
    if (tokens.length === 0) return 0;
    return Slot.objects.filter({ holder__in: tokens }).update({ expiresAt: new Date(Date.now() + ttl) });
  }

  // The slots held now, by node of a pool (for stats and tests).
  async function held(pool) {
    const rows = await Slot.objects.filter({ pool, holder__isnull: false, expiresAt__gte: new Date() });
    const counts = {};
    for (const row of rows) counts[row.node] = (counts[row.node] || 0) + 1;
    return counts;
  }

  return { claim, release, renew, held, ttl, owner, model: Slot };
}

module.exports = { ormSlots };
