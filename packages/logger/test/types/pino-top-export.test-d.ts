// Ported from pino (test/types/pino-top-export.test-d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectType, expectAssignable } from 'tsd'

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

expectType<Destination>(destination(''))
expectType<LevelMapping>(levels)
expectType<MultiStreamRes>(multistream(process.stdout))
expectType<SerializedError>(stdSerializers.err({} as any))
expectType<string>(stdTimeFunctions.isoTime())
expectType<string>(stdTimeFunctions.isoTimeNano())
expectType<string>(version)

// Can't test against `unique symbol`, see https://github.com/SamVerschueren/tsd/issues/49
expectAssignable<Symbol>(symbols.streamSym)

