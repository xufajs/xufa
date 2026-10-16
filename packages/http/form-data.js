// @xufa/http/form-data: forms of multipart/form-data to send, with the API of the form-data package, xufa's own
// implementation (./lib/form-data.js): require('@xufa/http/form-data') where require('form-data') was.
import { FormData } from './lib/form-data.js';

export default FormData;
export { FormData };
export { FormData as 'module.exports' };
