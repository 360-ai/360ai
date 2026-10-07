import { leseJson, phaseSetzen } from '../../lib/agent.js';
import { apiError } from '../../lib/responses.js';

// POST /api/agent/phase {lead_id, phase, erwartete_phase, grund?, notiz?, faellig_am?}
export async function onRequestPost(context) {
  if (!context.data?.accessIdentity) return apiError(403, 'forbidden', 'Zugriff verweigert');
  const { wert, fehler } = await leseJson(context.request);
  if (fehler) return fehler;
  return phaseSetzen(context, wert);
}
