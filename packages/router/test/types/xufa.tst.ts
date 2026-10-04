// Type tests of what @xufa/router has that find-my-way has not (not ported: kept by tools/port-types).
import { expect } from 'tstyche';
import Router from '../../';

const router = Router({ useSemicolonDelimiter: true });
router.query('/search', () => {});

const result = router.match('GET', '/users/1?full=true');
expect(result).type.toBe<Router.MatchResult<Router.HTTPVersion.V1> | null>();
if (result !== null) {
  expect(result.status).type.toBe<0 | 1 | 2>();
  expect(result.querystring).type.toBe<string>();
  expect(result.params).type.toBe<{ [k: string]: string | undefined } | null>();
  if (result.status === Router.FOUND) expect(result.handler).type.toBe<Router.Handler<Router.HTTPVersion.V1> | null>();
}

expect(Router.safeDecodeURI('/a%20b?x=1')).type.toBe<{ path: string; querystring: string; shouldDecodeParam: boolean }>();
expect(Router.httpMethods).type.toBe<Router.HTTPMethod[]>();
expect(new Router.Router()).type.toBe<Router.Instance<Router.HTTPVersion.V1>>();
expect(router.match).type.not.toBeCallableWith('NOPE', '/');
