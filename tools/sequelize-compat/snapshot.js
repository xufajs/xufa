// Copies packages/sequelize (index.js, package.json, lib/) to .snapshot/, the layer of the runs with SEQ_LAYER=snapshot.
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', '..', 'packages', 'sequelize');
const to = path.join(__dirname, '.snapshot');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to);
for (const name of ['index.js', 'package.json', 'lib']) {
  fs.cpSync(path.join(from, name), path.join(to, name), { recursive: true });
}
console.log(`snapshot of ${from} in ${to}`);
