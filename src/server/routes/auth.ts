import crypto from 'crypto';
import { Hono } from 'hono';
import { mutateSettings, getSettings } from '../../lib/config';
import { log } from '../../lib/logging';

const app = new Hono();

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
    return crypto.randomBytes(48).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
    return crypto.randomBytes(16).toString('hex');
}

const pkceStore = new Map<string, { verifier: string; provider: string; expiresAt: number }>();

function cleanExpired() {
    const now = Date.now();
    for (const [k, v] of pkceStore) {
        if (v.expiresAt < now) pkceStore.delete(k);
    }
}

// ── Claude OAuth ──────────────────────────────────────────────────────────────

const CLAUDE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CLAUDE_AUTH_URL = 'https://claude.ai/oauth/authorize';
const CLAUDE_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const CLAUDE_REDIRECT_URI = (baseUrl: string) => `${baseUrl}/api/auth/claude/callback`;

app.get('/api/auth/claude/start', (c) => {
    cleanExpired();
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : (process.env.PUBLIC_URL || 'http://localhost:3777');

    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = generateState();

    pkceStore.set(state, { verifier, provider: 'claude', expiresAt: Date.now() + 10 * 60 * 1000 });

    const params = new URLSearchParams({
        client_id: CLAUDE_CLIENT_ID,
        response_type: 'code',
        redirect_uri: CLAUDE_REDIRECT_URI(baseUrl),
        scope: 'org:create_api_key user:profile user:inference',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
    });

    const url = `${CLAUDE_AUTH_URL}?${params.toString()}`;
    log('INFO', '[Auth] Claude OAuth URL generated');
    return c.json({ url });
});

app.get('/api/auth/claude/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
        log('ERROR', `[Auth] Claude OAuth error: ${error}`);
        return c.html(`<html><body><h2>Authentication failed: ${error}</h2><p>You can close this tab.</p></body></html>`);
    }

    if (!code || !state) {
        return c.html(`<html><body><h2>Missing code or state.</h2></body></html>`);
    }

    const entry = pkceStore.get(state);
    if (!entry || entry.provider !== 'claude' || entry.expiresAt < Date.now()) {
        return c.html(`<html><body><h2>Invalid or expired session.</h2><p>Please try connecting again from TinyOffice.</p></body></html>`);
    }
    pkceStore.delete(state);

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : (process.env.PUBLIC_URL || 'http://localhost:3777');

    const tokenRes = await fetch(CLAUDE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: CLAUDE_CLIENT_ID,
            redirect_uri: CLAUDE_REDIRECT_URI(baseUrl),
            code_verifier: entry.verifier,
        }),
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        log('ERROR', `[Auth] Claude token exchange failed: ${err}`);
        return c.html(`<html><body><h2>Token exchange failed.</h2><pre>${err}</pre></body></html>`);
    }

    const token = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    log('INFO', '[Auth] Claude OAuth token received and saved');

    mutateSettings((s) => {
        if (!s.models) s.models = {};
        if (!s.models.anthropic) s.models.anthropic = {};
        (s.models.anthropic as Record<string, unknown>).oauth_token = token.access_token;
        (s.models.anthropic as Record<string, unknown>).oauth_refresh_token = token.refresh_token ?? null;
        (s.models.anthropic as Record<string, unknown>).oauth_expires_at = token.expires_in ? Date.now() + token.expires_in * 1000 : null;
        (s.models.anthropic as Record<string, unknown>).auth_method = 'oauth';
    });

    return c.html(`
        <html>
        <head><title>Connected</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff;">
            <div style="text-align:center">
                <div style="font-size:48px;margin-bottom:16px">&#10003;</div>
                <h2 style="margin:0 0 8px">Claude Connected!</h2>
                <p style="color:#888;margin:0">You can close this tab and return to TinyOffice.</p>
            </div>
        </body>
        </html>
    `);
});

app.get('/api/auth/claude/status', (c) => {
    const s = getSettings();
    const anthropic = s.models?.anthropic as Record<string, unknown> | undefined;
    const connected = !!(anthropic?.oauth_token || anthropic?.apiKey);
    const method = anthropic?.auth_method || (anthropic?.apiKey ? 'api_key' : null);
    return c.json({ connected, method });
});

