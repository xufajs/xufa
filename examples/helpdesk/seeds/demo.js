// Two organizations and their tickets (each in its database), and the user admin (superuser, password
// xufa-helpdesk). Run once (npx xufa seed): it does nothing when the organizations are there.
const TICKETS = {
  acme: [
    ['The anvils arrive dented', 'open'],
    ['Invoice 1043 charged twice', 'open'],
    ['Change the address of the warehouse', 'closed'],
  ],
  globex: [
    ['VPN drops every hour', 'open'],
    ['A new laptop for Hank', 'closed'],
  ],
};

export default async (db, { Organization, Ticket, User }, { project }) => {
  if (await Organization.objects.exists()) return;
  await Organization.objects.create({ slug: 'acme', name: 'Acme Corporation' });
  await Organization.objects.create({ slug: 'globex', name: 'Globex' });
  await User.createSuperuser({ username: 'admin', email: 'admin@example.com', password: 'xufa-helpdesk' });
  const tenants = project.tenants();
  for (const [slug, tickets] of Object.entries(TICKETS)) {
    await tenants.run(slug, async () => {
      for (const [title, status] of tickets) await Ticket.objects.create({ title, status });
    });
  }
};
