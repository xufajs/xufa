'use strict';

// after 0.8.2, as Express's tests use it (test/upstream requires it in place of the package): after(count, callback,
// errorCallback) is a function that calls callback once it has been called count times, or at once with the first
// error (errorCallback gets those after it); called more times than count, it throws.
module.exports = function after(count, callback, errorCallback = () => {}) {
  let bail = false;
  let onError = callback;
  const proxy = (err, result) => {
    if (proxy.count <= 0) throw new Error('after called too many times');
    proxy.count -= 1;
    if (err) {
      bail = true;
      onError(err);
      onError = errorCallback;
    } else if (proxy.count === 0 && !bail) {
      callback(null, result);
    }
  };
  proxy.count = count;
  return count === 0 ? callback() : proxy;
};
