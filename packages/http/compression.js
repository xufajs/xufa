// @xufa/http/compression: answers compressed (brotli, gzip, deflate) with compression's API, xufa's own implementation
// (./lib/compression.js): app.use(compression()) where compression was.
import { compression } from './lib/compression.js';

export default compression;
export { compression };
export { compression as 'module.exports' };
