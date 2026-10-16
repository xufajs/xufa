// The tree adapter of parse5 for the DOM of @xufa/html: the parser makes our nodes (of a document), and the serializer
// reads them (innerHTML, outerHTML). Attributes are given to parse5 as it has them: a namespaced one by its local name
// with its namespace and prefix (xlink:href is href in XLink), the rest by name.
import { NAMESPACES, NODE_TYPES, Attr, Text, Comment, DocumentFragment, DocumentType } from './nodes.js';

const SERIALIZED_BY_LOCAL_NAME = new Set([NAMESPACES.HTML, NAMESPACES.SVG, NAMESPACES.MATHML]);

function attrsOf(element) {
  return element._attrs.map((attr) => {
    const item = { name: attr._namespace ? attr._localName : attr.name, value: attr._value };
    if (attr._namespace) {
      item.namespace = attr._namespace;
      item.prefix = attr._prefix ?? '';
    }
    return item;
  });
}

// The adapter that makes the nodes of a document (the one parse5 asks for: createDocument()).
function adapterFor(document) {
  const owner = (parent) => (parent.nodeType === NODE_TYPES.DOCUMENT_NODE ? parent : parent._owner);
  return {
    createDocument: () => document,
    createDocumentFragment: () => new DocumentFragment(document),
    createElement(tagName, namespaceURI, attrs) {
      const element = document._createElement(namespaceURI ?? null, null, tagName);
      for (const attr of attrs) {
        element._appendAttr(new Attr(document, attr.namespace || null, attr.prefix || null, attr.name, attr.value));
      }
      return element;
    },
    createCommentNode: (data) => new Comment(document, data),
    createTextNode: (value) => new Text(document, value),

    appendChild(parent, node) {
      parent._insert(node, null);
    },
    insertBefore(parent, node, reference) {
      parent._insert(node, reference);
    },
    setTemplateContent(template, fragment) {
      template._content = fragment;
      fragment._adopt(template._owner._templateDocument());
    },
    getTemplateContent: (template) => template.content,
    setDocumentType(doc, name, publicId, systemId) {
      for (let child = doc._first; child; child = child._next) {
        if (child.nodeType === NODE_TYPES.DOCUMENT_TYPE_NODE) {
          child._name = name;
          child._publicId = publicId;
          child._systemId = systemId;
          return;
        }
      }
      doc._insert(new DocumentType(owner(doc), name, publicId, systemId), null);
    },
    setDocumentMode(doc, mode) {
      doc._mode = mode;
    },
    getDocumentMode: (doc) => doc._mode,
    detachNode(node) {
      if (node._parent) node._parent._removeChild(node);
    },
    insertText(parent, text) {
      const last = parent._last;
      if (last && last.nodeType === NODE_TYPES.TEXT_NODE) last._data += text;
      else parent._insert(new Text(owner(parent), text), null);
    },
    insertTextBefore(parent, text, reference) {
      const previous = reference._prev;
      if (previous && previous.nodeType === NODE_TYPES.TEXT_NODE) previous._data += text;
      else parent._insert(new Text(owner(parent), text), reference);
    },
    adoptAttributes(recipient, attrs) {
      const names = new Set(attrsOf(recipient).map((attr) => attr.name));
      for (const attr of attrs) {
        if (!names.has(attr.name)) {
          recipient._appendAttr(
            new Attr(recipient._owner, attr.namespace || null, attr.prefix || null, attr.name, attr.value)
          );
        }
      }
    },

    getFirstChild: (node) => node._first,
    getChildNodes: (node) => node._children(),
    getParentNode: (node) => node._parent,
    getAttrList: attrsOf,
    // (The local name of elements of HTML, SVG and MathML; the qualified name of others, as the serializer writes them.)
    getTagName: (element) =>
      SERIALIZED_BY_LOCAL_NAME.has(element._namespace) ? element._localName : element._qualifiedName,
    getNamespaceURI: (element) => element._namespace,
    getTextNodeContent: (node) => node._data,
    getCommentNodeContent: (node) => node._data,
    getDocumentTypeNodeName: (node) => node._name,
    getDocumentTypeNodePublicId: (node) => node._publicId,
    getDocumentTypeNodeSystemId: (node) => node._systemId,

    // (A CDATA section is a Text node: the HTML serializer writes it as text.)
    isTextNode: (node) => node.nodeType === NODE_TYPES.TEXT_NODE || node.nodeType === NODE_TYPES.CDATA_SECTION_NODE,
    isCommentNode: (node) => node.nodeType === NODE_TYPES.COMMENT_NODE,
    isDocumentTypeNode: (node) => node.nodeType === NODE_TYPES.DOCUMENT_TYPE_NODE,
    isElementNode: (node) => node.nodeType === NODE_TYPES.ELEMENT_NODE,

    setNodeSourceCodeLocation() {},
    getNodeSourceCodeLocation: () => undefined,
    updateNodeSourceCodeLocation() {},
  };
}

export { adapterFor };
