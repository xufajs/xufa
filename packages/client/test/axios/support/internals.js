// What axios's tests import from axios's own modules (lib/core/AxiosError.js, lib/helpers/buildURL.js, lib/utils.js...),
// as @xufa/client/axios has it: tools/port-axios turns `import X from '../lib/core/AxiosError.js'` into
// `import { AxiosError as X } from 'support/internals.js'`.
import { adapters } from '../../../lib/axios/adapters/index.js';
import { getFetch } from '../../../lib/axios/adapters/fetch.js';
import { setProxy } from '../../../lib/axios/adapters/http.js';
import { Axios } from '../../../lib/axios/core.js';
import { defaults, mergeConfig, transformData, validator } from '../../../lib/axios/config.js';
import { estimateDataURLDecodedBytes, fromDataURI } from '../../../lib/axios/data-url.js';
import { AxiosError, CanceledError, isAxiosError, isCancel } from '../../../lib/axios/errors.js';
import { formDataToJSON, randomString, toFormData } from '../../../lib/axios/form.js';
import { AxiosHeaders, parseHeaders } from '../../../lib/axios/headers.js';
import { composeSignals } from '../../../lib/axios/streams.js';
import { buildFullPath, buildURL, combineURLs, isAbsoluteURL, parseProtocol } from '../../../lib/axios/url.js';
import * as util from '../../../lib/axios/util.js';
import { axios } from '../../../lib/axios/index.js';

// lib/utils.js: the checks and helpers of @xufa/client/axios's util (and Array.isArray, typeof number).
const utils = { ...util, isArray: Array.isArray, isNumber: (value) => typeof value === 'number' };

// lib/platform/index.js: its random strings (boundaries).
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const DIGIT = '0123456789';
const ALPHABET = { DIGIT, ALPHA, ALPHA_DIGIT: ALPHA + ALPHA.toUpperCase() + DIGIT };
const platform = {
  isNode: true,
  ALPHABET,
  generateString: (size = 16, alphabet = ALPHABET.ALPHA_DIGIT) => randomString(size, alphabet),
  protocols: ['http', 'https', 'file', 'data'],
};

const { spread } = axios;

export {
  adapters,
  getFetch,
  setProxy as __setProxy,
  Axios,
  defaults,
  mergeConfig,
  transformData,
  validator,
  estimateDataURLDecodedBytes,
  fromDataURI,
  AxiosError,
  CanceledError,
  isAxiosError,
  isCancel,
  formDataToJSON,
  toFormData,
  AxiosHeaders,
  parseHeaders,
  composeSignals,
  buildFullPath,
  buildURL,
  combineURLs,
  isAbsoluteURL,
  parseProtocol,
  utils,
  platform,
  spread,
};
