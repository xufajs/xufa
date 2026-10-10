// A model of users, as Django's AbstractUser (django.contrib.auth): the fields every app writes (a unique username,
// an email, the hash of a password, names, staff and superuser, active, when it joined and logged in last, a role and
// permissions of its own), and what it does with them (setPassword, checkPassword, hasPerm, createUser and
// createSuperuser). @xufa/auth has no dependency on @xufa/orm: the Model and fields of the ORM are given.
//
//   import { Model, fields } from '@xufa/orm';
//   class User extends AbstractUser(Model, fields) {}               // the table user, as any model
//   class Member extends AbstractUser(Model, fields, { email: { unique: true } }) {
//     static fields = { ...super.fields, birthday: fields.date({ null: true }) };
//   }
//   await User.createSuperuser({ username: 'admin', email: 'admin@example.com', password: 'a long password' });
//
// Its permissions are the user's own (permissions, as Django's user_permissions) and those of its role (role, the
// roles of an Rbac, as Django's groups): accounts and the admin ask an Rbac for those; hasPerm(permission) knows the
// own ones and superusers. A user marked for the command line (static userModel) is the one of xufa createsuperuser.
import { hashPassword, verifyPassword } from './password.js';

// A password that never matches (setUnusablePassword()): a user who logs in elsewhere (OAuth...).
const UNUSABLE = '!';

function AbstractUser(Model, fields, options = {}) {
  if (typeof Model !== 'function' || !fields || typeof fields.string !== 'function') {
    throw new TypeError('AbstractUser(Model, fields): the Model and the fields of @xufa/orm');
  }
  // groups: the model of the groups (AbstractGroup) for a many-to-many, as Django's user.groups.
  const { passwordOptions, email = {}, username = {}, groups = null } = options;
  const base = class AbstractUserModel extends Model {
    static fields = {
      username: fields.string({
        maxLength: 150,
        unique: true,
        label: 'Username',
        help: 'Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.',
        validate: (value) => /^[\w.@+-]+$/u.test(value) || 'Enter a valid username.',
        ...username,
      }),
      email: fields.string({ maxLength: 254, null: true, label: 'Email address', ...email }),
      password: fields.string({ maxLength: 255, label: 'Password' }),
      firstName: fields.string({ maxLength: 150, default: '', label: 'First name' }),
      lastName: fields.string({ maxLength: 150, default: '', label: 'Last name' }),
      isStaff: fields.boolean({
        default: false,
        label: 'Staff status',
        help: 'Designates whether the user can log into the admin site.',
      }),
      isSuperuser: fields.boolean({
        default: false,
        label: 'Superuser status',
        help: 'Designates that this user has all permissions without explicitly assigning them.',
      }),
      isActive: fields.boolean({
        default: true,
        label: 'Active',
        help: 'Designates whether this user should be treated as active. Unselect this instead of deleting accounts.',
      }),
      dateJoined: fields.datetime({ autoNowAdd: true, label: 'Date joined' }),
      lastLogin: fields.datetime({ null: true, label: 'Last login' }),
      // Raised by each "log out everywhere" (@xufa/session): sessions logged in with a lower one are over. Read with
      // the user, so no request reads it apart.
      sessionGeneration: fields.integer({ default: 0, label: 'Session generation' }),
      // As Django's groups: the role of the user in an Rbac (its permissions are the role's).
      role: fields.string({ maxLength: 100, null: true, label: 'Role' }),
      // As Django's user_permissions: permissions of the user besides those of its role.
      permissions: fields.json({ default: () => [], label: 'User permissions', widget: 'permissions' }),
      // As Django's groups: those of the database (the roles of the Rbac whose model they are).
      ...(groups
        ? {
            groups: fields.manyToMany(groups, {
              blank: true,
              label: 'Groups',
              help: 'The groups this user belongs to. A user gets all permissions granted to each of their groups.',
              relatedName: 'users',
            }),
          }
        : {}),
    };

    static options = { abstract: true, ordering: ['username'] };

    // The model of the users of the app (xufa createsuperuser makes one of it).
    static userModel = true;

    // A user with its password hashed (Django's create_user()).
    static async createUser({ password, ...values } = {}) {
      const user = new this(values);
      if (password === undefined || password === null) user.setUnusablePassword();
      else await user.setPassword(password);
      await user.save();
      return user;
    }

    // A user who is staff and superuser (create_superuser()).
    static async createSuperuser(values = {}) {
      return this.createUser({ ...values, isStaff: true, isSuperuser: true });
    }

    // The hash of a password (scrypt; options: those of hashPassword, the model's by default).
    async setPassword(raw, options = passwordOptions) {
      if (typeof raw !== 'string' || raw === '') throw new TypeError('setPassword(raw): a password');
      this.password = await hashPassword(raw, options);
      return this;
    }

    setUnusablePassword() {
      this.password = UNUSABLE;
      return this;
    }

    get hasUsablePassword() {
      return typeof this.password === 'string' && this.password !== UNUSABLE && this.password !== '';
    }

    async checkPassword(raw) {
      if (!this.hasUsablePassword || typeof raw !== 'string') return false;
      return verifyPassword(raw, this.password);
    }

    // Its own permissions (and every one for an active superuser); those of its role are an Rbac's.
    hasPerm(permission) {
      if (!this.isActive) return false;
      if (this.isSuperuser) return true;
      return Array.isArray(this.permissions) && this.permissions.includes(permission);
    }

    get fullName() {
      return `${this.firstName || ''} ${this.lastName || ''}`.trim();
    }

    get shortName() {
      return this.firstName || '';
    }

    get isAuthenticated() {
      return true;
    }

    toString() {
      return this.username;
    }
  };
  return base;
}

// Groups, as Django's django.contrib.auth Group: roles of an Rbac stored in the database (its option model) and edited
// in the admin: a name, permissions (patterns: 'Book.*', '*.view') and the roles it inherits.
function AbstractGroup(Model, fields) {
  if (typeof Model !== 'function' || !fields || typeof fields.string !== 'function') {
    throw new TypeError('AbstractGroup(Model, fields): the Model and the fields of @xufa/orm');
  }
  const isList = (value) =>
    (Array.isArray(value) && value.every((item) => typeof item === 'string' && item)) ||
    'A list of permissions (texts: Book.add, Book.*, *.view)';
  return class AbstractGroupModel extends Model {
    static fields = {
      name: fields.string({ maxLength: 150, unique: true, label: 'Name' }),
      permissions: fields.json({
        default: () => [],
        label: 'Permissions',
        help: 'Its permissions: Model.action (Book.add), with * for any (Book.*, *.view).',
        validate: isList,
        // (The admin picks them from those of its models.)
        widget: 'permissions',
      }),
      inherits: fields.json({
        default: () => [],
        label: 'Inherits',
        help: 'The roles whose permissions it has too (of the code, or other groups).',
        validate: isList,
        widget: 'roles',
      }),
    };

    static options = { abstract: true, ordering: ['name'] };

    toString() {
      return this.name;
    }
  };
}

export { AbstractUser, AbstractGroup, UNUSABLE as UNUSABLE_PASSWORD };
