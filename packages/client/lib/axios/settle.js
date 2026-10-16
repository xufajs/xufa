// settle(): the end of a request in an adapter, by the status: accepted by validateStatus, or an AxiosError.
import { AxiosError } from './errors.js';

/** The response, if its status is accepted by validateStatus; else an AxiosError with it (4xx: bad request). */
function settle(resolve, reject, response) {
  const { validateStatus } = response.config;
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    resolve(response);
    return;
  }
  reject(
    new AxiosError(
      `Request failed with status code ${response.status}`,
      [AxiosError.ERR_BAD_REQUEST, AxiosError.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
      response.config,
      response.request,
      response
    )
  );
}

export { settle };
