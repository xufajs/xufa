// NodeIterator and TreeWalker (https://dom.spec.whatwg.org/#traversal): nodes of a root in tree order, by the kinds of
// whatToShow and a filter. A NodeIterator is live: when a node is removed, the iterators of its document move their
// reference as the standard's "pre-removing steps" say, so a tree can be changed while it is walked (as a sanitizer
// does: an element replaced by its children, the walk goes on through them).
import { DOMException } from './exception.js';

const NodeFilter = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_ALL: 0xffffffff,
  SHOW_ELEMENT: 0x1,
  SHOW_ATTRIBUTE: 0x2,
  SHOW_TEXT: 0x4,
  SHOW_CDATA_SECTION: 0x8,
  SHOW_ENTITY_REFERENCE: 0x10,
  SHOW_ENTITY: 0x20,
  SHOW_PROCESSING_INSTRUCTION: 0x40,
  SHOW_COMMENT: 0x80,
  SHOW_DOCUMENT: 0x100,
  SHOW_DOCUMENT_TYPE: 0x200,
  SHOW_DOCUMENT_FRAGMENT: 0x400,
  SHOW_NOTATION: 0x800,
};

const MAX_LIVE_ITERATORS = 32;

// The DOM's "filter": the kind of the node in whatToShow, then the filter.
function filterNode(walker, node) {
  if (walker._active) throw new DOMException('The filter is already running.', 'InvalidStateError');
  if (!((1 << (node.nodeType - 1)) & walker.whatToShow)) return NodeFilter.FILTER_SKIP;
  const { filter } = walker;
  if (!filter) return NodeFilter.FILTER_ACCEPT;
  walker._active = true;
  try {
    let result;
    if (typeof filter === 'function') result = filter(node);
    else {
      // (acceptNode read once for each node, as WebIDL calls a callback interface.)
      const accept = filter.acceptNode;
      if (typeof accept !== 'function') throw new TypeError('The filter has no acceptNode method.');
      result = accept.call(filter, node);
    }
    // (An unsigned short, as WebIDL converts it: true is FILTER_ACCEPT.)
    return Number(result) & 0xffff;
  } finally {
    walker._active = false;
  }
}

// The node after a node in tree order, within a root (null past it).
function following(node, root) {
  if (node._first) return node._first;
  for (let current = node; current && current !== root; current = current._parent) {
    if (current._next) return current._next;
  }
  return null;
}

// The node before a node in tree order, within a root.
function preceding(node, root) {
  if (node === root) return null;
  if (node._prev) {
    let last = node._prev;
    while (last._last) last = last._last;
    return last;
  }
  return node._parent;
}

// root, whatToShow and filter: read-only, as the standard has them.
const traversalGetters = (Class) => {
  for (const name of ['root', 'whatToShow', 'filter']) {
    Object.defineProperty(Class.prototype, name, {
      get() {
        return this[`_${name}`];
      },
      configurable: true,
      enumerable: true,
    });
  }
};

class NodeIterator {
  constructor(root, whatToShow, filter) {
    this._root = root;
    this._whatToShow = whatToShow >>> 0;
    this._filter = filter ?? null;
    this._reference = root;
    this._beforeReference = true;
    this._active = false;
    // (Live by its document, which holds the most recent ones: an iterator and the document it walks go together when
    // nothing else holds them, and a document that lives long does not keep every iterator made on it; past
    // MAX_LIVE_ITERATORS at once, the oldest is no longer moved by removals, as jsdom does past 10.)
    const document = root.nodeType === 9 ? root : root._owner;
    document._iterators.add(this);
    if (document._iterators.size > MAX_LIVE_ITERATORS) {
      document._iterators.delete(document._iterators.values().next().value);
    }
  }

  get referenceNode() {
    return this._reference;
  }

  get pointerBeforeReferenceNode() {
    return this._beforeReference;
  }

  nextNode() {
    return this._traverse(true);
  }

  previousNode() {
    return this._traverse(false);
  }

  _traverse(next) {
    let node = this._reference;
    let before = this._beforeReference;
    for (;;) {
      if (next) {
        if (!before) {
          node = following(node, this.root);
          if (!node) return null;
        } else before = false;
      } else if (before) {
        node = preceding(node, this.root);
        if (!node) return null;
      } else before = true;
      if (filterNode(this, node) === NodeFilter.FILTER_ACCEPT) break;
    }
    this._reference = node;
    this._beforeReference = before;
    return node;
  }

