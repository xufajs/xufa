// The tree of loaded plugins with the time each one took, for prettyPrint() and toJSON().

class TimeTree {
  constructor() {
    this.root = null;
    this.tableId = new Map();
    this.tableLabel = new Map();
  }

  track(node) {
    this.tableId.set(node.id, node);
    if (this.tableLabel.has(node.label)) this.tableLabel.get(node.label).push(node);
    else this.tableLabel.set(node.label, [node]);
  }

  untrack(node) {
    this.tableId.delete(node.id);
    const nodes = this.tableLabel.get(node.label);
    nodes.pop();
    if (nodes.length === 0) this.tableLabel.delete(node.label);
  }

  parentOf(label) {
    if (label === null || !this.tableLabel.has(label)) return null;
    const nodes = this.tableLabel.get(label);
    return nodes[nodes.length - 1];
  }

  start(parent, label, start = Date.now()) {
    const parentNode = this.parentOf(parent);
    if (parentNode === null) {
      this.root = { parent: null, id: 'root', label, nodes: [], start, stop: null, diff: -1 };
      this.track(this.root);
      return this.root.id;
    }
    const node = { parent, id: `${label}-${Math.random()}`, label, nodes: [], start, stop: null, diff: -1 };
    parentNode.nodes.push(node);
    this.track(node);
    return node.id;
  }

  stop(nodeId, stop = Date.now()) {
    const node = this.tableId.get(nodeId);
    if (!node) return;
    node.stop = stop;
    node.diff = node.stop - node.start || 0;
    this.untrack(node);
  }

  toJSON() {
    return { ...this.root };
  }

  prettyPrint() {
    return prettyPrintTimeTree(this.toJSON());
  }
}

function prettyPrintTimeTree(node, prefix = '') {
  let result = `${prefix}${node.label} ${node.diff} ms\n`;
  const last = node.nodes.length - 1;
  node.nodes.forEach((child, i) => {
    const childPrefix = prefix + (i === last ? '  ' : '│ ');
    result += prefix + (i === last ? '└─' : '├─') + (child.nodes.length === 0 ? '─ ' : '┬ ');
    result += prettyPrintTimeTree(child, childPrefix).slice(prefix.length + 2);
  });
  return result;
}

export { TimeTree };
