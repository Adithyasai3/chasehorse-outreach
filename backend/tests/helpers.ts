import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();

let counter = 0;

/** Registers a fresh user and returns an agent that carries the session cookie. */
export async function newUser(name = 'Tester') {
  const agent = request.agent(app);
  const email = `user${Date.now()}_${counter++}@test.local`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'a-sufficiently-long-password' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: string; email: string; name: string }, email };
}
