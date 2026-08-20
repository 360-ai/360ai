import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksByDomain = new Map();

export function isLocalRequest(request) {
  const hostname = new URL(request.url).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1'
    || hostname === '::1' || hostname === '[::1]';
}

// CF_PAGES ist in jeder Cloudflare-Pages-Umgebung gesetzt. Damit bleibt der
// Entwicklungs-Bypass selbst dann wirkungslos, wenn die Variable versehentlich
// in einer Preview- oder Produktionsumgebung landet.
export function localBypassEnabled(request, env) {
  if (env.CF_PAGES) return false;
  return env.LOCAL_DEV_BYPASS === 'true' && isLocalRequest(request);
}

export function normalizeTeamDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('TEAM_DOMAIN fehlt');
  const url = new URL(raw.includes('://') ? raw : 'https://' + raw);
  if (
    url.protocol !== 'https:' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('TEAM_DOMAIN ist ungueltig');
  }
  return url.origin;
}

function remoteJwks(teamDomain) {
  if (!jwksByDomain.has(teamDomain)) {
    jwksByDomain.set(
      teamDomain,
      createRemoteJWKSet(new URL(teamDomain + '/cdn-cgi/access/certs')),
    );
  }
  return jwksByDomain.get(teamDomain);
}

export async function verifyAccessToken(token, env, keySet = null) {
  const teamDomain = normalizeTeamDomain(env.TEAM_DOMAIN);
  const audience = String(env.POLICY_AUD || '').trim();
  const allowedEmail = String(env.ALLOWED_EMAIL || '').trim().toLowerCase();
  if (!audience || !allowedEmail) throw new Error('Access-Konfiguration unvollstaendig');
  const { payload } = await jwtVerify(token, keySet || remoteJwks(teamDomain), {
    issuer: teamDomain,
    audience,
    algorithms: ['RS256'],
  });
  const email = String(payload.email || '').trim().toLowerCase();
  if (payload.type !== 'app' || email !== allowedEmail) {
    throw new Error('Access-Identitaet nicht erlaubt');
  }
  return payload;
}
