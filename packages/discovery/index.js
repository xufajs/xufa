// @xufa/discovery: the nodes of a service found on the network by UDP, with no dependencies.
const { Discovery, DiscoveryError, createDiscovery, MAX_PACKET } = require('./lib/discovery');

module.exports = { Discovery, DiscoveryError, createDiscovery, MAX_PACKET };
