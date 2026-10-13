// A walk of a tree, depth first in the order of the source: enter(node, parent) before a node's children,
// leave(node, parent) after them. In enter, `this.skip()` leaves out the node's children; in either, `this.break()`
// ends the walk (no more enters or leaves).

import { KEYS, getKeys, isNode } from './visitor-keys.js';

const noop = () => {};

function traverse(root, { enter = noop, leave = noop }) {
  const control = {
    skipped: false,
    broken: false,
    skip() {
      control.skipped = true;
    },
    break() {
      control.broken = true;
    },
  };
  const walk = (node, parent) => {
    if (!isNode(node)) return;
    control.skipped = false;
    enter.call(control, node, parent);
    if (!control.skipped && !control.broken) {
      const keys = KEYS[node.type] ?? getKeys(node);
      for (let i = 0; i < keys.length && !control.broken; ++i) {
        const child = node[keys[i]];
        if (Array.isArray(child)) {
          for (let j = 0; j < child.length && !control.broken; ++j) walk(child[j], node);
        } else {
          walk(child, node);
        }
      }
    }
    if (!control.broken) leave.call(control, node, parent);
  };
  walk(root, null);
}

export { traverse };
