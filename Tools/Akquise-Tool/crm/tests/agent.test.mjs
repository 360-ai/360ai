import assert from 'node:assert/strict';
import test from 'node:test';

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';

import { identitaetDarfPfad } from '../functions/api/_middleware.js';
import {
  leadAkte, notizAnhaengen, phaseSetzen, sucheLeads,
} from '../functions/lib/agent.js';
import { verifyAccessToken } from '../functions/lib/access.js';
import { createDemoData } from '../functions/lib/demo-data.js';

const env = { CRM_WEBHOOK_URL: 'https://n8n.example.org/webhook/crm', CRM_WEBHOOK_TOKEN: 't' };
const kontext = () => ({ request: new Request('https://crm.example.org/api/agent/phase'), env });

// Faengt die WF-4-Aufrufe ab. antworten: Liste von [status, body] je Aufruf.
async function mitWf4(antworten, fn) {
  const aufrufe = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, optionen) => {
    aufrufe.push(JSON.parse(optionen.body));
    const [status, body] = antworten[aufrufe.length - 1] || [200, { ok: true }];
    return new Response(JSON.stringify(body), { status });
  };
  try {
    return { r: await fn(), aufrufe };
  } finally {
    globalThis.fetch = original;
  }
}

test('Suche findet Leads ueber Firma und filtert Archiv und Phase', () => {
  const { leads } = createDemoData();
  const treffer = sucheLeads(leads, { suche: 'lahnform' });
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].lead_id, 'L-DEMO-004');
  assert.equal(treffer[0].phase_label, 'Im Gespräch');
  assert.ok(sucheLeads(leads, { phase: 'beendet' }).every((lead) => lead.phase === 'beendet'));
  const archiviert = [{ ...leads[0], archiviert_am: '2026-09-01' }];
  assert.equal(sucheLeads(archiviert).length, 0);
  assert.equal(sucheLeads(archiviert, { archiv: true }).length, 1);
});

test('Lead-Akte liefert Phase, Grundtext und Verlauf neueste zuerst', () => {
  const akte = leadAkte(createDemoData(), 'L-DEMO-004');
  assert.equal(akte.phase, 'qualifiziert');
  assert.ok(akte.verlauf.length >= 2);
  assert.ok(akte.verlauf[0].datum >= akte.verlauf[1].datum);
  assert.equal(leadAkte(createDemoData(), 'gibt-es-nicht'), null);
});

test('Verloren ohne Grund oder Notiz und Ruht ohne Datum werden vor dem Schreiben abgelehnt', async () => {
  const { aufrufe } = await mitWf4([], async () => {
    for (const eingabe of [
      { lead_id: 'L-1', phase: 'beendet', erwartete_phase: 'termin', grund: 'zu_teuer' },
      { lead_id: 'L-1', phase: 'beendet', erwartete_phase: 'termin', notiz: 'x' },
      { lead_id: 'L-1', phase: 'ruht', erwartete_phase: 'termin' },
      { lead_id: 'L-1', phase: 'beendet', erwartete_phase: 'termin', grund: 'quatsch', notiz: 'x' },
      { lead_id: 'L-1', phase: 'gibtsnicht', erwartete_phase: 'termin' },
      { lead_id: 'L-1', phase: 'termin', erwartete_phase: '' },
    ]) {
      const antwort = await phaseSetzen(kontext(), eingabe);
      assert.equal(antwort.status, 400, JSON.stringify(eingabe));
    }
  });
  assert.equal(aufrufe.length, 0, 'nichts darf geschrieben werden');
});

test('Verloren schreibt Status, Grund und Notiz in dieser Reihenfolge', async () => {
  const { r, aufrufe } = await mitWf4([], () => phaseSetzen(kontext(), {
    lead_id: 'L-1', phase: 'beendet', erwartete_phase: 'angebot',
    grund: 'wettbewerber', notiz: 'Hat sich fuer den Systemhaus-Partner entschieden.',
  }));
  assert.equal(r.status, 200);
  assert.deepEqual(aufrufe.map((a) => a.feld), ['status', 'ende_grund', 'verlust_notiz']);
  assert.equal(aufrufe[0].erwarteter_status, 'angebot');
  assert.equal(aufrufe[0].ruecksprung_bestaetigt, false);
});

test('Ruht setzt Phase und Faelligkeit, eine Notiz landet im Verlauf', async () => {
  const { r, aufrufe } = await mitWf4([], () => phaseSetzen(kontext(), {
    lead_id: 'L-1', phase: 'ruht', erwartete_phase: 'termin',
    faellig_am: '2027-01-15', notiz: 'Nach der Saison melden',
  }));
  assert.equal(r.status, 200);
  assert.deepEqual(aufrufe.map((a) => a.feld || a.aktion), ['status', 'next_action_at', 'notiz']);
});

