// (One lookup when the key is there: the common case.)

function getOrInsertComputed(map, key, callback) {
  let value = map.get(key);
  if (value === undefined && !map.has(key)) {
    value = callback(key);
    map.set(key, value);
  }

  return value;
}

function getOrInsert(map, key, defaultValue) {
  let value = map.get(key);
  if (value === undefined && !map.has(key)) {
    value = defaultValue;
    map.set(key, value);
  }

  return value;
}

export { getOrInsert, getOrInsertComputed };
