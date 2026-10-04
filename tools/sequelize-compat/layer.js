// The @xufa/sequelize the shim gives: the package of this repository, or the copy that `node snapshot.js` makes in
// .snapshot/ when SEQ_LAYER=snapshot (a fixed version to run the whole suite while the package changes).
const path = require('path');

const dir =
  process.env.SEQ_LAYER === 'snapshot'
    ? path.join(__dirname, '.snapshot')
    : path.join(__dirname, '..', '..', 'packages', 'sequelize');

module.exports = { dir, load: (file = '') => require(path.join(dir, file)) };
