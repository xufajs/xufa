// The workbooks of the books: @xufa/xlsx (read, written, patched), with its errors as the errors of the rules
// (RulesError: XUFA_RULES_ERR_ZIP for bytes that are not a zip, XUFA_RULES_ERR_XLSX for the rest), as they were before
// it was a package of its own.
import * as xlsx from '@xufa/xlsx';
import { RulesError } from './values.js';

function rulesErrors(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      if (!(err instanceof xlsx.XlsxError)) throw err;
      const error = new RulesError(
        err.message,
        err.code === 'XUFA_XLSX_ERR_ZIP' ? 'XUFA_RULES_ERR_ZIP' : 'XUFA_RULES_ERR_XLSX'
      );
      error.cause = err;
      throw error;
    }
  };
}

const readXlsx = rulesErrors(xlsx.readXlsx);
const writeXlsx = rulesErrors(xlsx.writeXlsx);
const patchXlsx = rulesErrors(xlsx.patchXlsx);
const { refOf } = xlsx;

export { readXlsx, writeXlsx, patchXlsx, refOf };
