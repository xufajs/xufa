// Factories of objects (lib/factory.js): values made again for each object (numbers, values made before, sequences),
// states, values given, objects of other factories for foreign keys, make() without saving, createMany() with
// bulkCreate, and another database.
const { Database, Model, fields, factory, sequence } = require('..');

function models() {
  class Team extends Model {
    static fields = { name: fields.string() };
  }
  class Member extends Model {
    static fields = {
      name: fields.string(),
      email: fields.string({ unique: true }),
      role: fields.string(),
      color: fields.string({ null: true }),
      team: fields.foreignKey(() => Team),
    };
  }
  const Teams = factory(Team, { name: (n) => `Team ${n}` });
  const Members = factory(
    Member,
    {
      name: (n) => `User ${n}`,
      email: (n, values) => `${values.name.toLowerCase().replace(' ', '.')}@example.com`,
      role: 'member',
      color: sequence(['red', 'green']),
      team: Teams,
    },
    { states: { admin: { role: 'admin' }, blue: { color: () => 'blue' } } }
  );
  return { Team, Member, Teams, Members };
}

describe('factories', () => {
  it('make the values of each object again, with the objects of other factories', async () => {
    const { Team, Member, Teams, Members } = models();
    const db = new Database({ backend: 'memory' }).register(Team, Member);
    await db.sync();
    const first = await Members.create();
    expect([first.name, first.email, first.role, first.color]).toEqual(['User 1', 'user.1@example.com', 'member', 'red']);
    expect((await first.load('team')).name).toBe('Team 1');
    const team = await Teams.create({ name: 'Core' });
    const many = await Members.createMany(3, { team });
    expect(many.map((member) => [member.name, member.color, member.teamId])).toEqual([
      ['User 2', 'green', team.pk],
      ['User 3', 'red', team.pk],
      ['User 4', 'green', team.pk],
    ]);
    expect(many.every((member) => member.pk !== null)).toBe(true);
    const admin = await Members.state('admin', 'blue').create({ name: 'Ada Lovelace' });
    expect([admin.role, admin.color, admin.email]).toEqual(['admin', 'blue', 'ada.lovelace@example.com']);
    const made = await Members.make({ role: 'guest' });
    expect([made.pk, made.role, made.teamId]).toEqual([null, 'guest', null]);
    expect([await Member.objects.count(), await Team.objects.count()]).toEqual([5, 3]);
    expect(await Members.makeMany(2)).toHaveLength(2);
  });

  it('in another database; errors of the definition', async () => {
    const { Team, Member, Members } = models();
    const one = new Database({ backend: 'memory' }).register(Team, Member);
    const other = new Database({ backend: 'memory' }).register(Team, Member);
    await one.sync();
    await other.sync();
    await Members.using(other).createMany(2);
    expect([await Member.objects.using(one).count(), await Member.objects.using(other).count()]).toEqual([0, 2]);
    expect(await Team.objects.using(other).count()).toBe(2);
    expect(() => factory(Member, { nope: 1 })).toThrow(/has no field nope/);
    expect(() => Members.state('missing')).toThrow(/has no state missing/);
    expect(() => sequence([])).toThrow(/a list of values/);
  });
});
