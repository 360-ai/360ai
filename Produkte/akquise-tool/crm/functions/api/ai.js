import { readCrmWebhook } from './leads.js';
import { localBypassEnabled } from '../lib/access.js';
import {
  AI_DEFAULT_PROMPT, AI_TEXTARTEN, buildLeadContext, buildMessages, validateAiPayload,
} from '../lib/ai-prompt.js';
import { createDemoData } from '../lib/demo-data.js';
import { apiError, json } from '../lib/responses.js';

// Bewusst ohne @anthropic-ai/sdk: Pages Functions werden gebuendelt ausgeliefert,
// und das SDK vervielfacht die Bundle-Groesse fuer einen einzigen Aufruf.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5';
const MAX_TOKENS = 8000;

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

const bodySize = (value) => new TextEncoder().encode(value).byteLength;

function extractText(payload) {
  if (!payload || !Array.isArray(payload.content)) return '';
  return payload.content
    .filter((block) => block && block.type === 'text')
    .map((block) => String(block.text || ''))
    .join('')
    .trim();
}

export async function onRequestPost(context) {
  if (!sameOrigin(context.request)) return apiError(403, 'cross_site_request', 'Anfrage abgewiesen');
  if (!/^application\/json(?:;|$)/i.test(context.request.headers.get('Content-Type') || '')) {
    return apiError(415, 'content_type_required', 'application/json erwartet');
  }
  if (Number(context.request.headers.get('Content-Length') || 0) > 32768) {
    return apiError(413, 'body_too_large', 'Anfrage ist zu groß');
  }
  let raw;
  try {
    raw = await context.request.text();
  } catch {
    return apiError(400, 'invalid_body', 'Anfrage konnte nicht gelesen werden');
  }
  if (bodySize(raw) > 32768) return apiError(413, 'body_too_large', 'Anfrage ist zu groß');
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return apiError(400, 'invalid_json', 'Ungültiges JSON');
  }
  const validation = validateAiPayload(input);
  if (!validation.ok) return apiError(validation.status, validation.error, validation.message);

  const apiKey = String(context.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return apiError(503, 'ai_not_configured',
      'Der KI-Schlüssel ist noch nicht hinterlegt. Bitte ANTHROPIC_API_KEY als Pages-Secret setzen.');
  }

  // Lead-Daten kommen aus der Quelle, nicht aus dem Browser.
  let data;
  try {
    data = localBypassEnabled(context.request, context.env) && context.env.LOCAL_DEMO_DATA === 'true'
      ? createDemoData()
      : await readCrmWebhook(context.env);
  } catch {
    return apiError(502, 'data_source_unavailable', 'Lead-Daten konnten nicht geladen werden');
  }
  const lead = data.leads.find((item) => String(item.lead_id) === validation.value.lead_id);
  if (!lead) return apiError(404, 'lead_not_found', 'Lead wurde nicht gefunden');

  const kontext = buildLeadContext(
    lead,
    data.activities.filter((item) => String(item.lead_id) === validation.value.lead_id),
    data.audits.filter((item) => String(item.lead_id) === validation.value.lead_id),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: validation.value.prompt,
        output_config: { effort: 'medium' },
        messages: buildMessages(validation.value, kontext),
      }),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    return apiError(504, 'ai_unavailable', 'Die KI hat nicht rechtzeitig geantwortet');
  } finally {
    clearTimeout(timeout);
  }

  const text = (await upstream.text()).slice(0, 200000);
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403) {
      return apiError(503, 'ai_not_configured', 'Der KI-Schlüssel wird abgelehnt. Bitte Secret prüfen.');
    }
    if (upstream.status === 429) {
      return apiError(429, 'ai_rate_limited', 'KI-Limit erreicht. Bitte gleich noch einmal versuchen.');
    }
    return apiError(502, 'ai_failed', 'Die KI konnte keinen Text erzeugen');
  }
  if (payload.stop_reason === 'refusal') {
    return apiError(422, 'ai_refused', 'Die KI hat diese Anfrage abgelehnt.');
  }

  const ergebnis = extractText(payload);
  if (!ergebnis) return apiError(502, 'ai_empty', 'Die KI hat keinen Text zurückgegeben');

  return json({
    ok: true,
    lead_id: validation.value.lead_id,
    textart: validation.value.textart,
    text: ergebnis,
    abgeschnitten: payload.stop_reason === 'max_tokens',
  });
}

// Liefert Standardprompt und Textarten, damit das Frontend sie nicht doppelt pflegen muss.
export function onRequestGet() {
  return json({ ok: true, default_prompt: AI_DEFAULT_PROMPT, textarten: AI_TEXTARTEN });
}
