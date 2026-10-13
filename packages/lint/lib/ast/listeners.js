// The listeners of rules, by selector, and their run over the steps of a traversal (SourceCode#traverse(): entering
// and leaving each node, and the events of code paths between them). For each node entered or left, the selectors
// that match it, in ESLint's order (the less specific first, see selectors.js), then their listeners in the order
// they were added; for an event, its listeners.

import { parse } from './selectors.js';

const NONE = Object.freeze([]);
const VISIT = 1;
const CALL = 2;
const ENTER = 1;

// The selectors of a set of listeners, by the node type they can match, and those of any type, each list in order.
class SelectorIndex {
  constructor(entries) {
    this.entries = entries;
    this.byType = [new Map(), new Map()];
    this.anyType = [[], []];
    for (const name of entries.keys()) {
      const selector = parse(name);
      const exit = selector.isExit ? 1 : 0;
      if (selector.nodeTypes) {
        for (const type of selector.nodeTypes) {
          const list = this.byType[exit].get(type);
          if (list) list.push(selector);
          else this.byType[exit].set(type, [selector]);
        }
      } else {
        this.anyType[exit].push(selector);
      }
    }
    const order = (a, b) => a.compare(b);
    for (const exit of [0, 1]) {
      this.anyType[exit].sort(order);
      for (const list of this.byType[exit].values()) list.sort(order);
    }
    // What to do on a node of a type: its selectors and those of any type, merged in order, each with its test and
    // its listeners.
    this.merged = [new Map(), new Map()];
  }

  forType(type, exit) {
    let merged = this.merged[exit].get(type);
    if (merged) return merged;
    const own = this.byType[exit].get(type) ?? NONE;
    const any = this.anyType[exit];
    merged = { tests: [], entries: [] };
    const take = (selector, test) => {
      merged.tests.push(test);
      merged.entries.push(this.entries.get(selector.source));
    };
    let i = 0;
    let j = 0;
    while (i < own.length || j < any.length) {
      if (i < own.length && !(j < any.length && any[j].compare(own[i]) < 0)) {
        // Found by its type: a selector that is the type alone matches without a test.
        take(own[i], own[i].byTypeAlone ? null : own[i].test);
        i++;
      } else {
        take(any[j], any[j].test);
        j++;
      }
    }
    this.merged[exit].set(type, merged);
    return merged;
  }
}

// The listeners of a selector or an event, each with what added it (a rule's id: errors of a listener say it).
const newEntry = () => ({ listeners: [], owners: [] });

class Listeners {
  #entries = new Map();

  /** A listener of a selector or an event; `owner`, if given, is put as `ruleId` on its errors. */
  add(name, listener, owner) {
    let entry = this.#entries.get(name);
    if (!entry) this.#entries.set(name, (entry = newEntry()));
    entry.listeners.push(listener);
    entry.owners.push(owner);
  }

  get(name) {
    return this.#entries.get(name)?.listeners ?? NONE;
  }

  forEachName(callback) {
    for (const name of this.#entries.keys()) callback(name);
  }

  callSync(name, ...args) {
    const entry = this.#entries.get(name);
    if (entry) call(entry, args);
  }

  /** Runs the listeners over the steps of a traversal. */
  run(steps) {
    const index = new SelectorIndex(this.#entries);
    const ancestors = [];
    const matched = [];
    for (const step of steps) {
      if (step.kind === CALL) {
        const entry = this.#entries.get(step.target);
        if (entry) call(entry, step.args);
        continue;
      }
      if (step.kind !== VISIT) throw new Error(`Invalid traversal step found: "${step.kind}".`);
      const node = step.target;
      try {
        const exit = step.phase === ENTER ? 0 : 1;
        if (exit) ancestors.pop();
        // The selectors that match, all of them before any listener runs (as ESLint does).
        const { tests, entries } = index.forType(node.type, exit);
        const depth = ancestors.length;
        let count = 0;
        for (let i = 0; i < tests.length; i++) {
          const test = tests[i];
          if (test === null || test(node, ancestors, depth)) matched[count++] = entries[i];
        }
        for (let i = 0; i < count; i++) callWith(matched[i], node);
        if (!exit) ancestors.push(node);
      } catch (error) {
        error.currentNode = node;
        throw error;
      }
    }
  }
}

// The listeners of an entry, called with a node.
function callWith({ listeners, owners }, node) {
  for (let i = 0; i < listeners.length; i++) {
    const listener = listeners[i];
    try {
      listener(node);
    } catch (error) {
      if (owners[i] !== undefined) error.ruleId = owners[i];
      throw error;
    }
  }
}

// The listeners of an entry, called in order; an error of one gets its owner as ruleId.
function call({ listeners, owners }, args) {
  for (let i = 0; i < listeners.length; i++) {
    // Called as a function (this is undefined in it), as ESLint calls listeners.
    const listener = listeners[i];
    try {
      if (args.length === 1) listener(args[0]);
      else listener(...args);
    } catch (error) {
      if (owners[i] !== undefined) error.ruleId = owners[i];
      throw error;
    }
  }
}

export { Listeners };