test('Ruecksprung lehnt der Agent-Weg mit verstaendlicher Meldung ab', async () => {
  const { r } = await mitWf4(
    [[422, { ok: false, error: 'backward_transition_requires_confirmation' }]],
    () => phaseSetzen(kontext(), { lead_id: 'L-1', phase: 'kontaktiert', erwartete_phase: 'angebot' }),
  );
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'backward_not_allowed');
});

test('Konflikt meldet die aktuelle Phase zurueck', async () => {
  const { r } = await mitWf4(
    [[409, { ok: false, error: 'status_conflict', current_status: 'termin' }]],
    () => phaseSetzen(kontext(), { lead_id: 'L-1', phase: 'angebot', erwartete_phase: 'fragebogen_da' }),
  );
  assert.equal(r.status, 409);
  assert.equal((await r.json()).current_phase, 'termin');
});

test('Agent-Notizen sind im Verlauf als Langdock gekennzeichnet', async () => {
  const { r, aufrufe } = await mitWf4([], () => notizAnhaengen(kontext(), { lead_id: 'L-1', text: 'Rueckruf Di' }));
  assert.equal(r.status, 200);
  assert.deepEqual(aufrufe[0], { aktion: 'notiz', lead_id: 'L-1', wert: 'Langdock: Rueckruf Di' });
  const leer = await notizAnhaengen(kontext(), { lead_id: 'L-1', text: '  ' });
  assert.equal(leer.status, 400);
});

test('Service Token wird nur mit passender Client-ID und nur fuer /api/agent/ zugelassen', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k', alg: 'RS256' };
  const keySet = createLocalJWKSet({ keys: [jwk] });
  const signiere = (payload) => new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'k' })
    .setIssuer('https://team.cloudflareaccess.com').setAudience('aud')
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const basis = {
    TEAM_DOMAIN: 'https://team.cloudflareaccess.com', POLICY_AUD: 'aud', ALLOWED_EMAIL: 'denis@example.org',
  };
  const token = await signiere({ type: 'app', common_name: 'abc.access', email: '' });
  await assert.rejects(() => verifyAccessToken(token, basis, keySet), 'ohne Freigabe kein Zugang');
  await assert.rejects(() => verifyAccessToken(
    token, { ...basis, ALLOWED_SERVICE_TOKEN_ID: 'andere.access' }, keySet,
  ));
  const identitaet = await verifyAccessToken(
    token, { ...basis, ALLOWED_SERVICE_TOKEN_ID: 'abc.access' }, keySet,
  );
  assert.equal(identitaet.service, true);

  assert.equal(identitaetDarfPfad(identitaet, 'https://crm.example.org/api/agent/leads'), true);
  for (const pfad of ['/sync', '/api/write', '/api/ai', '/api/leads', '/api/agentx']) {
    assert.equal(identitaetDarfPfad(identitaet, 'https://crm.example.org' + pfad), false, pfad);
  }
  assert.equal(identitaetDarfPfad({ email: 'denis@example.org' }, 'https://crm.example.org/sync'), true);
});

// --- Lead anlegen (POST /api/agent/lead) ---
const leereDaten = { leads: [{ lead_id: 'L-ALT', firma: 'Schreck Kunststofftechnik GmbH', mail: 'info@alt.de', status: 'termin' }], activities: [] };
const neuerLead = {
  firma: 'Musterbau GmbH', ansprechpartner: 'Erika Muster', ort: '35066 Frankenberg',
  mail: 'erika@musterbau.de', website: 'https:// musterbau.de', anrede: 'Du', kontaktquelle: 'sonstiges',
};

test('Lead anlegen schreibt create, Phase, naechste Aktion und Datum, danach die Notiz', async () => {
  const { r, aufrufe } = await mitWf4([], async () => (await import('../functions/lib/agent.js')).leadAnlegen(
    kontext(), { ...neuerLead, phase: 'angebot', faellig_am: '2026-10-28', notiz: 'Bestandskunde' },
    leereDaten, '2026-10-21'));
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.deepEqual(aufrufe.map((a) => a.aktion === 'create' || a.aktion === 'notiz' ? a.aktion : a.feld),
    ['create', 'status', 'next_action', 'next_action_at', 'notiz']);
  assert.match(aufrufe[0].lead_id, /^L-20261021-musterbau-gmbh-[a-z0-9]{1,4}$/);
  assert.equal(aufrufe[0].lead.website, 'https://musterbau.de');
  assert.equal(aufrufe[0].lead.anrede, 'du');
  assert.equal(aufrufe[1].erwarteter_status, 'neu');
  assert.equal(aufrufe[2].wert, 'wiedervorlage');
  assert.equal(aufrufe[2].erwarteter_status, 'angebot');
  assert.equal(body.phase, 'angebot');
});

