// Ported from pino (test/types/pino-type-only.test-d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { assertType, expectTypeOf } from '@xufa/test';

import pino from '../../'
import type {
  LevelWithSilent,
  Logger,
  LogFn,
  DestinationStreamWithMetadata,
  Level,
  LevelOrString,
  LevelWithSilentOrString,
  LoggerExtras,
  LoggerOptions,
} from '../..'

// NB: can also use `import * as pino`, but that form is callable as `pino()`
// under `esModuleInterop: false` or `pino.default()` under `esModuleInterop: true`.
const log = pino()
assertType<LoggerExtras>(log);
expectTypeOf(log).toEqualTypeOf<Logger>();
expectTypeOf(log.info).toEqualTypeOf<LogFn>();

assertType<Parameters<typeof log.isLevelEnabled>>([log.level]);

const level: Level = 'debug'
assertType<string>(level);

const levelWithSilent: LevelWithSilent = 'silent'
assertType<string>(levelWithSilent);

const levelOrString: LevelOrString = 'myCustomLevel'
assertType<string>(levelOrString);
// @ts-expect-error
assertType<pino.Level>(levelOrString);
// @ts-expect-error
assertType<pino.LevelWithSilent>(levelOrString);
assertType<pino.LevelWithSilentOrString>(levelOrString);

const levelWithSilentOrString: LevelWithSilentOrString = 'myCustomLevel'
assertType<string>(levelWithSilentOrString);
// @ts-expect-error
assertType<pino.Level>(levelWithSilentOrString);
// @ts-expect-error
assertType<pino.LevelWithSilent>(levelWithSilentOrString);
assertType<pino.LevelOrString>(levelWithSilentOrString);

function createStream (): DestinationStreamWithMetadata {
  return { write () {} }
}

const stream = createStream()
// Argh. TypeScript doesn't seem to narrow unless we assign the symbol like so, and tsd seems to
// break without annotating the type explicitly
const needsMetadata: typeof pino.symbols.needsMetadataGsym = pino.symbols.needsMetadataGsym
if (stream[needsMetadata]) {
  expectTypeOf(stream.lastLevel).toEqualTypeOf<number>();
}

const loggerOptions: LoggerOptions = {
  browser: {
    formatters: {
      log (obj) {
        return obj
      },
      level (label, number) {
        return { label, number }
      },
    },
  },
}

expectTypeOf(loggerOptions).toEqualTypeOf<LoggerOptions>();

// Reference: https://github.com/pinojs/pino/issues/2285
const someConst = 'test' as const
pino().error({}, someConst)
const someFunc = <T extends typeof someConst>(someConst: T) => {
  pino().error({}, someConst)
}
