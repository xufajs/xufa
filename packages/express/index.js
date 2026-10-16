// @xufa/express: Express 5's API on @xufa/http (lib/). README.md.
import { createApplication as express } from './lib/express.js';

export default express;
export const { application, request, response, Route, Router, json, raw, text, urlencoded } = express;
const serveStatic = express.static;
export { express, serveStatic as static };
export { express as 'module.exports' };
