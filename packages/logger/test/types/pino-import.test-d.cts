// Ported from pino (test/types/pino-import.test-d.cts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectTypeOf } from '@xufa/test';

import * as pinoStar from '../..';
import { default as P, default as pino, pino as pinoNamed } from '../..';
import pinoCjsImport = require ('../..');
const pinoCjs = require('../..');
const { P: pinoCjsNamed } = require('pino')

const log = pino();
expectTypeOf(log.info).toEqualTypeOf<P.LogFn>();
expectTypeOf(log.error).toEqualTypeOf<P.LogFn>();

expectTypeOf(pinoNamed()).toEqualTypeOf<pino.Logger>();
expectTypeOf(pinoNamed()).toEqualTypeOf<P.Logger>();
expectTypeOf(pinoStar.default()).toEqualTypeOf<pino.Logger>();
expectTypeOf(pinoStar.pino()).toEqualTypeOf<pino.Logger>();
// expectType<pino.Logger>(pinoCjsImport.default());
expectTypeOf(pinoCjsImport.pino()).toEqualTypeOf<pino.Logger>();
expectTypeOf(pinoCjsNamed()).toEqualTypeOf<any>();
expectTypeOf(pinoCjs()).toEqualTypeOf<any>();
expectTypeOf(pinoNamed.stdTimeFunctions.isoTimeNano).toEqualTypeOf<P.TimeFn>();
expectTypeOf(pinoNamed.stdTimeFunctions.isoTimeNano()).toEqualTypeOf<string>();

const levelChangeEventListener: P.LevelChangeEventListener = (
    lvl: P.LevelWithSilent | string,
    val: number,
    prevLvl: P.LevelWithSilent | string,
    prevVal: number,
) => {}
expectTypeOf(levelChangeEventListener).toEqualTypeOf<P.LevelChangeEventListener>();