  // The standard's "NodeIterator pre-removing steps", for a node about to be removed.
  _preRemove(toBeRemoved) {
    if (toBeRemoved.contains(this.root) || !toBeRemoved.contains(this._reference)) return;
    if (this._beforeReference) {
      // The first node after toBeRemoved (its descendants left out) within the root.
      let next = null;
      for (let current = toBeRemoved; current && current !== this.root; current = current._parent) {
        if (current._next) {
          next = current._next;
          break;
        }
      }
      if (next) {
        this._reference = next;
        return;
      }
      this._beforeReference = false;
    }
    if (toBeRemoved._prev) {
      let last = toBeRemoved._prev;
      while (last._last) last = last._last;
      this._reference = last;
    } else this._reference = toBeRemoved._parent;
  }

  // (It does nothing, as the standard says now.)
  detach() {}
}

class TreeWalker {
  constructor(root, whatToShow, filter) {
    this._root = root;
    this._whatToShow = whatToShow >>> 0;
    this._filter = filter ?? null;
    this._current = root;
    this._active = false;
  }

  get currentNode() {
    return this._current;
  }

  set currentNode(node) {
    if (!node || typeof node.nodeType !== 'number') throw new TypeError('currentNode is not a Node.');
    this._current = node;
  }

  parentNode() {
    for (let node = this.currentNode; node && node !== this.root;) {
      node = node._parent;
      if (node && filterNode(this, node) === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
    return null;
  }

  _children(first) {
    let node = first ? this.currentNode._first : this.currentNode._last;
    while (node) {
      const result = filterNode(this, node);
      if (result === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
      if (result === NodeFilter.FILTER_SKIP) {
        const child = first ? node._first : node._last;
        if (child) {
          node = child;
          continue;
        }
      }
      while (node) {
        const sibling = first ? node._next : node._prev;
        if (sibling) {
          node = sibling;
          break;
        }
        const parent = node._parent;
        if (!parent || parent === this.root || parent === this.currentNode) return null;
        node = parent;
      }
    }
    return null;
  }

  firstChild() {
    return this._children(true);
  }

  lastChild() {
    return this._children(false);
  }

  _siblings(next) {
    let node = this.currentNode;
    if (node === this.root) return null;
    for (;;) {
      let sibling = next ? node._next : node._prev;
      while (sibling) {
        node = sibling;
        const result = filterNode(this, node);
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
        sibling = next ? node._first : node._last;
        if (result === NodeFilter.FILTER_REJECT || !sibling) sibling = next ? node._next : node._prev;
      }
      node = node._parent;
      if (!node || node === this.root) return null;
      if (filterNode(this, node) === NodeFilter.FILTER_ACCEPT) return null;
    }
  }

  nextSibling() {
    return this._siblings(true);
  }

  previousSibling() {
    return this._siblings(false);
  }

  nextNode() {
    let node = this.currentNode;
    let result = NodeFilter.FILTER_ACCEPT;
    for (;;) {
      while (result !== NodeFilter.FILTER_REJECT && node._first) {
        node = node._first;
        result = filterNode(this, node);
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
      }
      let sibling = null;
      for (let current = node; current; current = current._parent) {
        if (current === this.root) return null;
        if (current._next) {
          sibling = current._next;
          break;
        }
      }
      if (!sibling) return null;
      node = sibling;
      result = filterNode(this, node);
      if (result === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
  }

  previousNode() {
    let node = this.currentNode;
    while (node !== this.root) {
      let sibling = node._prev;
      while (sibling) {
        node = sibling;
        let result = filterNode(this, node);
        while (result !== NodeFilter.FILTER_REJECT && node._last) {
          node = node._last;
          result = filterNode(this, node);
        }
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
        sibling = node._prev;
      }
      if (node === this.root || !node._parent) return null;
      node = node._parent;
      if (filterNode(this, node) === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
    return null;
  }
}

traversalGetters(NodeIterator);
traversalGetters(TreeWalker);

export { NodeFilter, NodeIterator, TreeWalker };
