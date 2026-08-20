import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { onRequest as accessMiddleware } from '../functions/api/_middleware.js';
import { onRequestGet as getLeads } from '../functions/api/leads.js';
import { onRequestPost as writeLead } from '../functions/api/write.js';
import { apiError, json, secureApiResponse } from '../functions/lib/responses.js';

const localEnv = { LOCAL_DEV_BYPASS: 'true', LOCAL_DEMO_DATA: 'true' };
const accessData = { accessIdentity: { email: 'info@360-ai.org', type: 'app' } };

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function writeRequest(body, {
  url = 'http://localhost:8788/api/write',
  contentType = 'application/json',
  headers = {},
} = {}) {
  return new Request(url, {
    method: 'POST',
    // Der Browser setzt diesen Header bei jedem fetch() derselben Herkunft.
    headers: { 'Content-Type': contentType, 'Sec-Fetch-Site': 'same-origin', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validWrite = {
  lead_id: 'L-DEMO-001', feld: 'status', wert: 'analysiert', erwarteter_status: 'neu',
};

test('JSON-Antworten tragen konsequent No-Store- und Browser-Schutzheader', async () => {
  for (const response of [
    json({ ok: true }),
    apiError(400, 'bad', 'Abgelehnt'),
    secureApiResponse(new Response('ok', { headers: { 'Content-Type': 'text/plain' } })),
  ]) {
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.match(response.headers.get('Permissions-Policy'), /camera=\(\)/);
  }
});

test('API-Middleware erlaubt lokalen Bypass nur auf Loopback und setzt Schutzheader', async () => {
  const data = {};
  const response = await accessMiddleware({
    request: new Request('http://localhost:8788/api/leads'),
    env: localEnv,
    data,
    next: async () => Response.json({ ok: true }),
  });
  assert.equal(response.status, 200);
  assert.equal(data.accessIdentity.type, 'local');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');

  let nextCalled = false;
  const denied = await accessMiddleware({
    request: new Request('https://crm.example.org/api/leads'),
    env: localEnv,
    data: {},
    next: async () => {
      nextCalled = true;
      return Response.json({ ok: true });
    },
  });
  assert.equal(denied.status, 403);
  assert.equal((await responseJson(denied)).error, 'forbidden');
  assert.equal(nextCalled, false, 'ohne gueltiges Access-JWT darf der Handler nicht laufen');
});

test('Lead-Handler verweigert Aufrufe ohne verifizierte Access-Identitaet', async () => {
  const response = await getLeads({
    request: new Request('https://crm.example.org/api/leads'),
    env: {
      CRM_READ_WEBHOOK_URL: 'https://n8n.example.org/webhook/akquise-crm-read',
      CRM_READ_WEBHOOK_TOKEN: 'server-secret',
    },
    data: {},
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await responseJson(response), {
    ok: false,
    error: 'forbidden',
    message: 'Zugriff verweigert',
  });
});

test('Lead-API liefert lokal ausschliesslich fiktive Demo-Daten', async () => {
  const response = await getLeads({
    request: new Request('http://127.0.0.1:8788/api/leads'),
    env: localEnv,
    data: { accessIdentity: { email: 'lokal@example.org' } },
  });
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.leads.length >= 7);
  assert.ok(body.leads.every((lead) => String(lead.lead_id).startsWith('L-DEMO-')));
  assert.deepEqual(Object.keys(body.meta), ['generated_at']);
  assert.ok(!Number.isNaN(Date.parse(body.meta.generated_at)));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('Lead-API gibt Datenquellenfehler ohne interne Details zurueck', async () => {
  const response = await getLeads({
    request: new Request('https://crm.example.org/api/leads'),
    env: {},
    data: accessData,
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await responseJson(response), {
    ok: false,
    error: 'data_source_unavailable',
    message: 'Lead-Daten konnten nicht geladen werden',
  });
});

test('Lead-API liest n8n serverseitig mit Bearer-Token und kompatibler Antwortform', async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    CRM_READ_WEBHOOK_URL: 'https://n8n.example.org/webhook/akquise-crm-read',
    CRM_READ_WEBHOOK_TOKEN: 'read-server-secret',
  };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), env.CRM_READ_WEBHOOK_URL);
      assert.equal(options.method, 'GET');
      assert.deepEqual(options.headers, {
        Accept: 'application/json',
        Authorization: 'Bearer read-server-secret',
      });
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({
        ok: true,
        leads: [{ lead_id: 'L-1', firma: 'Alpha' }],
        activities: [{ activity_id: 'A-1', lead_id: 'L-1' }],
        audits: [{ audit_id: 'AU-1', lead_id: 'L-1' }],
        meta: { generated_at: '2000-01-01T00:00:00.000Z' },
        internal: 'wird nicht an den Browser gegeben',
      });
    };
    const response = await getLeads({
      request: new Request('https://crm.example.org/api/leads'), env, data: accessData,
    });
    const body = await responseJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body), ['ok', 'leads', 'activities', 'audits', 'meta']);
    assert.deepEqual(body.leads, [{ lead_id: 'L-1', firma: 'Alpha' }]);
    assert.deepEqual(body.activities, [{ activity_id: 'A-1', lead_id: 'L-1' }]);
    assert.deepEqual(body.audits, [{ audit_id: 'AU-1', lead_id: 'L-1' }]);
    assert.ok(!Number.isNaN(Date.parse(body.meta.generated_at)));
    assert.notEqual(body.meta.generated_at, '2000-01-01T00:00:00.000Z');
    assert.equal('internal' in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Lead-API behandelt non-2xx, ungueltiges JSON und falsche Shape fail closed', async (t) => {
  const originalFetch = globalThis.fetch;
  const env = {
    CRM_READ_WEBHOOK_URL: 'https://n8n.example.org/webhook/akquise-crm-read',
    CRM_READ_WEBHOOK_TOKEN: 'read-server-secret',
  };
  const failures = [
    ['HTTP-Fehler', () => Response.json({ ok: false, secret: 'intern' }, { status: 401 })],
    ['ungueltiges JSON', () => new Response('{kaputt', {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })],
    ['falsche Shape', () => Response.json({
      ok: true, leads: [], activities: [], audits: {},
    })],
  ];
  try {
    for (const [name, responseFactory] of failures) {
      await t.test(name, async () => {
        globalThis.fetch = async () => responseFactory();
        const response = await getLeads({
          request: new Request('https://crm.example.org/api/leads'), env, data: accessData,
        });
        assert.equal(response.status, 502);
        assert.deepEqual(await responseJson(response), {
          ok: false,
          error: 'data_source_unavailable',
          message: 'Lead-Daten konnten nicht geladen werden',
        });
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Write-API akzeptiert in der lokalen Demo eine normalisierte Aenderung', async () => {
  const response = await writeLead({ request: writeRequest(validWrite), env: localEnv });
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.demo, true);
  assert.equal(body.ruecksprung_bestaetigt, false);
});

test('Write-API blockiert Cross-Site, falschen Content-Type und ungueltiges JSON', async () => {
  const crossSite = await writeLead({
    request: writeRequest(validWrite, {
      headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
    }),
    env: localEnv,
  });
  assert.equal(crossSite.status, 403);

  const wrongType = await writeLead({
    request: writeRequest('{}', { contentType: 'text/plain' }), env: localEnv,
  });
  assert.equal(wrongType.status, 415);

  const invalidJson = await writeLead({
    request: writeRequest('{kaputt'), env: localEnv,
  });
  assert.equal(invalidJson.status, 400);
});

test('Body-Limit wird in Bytes und nicht nur in JavaScript-Zeichen geprueft', async () => {
  const response = await writeLead({
    request: writeRequest({
      lead_id: 'L-DEMO-001', feld: 'notiz', wert: 'ü'.repeat(9000), erwarteter_status: 'neu',
    }),
    env: localEnv,
  });
  assert.equal(response.status, 413);
  assert.equal((await responseJson(response)).error, 'body_too_large');
});

test('fehlende oder ungueltige Webhook-Konfiguration fuehrt zu 503', async () => {
  const request = writeRequest(validWrite, { url: 'https://crm.example.org/api/write' });
  const missing = await writeLead({ request, env: {} });
  assert.equal(missing.status, 503);

  const badUrl = await writeLead({
    request: writeRequest(validWrite, { url: 'https://crm.example.org/api/write' }),
    env: { CRM_WEBHOOK_TOKEN: 'secret', CRM_WEBHOOK_URL: 'http://n8n.example.org/webhook' },
  });
  assert.equal(badUrl.status, 503);
});

test('bekannte n8n-Konflikte werden weitergereicht, unbekannte Fehler werden bereinigt', async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    CRM_WEBHOOK_TOKEN: 'server-secret',
    CRM_WEBHOOK_URL: 'https://n8n.example.org/webhook/akquise-crm-write',
  };
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.equal(options.headers['X-CRM-Token'], 'server-secret');
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({
        error: 'status_conflict', message: 'Status hat sich geaendert', current_status: 'angebot',
      }, { status: 409 });
    };
    const conflict = await writeLead({
      request: writeRequest(validWrite, { url: 'https://crm.example.org/api/write' }), env,
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await responseJson(conflict), {
      ok: false,
      error: 'status_conflict',
      message: 'Status hat sich geaendert',
      current_status: 'angebot',
    });

    globalThis.fetch = async () => Response.json({
      error: 'stack_trace', message: 'interner Pfad und Secret',
    }, { status: 500 });
    const failure = await writeLead({
      request: writeRequest(validWrite, { url: 'https://crm.example.org/api/write' }), env,
    });
    assert.equal(failure.status, 502);
    assert.deepEqual(await responseJson(failure), {
      ok: false,
      error: 'write_failed',
      message: 'Änderung konnte nicht gespeichert werden',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('statische Sicherheitsregeln schuetzen App und API ohne externe oder CSP-widrige Assets', async () => {
  const [headers, routes, html, app, logo, leadsFunction] = await Promise.all([
    readFile(new URL('../public/_headers', import.meta.url), 'utf8'),
    readFile(new URL('../public/_routes.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/360ai-logo.svg', import.meta.url), 'utf8'),
    readFile(new URL('../functions/api/leads.js', import.meta.url), 'utf8'),
  ]);
  assert.match(headers, /Cache-Control: private, no-store/);
  assert.match(headers, /default-src 'self'/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.deepEqual(
    JSON.parse(routes),
    { version: 1, include: ['/api/*', '/sync'], exclude: [] },
  );
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.match(html, /<img class="brand-mark" src="\/assets\/360ai-logo\.svg"/);
  assert.doesNotMatch(html + app, /\sstyle=/i);
  assert.doesNotMatch(app, /\.style\s*\./);
  assert.match(logo, /^<\?xml[\s\S]*<svg/);
  assert.doesNotMatch(logo, /<script|\b(?:href|src)=["']https?:\/\//i);
  assert.match(leadsFunction, /CRM_READ_WEBHOOK_URL/);
  assert.match(leadsFunction, /Authorization:\s*'Bearer '/);
  assert.doesNotMatch(leadsFunction, /google-sheets|GOOGLE_(?:SERVICE_ACCOUNT|PRIVATE_KEY|SPREADSHEET)/);
});
