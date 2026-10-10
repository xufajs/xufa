// @xufa/cluster: an app in a cluster of processes (start, stop), the messages between them (bus), and pools of nodes
// whose slots the primary gives to the workers (createPool, usePool), shared by machines through a database
// (ormSlots), with no dependencies. The bus is the same object in every module of a process.
import cluster from 'node:cluster';
import { Bus, BusError } from './lib/bus.js';
import { createStarter } from './lib/start.js';
import { Pool, PoolClient, PoolError, Lease } from './lib/pool.js';
import { ormSlots } from './lib/slots.js';

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

export function isPrimary() {
  return cluster.isPrimary;
}
export function isWorker() {
  return cluster.isWorker;
}

export { start, stop, bus, Bus, BusError, createPool, usePool, Pool, PoolClient, PoolError, Lease, ormSlots };
