import { describe, expect, it } from 'vitest';
import { newUser } from './helpers';

describe('per-user data isolation', () => {
  it("prevents one user from reading or changing another user's records", async () => {
    const a = await newUser('A');
    const b = await newUser('B');

    const created = await a.agent.post('/api/companies').send({ name: 'Alpha Foods', domain: 'alpha-foods.example' });
    expect(created.status).toBe(201);
    const companyId = created.body.company.id;
    const leadId = created.body.lead.id;
    const contact = await a.agent.post('/api/contacts').send({ companyId, fullName: 'Priya Rao', email: 'priya@alpha-foods.example' });
    expect(contact.status).toBe(201);

    expect((await b.agent.get(`/api/companies/${companyId}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/companies/${companyId}`).send({ name: 'Hacked' })).status).toBe(404);
    expect((await b.agent.delete(`/api/companies/${companyId}`)).status).toBe(404);
    expect((await b.agent.get(`/api/leads/${leadId}`)).status).toBe(404);
    expect((await b.agent.post(`/api/leads/${leadId}/move`).send({ stage: 'WON', index: 0 })).status).toBe(404);
    expect((await b.agent.post(`/api/leads/${leadId}/notes`).send({ content: 'x' })).status).toBe(404);
    expect((await b.agent.patch(`/api/contacts/${contact.body.contact.id}`).send({ fullName: 'x' })).status).toBe(404);
    // B cannot attach a contact to A's company either.
    expect((await b.agent.post('/api/contacts').send({ companyId, fullName: 'Intruder' })).status).toBe(404);

    const listB = await b.agent.get('/api/companies');
    expect(listB.body.companies).toHaveLength(0);
    const contactsB = await b.agent.get('/api/contacts');
    expect(contactsB.body.contacts).toHaveLength(0);

    const stillA = await a.agent.get(`/api/companies/${companyId}`);
    expect(stillA.body.company.name).toBe('Alpha Foods');
  });

  it('lets two users save the same domain independently', async () => {
    const a = await newUser();
    const b = await newUser();
    expect((await a.agent.post('/api/companies').send({ name: 'Shared', domain: 'shared.example' })).status).toBe(201);
    expect((await b.agent.post('/api/companies').send({ name: 'Shared', domain: 'shared.example' })).status).toBe(201);
    // ...but not the same user twice.
    expect((await a.agent.post('/api/companies').send({ name: 'Shared again', domain: 'https://www.shared.example/' })).status).toBe(409);
  });
});
