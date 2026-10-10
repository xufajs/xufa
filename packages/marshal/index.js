// @xufa/marshal: values as JSON that keeps classes, references, cycles and the types JSON does not have.
import { marshal, unmarshal, stringify, parse } from './lib/marshal.js';
import { clone } from './lib/clone.js';
import { Registry, registry, ENCODE, DECODE } from './lib/registry.js';
import { MarshalError } from './lib/errors.js';

export { marshal, unmarshal, stringify, parse, clone, Registry, registry, ENCODE, DECODE, MarshalError };
