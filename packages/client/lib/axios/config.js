// The config of axios: its defaults (adapters, transforms of request and response, statuses accepted, headers by
// method), mergeConfig() (each option merged by its own rule), transformData(), and the validator of options.
import { AxiosError } from './errors.js';
import { formDataToJSON, toFormData, toURLEncodedForm, defaultFormData } from './form.js';
import { AxiosHeaders } from './headers.js';
import * as util from './util.js';
import { mergeObjects } from './util.js';

/** The version of axios whose API this is. */
const VERSION = '1.14.0';

const transitionalDefaults = {
  silentJSONParsing: true,
  forcedJSONParsing: true,
  clarifyTimeoutError: false,
  legacyInterceptorReqResOrdering: true,
};

// The validator of options: a validator returns true or what the value should have been ('a boolean').
const validators = {};
['object', 'boolean', 'number', 'function', 'string', 'symbol'].forEach((type, i) => {
  validators[type] = (thing) => typeof thing === type || `a${i < 1 ? 'n ' : ' '}${type}`;
});

const deprecatedWarnings = {};

validators.transitional = (validator, version, message) => {
  const formatMessage = (option, description) =>
    `[Axios v${VERSION}] Transitional option '${option}'${description}${message ? `. ${message}` : ''}`;
  return (value, option, options) => {
    if (validator === false) {
      throw new AxiosError(
        formatMessage(option, ` has been removed${version ? ` in ${version}` : ''}`),
        AxiosError.ERR_DEPRECATED
      );
    }
    if (version && !deprecatedWarnings[option]) {
      deprecatedWarnings[option] = true;
      console.warn(
        formatMessage(option, ` has been deprecated since v${version} and will be removed in the near future`)
      );
    }
    return validator ? validator(value, option, options) : true;
  };
};

validators.spelling = (correctSpelling) => (value, option) => {
  console.warn(`${option} is likely a misspelling of ${correctSpelling}`);
  return true;
};

/** Checks options by a schema of validators: unknown options are errors unless allowUnknown. */
function assertOptions(options, schema, allowUnknown) {
  if (typeof options !== 'object') {
    throw new AxiosError('options must be an object', AxiosError.ERR_BAD_OPTION_VALUE);
  }
  const keys = Object.keys(options);
  for (let i = keys.length - 1; i >= 0; i--) {
    const option = keys[i];
    const validator = schema[option];
    if (validator) {
      const value = options[option];
      const result = value === undefined || validator(value, option, options);
      if (result !== true) {
        throw new AxiosError(`option ${option} must be ${result}`, AxiosError.ERR_BAD_OPTION_VALUE);
      }
      continue;
    }
    if (allowUnknown !== true) throw new AxiosError(`Unknown option ${option}`, AxiosError.ERR_BAD_OPTION);
  }
}

const validator = { assertOptions, validators };

// A text that is JSON already is sent as it is (trimmed); anything else is stringified.
function stringifySafely(rawValue, parser, encoder) {
  if (util.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue);
      return rawValue.trim();
    } catch (err) {
      if (err.name !== 'SyntaxError') throw err;
    }
  }
  return (encoder || JSON.stringify)(rawValue);
}

const env = {
  // new env.FormData() makes one of the default kind: @xufa/http/form-data is loaded only by those who send forms.
  FormData: function FormData() {
    return new (defaultFormData())();
  },
  Blob: typeof Blob !== 'undefined' ? Blob : null,
};

const defaults = {
  transitional: transitionalDefaults,

  adapter: ['xhr', 'http', 'fetch'],

  transformRequest: [
    function transformRequest(data, headers) {
      const contentType = headers.getContentType() || '';
      const hasJSONContentType = contentType.includes('application/json');
      const isObjectPayload = util.isObject(data);
      if (isObjectPayload && util.isHTMLForm(data)) data = new FormData(data);
      if (util.isFormData(data)) return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
      if (
        util.isArrayBuffer(data) ||
        util.isBuffer(data) ||
        util.isStream(data) ||
        util.isFile(data) ||
        util.isBlob(data) ||
        util.isReadableStream(data)
      ) {
        return data;
      }
      if (util.isArrayBufferView(data)) return data.buffer;
      if (util.isURLSearchParams(data)) {
        headers.setContentType('application/x-www-form-urlencoded;charset=utf-8', false);
        return data.toString();
      }
      if (isObjectPayload) {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          return toURLEncodedForm(data, this.formSerializer).toString();
        }
        const isFileList = util.isFileList(data);
        if (isFileList || contentType.includes('multipart/form-data')) {
          const FormData_ = this.env && this.env.FormData;
          return toFormData(isFileList ? { 'files[]': data } : data, FormData_ && new FormData_(), this.formSerializer);
        }
      }
      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType('application/json', false);
        return stringifySafely(data);
      }
      return data;
    },
  ],

  transformResponse: [
    function transformResponse(data) {
      const transitional = this.transitional || defaults.transitional;
      const forcedJSONParsing = transitional && transitional.forcedJSONParsing;
      const JSONRequested = this.responseType === 'json';
      if (util.isResponse(data) || util.isReadableStream(data)) return data;
      if (data && util.isString(data) && ((forcedJSONParsing && !this.responseType) || JSONRequested)) {
        const silentJSONParsing = transitional && transitional.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;
        try {
          return JSON.parse(data, this.parseReviver);
        } catch (err) {
          if (strictJSONParsing) {
            if (err.name === 'SyntaxError') {
              throw AxiosError.from(err, AxiosError.ERR_BAD_RESPONSE, this, null, this.response);
            }
            throw err;
          }
        }
      }
      return data;
    },
  ],

  // 0: no timeout.
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  // -1: no limit.
  maxContentLength: -1,
  maxBodyLength: -1,

  env,

  validateStatus(status) {
    return status >= 200 && status < 300;
  },

  headers: {
    common: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': undefined,
    },
  },
};

