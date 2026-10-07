import { leseJson, notizAnhaengen } from '../../lib/agent.js';
import { apiError } from '../../lib/responses.js';

// POST /api/agent/notiz {lead_id, text}  Haengt einen Verlaufseintrag an, aendert keine Felder.
export async function onRequestPost(context) {
  if (!context.data?.accessIdentity) return apiError(403, 'forbidden', 'Zugriff verweigert');
  const { wert, fehler } = await leseJson(context.request);
  if (fehler) return fehler;
  return notizAnhaengen(context, wert);
}
