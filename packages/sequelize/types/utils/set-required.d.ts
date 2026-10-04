// Ported from sequelize (types/utils/set-required.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
/**
 * Full credits to sindresorhus/type-fest
 *
 * https://github.com/sindresorhus/type-fest/blob/v0.8.1/source/set-required.d.ts
 *
 * Thank you!
 */
export type SetRequired<BaseType, Keys extends keyof BaseType = keyof BaseType> =
  // Pick just the keys that are not required from the base type.
  Pick<BaseType, Exclude<keyof BaseType, Keys>> &
    // Pick the keys that should be required from the base type and make them required.
    Required<Pick<BaseType, Keys>> extends infer InferredType // If `InferredType` extends the previous, then for each key, use the inferred type key.
    ? { [KeyType in keyof InferredType]: InferredType[KeyType] }
    : never;
