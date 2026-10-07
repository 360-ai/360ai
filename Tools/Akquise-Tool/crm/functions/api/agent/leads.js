import { ladeDaten, sucheLeads } from '../../lib/agent.js';
import { apiError, json } from '../../lib/responses.js';

// GET /api/agent/leads?suche=&phase=&archiv=ja
// Hilfs-Aktion fuer Langdock: liefert lead_id und Phase, bevor geschrieben wird.
export async function onRequestGet(context) {
  if (!context.data?.accessIdentity) return apiError(403, 'forbidden', 'Zugriff verweigert');
  const parameter = new URL(context.request.url).searchParams;
  try {
    const daten = await ladeDaten(context);
    const treffer = sucheLeads(daten.leads, {
      suche: parameter.get('suche') || '',
      phase: parameter.get('phase') || '',
      archiv: parameter.get('archiv') === 'ja',
    });
    return json({ ok: true, anzahl: treffer.length, leads: treffer });
  } catch {
    return apiError(502, 'data_source_unavailable', 'Lead-Daten konnten nicht geladen werden');
  }
}
