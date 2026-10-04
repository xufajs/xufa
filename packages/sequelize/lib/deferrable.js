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

const Deferrable = {
  INITIALLY_DEFERRED: { xufaDeferrable: 'DEFERRABLE INITIALLY DEFERRED' },
  INITIALLY_IMMEDIATE: { xufaDeferrable: 'DEFERRABLE INITIALLY IMMEDIATE' },
  NOT: { xufaDeferrable: 'NOT DEFERRABLE' },
  SET_DEFERRED: setter('DEFERRED'),
  SET_IMMEDIATE: setter('IMMEDIATE'),
};

// The SQL of a deferrable (or undefined).
function deferrableSql(deferrable) {
  if (!deferrable) return undefined;
  return deferrable.xufaDeferrable;
}

module.exports = { Deferrable, deferrableSql };
