import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { config } from '../../config';
import { decryptJson, encryptJson, randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { getOAuthBundle, saveOAuthBundle } from '../../services/credentials.service';

/** Stored (encrypted) in IntegrationCredential.secretEncrypted for authType=OAUTH. */
export interface EnrichoOAuthBundle {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
}

/** Stored (encrypted) in OAuthState.dataEncrypted while the user is at the consent screen. */
interface PendingAuth {
  clientInformation?: OAuthClientInformationMixed;
  codeVerifier?: string;
}

const STATE_TTL_MS = 15 * 60 * 1000;

/**
 * OAuth client provider for the MCP SDK, backed by our database.
 *
 * Modes:
 *  - "start": begins authorization; captures the authorization URL instead of redirecting.
 *  - "callback": completes authorization for a given state.
 *  - "session": normal tool calls; refreshes tokens, never starts an interactive flow.
 */
export class EnrichoOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;
  private pending: PendingAuth = {};
  private bundle: EnrichoOAuthBundle | null = null;
  private stateValue: string;

  private constructor(
    private readonly userId: string,
    private readonly mode: 'start' | 'callback' | 'session',
    state?: string
  ) {
    this.stateValue = state || randomToken(24);
  }

  static async forStart(userId: string) {
    return new EnrichoOAuthProvider(userId, 'start');
  }

  static async forCallback(userId: string, state: string) {
    const row = await prisma.oAuthState.findUnique({ where: { state } });
    if (!row || row.userId !== userId || row.provider !== 'ENRICHO' || row.expiresAt < new Date()) {
      throw new AppError('VALIDATION', 'This authorization link has expired. Start the Enricho connection again.');
    }
    const p = new EnrichoOAuthProvider(userId, 'callback', state);
    p.pending = row.dataEncrypted ? decryptJson<PendingAuth>(row.dataEncrypted) : {};
    return p;
  }

  static async forSession(userId: string) {
    const p = new EnrichoOAuthProvider(userId, 'session');
    p.bundle = await getOAuthBundle<EnrichoOAuthBundle>(userId, 'ENRICHO');
    if (!p.bundle?.tokens) {
      throw new AppError('NOT_CONFIGURED', 'Enricho is not connected. Connect it in Settings → Integrations.', { provider: 'ENRICHO' });
    }
    return p;
  }

  get redirectUrl() {
    return config.enricho.oauthRedirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'ChaseHorse Outreach',
      redirect_uris: [config.enricho.oauthRedirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp',
    };
  }

  state() {
    return this.stateValue;
  }

  clientInformation() {
    if (this.mode === 'session') return this.bundle?.clientInformation;
    return this.pending.clientInformation;
  }

  async saveClientInformation(info: OAuthClientInformationMixed) {
    if (this.mode === 'session' && this.bundle) {
      this.bundle.clientInformation = info;
      await saveOAuthBundle(this.userId, 'ENRICHO', this.bundle, {});
    } else {
      this.pending.clientInformation = info;
    }
  }

  tokens() {
    return this.mode === 'session' ? this.bundle?.tokens : undefined;
  }

  async saveTokens(tokens: OAuthTokens) {
    const next: EnrichoOAuthBundle = {
      clientInformation: this.mode === 'session' ? this.bundle?.clientInformation : this.pending.clientInformation,
      tokens,
    };
    this.bundle = next;
    await saveOAuthBundle(this.userId, 'ENRICHO', next, {});
  }

  async redirectToAuthorization(url: URL) {
    if (this.mode !== 'start') {
      throw new AppError('PROVIDER_AUTH', 'Your Enricho authorization has expired. Reconnect Enricho in Settings → Integrations.', {
        provider: 'ENRICHO',
      });
    }
    this.authorizationUrl = url;
  }

  async saveCodeVerifier(codeVerifier: string) {
    this.pending.codeVerifier = codeVerifier;
    // Persist everything needed to finish the flow, keyed by the state parameter.
    await prisma.oAuthState.upsert({
      where: { state: this.stateValue },
      create: {
        state: this.stateValue,
        userId: this.userId,
        provider: 'ENRICHO',
        dataEncrypted: encryptJson(this.pending),
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
      update: { dataEncrypted: encryptJson(this.pending) },
    });
  }

  codeVerifier() {
    if (!this.pending.codeVerifier) throw new AppError('VALIDATION', 'Missing PKCE verifier. Start the Enricho connection again.');
    return this.pending.codeVerifier;
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (this.mode === 'session' && this.bundle && (scope === 'all' || scope === 'tokens')) {
      this.bundle.tokens = undefined;
    }
  }

  async consumeState() {
    await prisma.oAuthState.deleteMany({ where: { state: this.stateValue } });
  }
}
