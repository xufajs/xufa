// @xufa/sequelize: the API of Sequelize 6 over @xufa/orm. Code written for Sequelize runs with
// require('@xufa/sequelize') instead of require('sequelize'), on @xufa/orm's backends (PostgreSQL with @xufa/pg,
// SQLite with node:sqlite) and with no other dependencies.
//
//   const { Sequelize, DataTypes, Op } = require('@xufa/sequelize');
//   const sequelize = new Sequelize('postgres://user:pass@localhost:5432/db', { logging: false });
//   const User = sequelize.define('User', { name: DataTypes.STRING, email: { type: DataTypes.STRING, unique: true } });
//   await sequelize.sync();
//   const users = await User.findAll({ where: { name: { [Op.startsWith]: 'A' } }, order: [['name', 'ASC']] });
//
// As the sequelize package, the module is the Sequelize class, with the rest as its properties.
const { Sequelize } = require('./lib/sequelize');

module.exports = Sequelize;
