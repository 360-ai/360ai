import { localBypassEnabled, verifyAccessToken } from '../lib/access.js';
import { apiError, secureApiResponse } from '../lib/responses.js';

// Ein Service Token darf nur die Agent-Schnittstelle nutzen. /sync und /api/write
// verlassen sich auf Browser-Header (Sec-Fetch-*), die ein Server faelschen kann.
export function identitaetDarfPfad(identity, url) {
  return !identity.service || new URL(url).pathname.startsWith('/api/agent/');
}

export async function withApiAccess(context, next) {
  if (localBypassEnabled(context.request, context.env)) {
    context.data.accessIdentity = { email: 'lokale-demo@360-ai.org', type: 'local' };
    return secureApiResponse(await next());
  }

  const token = context.request.headers.get('cf-access-jwt-assertion');
  if (!token) return apiError(403, 'forbidden', 'Zugriff verweigert');
  let identity;
  try {
    identity = await verifyAccessToken(token, context.env);
  } catch {
    return apiError(403, 'forbidden', 'Zugriff verweigert');
  }
  if (!identitaetDarfPfad(identity, context.request.url)) {
    return apiError(403, 'forbidden', 'Zugriff verweigert');
  }
  context.data.accessIdentity = identity;
  return secureApiResponse(await next());
}

export function onRequest(context) {
  return withApiAccess(context, () => context.next());
}
