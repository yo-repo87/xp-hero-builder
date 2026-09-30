// Generic OAuth2 authorization-code flow, parameterized per provider.
// State-parameter CSRF protection uses the standard double-submit-cookie
// pattern: a random nonce is set as a short-lived httpOnly cookie AND
// passed as `state` in the redirect; the callback must see them match.

const PROVIDERS = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    extraAuthorizeParams: { access_type: 'online', prompt: 'select_account' },
    mapProfile: (p) => ({ providerUserId: p.sub, email: p.email || null, name: p.name || p.email || 'Google user' }),
  },
  facebook: {
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email',
    scope: 'email public_profile',
    clientId: () => process.env.FACEBOOK_CLIENT_ID,
    clientSecret: () => process.env.FACEBOOK_CLIENT_SECRET,
    extraAuthorizeParams: {},
    mapProfile: (p) => ({ providerUserId: p.id, email: p.email || null, name: p.name || 'Facebook user' }),
  },
  discord: {
    authorizeUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scope: 'identify email',
    clientId: () => process.env.DISCORD_CLIENT_ID,
    clientSecret: () => process.env.DISCORD_CLIENT_SECRET,
    extraAuthorizeParams: {},
    mapProfile: (p) => ({
      providerUserId: p.id,
      email: p.email || null,
      name: p.global_name || p.username || 'Discord user',
    }),
  },
};

export function isProviderConfigured(name) {
  const p = PROVIDERS[name];
  return !!(p && p.clientId() && p.clientSecret());
}

export function configuredProviders() {
  return Object.keys(PROVIDERS).filter(isProviderConfigured);
}

function redirectUriFor(name) {
  return `${process.env.API_BASE_URL}/auth/${name}/callback`;
}

export function buildAuthorizeUrl(name, state) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown OAuth provider: ${name}`);
  const url = new URL(p.authorizeUrl);
  url.searchParams.set('client_id', p.clientId());
  url.searchParams.set('redirect_uri', redirectUriFor(name));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', p.scope);
  url.searchParams.set('state', state);
  for (const [k, v] of Object.entries(p.extraAuthorizeParams)) url.searchParams.set(k, v);
  return url.toString();
}

// Exchanges an authorization code for the provider's user profile.
// Returns { providerUserId, email, name }.
export async function exchangeCodeForProfile(name, code) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown OAuth provider: ${name}`);

  const tokenRes = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: p.clientId(),
      client_secret: p.clientSecret(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUriFor(name),
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`${name} token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const { access_token: accessToken } = await tokenRes.json();
  if (!accessToken) throw new Error(`${name} token exchange returned no access_token`);

  const profileRes = await fetch(p.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    throw new Error(`${name} profile fetch failed: ${profileRes.status} ${await profileRes.text()}`);
  }
  const profile = await profileRes.json();
  return p.mapProfile(profile);
}
