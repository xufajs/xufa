// Ported from pino (test/types/pino-multistream.test-d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectTypeOf } from '@xufa/test';

import { createWriteStream } from 'node:fs'

import pino, { multistream } from '../..'

const streams = [
  { stream: process.stdout },
  { stream: createWriteStream('') },
  { level: 'error' as const, stream: process.stderr },
  { level: 'fatal' as const, stream: process.stderr },
]

expectTypeOf(pino.multistream(process.stdout)).toEqualTypeOf<pino.MultiStreamRes>();
expectTypeOf(pino.multistream([createWriteStream('')])).toEqualTypeOf<pino.MultiStreamRes>();
expectTypeOf(pino.multistream({ level: 'error' as const, stream: process.stderr })).toEqualTypeOf<pino.MultiStreamRes<'error'>>();
expectTypeOf(pino.multistream([{ level: 'fatal' as const, stream: createWriteStream('') }])).toEqualTypeOf<pino.MultiStreamRes<'fatal'>>();

expectTypeOf(pino.multistream(streams)).toEqualTypeOf<pino.MultiStreamRes<'error' | 'fatal'>>();
expectTypeOf(pino.multistream(streams, {})).toEqualTypeOf<pino.MultiStreamRes<'error' | 'fatal'>>();
expectTypeOf(pino.multistream(streams, { levels: { info: 30 } })).toEqualTypeOf<pino.MultiStreamRes<'error' | 'fatal'>>();
expectTypeOf(pino.multistream(streams, { dedupe: true })).toEqualTypeOf<pino.MultiStreamRes<'error' | 'fatal'>>();
expectTypeOf(pino.multistream(streams[0]).add(streams[1])).toEqualTypeOf<pino.MultiStreamRes<'error' | 'fatal'>>();
expectTypeOf(multistream(streams)).toEqualTypeOf<pino.MultiStreamRes<'error' | 'fatal'>>();
expectTypeOf(multistream(streams).clone('error')).toEqualTypeOf<pino.MultiStreamRes<'error'>>();
expectTypeOf(multistream(streams).clone('error')).not.toEqualTypeOf<pino.MultiStreamRes<string>>();

expectTypeOf(multistream(process.stdout)).toEqualTypeOf<pino.MultiStreamRes>();