test('Lead anlegen in Phase neu laesst die Analyse-Aufgabe von WF-4 stehen', async () => {
  const { aufrufe } = await mitWf4([], async () => (await import('../functions/lib/agent.js')).leadAnlegen(
    kontext(), neuerLead, leereDaten, '2026-10-21'));
  assert.deepEqual(aufrufe.map((a) => a.aktion), ['create']);
});

test('Moegliche Dublette (Firma ohne Gross/Klein oder Mail) gibt 409 und schreibt nichts', async () => {
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const { r, aufrufe } = await mitWf4([], () => leadAnlegen(
    kontext(), { firma: 'schreck kunststofftechnik gmbh', phase: 'angebot' }, leereDaten, '2026-10-21'));
  assert.equal(r.status, 409);
  assert.equal((await r.json()).treffer[0].lead_id, 'L-ALT');
  assert.equal(aufrufe.length, 0);
  const zwei = await mitWf4([], () => leadAnlegen(
    kontext(), { firma: 'Anders', mail: 'INFO@alt.de', doppelt_ok: true }, leereDaten, '2026-10-21'));
  assert.equal(zwei.r.status, 200);
});

test('Ungueltige Eingaben werden vor dem Anlegen abgelehnt', async () => {
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const { aufrufe } = await mitWf4([], async () => {
    for (const eingabe of [
      { ...neuerLead, phase: 'beendet' },
      { ...neuerLead, phase: 'quatsch' },
      { ...neuerLead, phase: 'angebot', faellig_am: '28.10.2026' },
      { ...neuerLead, mail: 'kein-at' },
      { ort: 'nur Ort' },
    ]) {
      const antwort = await leadAnlegen(kontext(), eingabe, leereDaten, '2026-10-21');
      assert.equal(antwort.status, 400, JSON.stringify(eingabe));
    }
  });
  assert.equal(aufrufe.length, 0);
});

test('Scheitert ein Folgeschritt, meldet die Antwort die lead_id und legt nicht erneut an', async () => {
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const { r, aufrufe } = await mitWf4([[200, { ok: true }], [502, { ok: false }]], () => leadAnlegen(
    kontext(), { ...neuerLead, phase: 'angebot', faellig_am: '2026-10-28' }, leereDaten, '2026-10-21'));
  const body = await r.json();
  assert.equal(body.ok, false);
  assert.equal(body.angelegt, true);
  assert.equal(body.lead_id, aufrufe[0].lead_id);
  assert.deepEqual(body.schon_geschrieben, ['create']);
  assert.equal(aufrufe.filter((a) => a.aktion === 'create').length, 1);
});

