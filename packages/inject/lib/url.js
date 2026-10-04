// The URL of an injected request, with the query given in the options merged in.
const BASE_URL = 'http://localhost';

function parseURL(url, query) {
  let target = url;
  if ((typeof target === 'string' || target instanceof String) && String(target).startsWith('//')) {
    target = BASE_URL + target;
  }
  const result =
    typeof target === 'object' && !(target instanceof String)
      ? Object.assign(new URL(BASE_URL), target)
      : new URL(String(target), BASE_URL);

  if (typeof query === 'string') {
    const params = new URLSearchParams(query);
    for (const key of params.keys()) {
      result.searchParams.delete(key);
      for (const value of params.getAll(key)) result.searchParams.append(key, value);
    }
  } else {
    const merged = { ...(typeof target === 'object' ? target.query : undefined), ...query };
    for (const key of Object.keys(merged)) {
      const value = merged[key];
      if (Array.isArray(value)) {
        result.searchParams.delete(key);
        for (const item of value) result.searchParams.append(key, item);
      } else {
        result.searchParams.set(key, value);
      }
    }
  }
  return result;
}

module.exports = { parseURL };
