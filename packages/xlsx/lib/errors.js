// The errors of @xufa/xlsx: a workbook that cannot be read or written (XUFA_XLSX_ERR), and a zip that is not one
// (XUFA_XLSX_ERR_ZIP: the bytes of an .xlsx are a zip).
class XlsxError extends Error {
  constructor(message, code = 'XUFA_XLSX_ERR') {
    super(message);
    this.name = 'XlsxError';
    this.code = code;
  }
}

class ZipError extends XlsxError {
  constructor(message) {
    super(message, 'XUFA_XLSX_ERR_ZIP');
    this.name = 'ZipError';
  }
}

export { XlsxError, ZipError };
