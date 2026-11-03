import { describe, expect, it, vi } from 'vitest';
import { decrypt, encrypt, hashPassword, maskSecret, verifyPassword } from '../src/lib/crypto';
import { redact, redactString } from '../src/lib/logger';
import { newUser } from './helpers';

describe('crypto', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encrypt('secret-value');
    const b = encrypt('secret-value');
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret-value');
    expect(decrypt(a)).toBe('secret-value');
  });

  it('detects tampering', () => {
    const enc = encrypt('secret-value').split(':');
    enc[3] = Buffer.from('tampered').toString('base64');
    expect(() => decrypt(enc.join(':'))).toThrow();
  });

  it('hashes passwords with scrypt', async () => {
    const h = await hashPassword('hunter2-hunter2');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('hunter2-hunter2', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('masks secrets to the last four characters', () => {
    expect(maskSecret('AIzaSyABCDEFGHIJ1234')).toBe('••••1234');
  });
});

describe('log redaction', () => {
  it('removes secrets from strings and objects', () => {
    expect(redactString('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi');
    expect(redactString('GET /x?key=AIzaSyAAAAAAAAAAAAAAAAAAAAAAAA')).not.toContain('AIzaSy');
    const out = redact({ apiKey: 'k', nested: { password: 'p', ok: 'fine' }, refresh_token: 'r' }) as Record<string, any>;
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.nested.password).toBe('[REDACTED]');
    expect(out.nested.ok).toBe('fine');
    expect(out.refresh_token).toBe('[REDACTED]');
  });
});

describe('credential handling', () => {
  it('validates a Gemini key before saving and never returns it', async () => {
    const { agent } = await newUser();
    const key = 'AIzaSyTESTKEYTESTKEYTESTKEY1234';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }), { status: 200 })
    );
    const save = await agent.put('/api/integrations/gemini').send({ apiKey: key });
    expect(save.status).toBe(200);
    // Key is sent as a header, not in the URL.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(key);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(key);
    fetchMock.mockRestore();

    const status = await agent.get('/api/integrations');
    const body = JSON.stringify(status.body);
    expect(body).not.toContain(key);
    expect(status.body.gemini.maskedHint).toBe('••••1234');
    expect(status.body.gemini.status).toBe('CONNECTED');
  });

  it('does not save a key the provider rejects', async () => {
    const { agent } = await newUser();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 })
    );
    const res = await agent.put('/api/integrations/gemini').send({ apiKey: 'AIzaSyBADBADBADBADBADBAD0000' });
    fetchMock.mockRestore();
    expect(res.status).toBe(424);
    expect(res.body.error.code).toBe('PROVIDER_AUTH');
    expect((await agent.get('/api/integrations')).body.gemini).toBeNull();
  });

  it('reports a missing integration clearly instead of returning fake data', async () => {
    const { agent } = await newUser();
    const res = await agent.post('/api/discovery/companies').send({ industries: ['Logistics'] });
    expect(res.status).toBe(412);
    expect(res.body.error.code).toBe('NOT_CONFIGURED');
  });
});
