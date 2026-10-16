// axios: the default instance (a function that is also an object of methods: axios(config), axios.get(url)...),
// create() for others, and the classes and helpers of axios's API on it.
import { adapters } from './adapters/index.js';
import { Axios } from './core.js';
import { VERSION, defaults, mergeConfig } from './config.js';
import { AxiosError, CanceledError, CancelToken, isCancel, isAxiosError } from './errors.js';
import { formDataToJSON, toFormData } from './form.js';
import { AxiosHeaders } from './headers.js';
import { HttpStatusCode } from './status.js';
import { isFunction, isHTMLForm } from './util.js';

// Each own property of `source` on `target` (functions bound to thisArg), writable and enumerable.
function extend(target, source, thisArg) {
  for (const key of Object.getOwnPropertyNames(source)) {
    const value = source[key];
    Object.defineProperty(target, key, {
      value: thisArg && isFunction(value) ? value.bind(thisArg) : value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return target;
}

function createInstance(defaultConfig) {
  const context = new Axios(defaultConfig);
  const instance = function wrap() {
    return Axios.prototype.request.apply(context, arguments);
  };
  extend(instance, Axios.prototype, context);
  extend(instance, context, null);
  instance.create = (instanceConfig) => createInstance(mergeConfig(defaultConfig, instanceConfig));
  return instance;
}

const axios = createInstance(defaults);

axios.Axios = Axios;
axios.CanceledError = CanceledError;
axios.CancelToken = CancelToken;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData;
axios.AxiosError = AxiosError;
axios.Cancel = CanceledError;
axios.all = (promises) => Promise.all(promises);
axios.spread = (callback) => (array) => callback(...array);
axios.isAxiosError = isAxiosError;
axios.mergeConfig = mergeConfig;
axios.AxiosHeaders = AxiosHeaders;
axios.formToJSON = (thing) => formDataToJSON(isHTMLForm(thing) ? new FormData(thing) : thing);
axios.getAdapter = adapters.getAdapter;
axios.HttpStatusCode = HttpStatusCode;
axios.default = axios;

export { axios };
