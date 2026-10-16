// after: a callback that calls `callback` once it is called `count` times (at once with an error).
module.exports = function after(count, callback, errorCallback = () => {}) {
  let bail = false;
  const proxy = (err, result) => {
    if (proxy.count <= 0) throw new Error('after called too many times');
    proxy.count -= 1;
    if (err) {
      bail = true;
      callback(err);
      callback = errorCallback;
    } else if (proxy.count === 0 && !bail) {
      callback(null, result);
    }
  };
  proxy.count = count;
  return count === 0 ? callback() : proxy;
};
