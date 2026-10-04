// Ported from sequelize (test/types/index-hints.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { User } from './models/User';
import { IndexHints } from 'sequelize';

User.findAll({
  indexHints: [{
    type: IndexHints.FORCE,
    values: ['some_index'],
  }],
});
