// @xufa/http/multer: uploads of multipart/form-data with multer's API, read by @xufa/http's parser (./lib/multer.js).
import { multer } from './lib/multer.js';

export default multer;
export { multer };
export { diskStorage, memoryStorage, MulterError } from './lib/multer.js';
export { multer as 'module.exports' };
