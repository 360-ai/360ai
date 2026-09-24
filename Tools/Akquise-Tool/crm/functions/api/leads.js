import { localBypassEnabled } from '../lib/access.js';
import { createDemoData } from '../lib/demo-data.js';
import { apiError, json } from '../lib/responses.js';

function readWebhookUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Read-Webhook-URL ungueltig');
  }
  return url;
}

function validateReadPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.ok !== true) {
    throw new Error('Read-Webhook-Antwort ungueltig');
  }
  const data = {};
  for (const collection of ['leads', 'activities', 'audits']) {
    const rows = payload[collection];
    if (!Array.isArray(rows) || rows.some(
      (row) => !row || typeof row !== 'object' || Array.isArray(row),
    )) {
      throw new Error('Read-Webhook-Antwort ungueltig');
    }
    data[collection] = rows;
  }
  return data;
}

export async function readCrmWebhook(env, fetchImpl = fetch) {
  const token = String(env.CRM_READ_WEBHOOK_TOKEN || '').trim();
  if (!token) throw new Error('CRM_READ_WEBHOOK_TOKEN fehlt');
  const url = readWebhookUrl(env.CRM_READ_WEBHOOK_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
      },
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error('Read-Webhook antwortet mit HTTP ' + response.status);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Read-Webhook liefert kein gueltiges JSON');
  }
  return validateReadPayload(payload);
}

export async function onRequestGet(context) {
  if (!context.data?.accessIdentity) {
    return apiError(403, 'forbidden', 'Zugriff verweigert');
  }
  try {
    const data = localBypassEnabled(context.request, context.env)
      && context.env.LOCAL_DEMO_DATA === 'true'
      ? createDemoData()
      : await readCrmWebhook(context.env);
    return json({
      ok: true,
      ...data,
      meta: {
        generated_at: new Date().toISOString(),
      },
    });
  } catch {
    return apiError(502, 'data_source_unavailable', 'Lead-Daten konnten nicht geladen werden');
  }
}
