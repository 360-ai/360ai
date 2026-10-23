import { ladeDaten, leadAkte, leadAnlegen } from '../../lib/agent.js';
import { mitDaten } from '../../lib/agent-route.js';
import { apiError, json } from '../../lib/responses.js';

// GET /api/agent/lead?id=L-...  Stammdaten, Phase, Notizen und die letzten Verlaufseintraege.
export async function onRequestGet(context) {
  if (!context.data?.accessIdentity) return apiError(403, 'forbidden', 'Zugriff verweigert');
  const leadId = new URL(context.request.url).searchParams.get('id') || '';
  let daten;
  try {
    daten = await ladeDaten(context);
  } catch {
    return apiError(502, 'data_source_unavailable', 'Lead-Daten konnten nicht geladen werden');
  }
  const akte = leadAkte(daten, leadId);
  if (!akte) return apiError(404, 'lead_not_found', 'Lead nicht gefunden. Erst mit leads suchen.');
  return json({ ok: true, lead: akte });
}

// POST /api/agent/lead {firma, ansprechpartner, ..., phase?, faellig_am?, next_action?, notiz?, doppelt_ok?}
// Legt einen Lead an, prueft vorher auf Dubletten (Firma oder E-Mail). Ohne lesbare Daten wird nichts angelegt.
export const onRequestPost = (context) => mitDaten(context, leadAnlegen);
