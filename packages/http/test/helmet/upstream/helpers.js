// Ported from helmet's test/helpers.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import assert from "node:assert/strict";
import { createServer, } from "node:http";
import supertest from '@xufa/test/supertest';
export async function check(middleware, expectedHeaders) {
    const app = createServer((req, res) => {
        res.setHeader("X-Powered-By", "Helmet test");
        middleware(req, res, (err) => {
            if (err) {
                res.statusCode = 500;
                res.end(String(err));
            }
            else {
                res.end("Hello world!");
            }
        });
    });
    const response = await supertest(app).get("/").expect(200, "Hello world!");
    for (const [headerName, headerValue] of Object.entries(expectedHeaders)) {
        if (headerValue === null) {
            assert(!(headerName in response.header), `${headerName} should not be set`);
        }
        else {
            assert.equal(response.header[headerName], headerValue, `${headerName} should have value ${headerValue}`);
        }
    }
    return response;
}
