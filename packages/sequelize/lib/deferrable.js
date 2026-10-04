// Deferrable: when PostgreSQL checks constraints. In references and addConstraint, INITIALLY_IMMEDIATE,
// INITIALLY_DEFERRED and NOT say how the constraint is made; in transactions, SET_DEFERRED and SET_IMMEDIATE (of
// constraints named, or all) when the transaction checks them.

function constraintList(constraints) {
  return constraints && constraints.length
    ? constraints.map((name) => `"${String(name).replace(/"/g, '""')}"`).join(', ')
    : 'ALL';
}

function setter(mode) {
  const make = (constraints) => ({
    xufaDeferrable: `SET CONSTRAINTS ${constraintList(constraints)} ${mode}`,
    constraints,
  });
  make.xufaDeferrable = `SET CONSTRAINTS ALL ${mode}`;
  return make;
}

// As Sequelize: each one is used as it is (Deferrable.INITIALLY_DEFERRED), or called (Deferrable.INITIALLY_DEFERRED()),
// and new'd too; what is given back is of it (instanceof).
function kind(sql) {
  function make() {
    if (!(this instanceof make)) return new make(); // eslint-disable-line new-cap
    this.xufaDeferrable = sql;
    return this;
  }
  make.xufaDeferrable = sql;
  make.prototype.toString = () => sql;
  return make;
}

const Deferrable = {
  INITIALLY_DEFERRED: kind('DEFERRABLE INITIALLY DEFERRED'),
  INITIALLY_IMMEDIATE: kind('DEFERRABLE INITIALLY IMMEDIATE'),
  NOT: kind('NOT DEFERRABLE'),
  SET_DEFERRED: setter('DEFERRED'),
  SET_IMMEDIATE: setter('IMMEDIATE'),
};

// The SQL of a deferrable (or undefined).
function deferrableSql(deferrable) {
  if (!deferrable) return undefined;
  return deferrable.xufaDeferrable;
}

// The deferrable of a foreign key, as information_schema says it (is_deferrable, initially_deferred).
function deferrableOf(isDeferrable, initiallyDeferred) {
  if (isDeferrable !== 'YES') return Deferrable.NOT;
  return initiallyDeferred === 'YES' ? Deferrable.INITIALLY_DEFERRED : Deferrable.INITIALLY_IMMEDIATE;
}

module.exports = { Deferrable, deferrableSql, deferrableOf };
