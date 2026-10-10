// The home page: the tickets of the organization of the subdomain (request.tenant: its database), or, without one, the
// organizations and their addresses.
import { Organization } from '../accounts/models.js';
import { Ticket } from './models.js';

export async function home(request, reply) {
  if (!request.tenant) {
    const organizations = [...(await Organization.objects.all())];
    const port = request.port ? `:${request.port}` : '';
    return reply.view('tickets/organizations', {
      organizations: organizations.map((organization) => ({
        name: organization.name,
        url: `http://${organization.slug}.localhost${port}/`,
      })),
    });
  }
  const organization = await Organization.objects.get({ slug: request.tenant });
  const tickets = [...(await Ticket.objects.all())];
  return reply.view('tickets/home', {
    organization,
    tickets,
    open: tickets.filter((ticket) => ticket.status === 'open').length,
  });
}
