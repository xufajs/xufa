/* eslint-disable no-console */
// The machine of the run of the benchmarks of @xufa/schema: results/schema/machine.json, which their pages show.
//
//   node schema/machine.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const RESULTS = require('./lib/results');
const machine = {
  cpu: os.cpus()[0].model.replace(/\s+/g, ' ').trim(),
  cores: os.cpus().length,
  os: os.type(),
  node: process.version,
  date: new Date().toISOString().slice(0, 10),
};
fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(path.join(RESULTS, 'machine.json'), `${JSON.stringify(machine, null, 2)}\n`);
console.log(machine);
