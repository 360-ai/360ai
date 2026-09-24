import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { onRequestGet, serializeForScript } from '../functions/sync.js';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const route = await readFile(new URL('../functions/sync.js', import.meta.url), 'utf8');
const routesConfig = JSON.parse(
  await readFile(new URL('../public/_routes.json', import.meta.url), 'utf8'),
);

test('Frontend nutzt einen CSP-kompatiblen External-Script-Lesetransport', () => {
  assert.doesNotMatch(app, /fetch\('\/sync'/);
  assert.doesNotMatch(app, /fetch\('\/api\/leads'/);
  assert.match(app, /document\.createElement\('script'\)/);
  assert.match(app, /script\.src = '\/sync\?request_id='/);
  assert.match(app, /__AKQUISE_CRM_SYNC_V1__/);
  assert.match(route, /withApiAccess/);
  assert.match(route, /readLeads/);
  assert.match(route, /application\/javascript/);
  assert.deepEqual(routesConfig.include, ['/api/*', '/sync']);
});

// Ein legitimes <script src> derselben Herkunft sendet immer beide Header.
const scriptRequest = (url) => new Request(url, {
  headers: { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'script' },
});

test('Script-Lesepfad nutzt Access-Pruefung und denselben Datenhandler', async () => {
  const requestId = '123e4567-e89b-42d3-a456-426614174000';
  const denied = await onRequestGet({
    request: scriptRequest('https://crm.example.org/sync?request_id=' + requestId),
    env: {},
    data: {},
  });
  assert.equal(denied.status, 403);

  const local = await onRequestGet({
    request: scriptRequest('http://localhost:8788/sync?request_id=' + requestId),
    env: { LOCAL_DEV_BYPASS: 'true', LOCAL_DEMO_DATA: 'true' },
    data: {},
  });
  assert.equal(local.status, 200);
  assert.match(local.headers.get('Content-Type'), /^application\/javascript/);
  assert.equal(local.headers.get('Cache-Control'), 'private, no-store');

  let delivered;
  runInNewContext(await local.text(), {
    globalThis: {
      __AKQUISE_CRM_SYNC_V1__: {
        deliver(id, payload) { delivered = { id, payload }; },
      },
    },
  });
  assert.equal(delivered.id, requestId);
  assert.equal(delivered.payload.ok, true);
  assert.ok(Array.isArray(delivered.payload.leads));
});

test('Script-Lesepfad lehnt ungueltige Request-IDs ab', async () => {
  const response = await onRequestGet({
    request: scriptRequest('http://localhost:8788/sync?request_id=callback.alert(1)'),
    env: { LOCAL_DEV_BYPASS: 'true', LOCAL_DEMO_DATA: 'true' },
    data: {},
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_request_id');
});

// Die Leaddaten werden als ausfuehrbares Skript ausgeliefert. Ohne diese Pruefung
// koennte eine fremde Seite sie per <script src> einbinden und komplett mitlesen.
test('Script-Lesepfad weist Einbindung von fremden Seiten ab', async () => {
  const requestId = '123e4567-e89b-42d3-a456-426614174000';
  const url = 'http://localhost:8788/sync?request_id=' + requestId;
  const env = { LOCAL_DEV_BYPASS: 'true', LOCAL_DEMO_DATA: 'true' };
  const varianten = [
    ['fremde Herkunft', { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'script' }],
    ['Schwesterdomain', { 'Sec-Fetch-Site': 'same-site', 'Sec-Fetch-Dest': 'script' }],
    ['direkter Aufruf', { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Dest': 'document' }],
    ['ohne Metadata-Header', {}],
  ];
  for (const [name, headers] of varianten) {
    const response = await onRequestGet({
      request: new Request(url, { headers }), env, data: {},
    });
    assert.equal(response.status, 403, name + ' muss abgewiesen werden');
    assert.equal((await response.json()).error, 'cross_site_request', name);
  }
});

test('Script-Serialisierung neutralisiert HTML- und JavaScript-Trennzeichen', () => {
  const value = { text: '</script><script>alert(1)</script>&\u2028\u2029' };
  const serialized = serializeForScript(value);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(serialized), value);
});
