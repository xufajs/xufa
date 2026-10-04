// Nodes of the radix tree: static prefixes, parameters (plain or with a regular expression) and wildcards.
const { HandlerStorage } = require('./constraints');

const matchFirst = () => true;

// A function telling whether the path has the prefix at an index, its first character being already checked:
// comparisons of character codes the compiler inlines, faster than startsWith() on short prefixes.
function compilePrefixMatch(prefix) {
  if (prefix.length <= 1) return matchFirst;
  const checks = [];
  for (let i = 1; i < prefix.length; i += 1) checks.push(`path.charCodeAt(i + ${i}) === ${prefix.charCodeAt(i)}`);
  // eslint-disable-next-line no-new-func
  return new Function('path', 'i', `return ${checks.join(' && ')}`);
}

const NODE_TYPES = { STATIC: 0, PARAMETRIC: 1, WILDCARD: 2 };

class Node {
  constructor() {
    this.isLeafNode = false;
    this.routes = null;
    this.handlerStorage = null;
  }

  addRoute(route, constrainer) {
    if (this.routes === null) this.routes = [];
    if (this.handlerStorage === null) this.handlerStorage = new HandlerStorage();
    this.isLeafNode = true;
    this.routes.push(route);
    this.handlerStorage.addHandler(constrainer, route);
  }
}

class ParentNode extends Node {
  constructor() {
    super();
    // Static children by the code of their first character: a scan of a few integers beats a lookup by string.
    this.staticChildrenCharCodes = [];
    this.staticChildrenNodes = [];
  }

  setStaticChild(label, node) {
    const code = label.charCodeAt(0);
    const index = this.staticChildrenCharCodes.indexOf(code);
    if (index === -1) {
      this.staticChildrenCharCodes.push(code);
      this.staticChildrenNodes.push(node);
    } else {
      this.staticChildrenNodes[index] = node;
    }
  }

  findStaticMatchingChild(path, pathIndex) {
    const code = path.charCodeAt(pathIndex);
    const codes = this.staticChildrenCharCodes;
    for (let i = 0; i < codes.length; i += 1) {
      if (codes[i] === code) {
        const child = this.staticChildrenNodes[i];
        return child.matchPrefix(path, pathIndex) ? child : null;
      }
    }
    return null;
  }

  getStaticChild(path, pathIndex = 0) {
    if (path.length === pathIndex) return this;
    const child = this.findStaticMatchingChild(path, pathIndex);
    return child ? child.getStaticChild(path, pathIndex + child.prefixLength) : null;
  }

  createStaticChild(path) {
    if (path.length === 0) return this;
    const index = this.staticChildrenCharCodes.indexOf(path.charCodeAt(0));
    let child = index === -1 ? undefined : this.staticChildrenNodes[index];
    if (child) {
      let i = 1;
      for (; i < child.prefixLength; i += 1) {
        if (path.charCodeAt(i) !== child.prefix.charCodeAt(i)) {
          child = child.split(this, i);
          break;
        }
      }
      return child.createStaticChild(path.slice(i));
    }
    const node = new StaticNode(path);
    this.setStaticChild(path, node);
    return node;
  }
}

class StaticNode extends ParentNode {
  constructor(prefix) {
    super();
    this.prefix = prefix;
    this.prefixLength = prefix.length;
    this.matchPrefix = compilePrefixMatch(prefix);
    this.wildcardChild = null;
    this.parametricChildren = [];
    this.kind = NODE_TYPES.STATIC;
  }

  getParametricChild(regex) {
    const source = regex && regex.source;
    return this.parametricChildren.find((child) => (child.regex && child.regex.source) === source) || null;
  }

  createParametricChild(regex, staticSuffix, nodePath) {
    let child = this.getParametricChild(regex);
    if (child) {
      child.nodePaths.add(nodePath);
      return child;
    }
    child = new ParametricNode(regex, staticSuffix, nodePath);
    this.parametricChildren.push(child);
    // Regular expressions first, the ones with the longest static suffix before the ones it ends.
    this.parametricChildren.sort((a, b) => {
      if (!a.isRegex) return 1;
      if (!b.isRegex) return -1;
      if (a.staticSuffix === null) return 1;
      if (b.staticSuffix === null) return -1;
      if (b.staticSuffix.endsWith(a.staticSuffix)) return 1;
      if (a.staticSuffix.endsWith(b.staticSuffix)) return -1;
      return 0;
    });
    return child;
  }

  getWildcardChild() {
    return this.wildcardChild;
  }

  createWildcardChild() {
    this.wildcardChild = this.wildcardChild || new WildcardNode();
    return this.wildcardChild;
  }

  split(parent, length) {
    const parentPrefix = this.prefix.slice(0, length);
    const childPrefix = this.prefix.slice(length);
    this.prefix = childPrefix;
    this.prefixLength = childPrefix.length;
    this.matchPrefix = compilePrefixMatch(childPrefix);
    const node = new StaticNode(parentPrefix);
    node.setStaticChild(childPrefix, this);
    parent.setStaticChild(parentPrefix, node);
    return node;
  }

  // The next node to try; the others that could match are pushed to be tried when it fails.
  getNextNode(path, pathIndex, stack, paramsCount) {
    let node = this.findStaticMatchingChild(path, pathIndex);
    let firstParametric = 0;
    if (node === null) {
      if (this.parametricChildren.length === 0) return this.wildcardChild;
      node = this.parametricChildren[0];
      firstParametric = 1;
    }
    // Three entries per node to try later: the node, the index in the path and the number of parameters.
    if (this.wildcardChild !== null) stack.push(this.wildcardChild, pathIndex, paramsCount);
    for (let i = this.parametricChildren.length - 1; i >= firstParametric; i -= 1) {
      stack.push(this.parametricChildren[i], pathIndex, paramsCount);
    }
    return node;
  }
}

class ParametricNode extends ParentNode {
  constructor(regex, staticSuffix, nodePath) {
    super();
    this.isRegex = Boolean(regex);
    this.regex = regex || null;
    this.staticSuffix = staticSuffix || null;
    this.kind = NODE_TYPES.PARAMETRIC;
    this.nodePaths = new Set([nodePath]);
  }

  getNextNode(path, pathIndex) {
    return this.findStaticMatchingChild(path, pathIndex);
  }
}

class WildcardNode extends Node {
  constructor() {
    super();
    this.kind = NODE_TYPES.WILDCARD;
  }

  // eslint-disable-next-line class-methods-use-this
  getNextNode() {
    return null;
  }
}

module.exports = { StaticNode, ParametricNode, WildcardNode, NODE_TYPES };
