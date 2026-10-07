import { expectType, expectError } from 'tsd';
import xufa from '@xufa/http';
import { Database } from '@xufa/orm';
import { sessionPlugin, ormStore, Session } from '../..';

const app = xufa();
app.register(sessionPlugin, { secret: ['a', 'b'], store: ormStore(new Database()), csrf: true, maxAge: '1d', cookie: { sameSite: 'strict' } });
app.get('/', async (request) => {
  expectType<Session>(request.session);
  expectType<number | undefined>(request.session.get<number>('count'));
  request.session.regenerate().set('userId', 1).flash('notice', 'hi');
  expectType<string>(request.session.csrfToken());
  return 'ok';
});
expectError(app.register(sessionPlugin, { secret: 'x', cookie: { sameSite: 'sometimes' } }));
