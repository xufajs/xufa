// Roles and their permissions (RBAC), by tenant. A permission is a name ('Book.change'); a role gives some (patterns:
// 'Book.*', '*.view', '*'), and may take those of other roles (inherits). A user has grants: a role in a tenant, or in
// every tenant ('*'); a superuser may do everything in every tenant.
//
//   const rbac = new Rbac({
//     roles: {
//       viewer: ['*.view'],
//       editor: { inherits: 'viewer', permissions: ['Book.add', 'Book.change'] },
//       owner: ['*'],
//     },
//     grants: (user) => Membership.objects.filter({ user: user.pk }).values('tenant', 'role'),
//   });
//   await rbac.can(user, 'Book.change', { tenant: 'acme' });
//
// The grants of a user: grants(user) when it is given; else user.grants ([{ role, tenant }], or { tenant: roles }),
// or its roles (user.roles or user.role) in its tenants (user.tenants or user.tenant; every tenant without them).
// access(user) is what a user may, as plain data (for a session or the claims of a token): allows(access, permission,
// tenant) asks it without loading the user again.
const ALL_TENANTS = '*';

class RbacError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'RbacError';
    this.code = 'XUFA_AUTH_ERR_RBAC';
  }
}

// The roles of a user: user.roles (a list) or user.role.
function rolesOf(user) {
  if (!user) return [];
  if (Array.isArray(user.roles)) return user.roles;
  return user.role === undefined || user.role === null ? [] : [user.role];
}

// The tenants of a user: user.tenants (a list) or user.tenant, as texts.
function tenantsOf(user) {
  if (!user) return [];
  if (Array.isArray(user.tenants)) return user.tenants.map(String);
  return user.tenant === undefined || user.tenant === null ? [] : [String(user.tenant)];
}

// Grants as a list of { role, tenant }: from a list of them (tenant '*' when it has none) or a map { tenant: roles }.
function normalizeGrants(grants) {
  if (!grants) return [];
  const list = Array.isArray(grants)
    ? grants
    : Object.entries(grants).flatMap(([tenant, roles]) => [].concat(roles).map((role) => ({ role, tenant })));
  return list.map((grant) => {
    if (!grant || typeof grant !== 'object' || typeof grant.role !== 'string' || !grant.role) {
      throw new RbacError(`A grant is { role, tenant }: ${JSON.stringify(grant)}`);
    }
    const tenant =
      grant.tenant === undefined || grant.tenant === null || grant.tenant === '' ? ALL_TENANTS : grant.tenant;
    return { role: grant.role, tenant: String(tenant) };
  });
}

// The grants of a user without grants(): user.grants, or its roles in its tenants (or in every tenant); its roles are
// user.roles or user.role, and the names of its groups (a many-to-many to the groups of an Rbac's model, as Django's
// user.groups).
async function grantsOfUser(user) {
  if (!user) return [];
  if (user.grants) return normalizeGrants(user.grants);
  const tenants = tenantsOf(user);
  const where = tenants.length ? tenants : [ALL_TENANTS];
  const groups =
    user.groups && typeof user.groups.all === 'function' ? (await user.groups.all()).map((group) => group.name) : [];
  const roles = [...new Set([...rolesOf(user), ...groups])];
  return roles.flatMap((role) => where.map((tenant) => ({ role: String(role), tenant })));
}

const escape = (text) => text.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');

// A pattern of permissions as a test: '*' every one; else a * is any text but a dot ('Book.*', '*.view').
function matcherOf(pattern) {
  if (typeof pattern !== 'string' || !pattern)
    throw new RbacError(`A permission is a text: ${JSON.stringify(pattern)}`);
  if (pattern === '*') return () => true;
  if (!pattern.includes('*')) return (permission) => permission === pattern;
  const re = new RegExp(`^${pattern.split('*').map(escape).join('[^.]*')}$`);
  return (permission) => re.test(permission);
}

