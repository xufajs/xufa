// Type tests of what @xufa/router has that find-my-way has not (not ported: kept by tools/port-types).
import { expectTypeOf } from '@xufa/test';
import Router from '../../';

const router = Router({ useSemicolonDelimiter: true });
router.query('/search', () => {});

const result = router.match('GET', '/users/1?full=true');
expectTypeOf(result).toEqualTypeOf<Router.MatchResult<Router.HTTPVersion.V1> | null>();
if (result !== null) {
  expectTypeOf(result.status).toEqualTypeOf<0 | 1 | 2>();
  expectTypeOf(result.querystring).toEqualTypeOf<string>();
  expectTypeOf(result.params).toEqualTypeOf<{ [k: string]: string | undefined } | null>();
  if (result.status === Router.FOUND) expectTypeOf(result.handler).toEqualTypeOf<Router.Handler<Router.HTTPVersion.V1> | null>();
}

expectTypeOf(Router.safeDecodeURI('/a%20b?x=1')).toEqualTypeOf<{ path: string; querystring: string; shouldDecodeParam: boolean }>();
expectTypeOf(Router.httpMethods).toEqualTypeOf<Router.HTTPMethod[]>();
expectTypeOf(new Router.Router()).toEqualTypeOf<Router.Instance<Router.HTTPVersion.V1>>();
expectTypeOf(Router.Router.COMPILE_AFTER).toEqualTypeOf<number>();
// @ts-expect-error
router.match('NOPE', '/');
