import { expectType, expectError } from 'tsd';
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
  expectType<Session>(request.session);
  expectType<number | undefined>(request.session.get<number>('count'));
  request.session.regenerate().set('userId', 1).flash('notice', 'hi');
  expectType<string>(request.session.csrfToken());
  return 'ok';
});
expectError(app.register(sessionPlugin, { secret: 'x', cookie: { sameSite: 'sometimes' } }));

// The users of sessions.
app.post('/login', async (request) => {
  await request.session.login(7);
  expectType<string | null>(request.session.user);
  await request.session.logoutOthers();
  await request.session.logoutEverywhere();
  expectType<Promise<void>>(app.sessions.logoutUser('7'));
  expectType<Promise<UserSession[]>>(app.sessions.list(7));
  expectType<Promise<boolean>>(app.sessions.end('7', request.session.handle));
  expectType<Promise<number>>(app.sessions.generationOf(7));
  expectError(request.session.login({}));
  expectType<typeof request.session>(request.session.message('Saved', 'success'));
  expectType<{ text: string; level: string }[]>(request.session.messages());
  return 'ok';
});
