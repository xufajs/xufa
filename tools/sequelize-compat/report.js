// Reads a report of run-all.js, given as a path or as its name in results/.
const fs = require('fs');
const path = require('path');

module.exports = (name) => {
  const file = fs.existsSync(name) ? name : path.join(__dirname, 'results', `${name.replace(/\.json$/, '')}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
