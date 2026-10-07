// @xufa/cluster: an app in a cluster of processes (start, stop), the messages between them (bus), and pools of nodes
// whose slots the primary gives to the workers (createPool, usePool), shared by machines through a database
// (ormSlots), with no dependencies. The bus is the same object in every module of a process.
const cluster = require('node:cluster');
const { Bus, BusError } = require('./lib/bus');
const { createStarter } = require('./lib/start');
const { Pool, PoolClient, PoolError, Lease } = require('./lib/pool');
const { ormSlots } = require('./lib/slots');

const bus = new Bus();
const { start, stop } = createStarter(bus);

// A pool of nodes, in the primary (or in the only process): the nodes, their slots and the queue of tickets.
function createPool(name, options = {}) {
  return new Pool(name, { bus, ...options });
}

// The pool of the primary, from a worker (or from any process): use(fn) and acquire().
function usePool(name, options = {}) {
  return new PoolClient(name, { bus, ...options });
}

module.exports = {
  start,
  stop,
  bus,
  Bus,
  BusError,
  createPool,
  usePool,
  Pool,
  PoolClient,
  PoolError,
  Lease,
  ormSlots,
  get isPrimary() {
    return cluster.isPrimary;
  },
  get isWorker() {
    return cluster.isWorker;
  },
};
