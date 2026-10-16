import { expectTypeOf } from '@xufa/test';
import jsdoc = require('../../jsdoc');

const document = jsdoc({ definition: { openapi: '3.0.3', info: { title: 'Books', version: '1.0.0' } }, apis: ['./src/**/*.js'] });
expectTypeOf(document).toEqualTypeOf<Record<string, any>>();
expectTypeOf(jsdoc({ swaggerDefinition: {}, apis: [], format: '.yaml' })).toEqualTypeOf<string>();
expectTypeOf(jsdoc.globSync('./a/*.js')).toEqualTypeOf<string[]>();
// @ts-expect-error apis is required
jsdoc({ definition: {} });

// A document made when first needed (static mode).
import xufa from '@xufa/http';
import openapi from '../..';
xufa().register(openapi, { mode: 'static', specification: { document: () => document } });
