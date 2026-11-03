import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, newUser } from './helpers';

describe('authentication', () => {
  it('registers, reads the session, logs out', async () => {
    const { agent, email } = await newUser('Asha');
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user).not.toHaveProperty('passwordHash');

    await agent.post('/api/auth/logout').send({});
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('sets an httpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'C', email: `cookie${Date.now()}@t.local`, password: 'long-enough-password' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/ch_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('logs in with the right password only', async () => {
    const { email } = await newUser();
    const bad = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password-123' });
    expect(bad.status).toBe(401);
    const good = await request(app).post('/api/auth/login').send({ email, password: 'a-sufficiently-long-password' });
    expect(good.status).toBe(200);
  });

  it('rejects duplicate registration and weak passwords', async () => {
    const { email } = await newUser();
    const dup = await request(app).post('/api/auth/register').send({ name: 'X', email, password: 'another-long-password' });
    expect(dup.status).toBe(409);
    const weak = await request(app).post('/api/auth/register').send({ name: 'X', email: `w${Date.now()}@t.local`, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION');
  });

  it('blocks protected routes without a session', async () => {
    for (const path of ['/api/leads', '/api/companies', '/api/integrations', '/api/analytics/dashboard']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it('rejects cross-origin state-changing requests', async () => {
    const { agent } = await newUser();
    const res = await agent.post('/api/companies').set('Origin', 'https://evil.example').send({ name: 'X' });
    expect(res.status).toBe(403);
  });
});
