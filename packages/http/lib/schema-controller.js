// The schemas of an instance (addSchema) and the compilers of validators and serializers, inherited by the
// encapsulated instances.
import { buildSchemas } from './schemas.js';
import { createRequire } from 'node:module';

// The default compilers are loaded when an instance uses them (require() of ES modules): not with custom ones.
const require = createRequire(import.meta.url);

function buildSchemaController(parent, opts) {
  if (parent) return new SchemaController(parent, opts);
  const compilersFactory = { buildValidator: null, buildSerializer: null, ...(opts && opts.compilersFactory) };
  if (!compilersFactory.buildValidator) {
    const { ValidatorSelector } = require('./validator-compiler.js');
    compilersFactory.buildValidator = ValidatorSelector();
  }
  if (!compilersFactory.buildSerializer) {
    const { SerializerSelector } = require('./serializer-compiler.js');
    compilersFactory.buildSerializer = SerializerSelector();
  }
  const isCustom = (name) =>
    Boolean(opts && opts.compilersFactory && typeof opts.compilersFactory[name] === 'function');
  return new SchemaController(undefined, {
    bucket: (opts && opts.bucket) || buildSchemas,
    compilersFactory,
    isCustomValidatorCompiler: isCustom('buildValidator'),
    isCustomSerializerCompiler: isCustom('buildSerializer'),
  });
}

class SchemaController {
  constructor(parent, options) {
    this.opts = options || (parent && parent.opts);
    this.addedSchemas = false;
    this.compilersFactory = this.opts.compilersFactory;
    if (parent) {
      this.schemaBucket = this.opts.bucket(parent.getSchemas());
      this.validatorCompiler = parent.getValidatorCompiler();
      this.serializerCompiler = parent.getSerializerCompiler();
      this.isCustomValidatorCompiler = parent.isCustomValidatorCompiler;
      this.isCustomSerializerCompiler = parent.isCustomSerializerCompiler;
      this.parent = parent;
    } else {
      this.schemaBucket = this.opts.bucket();
      this.isCustomValidatorCompiler = this.opts.isCustomValidatorCompiler || false;
      this.isCustomSerializerCompiler = this.opts.isCustomSerializerCompiler || false;
    }
  }

  add(schema) {
    this.addedSchemas = true;
    return this.schemaBucket.add(schema);
  }

  getSchema(schemaId) {
    return this.schemaBucket.getSchema(schemaId);
  }

  getSchemas() {
    return this.schemaBucket.getSchemas();
  }

  // A compiler set this way is used as if a factory always gave it.
  setValidatorCompiler(validatorCompiler) {
    this.compilersFactory = { ...this.compilersFactory, buildValidator: () => validatorCompiler };
    this.validatorCompiler = validatorCompiler;
    this.isCustomValidatorCompiler = true;
  }

  setSerializerCompiler(serializerCompiler) {
    this.compilersFactory = { ...this.compilersFactory, buildSerializer: () => serializerCompiler };
    this.serializerCompiler = serializerCompiler;
    this.isCustomSerializerCompiler = true;
  }

  getValidatorCompiler() {
    return this.validatorCompiler || (this.parent && this.parent.getValidatorCompiler());
  }

  getSerializerCompiler() {
    return this.serializerCompiler || (this.parent && this.parent.getSerializerCompiler());
  }

  getSerializerBuilder() {
    return this.compilersFactory.buildSerializer || (this.parent && this.parent.getSerializerBuilder());
  }

  getValidatorBuilder() {
    return this.compilersFactory.buildValidator || (this.parent && this.parent.getValidatorBuilder());
  }

  // Builds the compiler once, again when schemas were added since.
  setupValidator(serverOptions) {
    if (this.validatorCompiler !== undefined && !this.addedSchemas) return;
    this.validatorCompiler = this.getValidatorBuilder()(this.schemaBucket.getSchemas(), serverOptions.ajv);
  }

  setupSerializer(serverOptions) {
    if (this.serializerCompiler !== undefined && !this.addedSchemas) return;
    this.serializerCompiler = this.getSerializerBuilder()(this.schemaBucket.getSchemas(), serverOptions.serializerOpts);
  }
}

SchemaController.buildSchemaController = buildSchemaController;

export default SchemaController;

// What require() gives (the tests of fastify are CommonJS).
export { SchemaController as 'module.exports' };
