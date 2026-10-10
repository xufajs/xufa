// django.contrib.auth's User and Group, as AbstractUser and AbstractGroup of xufa/auth (roles of the rbac of xufa.yaml,
// groups of the database, permissions of their own).
import { Model, fields } from 'xufa/orm';
import { AbstractUser, AbstractGroup } from 'xufa/auth';

// django.contrib.auth's Group: roles of the Rbac kept in the database, edited in the admin.
class Group extends AbstractGroup(Model, fields) {}

class User extends AbstractUser(Model, fields, { email: { unique: true }, groups: () => Group }) {}

export { User, Group };
