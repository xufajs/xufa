// What scope analysis finds: variables, the definitions that make them (a declaration, a parameter, an import...)
// and the references to them (identifiers that read or write them). Rules read their fields: they are eslint-scope's.

const READ = 0x1;
const WRITE = 0x2;
const RW = READ | WRITE;

class Variable {
  constructor(name, scope) {
    this.name = name;
    this.identifiers = [];
    this.references = [];
    this.defs = [];
    this.tainted = false;
    // Whether every reference is from the variable's own function (no closure reads it).
    this.stack = true;
    this.scope = scope;
  }
}

// The types of definitions.
Variable.CatchClause = 'CatchClause';
Variable.Parameter = 'Parameter';
Variable.FunctionName = 'FunctionName';
Variable.ClassName = 'ClassName';
Variable.Variable = 'Variable';
Variable.ImportBinding = 'ImportBinding';
Variable.ImplicitGlobalVariable = 'ImplicitGlobalVariable';

class Definition {
  constructor(type, name, node, parent, index, kind) {
    this.type = type;
    this.name = name;
    this.node = node;
    this.parent = parent;
    this.index = index;
    this.kind = kind;
  }
}

class ParameterDefinition extends Definition {
  constructor(name, node, index, rest) {
    super(Variable.Parameter, name, node, null, index, null);
    this.rest = rest;
  }
}

// An identifier that reads (READ), writes (WRITE) or does both (RW, `x++`, `x += 1`). A write has what is written
// (writeExpr), whether it writes part of it (partial: a name in a pattern) and whether it initializes (init).
class Reference {
  constructor(identifier, scope, flag, writeExpr, maybeImplicitGlobal, partial, init) {
    this.identifier = identifier;
    this.from = scope;
    this.tainted = false;
    this.resolved = null;
    this.flag = flag;
    if (flag & WRITE) {
      this.writeExpr = writeExpr;
      this.partial = partial;
      this.init = init;
    }
    // { pattern, node } of an assignment to a name outside strict code: a global if nothing declares it.
    this.__maybeImplicitGlobal = maybeImplicitGlobal;
  }

  isStatic() {
    return !this.tainted && this.resolved && this.resolved.scope.isStatic();
  }

  isWrite() {
    return (this.flag & WRITE) !== 0;
  }

  isRead() {
    return (this.flag & READ) !== 0;
  }

  isReadOnly() {
    return this.flag === READ;
  }

  isWriteOnly() {
    return this.flag === WRITE;
  }

  isReadWrite() {
    return this.flag === RW;
  }
}

Reference.READ = READ;
Reference.WRITE = WRITE;
Reference.RW = RW;

export { Variable, Definition, ParameterDefinition, Reference };