// The specs of roles, checked: { name: { permissions, inherits, where } }. where: the objects a permission of the role
// is for, by patterns of permissions: { 'Book.change': (user, { tenant }) => ({ ownerId: user.id }) } (conditions of
// the ORM; true: every object; false: none).
function specsOf(roles) {
  const own = new Map();
  for (const [name, spec] of Object.entries(roles)) {
    const permissions = Array.isArray(spec) ? spec : spec && spec.permissions ? [].concat(spec.permissions) : [];
    const inherits = Array.isArray(spec) || !spec || spec.inherits === undefined ? [] : [].concat(spec.inherits);
    if (!Array.isArray(spec) && (!spec || typeof spec !== 'object')) {
      throw new RbacError(`The role ${name} is a list of permissions or { permissions, inherits }`);
    }
    const where = [];
    if (!Array.isArray(spec) && spec.where !== undefined) {
      if (!spec.where || typeof spec.where !== 'object' || Array.isArray(spec.where)) {
        throw new RbacError(`where of the role ${name} is { pattern: (user) => conditions }`);
      }
      for (const [pattern, fn] of Object.entries(spec.where)) {
        if (typeof fn !== 'function')
          throw new RbacError(`where of the role ${name} for ${pattern} is a function of the user`);
        where.push({ pattern, test: matcherOf(pattern), fn });
      }
    }
    own.set(name, { permissions, inherits, where });
  }
  return own;
}

class Rbac {
  // roles: in code. model: a model of roles in the database (Django's Group: AbstractGroup), whose rows (name,
  // permissions, inherits) are roles too, next to those in code (a group of the name of a role in code adds
  // permissions to it), read again after a save or delete of the model and every `refresh` ms (60000; changes made by
  // other processes).
  constructor({ roles = {}, grants, superuser, model = null, refresh = 60000 } = {}) {
    if (!roles || typeof roles !== 'object' || Array.isArray(roles)) {
      throw new RbacError('The roles of Rbac are { name: [permissions] | { permissions, inherits } }');
    }
    if (model !== null && (typeof model !== 'function' || !model.objects)) {
      throw new RbacError('The model of the roles of Rbac is a model of @xufa/orm (AbstractGroup)');
    }
    if (grants !== undefined && typeof grants !== 'function') throw new RbacError('grants is a function of the user');
    if (superuser !== undefined && superuser !== false && typeof superuser !== 'function') {
      throw new RbacError('superuser is a function of the user, or false');
    }
    this.grantsOf = grants || grantsOfUser;
    this.superuserOf =
      superuser === false ? () => false : superuser || ((user) => user.superuser === true || user.isSuperuser === true);
    this.code = specsOf(roles);
    this.roles = this.build(this.code, true);
    this.model = model;
    this.refresh = refresh;
    this.loadedAt = 0;
    this.loading = null;
    if (model) {
      // A save or delete of a group (in the admin): read again at the next question.
      const stale = () => {
        this.loadedAt = 0;
      };
      model.on('afterSave', stale);
      model.on('afterDelete', stale);
    }
  }

  // Each role with its own permissions and those of the roles it inherits (patterns, and their tests). strict: a role
  // that inherits one that is not there is an error (in code); else it inherits nothing of it (a group of the admin).
  build(own, strict) {
    const roles = new Map();
    const resolve = (name, path) => {
      if (roles.has(name)) return roles.get(name).permissions;
      if (!own.has(name)) {
        if (!strict) return [];
        throw new RbacError(`The role ${path[path.length - 1]} inherits ${name}, which is not a role`);
      }
      if (path.includes(name)) {
        if (!strict) return [];
        throw new RbacError(`The roles inherit in a circle: ${[...path, name].join(' > ')}`);
      }
      const { permissions, inherits } = own.get(name);
      const all = [...new Set([...inherits.flatMap((parent) => resolve(parent, [...path, name])), ...permissions])];
      const tests = [];
      for (const pattern of all) {
        try {
          tests.push(matcherOf(pattern));
        } catch (err) {
          if (strict) throw err;
        }
      }
      roles.set(name, { permissions: all, tests, where: own.get(name).where || [] });
      return all;
    };
    for (const name of own.keys()) resolve(name, []);
    // The rules of objects of the roles they inherit too (their permissions keep their limits).
    const whereOf = (name, path) => {
      if (!own.has(name) || path.includes(name)) return [];
      const { inherits, where = [] } = own.get(name);
      return [...inherits.flatMap((parent) => whereOf(parent, [...path, name])), ...where];
    };
    for (const [name, role] of roles) role.where = whereOf(name, []);
    return roles;
  }