app.delete('/api/auth/claude/disconnect', (c) => {
    mutateSettings((s) => {
        if (s.models?.anthropic) {
            const a = s.models.anthropic as Record<string, unknown>;
            delete a.oauth_token;
            delete a.oauth_refresh_token;
            delete a.oauth_expires_at;
            delete a.auth_method;
        }
    });
    log('INFO', '[Auth] Claude disconnected');
    return c.json({ ok: true });
});

// ── Codex (OpenAI) OAuth ──────────────────────────────────────────────────────

const CODEX_CLIENT_ID = 'app_EMOoBCMLmFgkSNTD5AvJGezA';
const CODEX_AUTH_URL = 'https://auth.openai.com/authorize';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_REDIRECT_URI = (baseUrl: string) => `${baseUrl}/api/auth/codex/callback`;

app.get('/api/auth/codex/start', (c) => {
    cleanExpired();
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : (process.env.PUBLIC_URL || 'http://localhost:3777');

    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = generateState();

    pkceStore.set(state, { verifier, provider: 'codex', expiresAt: Date.now() + 10 * 60 * 1000 });

    const params = new URLSearchParams({
        client_id: CODEX_CLIENT_ID,
        response_type: 'code',
        redirect_uri: CODEX_REDIRECT_URI(baseUrl),
        scope: 'openid profile email offline_access',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        audience: 'https://api.openai.com/v1',
    });

    const url = `${CODEX_AUTH_URL}?${params.toString()}`;
    log('INFO', '[Auth] Codex OAuth URL generated');
    return c.json({ url });
});

app.get('/api/auth/codex/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
        log('ERROR', `[Auth] Codex OAuth error: ${error}`);
        return c.html(`<html><body><h2>Authentication failed: ${error}</h2><p>You can close this tab.</p></body></html>`);
    }

    if (!code || !state) {
        return c.html(`<html><body><h2>Missing code or state.</h2></body></html>`);
    }

    const entry = pkceStore.get(state);
    if (!entry || entry.provider !== 'codex' || entry.expiresAt < Date.now()) {
        return c.html(`<html><body><h2>Invalid or expired session.</h2><p>Please try connecting again from TinyOffice.</p></body></html>`);
    }
    pkceStore.delete(state);

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : (process.env.PUBLIC_URL || 'http://localhost:3777');

    const tokenRes = await fetch(CODEX_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: CODEX_CLIENT_ID,
            redirect_uri: CODEX_REDIRECT_URI(baseUrl),
            code_verifier: entry.verifier,
        }),
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        log('ERROR', `[Auth] Codex token exchange failed: ${err}`);
        return c.html(`<html><body><h2>Token exchange failed.</h2><pre>${err}</pre></body></html>`);
    }

    const token = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    log('INFO', '[Auth] Codex OAuth token received and saved');

    mutateSettings((s) => {
        if (!s.models) s.models = {};
        if (!s.models.openai) s.models.openai = {};
        (s.models.openai as Record<string, unknown>).oauth_token = token.access_token;
        (s.models.openai as Record<string, unknown>).oauth_refresh_token = token.refresh_token ?? null;
        (s.models.openai as Record<string, unknown>).oauth_expires_at = token.expires_in ? Date.now() + token.expires_in * 1000 : null;
        (s.models.openai as Record<string, unknown>).auth_method = 'oauth';
    });

    return c.html(`
        <html>
        <head><title>Connected</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff;">
            <div style="text-align:center">
                <div style="font-size:48px;margin-bottom:16px">&#10003;</div>
                <h2 style="margin:0 0 8px">Codex Connected!</h2>
                <p style="color:#888;margin:0">You can close this tab and return to TinyOffice.</p>
            </div>
        </body>
        </html>
    `);
});

app.get('/api/auth/codex/status', (c) => {
    const s = getSettings();
    const openai = s.models?.openai as Record<string, unknown> | undefined;
    const connected = !!(openai?.oauth_token || openai?.apiKey);
    const method = openai?.auth_method || (openai?.apiKey ? 'api_key' : null);
    return c.json({ connected, method });
});

app.delete('/api/auth/codex/disconnect', (c) => {
    mutateSettings((s) => {
        if (s.models?.openai) {
            const o = s.models.openai as Record<string, unknown>;
            delete o.oauth_token;
            delete o.oauth_refresh_token;
            delete o.oauth_expires_at;
            delete o.auth_method;
        }
    });
    log('INFO', '[Auth] Codex disconnected');
    return c.json({ ok: true });
});

export default app;
