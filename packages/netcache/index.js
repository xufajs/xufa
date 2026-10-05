// @xufa/netcache: a cache shared by the machines of a service, with no dependencies outside xufa.
const { NetCache, NetCacheError } = require('./lib/netcache');

module.exports = { NetCache, NetCacheError };
