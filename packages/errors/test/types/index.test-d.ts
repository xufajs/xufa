// Ported from @fastify/error (types/index.test-d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import createError, { XufaError, XufaErrorConstructor } from '../..'
import { expectTypeOf } from '@xufa/test';

const CustomError = createError('ERROR_CODE', 'message')
expectTypeOf(CustomError).toEqualTypeOf<XufaErrorConstructor<{ code: 'ERROR_CODE' }>>();
const err = new CustomError()
expectTypeOf(err).toEqualTypeOf<XufaError & { code: 'ERROR_CODE' }>();
expectTypeOf(err.code).toEqualTypeOf<'ERROR_CODE'>();
expectTypeOf(err.message).toEqualTypeOf<string>();
expectTypeOf(err.statusCode).toEqualTypeOf<number | undefined>();

const CustomErrorNoStackTrace = createError('ERROR_CODE', 'message', undefined, undefined, false)
expectTypeOf(CustomErrorNoStackTrace).toEqualTypeOf<XufaErrorConstructor<{ code: 'ERROR_CODE' }>>();
const errNoStackTrace = new CustomErrorNoStackTrace()
expectTypeOf(errNoStackTrace).toEqualTypeOf<XufaError & { code: 'ERROR_CODE' }>();
expectTypeOf(errNoStackTrace.code).toEqualTypeOf<'ERROR_CODE'>();
expectTypeOf(errNoStackTrace.message).toEqualTypeOf<string>();
expectTypeOf(errNoStackTrace.statusCode).toEqualTypeOf<number | undefined>();

const CustomTypedError = createError('OTHER_CODE', 'message', 400)
expectTypeOf(CustomTypedError).toEqualTypeOf<XufaErrorConstructor<{ code: 'OTHER_CODE', statusCode: 400 }>>();
const typed = new CustomTypedError()
expectTypeOf(typed).toEqualTypeOf<XufaError & { code: 'OTHER_CODE', statusCode: 400 }>();
expectTypeOf(typed.code).toEqualTypeOf<'OTHER_CODE'>();
expectTypeOf(typed.message).toEqualTypeOf<string>();
expectTypeOf(typed.statusCode).toEqualTypeOf<400>();

/* eslint-disable no-new */
const CustomTypedArgError = createError<[string]>('OTHER_CODE', 'expect %s message', 400)
CustomTypedArgError('a')
// @ts-expect-error
CustomTypedArgError('a', 'b');
// @ts-expect-error
new CustomTypedArgError('a', 'b');
// @ts-expect-error
CustomTypedArgError(1);
// @ts-expect-error
new CustomTypedArgError(1);

const CustomTypedArgError2 = createError<string, number, [string]>('OTHER_CODE', 'expect %s message', 400)
CustomTypedArgError2('a')
// @ts-expect-error
CustomTypedArgError2('a', 'b');
// @ts-expect-error
new CustomTypedArgError2('a', 'b');
// @ts-expect-error
CustomTypedArgError2(1);
// @ts-expect-error
new CustomTypedArgError2(1);

const CustomTypedArgError3 = createError<string, number, [string, string]>('OTHER_CODE', 'expect %s message but got %s', 400)
// @ts-expect-error
CustomTypedArgError3('a');
CustomTypedArgError3('a', 'b')
new CustomTypedArgError3('a', 'b')
// @ts-expect-error
CustomTypedArgError3(1);
// @ts-expect-error
new CustomTypedArgError3(1);
// @ts-expect-error
new CustomTypedArgError3(1, 2);
// @ts-expect-error
new CustomTypedArgError3('1', 2);
// @ts-expect-error
new CustomTypedArgError3(1, '2');

const CustomTypedArgError4 = createError<string, number, [string, string]>('OTHER_CODE', 'expect %s message but got %s', 400)
// @ts-expect-error
CustomTypedArgError4('a');
CustomTypedArgError4('a', 'b')
new CustomTypedArgError4('a', 'b')
// @ts-expect-error
CustomTypedArgError4(1);
// @ts-expect-error
new CustomTypedArgError4(1);
// @ts-expect-error
new CustomTypedArgError4(1, 2);
// @ts-expect-error
new CustomTypedArgError4('1', 2);
// @ts-expect-error
new CustomTypedArgError4(1, '2');

const CustomTypedArgError5 = createError<[string, string, string, string]>('OTHER_CODE', 'expect %s message but got %s. Please contact %s by emailing to %s', 400)
// @ts-expect-error
CustomTypedArgError5('a');
// @ts-expect-error
new CustomTypedArgError5('a', 'b');
// @ts-expect-error
new CustomTypedArgError5('a', 'b', 'c');
CustomTypedArgError5('a', 'b', 'c', 'd')
// @ts-expect-error
new CustomTypedArgError5('a', 'b', 'c', 'd', 'e');

const CustomTypedArgError6 = createError<string, number, [string, string, string, string]>('OTHER_CODE', 'expect %s message but got %s. Please contact %s by emailing to %s', 400)
// @ts-expect-error
CustomTypedArgError6('a');
// @ts-expect-error
new CustomTypedArgError6('a', 'b');
// @ts-expect-error
new CustomTypedArgError6('a', 'b', 'c');
CustomTypedArgError6('a', 'b', 'c', 'd')
// @ts-expect-error
new CustomTypedArgError6('a', 'b', 'c', 'd', 'e');

const CustomErrorWithErrorConstructor = createError('ERROR_CODE', 'message', 500, TypeError)
expectTypeOf(CustomErrorWithErrorConstructor).toEqualTypeOf<XufaErrorConstructor<{ code: 'ERROR_CODE', statusCode: 500 }>>();
CustomErrorWithErrorConstructor({ cause: new Error('Error') })
const customErrorWithErrorConstructor = CustomErrorWithErrorConstructor()
if (customErrorWithErrorConstructor instanceof XufaError) {
  expectTypeOf(customErrorWithErrorConstructor.code).toEqualTypeOf<'ERROR_CODE'>();
  expectTypeOf(customErrorWithErrorConstructor.message).toEqualTypeOf<string>();
  expectTypeOf(customErrorWithErrorConstructor.statusCode).toEqualTypeOf<500>();
}

const error = new XufaError('ERROR_CODE', 'message', 500)
if (error instanceof XufaError) {
  expectTypeOf(error.code).toEqualTypeOf<string>();
  expectTypeOf(error.message).toEqualTypeOf<string>();
  expectTypeOf(error.statusCode).toEqualTypeOf<number | undefined>();
}
