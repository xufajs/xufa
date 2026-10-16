// The config of the fetch adapter resolved: headers as AxiosHeaders, the full URL with params, Basic auth, and the
// headers of a FormData of form-data's API (only its type and length).
import { mergeConfig } from './config.js';
import { AxiosHeaders } from './headers.js';
import { buildFullPath, buildURL } from './url.js';
import { isFormData, isFunction } from './util.js';

const FORM_HEADERS = ['content-type', 'content-length'];

function resolveConfig(config) {
  const newConfig = mergeConfig({}, config);
  const { data, auth } = newConfig;
  const headers = (newConfig.headers = AxiosHeaders.from(newConfig.headers));
  newConfig.url = buildURL(
    buildFullPath(newConfig.baseURL, newConfig.url, newConfig.allowAbsoluteUrls),
    config.params,
    config.paramsSerializer
  );
  if (auth) {
    headers.set(
      'Authorization',
      `Basic ${btoa(`${auth.username || ''}:${auth.password ? unescape(encodeURIComponent(auth.password)) : ''}`)}`
    );
  }
  if (isFormData(data) && isFunction(data.getHeaders)) {
    for (const [key, value] of Object.entries(data.getHeaders())) {
      if (FORM_HEADERS.includes(key.toLowerCase())) headers.set(key, value);
    }
  }
  return newConfig;
}

export { resolveConfig };
