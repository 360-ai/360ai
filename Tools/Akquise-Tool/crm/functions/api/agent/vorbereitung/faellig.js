import { erinnerungenFaellig, ladeDaten } from '../../../lib/agent.js';
import { apiError, json } from '../../../lib/responses.js';

// GET /api/agent/vorbereitung/faellig  Erinnerungen, die heute rausgehen, mit fertigem Mailtext.
export async function onRequestGet(context) {
  if (!context.data?.accessIdentity) return apiError(403, 'forbidden', 'Zugriff verweigert');
  try {
    const daten = await ladeDaten(context);
    const faellig = erinnerungenFaellig(daten.leads);
    return json({ ok: true, anzahl: faellig.length, faellig });
  } catch {
    return apiError(502, 'data_source_unavailable', 'Lead-Daten konnten nicht geladen werden');
  }
}
