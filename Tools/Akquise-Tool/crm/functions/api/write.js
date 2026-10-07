import { localBypassEnabled } from '../lib/access.js';
import { apiError, json } from '../lib/responses.js';
import { schreibeCrm } from '../lib/crm-write.js';
import { validateWritePayload } from '../lib/validation.js';

// Der Browser sendet Sec-Fetch-Site bei jedem fetch() derselben Herkunft.
// Fehlt der Header, stammt die Anfrage nicht aus dem CRM und wird abgewiesen.
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

const bodySize = (value) => new TextEncoder().encode(value).byteLength;

export async function onRequestPost(context) {
  if (!sameOrigin(context.request)) return apiError(403, 'cross_site_request', 'Anfrage abgewiesen');
  if (!/^application\/json(?:;|$)/i.test(context.request.headers.get('Content-Type') || '')) {
    return apiError(415, 'content_type_required', 'application/json erwartet');
  }
  const declared = Number(context.request.headers.get('Content-Length') || 0);
  if (declared > 16384) return apiError(413, 'body_too_large', 'Anfrage ist zu groß');
  let raw;
  try {
    raw = await context.request.text();
  } catch {
    return apiError(400, 'invalid_body', 'Anfrage konnte nicht gelesen werden');
  }
  if (bodySize(raw) > 16384) return apiError(413, 'body_too_large', 'Anfrage ist zu groß');
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return apiError(400, 'invalid_json', 'Ungültiges JSON');
  }
  const validation = validateWritePayload(input);
  if (!validation.ok) return apiError(validation.status, validation.error, validation.message);

  if (localBypassEnabled(context.request, context.env) && context.env.LOCAL_DEMO_DATA === 'true') {
    return json({ ok: true, ...validation.value, demo: true });
  }

  const antwort = await schreibeCrm(context.env, validation.value);
  if (!antwort.ok) {
    if (antwort.status === 502 || antwort.status === 503) {
      return apiError(antwort.status, antwort.error, antwort.message);
    }
    return json({
      ok: false,
      error: antwort.error,
      message: antwort.message,
      current_status: antwort.current_status,
    }, { status: antwort.status });
  }
  const result = antwort.result;
  return json({
    ok: true,
    aktion: validation.value.aktion,
    lead_id: validation.value.lead_id,
    feld: validation.value.feld ?? null,
    wert: validation.value.wert ?? null,
    needs_ende_grund: Boolean(result.needs_ende_grund),
  });
}
