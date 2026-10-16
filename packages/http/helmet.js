// @xufa/http/helmet: the security headers of responses with helmet's API, xufa's own implementation
// (./lib/helmet.js): app.use(helmet()) where helmet was. staticHeaders(options): what it sets on every response.
import { helmet } from './lib/helmet.js';

export default helmet;
export {
  helmet,
  staticHeaders,
  contentSecurityPolicy,
  crossOriginEmbedderPolicy,
  crossOriginOpenerPolicy,
  crossOriginResourcePolicy,
  originAgentCluster,
  referrerPolicy,
  strictTransportSecurity,
  xContentTypeOptions,
  xDnsPrefetchControl,
  xDownloadOptions,
  xFrameOptions,
  xPermittedCrossDomainPolicies,
  xPoweredBy,
  xXssProtection,
  strictTransportSecurity as hsts,
  xContentTypeOptions as noSniff,
  xDnsPrefetchControl as dnsPrefetchControl,
  xDownloadOptions as ieNoOpen,
  xFrameOptions as frameguard,
  xPermittedCrossDomainPolicies as permittedCrossDomainPolicies,
  xPoweredBy as hidePoweredBy,
  xXssProtection as xssFilter,
} from './lib/helmet.js';
export { helmet as 'module.exports' };
