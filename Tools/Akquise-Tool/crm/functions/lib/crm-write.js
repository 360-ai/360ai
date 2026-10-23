// Schreibt eine bereits validierte Aenderung ueber WF-4 ins Sheet. Gemeinsamer Weg fuer
// die Browser-Route /api/write und die Agent-Schnittstelle /api/agent/*.

function webhookUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Webhook-URL ungueltig');
  }
  return url;
}

// Rueckgabe immer als Objekt mit HTTP-Status, nie als Ausnahme:
// { ok: true, status: 200, result } oder { ok: false, status, error, message, current_status }.
export async function schreibeCrm(env, payload, fetchImpl = fetch) {
  const fehler = (status, error, message, extra = {}) => ({
    ok: false, status, error, message, current_status: null, ...extra,
  });
  const token = String(env.CRM_WEBHOOK_TOKEN || '');
  if (!token) return fehler(503, 'write_not_configured', 'Schreibzugriff ist nicht konfiguriert');
  let url;
  try {
    url = webhookUrl(env.CRM_WEBHOOK_URL);
  } catch {
    return fehler(503, 'write_not_configured', 'Schreibzugriff ist nicht konfiguriert');
  }
  let upstream;
  const controller = new AbortController();
  // WF-4 braucht unter Last bis ~30 s (21.10.: Abbruch nach 12 s, n8n hatte trotzdem geschrieben).
  const warteMs = Number(env.CRM_WRITE_TIMEOUT_MS) || 30000;
  let abgelaufen = false;
  const timeout = setTimeout(() => { abgelaufen = true; controller.abort(); }, warteMs);
  try {
    upstream = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CRM-Token': token,
      },
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    if (abgelaufen) {
      // Nicht "gescheitert": n8n kann die Aenderung nach dem Abbruch noch gespeichert haben.
      return fehler(504, 'write_timeout',
        'Keine Antwort vom CRM. Die Änderung ist eventuell trotzdem gespeichert, bitte nachlesen.');
    }
    return fehler(502, 'write_unavailable', 'Änderung konnte nicht gespeichert werden');
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
      return fehler(503, 'write_not_configured',
        'Der Schreibzugriff ist in n8n nicht korrekt konfiguriert');
    }
    const status = [400, 404, 409, 422].includes(upstream.status) ? upstream.status : 502;
    if (status === 502) {
      return fehler(502, 'write_failed', 'Änderung konnte nicht gespeichert werden');
    }
    return fehler(status, result.error || 'validation_failed',
      result.message || (status === 409
        ? 'Status hat sich geändert, bitte neu laden'
        : 'Änderung wurde abgelehnt'),
      { current_status: result.current_status || null });
  }
  return { ok: true, status: 200, result };
}
