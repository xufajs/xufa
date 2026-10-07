import { expectType, expectError } from 'tsd';
import { Model, fields } from '@xufa/orm';
import xufa from '@xufa/http';
import { Queue, Pipelines } from '@xufa/queue';
import { admin, describeModel, AdminModel } from '../..';

class Book extends Model {
  static fields = { title: fields.string() };
}
const app = xufa();
app.register(admin, {
  prefix: '/admin',
  models: [Book, [Book, { list: ['title'], readOnlyModel: true }]],
  authorize: (request) => true,
});
app.register(admin, { models: [Book], authorize: 'development' });
expectError(admin(app, { models: [Book] }));
expectType<AdminModel>(describeModel(Book, { search: ['title'] }));

declare const queue: Queue;
xufa().register(admin, { authorize: 'development', models: [], pipelines: new Pipelines(queue), health: false });

xufa().register(admin, {
  models: [],
  login: {
    findUser: async (email: string) => ({ email, password: 'x', role: 'staff' }),
    allow: (user) => user.role === 'staff',
    lockout: { maxAttempts: 3 },
  },
});
