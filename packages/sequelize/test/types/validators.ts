// Ported from sequelize (test/types/validators.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { DataTypes, Model, Sequelize } from 'sequelize';

const sequelize = new Sequelize('mysql://user:user@localhost:3306/mydb');

/**
 * Test for isIn/notIn validation - should accept any[]
 */
class ValidatedUser extends Model {}
ValidatedUser.init(
  {
    name: {
      type: DataTypes.STRING,
      validate: {
        isIn: [['first', 1, null]],
      },
    },
    email: {
      type: DataTypes.STRING,
      validate: {
        notIn: [['second', 2, null]],
      },
    },
  },
  { sequelize }
);
