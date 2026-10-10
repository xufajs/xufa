// Groups, as Django's: roles of an Rbac stored in the database (AbstractGroup), next to those in code, with users in
// them (AbstractUser with groups); changes of a group are seen at the next question, those of other processes after
// `refresh`.
import { Database, Model, fields } from '@xufa/orm';
import { Rbac, AbstractGroup, AbstractUser } from '../index.js';

function models() {
  class Group extends AbstractGroup(Model, fields) {}
  class User extends AbstractUser(Model, fields, { groups: () => Group }) {}
  return { Group, User };
}

describe('groups', () => {
  let db;
  let Group;
  let User;
  beforeEach(async () => {
    ({ Group, User } = models());
    db = new Database({ backend: 'memory' }).register(Group, User);
    await db.sync();
  });

  it('the roles of a user are its groups (and its role), their permissions those of the groups', async () => {
    const rbac = new Rbac({ roles: { viewer: ['*.view'] }, model: Group });
    const editors = await Group.objects.create({ name: 'editors', permissions: ['Book.*'], inherits: ['viewer'] });
    const ada = await User.objects.create({ username: 'ada', password: 'x', role: 'viewer' });
    await ada.groups.set([editors.pk]);
    const access = await rbac.access(ada);
    expect(access.grants.map((grant) => grant.role).sort()).toEqual(['editors', 'viewer']);
    expect([rbac.allows(access, 'Book.change'), rbac.allows(access, 'Author.view'), rbac.allows(access, 'Author.add')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(rbac.permissionsIn(access).sort()).toEqual(['*.view', 'Book.*']);
  });

  it('a change of a group is seen at the next question; a group of the name of a role in code adds to it', async () => {
    const rbac = new Rbac({ roles: { viewer: ['*.view'] }, model: Group });
    const editors = await Group.objects.create({ name: 'editors', permissions: ['Book.change'] });
    const user = { username: 'bob', roles: ['editors', 'viewer'] };
    let access = await rbac.access(user);
    expect(rbac.allows(access, 'Book.delete')).toBe(false);
    editors.permissions = ['Book.change', 'Book.delete'];
    await editors.save();
    await Group.objects.create({ name: 'viewer', permissions: ['Report.export'] });
    access = await rbac.access(user);
    expect([rbac.allows(access, 'Book.delete'), rbac.allows(access, 'Report.export'), rbac.allows(access, 'Book.view')]).toEqual([
      true,
      true,
      true,
    ]);
    await editors.delete();
    access = await rbac.access(user);
    expect(rbac.allows(access, 'Book.delete')).toBe(false);
  });

  it('changes of other processes after refresh; groups that inherit what is not there inherit nothing', async () => {
    const rbac = new Rbac({ model: Group, refresh: 50 });
    await rbac.load();
    // Written without the hooks of the model (as another process would).
    await Group.objects.bulkCreate([new Group({ name: 'auditors', permissions: ['*.view'], inherits: ['nobody'] })]);
    const user = { roles: ['auditors'] };
    expect(rbac.allows(await rbac.access(user), 'Book.view')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(rbac.allows(await rbac.access(user), 'Book.view')).toBe(true);
  });

  it('the fields of a group are checked; a model that is not one is refused', async () => {
    await expect(Group.objects.create({ name: 'bad', permissions: 'Book.add' })).rejects.toThrow(/list of permissions/);
    expect(() => new Rbac({ model: {} })).toThrow('The model of the roles of Rbac is a model of @xufa/orm');
    expect(String(await Group.objects.create({ name: 'staff' }))).toBe('staff');
    expect(User.meta.manyToMany.map((field) => [field.name, field.label])).toEqual([['groups', 'Groups']]);
  });
});

describe('rules of objects (where)', () => {
  const rbac = new Rbac({
    roles: {
      viewer: ['*.view'],
      // An editor changes its own books, and those of the drafts of anyone.
      editor: {
        inherits: 'viewer',
        permissions: ['Book.change', 'Book.delete'],
        where: { 'Book.change': (user) => ({ ownerId: user.id }), 'Book.delete': () => false },
      },
      reviewer: { permissions: ['Book.change'], where: { 'Book.*': () => ({ status: 'draft' }) } },
      chief: { inherits: 'editor', permissions: ['Author.change'] },
      everything: { permissions: ['Book.change'], where: { 'Book.change': () => true } },
    },
  });
  const accessOf = (roles) => ({ superuser: false, grants: roles.map((role) => ({ role, tenant: '*' })) });
  const ada = { id: 7 };

  it('null: every object; false: none; conditions: those of the roles that have the permission', () => {
    expect(rbac.scopeOf({ superuser: true, grants: [] }, ada, 'Book.change')).toBe(null);
    expect(rbac.scopeOf(accessOf(['viewer']), ada, 'Book.change')).toBe(false);
    expect(rbac.scopeOf(accessOf(['viewer']), ada, 'Book.view')).toBe(null);
    expect(rbac.scopeOf(accessOf(['editor']), ada, 'Book.change')).toEqual([{ ownerId: 7 }]);
    // A where that gives false: no object; true: every one.
    expect(rbac.scopeOf(accessOf(['editor']), ada, 'Book.delete')).toBe(false);
    expect(rbac.scopeOf(accessOf(['editor', 'everything']), ada, 'Book.change')).toBe(null);
    // Several roles: any of their conditions.
    expect(rbac.scopeOf(accessOf(['editor', 'reviewer']), ada, 'Book.change')).toEqual([{ ownerId: 7 }, { status: 'draft' }]);
    // A role that inherits keeps the limits of the permissions it inherits.
    expect(rbac.scopeOf(accessOf(['chief']), ada, 'Book.change')).toEqual([{ ownerId: 7 }]);
    expect(rbac.scopeOf(accessOf(['chief']), ada, 'Author.change')).toBe(null);
    expect(rbac.scopeOf(null, ada, 'Book.view')).toBe(false);
  });

  it('a where that is not a function is a mistake when the rbac is made', () => {
    expect(() => new Rbac({ roles: { x: { permissions: ['A.b'], where: { 'A.b': 7 } } } })).toThrow(
      'where of the role x for A.b is a function of the user'
    );
  });
});
