// Route constraints (version, host and custom strategies), and the handlers stored on a node of the tree.
const strategies = require('./strategies');

class Constrainer {
  constructor(customStrategies) {
    this.strategies = { version: strategies.version, host: strategies.host };
    this.strategiesInUse = new Set();
    this.asyncStrategiesInUse = new Set();
    this.deriveSync = null;
    if (customStrategies) {
      for (const strategy of Object.values(customStrategies)) this.addConstraintStrategy(strategy);
    }
  }

  isStrategyUsed(name) {
    return this.strategiesInUse.has(name) || this.asyncStrategiesInUse.has(name);
  }

  hasConstraintStrategy(name) {
    const strategy = this.strategies[name];
    if (strategy === undefined) return false;
    return Boolean(strategy.isCustom) || this.isStrategyUsed(name);
  }

  addConstraintStrategy(strategy) {
    if (typeof strategy.name !== 'string' || strategy.name === '') throw new Error('strategy.name is required.');
    if (typeof strategy.storage !== 'function') throw new Error('strategy.storage function is required.');
    if (typeof strategy.deriveConstraint !== 'function') {
      throw new Error('strategy.deriveConstraint function is required.');
    }
    if (this.strategies[strategy.name] && this.strategies[strategy.name].isCustom) {
      throw new Error(`There already exists a custom constraint with the name ${strategy.name}.`);
    }
    if (this.isStrategyUsed(strategy.name)) {
      throw new Error(`There already exists a route with ${strategy.name} constraint.`);
    }
    strategy.isCustom = true;
    strategy.isAsync = strategy.deriveConstraint.length === 3;
    this.strategies[strategy.name] = strategy;
    if (strategy.mustMatchWhenDerived) this.noteUsage({ [strategy.name]: strategy });
  }

  // The constraints of a request: undefined when no route has any, so that the unconstrained handlers match.
  deriveConstraints(req, ctx, done) {
    const constraints = this.deriveSync === null ? undefined : this.deriveSync(req, ctx);
    if (done === undefined) return constraints;
    this.deriveAsyncConstraints(constraints, req, ctx, done);
    return undefined;
  }

  noteUsage(constraints) {
    if (!constraints) return;
    const before = this.strategiesInUse.size;
    for (const key of Object.keys(constraints)) {
      const strategy = this.strategies[key];
      if (strategy.isAsync) this.asyncStrategiesInUse.add(key);
      else this.strategiesInUse.add(key);
    }
    if (before !== this.strategiesInUse.size) this.buildDeriveSync();
  }

  newStoreForConstraint(name) {
    if (!this.strategies[name]) throw new Error(`No strategy registered for constraint key ${name}`);
    return this.strategies[name].storage();
  }

  validateConstraints(constraints) {
    for (const key of Object.keys(constraints)) {
      const value = constraints[key];
      if (value === undefined)
        throw new Error("Can't pass an undefined constraint value, must pass null or no key at all");
      const strategy = this.strategies[key];
      if (!strategy) throw new Error(`No strategy registered for constraint key ${key}`);
      if (strategy.validate) strategy.validate(value);
    }
  }

  deriveAsyncConstraints(constraints, req, ctx, done) {
    let pending = this.asyncStrategiesInUse.size;
    if (pending === 0) {
      done(null, constraints);
      return;
    }
    let errored = false;
    const values = constraints || {};
    for (const key of this.asyncStrategiesInUse) {
      this.strategies[key].deriveConstraint(req, ctx, (err, value) => {
        if (errored) return;
        if (err !== null) {
          errored = true;
          done(err);
          return;
        }
        values[key] = value;
        pending -= 1;
        if (pending === 0) done(null, values);
      });
    }
  }

  buildDeriveSync() {
    const used = [...this.strategiesInUse].map((key) => [key, this.strategies[key]]);
    if (used.length === 0) {
      this.deriveSync = null;
      return;
    }
    this.deriveSync = (req, ctx) => {
      const values = {};
      for (let i = 0; i < used.length; i += 1) {
        const [key, strategy] = used[i];
        if (key === 'version' && !strategy.isCustom) values.version = req.headers['accept-version'];
        else if (key === 'host' && !strategy.isCustom) values.host = req.headers.host || req.headers[':authority'];
        else values[key] = strategy.deriveConstraint(req, ctx);
      }
      return values;
    };
  }
}

