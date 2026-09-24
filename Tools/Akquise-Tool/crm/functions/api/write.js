import { localBypassEnabled } from '../lib/access.js';
import { apiError, json } from '../lib/responses.js';
import { validateWritePayload } from '../lib/validation.js';

// Der Browser sendet Sec-Fetch-Site bei jedem fetch() derselben Herkunft.
// Fehlt der Header, stammt die Anfrage nicht aus dem CRM und wird abgewiesen.
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

function webhookUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Webhook-URL ungueltig');
  }
  return url;
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

  const token = String(context.env.CRM_WEBHOOK_TOKEN || '');
  if (!token) return apiError(503, 'write_not_configured', 'Schreibzugriff ist nicht konfiguriert');
  let url;
  try {
    url = webhookUrl(context.env.CRM_WEBHOOK_URL);
  } catch {
    return apiError(503, 'write_not_configured', 'Schreibzugriff ist nicht konfiguriert');
  }
  let upstream;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CRM-Token': token,
      },
      body: JSON.stringify(validation.value),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    return apiError(502, 'write_unavailable', 'Änderung konnte nicht gespeichert werden');
  } finally {
    clearTimeout(timeout);
  }
  const text = (await upstream.text()).slice(0, 4096);
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }
  if (!upstream.ok) {
    // 401/503 kommen von einer Fehlkonfiguration in n8n und waren bisher von einem
    // echten Ausfall nicht zu unterscheiden.
    if (upstream.status === 401 || upstream.status === 503) {
      return apiError(503, 'write_not_configured',
        'Der Schreibzugriff ist in n8n nicht korrekt konfiguriert');
    }
    const status = [400, 404, 409, 422].includes(upstream.status) ? upstream.status : 502;
    if (status === 502) {
      return apiError(502, 'write_failed', 'Änderung konnte nicht gespeichert werden');
    }
    return json({
      ok: false,
      error: result.error || 'validation_failed',
      message: result.message || (status === 409
        ? 'Status hat sich geändert, bitte neu laden'
        : 'Änderung wurde abgelehnt'),
      current_status: result.current_status || null,
    }, { status });
  }
  return json({
    ok: true,
    aktion: validation.value.aktion,
    lead_id: validation.value.lead_id,
    feld: validation.value.feld ?? null,
    wert: validation.value.wert ?? null,
    needs_ende_grund: Boolean(result.needs_ende_grund),
  });
}
