// URLs as axios builds them: baseURL + url (unless url is absolute and allowed), and params as a query (encoded as
// axios does: ':', '$', ',' kept, spaces as '+'), or by a serializer of one's own.
import { AxiosURLSearchParams } from './form.js';
import { isFunction, isURLSearchParams } from './util.js';

const encode = (value) =>
  encodeURIComponent(value).replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, '+');

/** The URL with its params as a query ('#...' dropped); options: { encode, serialize } or a serialize function. */
function buildURL(url, params, options) {
  if (!params) return url;
  const encoder = (options && options.encode) || encode;
  const settings = isFunction(options) ? { serialize: options } : options;
  const serialize = settings && settings.serialize;
  const query = serialize
    ? serialize(params, settings)
    : isURLSearchParams(params)
      ? params.toString()
      : new AxiosURLSearchParams(params, settings).toString(encoder);
  if (query) {
    const hash = url.indexOf('#');
    if (hash !== -1) url = url.slice(0, hash);
    url += (url.includes('?') ? '&' : '?') + query;
  }
  return url;
}

/** <scheme>:// or // (RFC 3986 schemes). */
const isAbsoluteURL = (url) => typeof url === 'string' && /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);

const combineURLs = (baseURL, relativeURL) =>
  relativeURL ? `${baseURL.replace(/\/?\/$/, '')}/${relativeURL.replace(/^\/+/, '')}` : baseURL;

/** baseURL + url when url is relative, or when absolute URLs are not allowed. */
function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
  // allowAbsoluteUrls: false, or anything == false ('', 0).
  // eslint-disable-next-line eqeqeq
  const joined = baseURL && (!isAbsoluteURL(requestedURL) || allowAbsoluteUrls == false);
  return joined ? combineURLs(baseURL, requestedURL) : requestedURL;
}

const parseProtocol = (url) => {
  const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
  return (match && match[1]) || '';
};

export { buildURL, isAbsoluteURL, combineURLs, buildFullPath, parseProtocol };