const NullObject = function NullObject() {};
NullObject.prototype = Object.create(null);

// Builds the object of parameters from their values; compiled so that each one is a plain store of a property.
function compileParamsFactory(names) {
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = values[${i}];`);
  // eslint-disable-next-line no-new-func
  return new Function(
    'NullObject',
    `return function createParams(values) {\n  const params = new NullObject();\n  ${lines.join('\n  ')}\n  return params;\n}`
  )(NullObject);
}

// The same, with the values as arguments: what the compiled walk calls, with its parameters in locals.
function compileParamsArgsFactory(names) {
  const args = names.map((_, i) => `v${i}`);
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = v${i};`);
  // eslint-disable-next-line no-new-func
  return new Function(
    'NullObject',
    `return function createParamsArgs(${args.join(', ')}) {\n  const params = new NullObject();\n  ${lines.join('\n  ')}\n  return params;\n}`
  )(NullObject);
}

const MAX_HANDLERS = 31;

class HandlerStorage {
  constructor() {
    this.unconstrainedHandler = null;
    this.constraints = [];
    this.handlers = [];
    this.stores = null;
    this.matchConstrained = () => null;
  }

  getMatchingHandler(derivedConstraints) {
    if (derivedConstraints === undefined) return this.unconstrainedHandler;
    return this.matchConstrained(derivedConstraints);
  }

  addHandler(constrainer, route) {
    const constraints = route.opts.constraints || {};
    const handler = {
      params: route.params,
      constraints,
      handler: route.handler,
      store: route.store || null,
      createParams: compileParamsFactory(route.params),
      createParamsArgs: compileParamsArgsFactory(route.params),
    };
    // find-my-way's name of createParams, kept for code reading it
    handler._createParamsObject = handler.createParams;
    const names = Object.keys(constraints);
    if (names.length === 0) this.unconstrainedHandler = handler;
    for (const name of names) {
      if (!this.constraints.includes(name)) {
        if (name === 'version') this.constraints.unshift(name);
        else this.constraints.push(name);
      }
    }
    const merged = names.includes(strategies.httpMethod.name);
    if (!merged && this.handlers.length >= MAX_HANDLERS) {
      throw new Error(
        'find-my-way supports a maximum of 31 route handlers per node when there are constraints, limit reached'
      );
    }
    this.handlers.push(handler);
    this.handlers.sort((a, b) => Object.keys(a.constraints).length - Object.keys(b.constraints).length);
    if (!merged) this.compileMatcher(constrainer);
  }

  // Matches with bitmaps: a bit for each handler, cleared when a constraint of the request rules the handler out.
  compileMatcher(constrainer) {
    const { handlers } = this;
    this.stores = {};
    const checks = this.constraints.map((name) => {
      const store = constrainer.newStoreForConstraint(name);
      this.stores[name] = store;
      let unconstrained = 0;
      for (let i = 0; i < handlers.length; i += 1) {
        const value = handlers[i].constraints[name];
        if (value !== undefined) {
          store.set(value, (store.get(value) || 0) | (1 << i));
        } else {
          unconstrained |= 1 << i;
        }
      }
      return { name, store, unconstrained, mustMatch: Boolean(constrainer.strategies[name].mustMatchWhenDerived) };
    });
    const mustNotBeDerived = Object.keys(constrainer.strategies).filter(
      (name) => constrainer.strategies[name].mustMatchWhenDerived && !this.constraints.includes(name)
    );
    const all = 2 ** handlers.length - 1;
    this.matchConstrained = (derived) => {
      let candidates = all;
      for (let i = 0; i < checks.length; i += 1) {
        const check = checks[i];
        const value = derived[check.name];
        if (value === undefined) {
          candidates &= check.unconstrained;
        } else {
          const matches = check.store.get(value) || 0;
          candidates &= check.mustMatch ? matches : matches | check.unconstrained;
        }
        if (candidates === 0) return null;
      }
      for (let i = 0; i < mustNotBeDerived.length; i += 1) {
        if (derived[mustNotBeDerived[i]] !== undefined) return null;
      }
      return handlers[31 - Math.clz32(candidates)];
    };
  }
}

module.exports = { Constrainer, HandlerStorage, NullObject, compileParamsFactory };
