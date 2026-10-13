import { expectTypeOf } from '@xufa/test';
import { sign, verify, decode, JsonWebTokenError, TokenExpiredError, Jwt, JwtPayload } from '../..';

const token = sign({ sub: '42' }, 'secret', { expiresIn: '15m', algorithm: 'HS256' });
expectTypeOf(token).toEqualTypeOf<string>();
sign({ sub: '42' }, 'private key', { algorithm: 'EdDSA', expiresIn: 60 });
// @ts-expect-error
sign({ sub: '42' }, 'secret', { algorithm: 'HS999' });
// @ts-expect-error
sign({ sub: '42' }, 'secret', { expiresIn: 'soon' });

expectTypeOf(verify(token, 'secret', { algorithms: ['HS256'] })).toEqualTypeOf<JwtPayload | string>();
expectTypeOf(verify(token, 'secret', { complete: true })).toEqualTypeOf<Jwt>();
verify(token, 'secret', (err, payload) => {
  if (err) expectTypeOf(err.message).toEqualTypeOf<string>();
});
expectTypeOf(decode(token, { complete: true })).toEqualTypeOf<null | Jwt>();

const err = new TokenExpiredError('jwt expired', new Date());
expectTypeOf(err).toEqualTypeOf<TokenExpiredError>();
const base: JsonWebTokenError = err;
expectTypeOf(err.expiredAt).toEqualTypeOf<Date>();
expectTypeOf(base.message).toEqualTypeOf<string>();

// ES256K, and the typ expected.
sign({}, 'secret', { algorithm: 'ES256K' });
verify('token', 'secret', { type: 'at+jwt' });
verify('token', 'secret', { type: ['at+jwt', 'jwt'] });
