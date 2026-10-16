// DOMException: an error of the DOM by its name (InvalidCharacterError, HierarchyRequestError, ...) and legacy code.
const CODES = {
  IndexSizeError: 1,
  HierarchyRequestError: 3,
  WrongDocumentError: 4,
  InvalidCharacterError: 5,
  NoModificationAllowedError: 7,
  NotFoundError: 8,
  NotSupportedError: 9,
  InUseAttributeError: 10,
  InvalidStateError: 11,
  SyntaxError: 12,
  InvalidModificationError: 13,
  NamespaceError: 14,
  InvalidAccessError: 15,
};

class DOMException extends Error {
  constructor(message = '', name = 'Error') {
    super(message);
    Object.defineProperty(this, 'name', { value: name, configurable: true, writable: true });
    Object.defineProperty(this, 'code', { value: CODES[name] ?? 0, configurable: true });
  }
}
Object.assign(DOMException, {
  INDEX_SIZE_ERR: 1,
  HIERARCHY_REQUEST_ERR: 3,
  WRONG_DOCUMENT_ERR: 4,
  INVALID_CHARACTER_ERR: 5,
  NO_MODIFICATION_ALLOWED_ERR: 7,
  NOT_FOUND_ERR: 8,
  NOT_SUPPORTED_ERR: 9,
  INUSE_ATTRIBUTE_ERR: 10,
  INVALID_STATE_ERR: 11,
  SYNTAX_ERR: 12,
  INVALID_MODIFICATION_ERR: 13,
  NAMESPACE_ERR: 14,
  INVALID_ACCESS_ERR: 15,
});

export { DOMException };
