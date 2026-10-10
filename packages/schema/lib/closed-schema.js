import { Schema } from './schema.js';

class ClosedSchema extends Schema {
  constructor(schema = {}, options = {}) {
    super(schema, { ...options, isOpen: false });
  }
}

export { ClosedSchema };
