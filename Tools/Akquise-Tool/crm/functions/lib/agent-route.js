import { ladeDaten, leseJson } from './agent.js';
import { apiError } from './responses.js';

// Gemeinsamer Ablauf der schreibenden Vorbereitungs-Routen: Zugriff, JSON, aktuelle Daten.
export async function mitDaten(context, fn) {
  if (!context.data?.accessIdentity) return apiError(403, 'forbidden', 'Zugriff verweigert');
  const { wert, fehler } = await leseJson(context.request);
  if (fehler) return fehler;
  let daten;
  try {
    daten = await ladeDaten(context);
  } catch {
    return apiError(502, 'data_source_unavailable', 'Lead-Daten konnten nicht geladen werden');
  }
  return fn(context, wert, daten);
}
