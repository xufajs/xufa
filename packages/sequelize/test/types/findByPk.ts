// Ported from sequelize (test/types/findByPk.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { User } from './models/User';

User.findByPk(Buffer.from('asdf'));
