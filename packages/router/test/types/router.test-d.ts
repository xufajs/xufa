// Ported from find-my-way (test/types/router.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
/// <reference types="node" />

import { expectTypeOf } from '@xufa/test';
import Router from '../../';
import { Http2ServerRequest, Http2ServerResponse } from 'http2';
import { IncomingMessage, ServerResponse } from 'http';

let http1Req!: IncomingMessage;
let http1Res!: ServerResponse;
let http2Req!: Http2ServerRequest;
let http2Res!: Http2ServerResponse;
let ctx!: { req: IncomingMessage; res: ServerResponse };
let done!: (err: Error | null, result: any) => void;

expectTypeOf(Router.sanitizeUrlPath('/hello/%20world?foo=bar')).toEqualTypeOf<string>();
expectTypeOf(Router.sanitizeUrlPath('/hello/%23world;foo=bar', true)).toEqualTypeOf<string>();
expectTypeOf(Router.removeDuplicateSlashes('//hello///world')).toEqualTypeOf<string>();
expectTypeOf(Router.trimLastSlash('/hello/')).toEqualTypeOf<string>();

// HTTP1
{
  let handler!: Router.Handler<Router.HTTPVersion.V1>;
  const router = Router({
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: true,
    allowUnsafeRegex: false,
    caseSensitive: false,
    maxParamLength: 42,
    querystringParser: (queryString) => {},
    defaultRoute(http1Req, http1Res) {},
    onBadUrl(path, http1Req, http1Res) {},
    onMaxParamLength(path, http1Req, http1Res) {},
    constraints: {
      foo: {
        name: 'foo',
        mustMatchWhenDerived: true,
        storage() {
          return {
            get(version) {
              return handler;
            },
            set(version, handler) {}
          };
        },
        deriveConstraint(req) {
          return '1.0.0';
        },
        validate(value) {
          if (typeof value === 'string') {
            throw new Error('invalid');
          }
        }
      }
    }
  });
  expectTypeOf(router).toEqualTypeOf<Router.Instance<Router.HTTPVersion.V1>>();

  expectTypeOf(router.on('GET', '/', () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.on(['GET', 'POST'], '/', () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.on('GET', '/', { constraints: { version: '1.0.0' } }, () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.on('GET', '/', () => {}, {})).toEqualTypeOf<void>();
  expectTypeOf(router.on('GET', '/', { constraints: { version: '1.0.0' } }, () => {}, {})).toEqualTypeOf<void>();

  expectTypeOf(router.get('/', () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.get('/', { constraints: { version: '1.0.0' } }, () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.get('/', () => {}, {})).toEqualTypeOf<void>();
  expectTypeOf(router.get('/', { constraints: { version: '1.0.0' } }, () => {}, {})).toEqualTypeOf<void>();

  expectTypeOf(router.off('GET', '/')).toEqualTypeOf<void>();
  expectTypeOf(router.off(['GET', 'POST'], '/')).toEqualTypeOf<void>();

  expectTypeOf(router.lookup(http1Req, http1Res)).toEqualTypeOf<any>();
  expectTypeOf(router.lookup(http1Req, http1Res, done)).toEqualTypeOf<any>();
  expectTypeOf(router.lookup(http1Req, http1Res, ctx, done)).toEqualTypeOf<any>();
  expectTypeOf(router.find('GET', '/')).toEqualTypeOf<Router.FindResult<Router.HTTPVersion.V1> | null>();
  expectTypeOf(router.find('GET', '/', {})).toEqualTypeOf<Router.FindResult<Router.HTTPVersion.V1> | null>();
  expectTypeOf(router.find('GET', '/', { version: '1.0.0' })).toEqualTypeOf<Router.FindResult<Router.HTTPVersion.V1> | null>();

  expectTypeOf(router.findRoute('GET', '/')).toEqualTypeOf<Router.FindRouteResult<Router.HTTPVersion.V1> | null>();
  expectTypeOf(router.findRoute('GET', '/', {})).toEqualTypeOf<Router.FindRouteResult<Router.HTTPVersion.V1> | null>();
  expectTypeOf(router.findRoute('GET', '/', { version: '1.0.0' })).toEqualTypeOf<Router.FindRouteResult<Router.HTTPVersion.V1> | null>();

  expectTypeOf(router.reset()).toEqualTypeOf<void>();
  expectTypeOf(router.prettyPrint()).toEqualTypeOf<string>();
  expectTypeOf(router.prettyPrint({ method: 'GET' })).toEqualTypeOf<string>();
  expectTypeOf(router.prettyPrint({ commonPrefix: false })).toEqualTypeOf<string>();
  expectTypeOf(router.prettyPrint({ commonPrefix: true })).toEqualTypeOf<string>();
  expectTypeOf(router.prettyPrint({ includeMeta: true })).toEqualTypeOf<string>();
  expectTypeOf(router.prettyPrint({ includeMeta: ['test', Symbol('test')] })).toEqualTypeOf<string>();
}

// HTTP2
{
  const constraints: {
    [key: string]: Router.ConstraintStrategy<Router.HTTPVersion.V2, string>;
  } = {
    foo: {
      name: 'foo',
      mustMatchWhenDerived: true,
      storage() {
        return {
          get(version) {
            return handler;
          },
          set(version, handler) {}
        };
      },
      deriveConstraint(req) {
        return '1.0.0';
      },
      validate(value) {
        if (typeof value === 'string') {
          throw new Error('invalid');
        }
      }
    }
  };

  let handler!: Router.Handler<Router.HTTPVersion.V2>;
  const router = Router<Router.HTTPVersion.V2>({
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: true,
    allowUnsafeRegex: false,
    caseSensitive: false,
    maxParamLength: 42,
    querystringParser: (queryString) => {},
    defaultRoute(http1Req, http1Res) {},
    onBadUrl(path, http1Req, http1Res) {},
    constraints
  });
  expectTypeOf(router).toEqualTypeOf<Router.Instance<Router.HTTPVersion.V2>>();

  expectTypeOf(router.on('GET', '/', () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.on(['GET', 'POST'], '/', () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.on('GET', '/', { constraints: { version: '1.0.0' } }, () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.on('GET', '/', () => {}, {})).toEqualTypeOf<void>();
  expectTypeOf(router.on('GET', '/', { constraints: { version: '1.0.0' } }, () => {}, {})).toEqualTypeOf<void>();

  expectTypeOf(router.addConstraintStrategy(constraints.foo!)).toEqualTypeOf<void>();

  expectTypeOf(router.get('/', () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.get('/', { constraints: { version: '1.0.0' } }, () => {})).toEqualTypeOf<void>();
  expectTypeOf(router.get('/', () => {}, {})).toEqualTypeOf<void>();
  expectTypeOf(router.get('/', { constraints: { version: '1.0.0' } }, () => {}, {})).toEqualTypeOf<void>();

  expectTypeOf(router.off('GET', '/')).toEqualTypeOf<void>();
  expectTypeOf(router.off(['GET', 'POST'], '/')).toEqualTypeOf<void>();

  expectTypeOf(router.lookup(http2Req, http2Res)).toEqualTypeOf<any>();
  expectTypeOf(router.lookup(http2Req, http2Res, done)).toEqualTypeOf<any>();
  expectTypeOf(router.lookup(http2Req, http2Res, ctx, done)).toEqualTypeOf<any>();
  expectTypeOf(router.find('GET', '/', {})).toEqualTypeOf<Router.FindResult<Router.HTTPVersion.V2> | null>();
  expectTypeOf(router.find('GET', '/', { version: '1.0.0', host: 'fastify.io' })).toEqualTypeOf<Router.FindResult<Router.HTTPVersion.V2> | null>();

  expectTypeOf(router.reset()).toEqualTypeOf<void>();
  expectTypeOf(router.prettyPrint()).toEqualTypeOf<string>();
}

// Custom Constraint
{
  let handler!: Router.Handler<Router.HTTPVersion.V1>;

  interface AcceptAndContentType {
    accept?: string | undefined;
    contentType?: string | undefined;
  }

  const customConstraintWithObject: Router.ConstraintStrategy<
    Router.HTTPVersion.V1,
    AcceptAndContentType
  > = {
    name: 'customConstraintWithObject',
    deriveConstraint<Context>(
      req: Router.Req<Router.HTTPVersion.V1>,
      ctx: Context | undefined
    ): AcceptAndContentType {
      return {
        accept: req.headers.accept,
        contentType: req.headers['content-type']
      };
    },
    validate(value: unknown): void {},
    storage() {
      return {
        get(version) {
          return handler;
        },
        set(version, handler) {}
      };
    }
  };

  const storageWithObject = customConstraintWithObject.storage();
  const acceptAndContentType: AcceptAndContentType = {
    accept: 'application/json',
    contentType: 'application/xml'
  };

  expectTypeOf(customConstraintWithObject.deriveConstraint(http1Req, http1Res)).toEqualTypeOf<AcceptAndContentType>();
  expectTypeOf(storageWithObject.get(acceptAndContentType)).toEqualTypeOf<Router.Handler<Router.HTTPVersion.V1> | null>();
  expectTypeOf(storageWithObject.set(acceptAndContentType, () => {})).toEqualTypeOf<void>();

  const customConstraintWithDefault: Router.ConstraintStrategy<Router.HTTPVersion.V1> =
    {
      name: 'customConstraintWithObject',
      deriveConstraint<Context>(
        req: Router.Req<Router.HTTPVersion.V1>,
        ctx: Context | undefined
      ): string {
        return req.headers.accept ?? '';
      },
      storage() {
        return {
          get(version) {
            return handler;
          },
          set(version, handler) {}
        };
      }
    };

  const storageWithDefault = customConstraintWithDefault.storage();

  expectTypeOf(customConstraintWithDefault.deriveConstraint(http1Req, http1Res)).toEqualTypeOf<string>();
  expectTypeOf(storageWithDefault.get('')).toEqualTypeOf<Router.Handler<Router.HTTPVersion.V1> | null>();
  expectTypeOf(storageWithDefault.set('', () => {})).toEqualTypeOf<void>();
}
