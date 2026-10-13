import { expectTypeOf } from '@xufa/test';
import xufa from '@xufa/http';
import { Database } from '@xufa/orm';
import { sessionPlugin, ormStore, Session, UserSession } from '../..';

const app = xufa();
app.register(sessionPlugin, {
  secret: ['a', 'b'],
  store: ormStore(new Database()),
  csrf: true,
  maxAge: '1d',
  cookie: { sameSite: 'strict' },
});
app.get('/', async (request) => {
  expectTypeOf(request.session).toEqualTypeOf<Session>();
  expectTypeOf(request.session.get<number>('count')).toEqualTypeOf<number | undefined>();
  request.session.regenerate().set('userId', 1).flash('notice', 'hi');
  expectTypeOf(request.session.csrfToken()).toEqualTypeOf<string>();
  return 'ok';
});
// @ts-expect-error
app.register(sessionPlugin, { secret: 'x', cookie: { sameSite: 'sometimes' } });

// The users of sessions.
app.post('/login', async (request) => {
  await request.session.login(7);
  expectTypeOf(request.session.user).toEqualTypeOf<string | null>();
  await request.session.logoutOthers();
  await request.session.logoutEverywhere();
  expectTypeOf(app.sessions.logoutUser('7')).toEqualTypeOf<Promise<void>>();
  expectTypeOf(app.sessions.list(7)).toEqualTypeOf<Promise<UserSession[]>>();
  expectTypeOf(app.sessions.end('7', request.session.handle)).toEqualTypeOf<Promise<boolean>>();
  expectTypeOf(app.sessions.generationOf(7)).toEqualTypeOf<Promise<number>>();
  // @ts-expect-error
  request.session.login({});
  expectTypeOf(request.session.message('Saved', 'success')).toEqualTypeOf<typeof request.session>();
  expectTypeOf(request.session.messages()).toEqualTypeOf<{ text: string; level: string }[]>();
  return 'ok';
});
