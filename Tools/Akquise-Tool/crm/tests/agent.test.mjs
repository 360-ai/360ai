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
