import { withApiAccess } from './api/_middleware.js';
import { onRequestGet as readLeads } from './api/leads.js';
import { apiError } from './lib/responses.js';

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCRIPT_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serializeForScript(value) {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('Script-Nutzlast ist nicht serialisierbar');
  return serialized.replace(/[<>&\u2028\u2029]/g, (character) => SCRIPT_ESCAPES[character]);
}

function scriptResponse(requestId, payload) {
  const body = 'globalThis.__AKQUISE_CRM_SYNC_V1__?.deliver('
    + serializeForScript(requestId) + ',' + serializeForScript(payload) + ');';
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/javascript; charset=utf-8',
    },
  });
}

async function readScript(context) {
  const requestId = new URL(context.request.url).searchParams.get('request_id') || '';
  if (!REQUEST_ID.test(requestId)) {
    return apiError(400, 'invalid_request_id', 'Leseanfrage ist ungueltig');
  }
  const response = await readLeads(context);
  if (!response.ok) return response;
  try {
    return scriptResponse(requestId, await response.json());
  } catch {
    return apiError(502, 'data_source_unavailable', 'Lead-Daten konnten nicht geladen werden');
  }
}

// Diese Route liefert die Leaddaten als ausfuehrbares Skript aus. Ohne zusaetzliche
// Pruefung koennte eine fremde Seite sie per <script src> einbinden und mitlesen,
// weil der Browser das Access-Cookie bei Subresourcen mitschickt. Die request_id ist
// kein Geheimnis, sie wird nur auf ihr Format geprueft. Deshalb hier strenger als in
// write.js: fehlende Fetch-Metadata-Header gelten als Ablehnung, nicht als Freigabe.
// Ein legitimes <script src> derselben Herkunft sendet immer genau diese Werte,
// auch in Brave; die Header sind aus JavaScript nicht faelschbar.
function sameOriginScript(request) {
  return request.headers.get('Sec-Fetch-Site') === 'same-origin'
    && request.headers.get('Sec-Fetch-Dest') === 'script';
}

export function onRequestGet(context) {
  if (!sameOriginScript(context.request)) {
    return apiError(403, 'cross_site_request', 'Anfrage abgewiesen');
  }
  return withApiAccess(context, () => readScript(context));
}
