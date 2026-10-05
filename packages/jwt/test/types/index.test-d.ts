import { expectType, expectError } from 'tsd';
import { sign, verify, decode, JsonWebTokenError, TokenExpiredError, Jwt, JwtPayload } from '../..';

const token = sign({ sub: '42' }, 'secret', { expiresIn: '15m', algorithm: 'HS256' });
expectType<string>(token);
sign({ sub: '42' }, 'private key', { algorithm: 'EdDSA', expiresIn: 60 });
expectError(sign({ sub: '42' }, 'secret', { algorithm: 'HS999' }));
expectError(sign({ sub: '42' }, 'secret', { expiresIn: 'soon' }));

expectType<JwtPayload | string>(verify(token, 'secret', { algorithms: ['HS256'] }));
expectType<Jwt>(verify(token, 'secret', { complete: true }));
verify(token, 'secret', (err, payload) => {
  if (err) expectType<string>(err.message);
});
expectType<null | Jwt>(decode(token, { complete: true }));

const err = new TokenExpiredError('jwt expired', new Date());
expectType<TokenExpiredError>(err);
const base: JsonWebTokenError = err;
expectType<Date>(err.expiredAt);
expectType<string>(base.message);

// ES256K, and the typ expected.
sign({}, 'secret', { algorithm: 'ES256K' });
verify('token', 'secret', { type: 'at+jwt' });
verify('token', 'secret', { type: ['at+jwt', 'jwt'] });
