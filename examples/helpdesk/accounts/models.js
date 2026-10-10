// The users (of every organization) and the organizations: in the database of the project.
import { Model, fields } from 'xufa/orm';
import { AbstractUser } from 'xufa/auth';

export class User extends AbstractUser(Model, fields) {}

// An organization: a tenant, whose slug is its subdomain and the name of its database.
export class Organization extends Model {
  static fields = {
    slug: fields.string({ maxLength: 40, unique: true, help: 'Its subdomain: acme for acme.localhost:8001' }),
    name: fields.string({ maxLength: 100 }),
  };

  static options = { ordering: ['name'], display: '{name}' };
}
