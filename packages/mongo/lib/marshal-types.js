// The types of BSON registered in a registry of @xufa/marshal (or anything with its register(Class, { name, encode,
// decode })), so that documents keep them through the processes of a cluster as a read from the database gives them:
// an ObjectId as itself (written as its hex), a Decimal128 (its text), and Binary, Timestamp, Int32, Double, MinKey
// and MaxKey by their fields.
//
//   registerBsonTypes(new Registry());
import { Binary, Decimal128, Double, Int32, MaxKey, MinKey, ObjectId, Timestamp } from './bson.js';

export function registerBsonTypes(registry) {
  registry.register(ObjectId, {
    name: 'bson.ObjectId',
    encode: (id) => id.toHexString(),
    decode: (hex) => new ObjectId(hex),
  });
  registry.register(Decimal128, {
    name: 'bson.Decimal128',
    encode: (decimal) => decimal.toString(),
    decode: (text) => Decimal128.fromString(text),
  });
  for (const Class of [Binary, Timestamp, Int32, Double, MinKey, MaxKey]) {
    registry.register(Class, { name: `bson.${Class.name}` });
  }
  return registry;
}
