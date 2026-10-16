// bytes(text): a size in bytes ('1mb', '40kb'), as compression's tests use it.
module.exports = function bytes(value) {
  const match = /^(\d+(?:\.\d+)?) *(b|kb|mb|gb)$/i.exec(String(value));
  const units = { b: 1, kb: 1 << 10, mb: 1 << 20, gb: 1 << 30 };
  return match ? Math.floor(parseFloat(match[1]) * units[match[2].toLowerCase()]) : parseInt(value, 10);
};
