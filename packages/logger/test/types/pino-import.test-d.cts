// Ported from pino (test/types/pino-import.test-d.cts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectType } from "tsd";

import * as pinoStar from '../..';
import { default as P, default as pino, pino as pinoNamed } from '../..';
import pinoCjsImport = require ('../..');
const pinoCjs = require('../..');
const { P: pinoCjsNamed } = require('pino')

const log = pino();
expectType<P.LogFn>(log.info);
expectType<P.LogFn>(log.error);

expectType<pino.Logger>(pinoNamed());
expectType<P.Logger>(pinoNamed());
expectType<pino.Logger>(pinoStar.default());
expectType<pino.Logger>(pinoStar.pino());
// expectType<pino.Logger>(pinoCjsImport.default());
expectType<pino.Logger>(pinoCjsImport.pino());
expectType<any>(pinoCjsNamed());
expectType<any>(pinoCjs());
expectType<P.TimeFn>(pinoNamed.stdTimeFunctions.isoTimeNano)
expectType<string>(pinoNamed.stdTimeFunctions.isoTimeNano())

const levelChangeEventListener: P.LevelChangeEventListener = (
    lvl: P.LevelWithSilent | string,
    val: number,
    prevLvl: P.LevelWithSilent | string,
    prevVal: number,
) => {}
expectType<P.LevelChangeEventListener>(levelChangeEventListener)