for (const method of ['delete', 'get', 'head', 'post', 'put', 'patch']) defaults.headers[method] = {};

/** Runs the transforms on the data of the config (or of a response), with its headers; `this` is the config. */
function transformData(fns, response) {
  const config = this || defaults;
  const context = response || config;
  const headers = AxiosHeaders.from(context.headers);
  let { data } = context;
  util.forEach(fns, (fn) => {
    data = fn.call(config, data, headers.normalize(), response ? response.status : undefined);
  });
  headers.normalize();
  return data;
}

const headersToObject = (thing) => (thing instanceof AxiosHeaders ? { ...thing } : thing);

/** Two configs as one: each option by its rule (url, method, data from the second only; headers merged in any case). */
function mergeConfig(config1, config2) {
  config2 = config2 || {};
  const config = {};

  function getMergedValue(target, source, prop, caseless) {
    if (util.isPlainObject(target) && util.isPlainObject(source))
      return mergeObjects(!!caseless, false, [target, source]);
    if (util.isPlainObject(source)) return mergeObjects(false, false, [source]);
    if (Array.isArray(source)) return source.slice();
    return source;
  }

  function mergeDeepProperties(a, b, prop, caseless) {
    if (b !== undefined) return getMergedValue(a, b, prop, caseless);
    if (a !== undefined) return getMergedValue(undefined, a, prop, caseless);
    return undefined;
  }

  const valueFromConfig2 = (a, b) => (b !== undefined ? getMergedValue(undefined, b) : undefined);

  function defaultToConfig2(a, b) {
    if (b !== undefined) return getMergedValue(undefined, b);
    if (a !== undefined) return getMergedValue(undefined, a);
    return undefined;
  }

  function mergeDirectKeys(a, b, prop) {
    if (prop in config2) return getMergedValue(a, b);
    if (prop in config1) return getMergedValue(undefined, a);
    return undefined;
  }

  const mergeMap = {
    url: valueFromConfig2,
    method: valueFromConfig2,
    data: valueFromConfig2,
    baseURL: defaultToConfig2,
    transformRequest: defaultToConfig2,
    transformResponse: defaultToConfig2,
    paramsSerializer: defaultToConfig2,
    timeout: defaultToConfig2,
    timeoutMessage: defaultToConfig2,
    withCredentials: defaultToConfig2,
    withXSRFToken: defaultToConfig2,
    adapter: defaultToConfig2,
    responseType: defaultToConfig2,
    xsrfCookieName: defaultToConfig2,
    xsrfHeaderName: defaultToConfig2,
    onUploadProgress: defaultToConfig2,
    onDownloadProgress: defaultToConfig2,
    decompress: defaultToConfig2,
    maxContentLength: defaultToConfig2,
    maxBodyLength: defaultToConfig2,
    beforeRedirect: defaultToConfig2,
    transport: defaultToConfig2,
    httpAgent: defaultToConfig2,
    httpsAgent: defaultToConfig2,
    cancelToken: defaultToConfig2,
    socketPath: defaultToConfig2,
    responseEncoding: defaultToConfig2,
    validateStatus: mergeDirectKeys,
    headers: (a, b, prop) => mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true),
  };

  for (const prop of Object.keys({ ...config1, ...config2 })) {
    if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') continue;
    const merge = util.hasOwn(mergeMap, prop) ? mergeMap[prop] : mergeDeepProperties;
    const value = merge(config1[prop], config2[prop], prop);
    if (value !== undefined || merge === mergeDirectKeys) config[prop] = value;
  }
  return config;
}

export { VERSION, transitionalDefaults, validator, defaults, transformData, mergeConfig };
