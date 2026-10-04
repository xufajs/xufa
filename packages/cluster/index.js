// @xufa/cluster: an app in a cluster of processes (start, stop) and the messages between them (bus), with no
// dependencies. The bus is the same object in every module of a process.
const cluster = require('node:cluster');
const { Bus, BusError } = require('./lib/bus');
const { createStarter } = require('./lib/start');

const bus = new Bus();
const { start, stop } = createStarter(bus);

module.exports = {
  start,
  stop,
  bus,
  Bus,
  BusError,
  get isPrimary() {
    return cluster.isPrimary;
  },
  get isWorker() {
    return cluster.isWorker;
  },
};
