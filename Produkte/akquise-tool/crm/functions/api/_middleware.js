import { localBypassEnabled, verifyAccessToken } from '../lib/access.js';
import { apiError, secureApiResponse } from '../lib/responses.js';

export async function withApiAccess(context, next) {
  if (localBypassEnabled(context.request, context.env)) {
    context.data.accessIdentity = { email: 'lokale-demo@360-ai.org', type: 'local' };
    return secureApiResponse(await next());
  }

  const token = context.request.headers.get('cf-access-jwt-assertion');
  if (!token) return apiError(403, 'forbidden', 'Zugriff verweigert');
  try {
    context.data.accessIdentity = await verifyAccessToken(token, context.env);
    return secureApiResponse(await next());
  } catch {
    return apiError(403, 'forbidden', 'Zugriff verweigert');
  }
}

export function onRequest(context) {
  return withApiAccess(context, () => context.next());
}
