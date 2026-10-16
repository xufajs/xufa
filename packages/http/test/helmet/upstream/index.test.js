// Ported from helmet's test/index.test.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import { afterEach } from '@xufa/test';
import { mockMethod, restoreMocks } from '../support/node-test-mock.js';
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from '@xufa/test';
import supertest from '@xufa/test/supertest';
import { check } from './helpers.js';
import * as helmet from '../../../helmet.js';
import { contentSecurityPolicy } from '../../../lib/helmet.js';
import { crossOriginEmbedderPolicy } from '../../../lib/helmet.js';
import { crossOriginOpenerPolicy } from '../../../lib/helmet.js';
import { crossOriginResourcePolicy } from '../../../lib/helmet.js';
import { originAgentCluster } from '../../../lib/helmet.js';
import { referrerPolicy } from '../../../lib/helmet.js';
import { strictTransportSecurity } from '../../../lib/helmet.js';
import { xContentTypeOptions } from '../../../lib/helmet.js';
import { xDnsPrefetchControl } from '../../../lib/helmet.js';
import { xDownloadOptions } from '../../../lib/helmet.js';
import { xFrameOptions } from '../../../lib/helmet.js';
import { xPermittedCrossDomainPolicies } from '../../../lib/helmet.js';
import { xPoweredBy } from '../../../lib/helmet.js';
import { xXssProtection } from '../../../lib/helmet.js';
describe("helmet", () => {
    const topLevel = helmet.default;
    it("includes all middleware, except COEP, with their default options", async () => {
        // NOTE: This test relies on the CSP object being ordered a certain way,
        // which could change (and be non-breaking). If that becomes a problem,
        // we should update this test to be more robust.
        const expectedHeaders = {
            "content-security-policy": "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
            "cross-origin-embedder-policy": null,
            "cross-origin-opener-policy": "same-origin",
            "cross-origin-resource-policy": "same-origin",
            "origin-agent-cluster": "?1",
            "referrer-policy": "no-referrer",
            "strict-transport-security": "max-age=31536000; includeSubDomains",
            "x-content-type-options": "nosniff",
            "x-dns-prefetch-control": "off",
            "x-download-options": "noopen",
            "x-frame-options": "SAMEORIGIN",
            "x-permitted-cross-domain-policies": "none",
            "x-powered-by": null,
            "x-xss-protection": "0",
        };
        await check(topLevel(), expectedHeaders);
        await check(topLevel({}), expectedHeaders);
        await check(topLevel(Object.create(null)), expectedHeaders);
    });
    it("allows individual middlewares to be disabled", async () => {
        await check(topLevel({ contentSecurityPolicy: false }), {
            "content-security-policy": null,
        });
        await check(topLevel({ xDnsPrefetchControl: false }), {
            "x-dns-prefetch-control": null,
        });
    });
    it("works with all default middlewares disabled", async () => {
        await check(topLevel({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: false,
            crossOriginResourcePolicy: false,
            originAgentCluster: false,
            referrerPolicy: false,
            strictTransportSecurity: false,
            xContentTypeOptions: false,
            xDnsPrefetchControl: false,
            xDownloadOptions: false,
            xFrameOptions: false,
            xPermittedCrossDomainPolicies: false,
            xPoweredBy: false,
            xXssProtection: false,
        }), {
            "content-security-policy": null,
            "x-frame-options": null,
        });
    });
    it("errors when `use`d directly", () => {
        const fakeRequest = {
            constructor: {
                name: "IncomingMessage",
            },
        };
        assert.throws(() => topLevel(fakeRequest));
    });
    it("allows default middleware to be explicitly enabled (a no-op)", async () => {
        await check(topLevel({ xFrameOptions: true }), {
            "x-frame-options": "SAMEORIGIN",
        });
    });
    it("allows Cross-Origin-Embedder-Policy middleware to be explicitly enabled", async () => {
        await check(topLevel({ crossOriginEmbedderPolicy: true }), {
            "cross-origin-embedder-policy": "require-corp",
        });
    });
    it("allows Cross-Origin-Embedder-Policy middleware to be explicitly disabled", async () => {
        await check(topLevel({ crossOriginEmbedderPolicy: false }), {
            "cross-origin-embedder-policy": null,
        });
    });
    it("allows Cross-Origin-Embedder-Policy middleware to be enabled with custom arguments", async () => {
        await check(topLevel({ crossOriginEmbedderPolicy: { policy: "credentialless" } }), {
            "cross-origin-embedder-policy": "credentialless",
        });
    });
    it("allows Cross-Origin-Opener-Policy middleware to be enabled with its default", async () => {
        await check(topLevel({ crossOriginOpenerPolicy: true }), {
            "cross-origin-opener-policy": "same-origin",
        });
    });
    it("allows Cross-Origin-Opener-Policy middleware to be enabled with custom arguments", async () => {
        await check(topLevel({
            crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        }), {
            "cross-origin-opener-policy": "same-origin-allow-popups",
        });
    });
    it("allows Cross-Origin-Opener-Policy middleware to be explicitly disabled", async () => {
        await check(topLevel({ crossOriginOpenerPolicy: false }), {
            "cross-origin-opener-policy": null,
        });
    });
    it("allows Cross-Origin-Resource-Policy middleware to be enabled with its default", async () => {
        await check(topLevel({ crossOriginResourcePolicy: true }), {
            "cross-origin-resource-policy": "same-origin",
        });
    });
    it("allows Cross-Origin-Resource-Policy middleware to be enabled with custom arguments", async () => {
        await check(topLevel({ crossOriginResourcePolicy: { policy: "same-site" } }), {
            "cross-origin-resource-policy": "same-site",
        });
    });
    it("allows Cross-Origin-Resource-Policy middleware to be explicitly disabled", async () => {
        await check(topLevel({ crossOriginResourcePolicy: false }), {
            "cross-origin-resource-policy": null,
        });
    });
    it("allows Origin-Agent-Cluster middleware to be enabled", async () => {
        await check(topLevel({ originAgentCluster: true }), {
            "origin-agent-cluster": "?1",
        });
    });
    it("allows Origin-Agent-Cluster middleware to be explicitly disabled", async () => {
        await check(topLevel({ originAgentCluster: false }), {
            "origin-agent-cluster": null,
        });
    });
    it("properly handles a middleware calling `next()` with an error", async () => {
        const middleware = topLevel({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'", () => "bad;value"],
                },
            },
        });
        const app = createServer((req, res) => {
            middleware(req, res, (err) => {
                if (err) {
                    res.statusCode = 500;
                    res.end(String(err));
                }
                else {
                    res.end();
                }
            });
        });
        await supertest(app)
            .get("/")
            .expect(500, 'Error: Content-Security-Policy received an invalid directive value for "default-src"');
    });
    describe("warnings", () => {
        const mockWarn = () => mockMethod(console, "warn", () => { });
        const assertWarns = ({ mock }, message) => {
            assert.equal(mock.callCount(), 1);
            assert.deepEqual(mock.calls[0]?.arguments, [message]);
        };
        it("logs a warning when passing options to xPoweredBy", () => {
            const warn = mockWarn();
            topLevel({ xPoweredBy: { setTo: "deprecated option" } });
            assertWarns(warn, "X-Powered-By does not take options. Remove the property to silence this warning.");
        });
        it("logs a warning when passing options to xDownloadOptions", () => {
            const warn = mockWarn();
            topLevel({ xDownloadOptions: { option: "foo" } });
            assertWarns(warn, "X-Download-Options does not take options. Remove the property to silence this warning.");
        });
        it("logs a warning when passing options to originAgentCluster", () => {
            const warn = mockWarn();
            topLevel({ originAgentCluster: { option: "foo" } });
            assertWarns(warn, "Origin-Agent-Cluster does not take options. Remove the property to silence this warning.");
        });
        it("logs a warning when passing options to xContentTypeOptions", () => {
            const warn = mockWarn();
            topLevel({ xContentTypeOptions: { option: "foo" } });
            assertWarns(warn, "X-Content-Type-Options does not take options. Remove the property to silence this warning.");
        });
        it("logs a warning when passing options to xXssProtection", () => {
            const warn = mockWarn();
            topLevel({ xXssProtection: { setOnOldIe: true } });
            assertWarns(warn, "X-XSS-Protection does not take options. Remove the property to silence this warning.");
        });
    });
    it("exposes standalone middleware", () => {
        assert.strictEqual(helmet.contentSecurityPolicy.name, contentSecurityPolicy.name);
        assert.strictEqual(helmet.contentSecurityPolicy.name, "contentSecurityPolicy");
        assert.strictEqual(helmet.crossOriginEmbedderPolicy.name, crossOriginEmbedderPolicy.name);
        assert.strictEqual(helmet.crossOriginEmbedderPolicy.name, "crossOriginEmbedderPolicy");
        assert.strictEqual(helmet.crossOriginOpenerPolicy.name, crossOriginOpenerPolicy.name);
        assert.strictEqual(helmet.crossOriginOpenerPolicy.name, "crossOriginOpenerPolicy");
        assert.strictEqual(helmet.crossOriginResourcePolicy.name, crossOriginResourcePolicy.name);
        assert.strictEqual(helmet.crossOriginResourcePolicy.name, "crossOriginResourcePolicy");
        assert.strictEqual(helmet.originAgentCluster.name, originAgentCluster.name);
        assert.strictEqual(helmet.originAgentCluster.name, "originAgentCluster");
        assert.strictEqual(helmet.referrerPolicy.name, referrerPolicy.name);
        assert.strictEqual(helmet.referrerPolicy.name, "referrerPolicy");
        assert.strictEqual(helmet.strictTransportSecurity.name, strictTransportSecurity.name);
        assert.strictEqual(helmet.strictTransportSecurity.name, "strictTransportSecurity");
        assert.strictEqual(helmet.xContentTypeOptions.name, xContentTypeOptions.name);
        assert.strictEqual(helmet.xContentTypeOptions.name, "xContentTypeOptions");
        assert.strictEqual(helmet.xDnsPrefetchControl.name, xDnsPrefetchControl.name);
        assert.strictEqual(helmet.xDnsPrefetchControl.name, "xDnsPrefetchControl");
        assert.strictEqual(helmet.xDownloadOptions.name, xDownloadOptions.name);
        assert.strictEqual(helmet.xDownloadOptions.name, "xDownloadOptions");
        assert.strictEqual(helmet.xFrameOptions.name, xFrameOptions.name);
        assert.strictEqual(helmet.xFrameOptions.name, "xFrameOptions");
        assert.strictEqual(helmet.xPermittedCrossDomainPolicies.name, xPermittedCrossDomainPolicies.name);
        assert.strictEqual(helmet.xPermittedCrossDomainPolicies.name, "xPermittedCrossDomainPolicies");
        assert.strictEqual(helmet.xPoweredBy.name, xPoweredBy.name);
        assert.strictEqual(helmet.xPoweredBy.name, "xPoweredBy");
        assert.strictEqual(helmet.xXssProtection.name, xXssProtection.name);
        assert.strictEqual(helmet.xXssProtection.name, "xXssProtection");
    });
    it("exposes legacy header options", async () => {
        await check(topLevel({ hsts: { maxAge: 123 } }), {
            "strict-transport-security": "max-age=123; includeSubDomains",
        });
        await check(topLevel({ noSniff: false }), {
            "x-content-type-options": null,
        });
        await check(topLevel({ dnsPrefetchControl: { allow: true } }), {
            "x-dns-prefetch-control": "on",
        });
        await check(topLevel({ ieNoOpen: false }), {
            "x-download-options": null,
        });
        await check(topLevel({ frameguard: { action: "deny" } }), {
            "x-frame-options": "DENY",
        });
        await check(topLevel({
            permittedCrossDomainPolicies: { permittedPolicies: "by-content-type" },
        }), {
            "x-permitted-cross-domain-policies": "by-content-type",
        });
        await check(topLevel({ hidePoweredBy: false }), {
            "x-powered-by": "Helmet test",
        });
        await check(topLevel({ xssFilter: false }), {
            "x-xss-protection": null,
        });
    });
    it("errors with conflicting header options (legacy + new)", () => {
        /* eslint-disable @typescript-eslint/ban-ts-comment */
        assert.throws(() => 
        // @ts-expect-error
        topLevel({ strictTransportSecurity: true, hsts: true }));
        assert.throws(() => 
        // @ts-expect-error
        topLevel({ xContentTypeOptions: true, noSniff: true }));
        assert.throws(() => 
        // @ts-expect-error
        topLevel({ xDnsPrefetchControl: true, dnsPrefetchControl: true }));
        assert.throws(() => 
        // @ts-expect-error
        topLevel({ xDownloadOptions: true, ieNoOpen: true }));
        assert.throws(() => 
        // @ts-expect-error
        topLevel({ xFrameOptions: true, frameguard: true }));
        // Prettier pushes this to two lines, so the `@ts-expect-error` isn't like the others.
        assert.throws(() => topLevel({
            xPermittedCrossDomainPolicies: true,
            // @ts-expect-error
            permittedCrossDomainPolicies: true,
        }));
        assert.throws(() => 
        // @ts-expect-error
        topLevel({ xPoweredBy: true, hidePoweredBy: true }));
        assert.throws(() => 
        // @ts-expect-error
        topLevel({ xXssProtection: true, xssFilter: true }));
        /* eslint-enable @typescript-eslint/ban-ts-comment */
    });
    it("exposes standalone middleware with legacy aliases", () => {
        assert.strictEqual(helmet.hsts.name, strictTransportSecurity.name);
        assert.strictEqual(helmet.dnsPrefetchControl.name, xDnsPrefetchControl.name);
        assert.strictEqual(helmet.ieNoOpen.name, xDownloadOptions.name);
        assert.strictEqual(helmet.frameguard.name, xFrameOptions.name);
        assert.strictEqual(helmet.noSniff.name, xContentTypeOptions.name);
        assert.strictEqual(helmet.hidePoweredBy.name, xPoweredBy.name);
        assert.strictEqual(helmet.permittedCrossDomainPolicies.name, xPermittedCrossDomainPolicies.name);
        assert.strictEqual(helmet.xssFilter.name, xXssProtection.name);
    });
});

afterEach(restoreMocks);
