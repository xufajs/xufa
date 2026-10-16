// @xufa/client/axios: axios's API (1.14), xufa's own implementation (./lib/axios): import axios from
// '@xufa/client/axios' or require('@xufa/client/axios') where axios was. Its http and fetch adapters, interceptors,
// cancellation, redirects, proxies, forms, progress and errors are axios's; its tests pass on it (tools/port-axios).
import { axios } from './lib/axios/index.js';

const {
  Axios,
  AxiosError,
  CanceledError,
  isCancel,
  CancelToken,
  VERSION,
  all,
  Cancel,
  isAxiosError,
  spread,
  toFormData,
  AxiosHeaders,
  HttpStatusCode,
  formToJSON,
  getAdapter,
  mergeConfig,
} = axios;

export default axios;
export {
  Axios,
  AxiosError,
  CanceledError,
  isCancel,
  CancelToken,
  VERSION,
  all,
  Cancel,
  isAxiosError,
  spread,
  toFormData,
  AxiosHeaders,
  HttpStatusCode,
  formToJSON,
  getAdapter,
  mergeConfig,
};
export { axios as 'module.exports' };