  // The roles of the model (with model), read now: those in code, and the groups of the database over them.
  async load() {
    if (!this.model) return this;
    const rows = await this.model.objects.all();
    const own = new Map(this.code);
    for (const row of rows) {
      const permissions = Array.isArray(row.permissions) ? row.permissions.map(String) : [];
      const inherits = Array.isArray(row.inherits) ? row.inherits.map(String) : [];
      const given = own.get(row.name);
      own.set(
        row.name,
        given
          ? {
              permissions: [...given.permissions, ...permissions],
              inherits: [...given.inherits, ...inherits],
              where: given.where,
            }
          : { permissions, inherits, where: [] }
      );
    }
    this.roles = this.build(own, false);
    this.loadedAt = Date.now();
    return this;
  }

  // The roles read again when they may have changed (with model): before the questions of a request.
  async fresh() {
    if (!this.model || (this.loadedAt && Date.now() - this.loadedAt < this.refresh)) return this;
    if (!this.loading) {
      this.loading = this.load().finally(() => {
        this.loading = null;
      });
    }
    await this.loading;
    return this;
  }

  // The objects of a permission for a user (Django's get_queryset and has_change_permission(obj), as rules of roles):
  // null for every object (a superuser, or a role with the permission and no where for it), false for none (no role
  // has it), or a list of conditions of the ORM, any of which an object meets (the where of the roles that have it).
  scopeOf(access, user, permission, tenant) {
    if (!access) return false;
    if (access.superuser) return null;
    const conditions = [];
    for (const name of this.rolesIn(access, tenant)) {
      const role = this.roles.get(name);
      if (!role.tests.some((test) => test(permission))) continue;
      const rules = role.where.filter((rule) => rule.test(permission));
      if (!rules.length) return null;
      for (const rule of rules) {
        const given = rule.fn(user, { tenant: tenant === undefined ? null : tenant, permission });
        if (given === true) return null;
        if (given && typeof given === 'object') conditions.push(given);
      }
    }
    return conditions.length ? conditions : false;
  }

  // What a user may, as plain data: { superuser, grants: [{ role, tenant }] }.
  async access(user) {
    await this.fresh();
    if (!user) return { superuser: false, grants: [] };
    const superuser = Boolean(await this.superuserOf(user));
    const grants = normalizeGrants(await this.grantsOf(user));
    return { superuser, grants };
  }

  // The roles of an access in a tenant (those of every tenant too); without a tenant, those of every tenant.
  rolesIn(access, tenant) {
    if (!access) return [];
    const id = tenant === undefined || tenant === null || tenant === '' ? null : String(tenant);
    const names = access.grants
      .filter((grant) => grant.tenant === ALL_TENANTS || (id !== null && grant.tenant === id))
      .map((grant) => grant.role);
    return [...new Set(names)].filter((name) => this.roles.has(name));
  }

  // Whether an access has a permission (or all those of a list) in a tenant.
  allows(access, permission, tenant) {
    if (!access) return false;
    if (access.superuser) return true;
    const wanted = [].concat(permission);
    const roles = this.rolesIn(access, tenant).map((name) => this.roles.get(name));
    return wanted.every((name) => roles.some((role) => role.tests.some((test) => test(name))));
  }

  // Whether a user has a permission (or all those of a list) in a tenant ({ tenant }).
  async can(user, permission, { tenant } = {}) {
    return this.allows(await this.access(user), permission, tenant);
  }

  // The patterns of the permissions of an access in a tenant (['*'] for a superuser).
  permissionsIn(access, tenant) {
    if (!access) return [];
    if (access.superuser) return ['*'];
    return [...new Set(this.rolesIn(access, tenant).flatMap((name) => this.roles.get(name).permissions))];
  }

  // The tenants an access may use: ['*'] (every one: a superuser, or a grant in every tenant) or their ids.
  tenantsIn(access) {
    if (!access) return [];
    if (access.superuser) return [ALL_TENANTS];
    const known = access.grants.filter((grant) => this.roles.has(grant.role)).map((grant) => grant.tenant);
    return known.includes(ALL_TENANTS) ? [ALL_TENANTS] : [...new Set(known)];
  }

  // Whether an access may use a tenant: a superuser, or a grant in it (or in every tenant).
  inTenant(access, tenant) {
    const tenants = this.tenantsIn(access);
    return (
      tenants.includes(ALL_TENANTS) || (tenant !== undefined && tenant !== null && tenants.includes(String(tenant)))
    );
  }
}

export { Rbac, RbacError, rolesOf, tenantsOf, normalizeGrants, grantsOfUser, ALL_TENANTS };
