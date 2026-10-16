import { expectTypeOf } from '@xufa/test';
import axios, {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  HttpStatusCode,
  isAxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type AxiosProgressEvent,
} from '@xufa/client/axios';

interface Book {
  id: number;
  title: string;
}

expectTypeOf(axios.get<Book[]>('/books')).toEqualTypeOf<Promise<AxiosResponse<Book[]>>>();
expectTypeOf(axios<Book>({ url: '/books/1' })).toEqualTypeOf<Promise<AxiosResponse<Book>>>();
expectTypeOf(axios('/books/1')).toEqualTypeOf<Promise<AxiosResponse<any>>>();
expectTypeOf(axios.post<Book, AxiosResponse<Book>, { title: string }>('/books', { title: 'Dune' })).toEqualTypeOf<
  Promise<AxiosResponse<Book>>
>();
axios.postForm('/upload', { file: Buffer.from('x') });

const api: AxiosInstance = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: { Authorization: 'Bearer t', common: { 'X-App': '1' } },
});
api.defaults.headers.common.Authorization = 'Bearer u';

api.interceptors.request.use(
  (config) => {
    expectTypeOf(config).toEqualTypeOf<InternalAxiosRequestConfig>();
    config.headers.set('X-Request-Id', '1');
    return config;
  },
  null,
  { synchronous: true, runWhen: (config) => config.method === 'get' }
);
api.interceptors.response.use((response) => response, (error) => Promise.reject(error));

const config: AxiosRequestConfig = {
  method: 'post',
  responseType: 'arraybuffer',
  signal: new AbortController().signal,
  maxRate: [100_000, 200_000],
  proxy: { host: 'proxy', port: 3128, auth: { username: 'u', password: 'p' } },
  onUploadProgress: (event) => expectTypeOf(event).toEqualTypeOf<AxiosProgressEvent>(),
  validateStatus: null,
  httpVersion: 2,
};
api.request(config);
// @ts-expect-error
api.request({ responseType: 'xml' });
// @ts-expect-error
api.get(42);

try {
  await axios.get('/x');
} catch (err) {
  if (isAxiosError<{ message: string }>(err)) {
    expectTypeOf(err.response?.data).toEqualTypeOf<{ message: string } | undefined>();
    expectTypeOf(err.status).toEqualTypeOf<number | undefined>();
    expectTypeOf(err.code).toEqualTypeOf<string | undefined>();
  }
  if (axios.isCancel(err)) expectTypeOf(err).toMatchTypeOf<CanceledError<any>>();
}
const badResponse: 'ERR_BAD_RESPONSE' = AxiosError.ERR_BAD_RESPONSE;
expectTypeOf(new AxiosError('m').toJSON()).toEqualTypeOf<object>();

const headers = new AxiosHeaders({ 'Content-Type': 'application/json' });
expectTypeOf(headers.getContentType()).toEqualTypeOf<AxiosHeaderValueOf>();
expectTypeOf(headers.getContentType(/boundary=(S+)/)).toEqualTypeOf<RegExpExecArray | null>();
expectTypeOf(headers.set('A', '1').has('a')).toEqualTypeOf<boolean>();
expectTypeOf(HttpStatusCode.NotFound).toMatchTypeOf<number>();
const notFound: HttpStatusCode = HttpStatusCode.NotFound;
expectTypeOf(axios.HttpStatusCode[404]).toEqualTypeOf<string>();

const source = axios.CancelToken.source();
source.cancel('stop');
expectTypeOf(axios.getUri({ url: '/a', params: { b: 1 } })).toEqualTypeOf<string>();
expectTypeOf(axios.VERSION).toEqualTypeOf<string>();

type AxiosHeaderValueOf = ReturnType<AxiosHeaders['get']>;
export { notFound, badResponse };