test('Lesefehler beim Anlegen: Route gibt 502 und schreibt nichts', async () => {
  const { mitDaten } = await import('../functions/lib/agent-route.js');
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const aufrufe = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, optionen) => {
    if (optionen?.method === 'POST' && optionen.body?.includes?.('"aktion"')) aufrufe.push(optionen.body);
    return new Response('kaputt', { status: 500 });
  };
  try {
    const context = {
      request: new Request('https://crm.example.org/api/agent/lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(neuerLead),
      }),
      env: { ...env, CRM_READ_WEBHOOK_URL: 'https://n8n.example.org/webhook/read', CRM_READ_TOKEN: 't' },
      data: { accessIdentity: { service: true } },
    };
    const r = await mitDaten(context, leadAnlegen);
    assert.equal(r.status, 502);
    assert.equal(aufrufe.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

// --- Zeitueberschreitung bei WF-4 (21.10.: n8n schrieb nach dem Abbruch trotzdem) ---
// schreibt: Liste je POST-Aufruf, 'haengt' = keine Antwort bis zum Abbruch. sheet: was der Read-Webhook liefert.
async function mitLangsamemWf4(schreibt, sheet, fn) {
  const aufrufe = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, optionen) => {
    if (optionen.method === 'GET') {
      return new Response(JSON.stringify({ ok: true, leads: sheet.leads, activities: sheet.activities, audits: [] }));
    }
    const payload = JSON.parse(optionen.body);
    aufrufe.push(payload);
    const art = schreibt[aufrufe.length - 1] || 'ok';
    if (art === 'haengt' || art === 'haengt-schreibt') {
      // haengt-schreibt: n8n speichert, die Antwort kommt aber nie an
      if (art === 'haengt-schreibt' && payload.aktion === 'create') sheet.leads.push({ ...payload.lead, lead_id: payload.lead_id, status: 'neu' });
      return new Promise((_ok, abbruch) => optionen.signal.addEventListener('abort', () => abbruch(new Error('abort'))));
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    return { r: await fn(), aufrufe };
  } finally {
    globalThis.fetch = original;
  }
}
const langsamEnv = {
  ...env, CRM_WRITE_TIMEOUT_MS: '20', CRM_NACHLESE_PAUSE_MS: '0',
  CRM_READ_WEBHOOK_URL: 'https://n8n.example.org/webhook/read', CRM_READ_WEBHOOK_TOKEN: 't',
};
const langsamKontext = () => ({ request: new Request('https://crm.example.org/api/agent/lead'), env: langsamEnv });

test('Zeitueberschreitung beim Anlegen: Lead steht im Sheet, Folgeschritte laufen weiter', async () => {
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const sheet = { leads: [...leereDaten.leads], activities: [] };
  const { r, aufrufe } = await mitLangsamemWf4(['haengt-schreibt'], sheet, () => leadAnlegen(langsamKontext(),
    { ...neuerLead, phase: 'angebot', faellig_am: '2026-10-28' }, leereDaten, '2026-10-21'));
  const body = await r.json();
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.equal(aufrufe.filter((a) => a.aktion === 'create').length, 1, 'nie zweimal anlegen');
  assert.deepEqual(body.geschrieben, ['create', 'status', 'next_action', 'next_action_at']);
});

test('Zeitueberschreitung beim Anlegen ohne Lead im Sheet: 504, angelegt unklar, kein zweites create', async () => {
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const { r, aufrufe } = await mitLangsamemWf4(['haengt'], { leads: [...leereDaten.leads], activities: [] },
    () => leadAnlegen(langsamKontext(), neuerLead, leereDaten, '2026-10-21'));
  const body = await r.json();
  assert.equal(r.status, 504);
  assert.equal(body.angelegt, 'unklar');
  assert.match(body.message, /NICHT sofort erneut/);
  assert.equal(aufrufe.length, 1);
});

test('Gescheiterte Notiz beim Anlegen wird gemeldet statt verschluckt', async () => {
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const { r } = await mitWf4([[200, { ok: true }], [200, { ok: true }], [200, { ok: true }], [200, { ok: true }],
    [500, { ok: false }]], () => leadAnlegen(
    kontext(), { ...neuerLead, phase: 'angebot', faellig_am: '2026-10-28', notiz: 'x' }, leereDaten, '2026-10-21'));
  const body = await r.json();
  assert.equal(body.ok, false);
  assert.equal(body.angelegt, true);
  assert.match(body.message, /notiz_anhaengen/);
  assert.deepEqual(body.schon_geschrieben, ['create', 'status', 'next_action', 'next_action_at']);
});

test('Leere Lead-Liste gilt als Lesefehler, nicht als "keine Dublette"', async () => {
  const { leadAnlegen } = await import('../functions/lib/agent.js');
  const { r, aufrufe } = await mitWf4([], () => leadAnlegen(
    kontext(), neuerLead, { leads: [], activities: [] }, '2026-10-21'));
  assert.equal(r.status, 502);
  assert.equal(aufrufe.length, 0);
});

test('Zeitueberschreitung bei Phase setzen: Wert steht im Sheet, gilt als geschrieben', async () => {
  const sheet = { leads: [{ lead_id: 'L-1', status: 'angebot', next_action_at: '2026-11-02' }], activities: [] };
  const { r } = await mitLangsamemWf4(['haengt', 'ok'], sheet, () => phaseSetzen(langsamKontext(), {
    lead_id: 'L-1', phase: 'angebot', erwartete_phase: 'termin', faellig_am: '2026-11-02',
  }));
  assert.equal(r.status, 200, JSON.stringify(r));
});

test('Leere Leseantwort wird neu gelesen: Eingang findet die Kennung beim zweiten Lesen', async () => {
  const { mitDaten } = await import('../functions/lib/agent-route.js');
  const { eingangVermerken } = await import('../functions/lib/agent.js');
  const lead = { lead_id: 'L-1', firma: 'Schreiber', status: 'fragebogen_raus', vb_kennung: 'K-1' };
  let lesungen = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, optionen) => {
    if (optionen.method === 'GET') {
      lesungen += 1;
      return new Response(JSON.stringify({ ok: true, leads: lesungen === 1 ? [] : [lead], activities: [], audits: [] }));
    }
    return new Response(JSON.stringify({ ok: true }));
  };
  try {
    const context = {
      request: new Request('https://crm.example.org/api/agent/vorbereitung/eingang', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kennung: 'K-1' }),
      }),
      env: langsamEnv, data: { accessIdentity: { service: true } },
    };
    const r = await mitDaten(context, eingangVermerken);
    assert.equal(r.status, 200);
    assert.equal(lesungen, 2);
  } finally {
    globalThis.fetch = original;
  }
});
