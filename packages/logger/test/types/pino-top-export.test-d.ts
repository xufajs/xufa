// Ported from pino (test/types/pino-top-export.test-d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { assertType, expectTypeOf } from '@xufa/test';

import pino, {
  destination,
  type LevelMapping,
  levels,
  type Logger,
  multistream,
  type MultiStreamRes,
  type SerializedError,
  stdSerializers,
  stdTimeFunctions,
  symbols,
  Destination,
  version,
} from '../..'

expectTypeOf(destination('')).toEqualTypeOf<Destination>();
expectTypeOf(levels).toEqualTypeOf<LevelMapping>();
expectTypeOf(multistream(process.stdout)).toEqualTypeOf<MultiStreamRes>();
expectTypeOf(stdSerializers.err({} as any)).toEqualTypeOf<SerializedError>();
expectTypeOf(stdTimeFunctions.isoTime()).toEqualTypeOf<string>();
expectTypeOf(stdTimeFunctions.isoTimeNano()).toEqualTypeOf<string>();
expectTypeOf(version).toEqualTypeOf<string>();

// Can't test against `unique symbol`, see https://github.com/SamVerschueren/tsd/issues/49
assertType<Symbol>(symbols.streamSym);

