// api() of the page of the admin: a request aborted while its body is read (a reload over it, as two quick edits of
// list_editable make) is an abort, not data; a body that is not JSON is the error of its status.
import { api, ApiError } from '../client/src/api.js';

const response = (status, json) => ({ status, ok: status >= 200 && status < 300, statusText: `Status ${status}`, json });

describe('api() of the page of the admin', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a body aborted while it is read is the abort (not { error } as the data of the request)', async () => {
    const aborted = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', async () => response(200, () => Promise.reject(aborted)));
    await expect(api('Genre?page=1')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('a body that is not JSON: the error of its status', async () => {
    vi.stubGlobal('fetch', async () => response(200, () => Promise.reject(new SyntaxError('Unexpected token <'))));
    expect(await api('Genre?page=1')).toEqual({ error: 'Status 200' });
    vi.stubGlobal('fetch', async () => response(502, () => Promise.reject(new SyntaxError('Unexpected token <'))));
    await expect(api('Genre?page=1')).rejects.toBeInstanceOf(ApiError);
  });

  it('JSON: the data', async () => {
    vi.stubGlobal('fetch', async () => response(200, async () => ({ count: 1, results: [{ pk: 1 }] })));
    expect(await api('Genre?page=1')).toEqual({ count: 1, results: [{ pk: 1 }] });
  });
});
