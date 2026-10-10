# Helpdesk

The tickets of several organizations, each in a database of its own: the tenants of a project of
[xufa](../../packages/xufa), declared in its `xufa.yaml`. The site shows each organization at its subdomain
(`acme.localhost:8001`), and the admin chooses one in its header.

- `accounts`: the users and the organizations, in the database of the project (`data/helpdesk.db`).
- `tickets`: the tickets, in the database of each organization (`data/tenants/<slug>.db`), made and migrated with the
  migrations of the app the first time the organization is used.

```yaml
# xufa.yaml
tenants:
  apps: [tickets] # the models of these apps are in the database of each tenant
  database: { url: 'sqlite:data/tenants/{id}.db' }
  list: { model: accounts.Organization, field: slug, label: name } # a new organization is a new tenant
  resolve: subdomain # the tenant of a request of the site
```

## Run it

From the root of the repository (`pnpm install` links the workspace):

```sh
cd examples/helpdesk
npm run migrate   # xufa migrate: the tables of the project, in data/helpdesk.db (SQLite)
npm run seed      # xufa seed: seeds/demo.js, Acme Corporation and Globex with their tickets, and the user admin
npm start         # xufa start: http://localhost:8001/ (the organizations), http://acme.localhost:8001/
npm test          # xufa test
```

The user of the seed is `admin` (superuser), password `xufa-helpdesk`: the admin at http://localhost:8001/admin, with
the organization to choose in its header. Browsers send `*.localhost` to this machine, so the subdomains need no setup.

In code, `project.tenants().run('acme', () => Ticket.objects.count())` runs in a tenant (the seed does), and a request
of the site has its tenant in `request.tenant`. The settings of `xufa.yaml` take the environment as those of every
project: `DATABASE_URL`, `PORT` (8001), `SECRET_KEY`, and `APP__TENANTS__DATABASE__URL` for the databases of the
tenants.
