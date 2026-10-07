import assert from 'node:assert/strict';
import test from 'node:test';

import {
  datumLang, eingangVermerken, erinnerungenFaellig, erinnerungsMail, erinnerungVermerken,
  heuteBerlin, vorbereitungVermerken,
} from '../functions/lib/agent.js';
import { validateWritePayload } from '../functions/lib/validation.js';

const env = { CRM_WEBHOOK_URL: 'https://n8n.example.org/webhook/crm', CRM_WEBHOOK_TOKEN: 't' };
const kontext = () => ({ request: new Request('https://crm.example.org/api/agent/vorbereitung'), env });

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

const basis = {
  lead_id: 'L-1', firma: 'Muster GmbH', ansprechpartner: 'Tom Muster', anrede: 'du',
  mail: 'tom@muster.de', status: 'fragebogen_raus', vb_kennung: 'MUSTER-2026-10-20',
  vb_link: 'https://360-ai.org/vorbereitung#t=abc', vb_mail: 'tom@muster.de', vb_begruessung: '',
  vb_frist: '2026-10-16', vb_termin: '2026-10-20', vb_versand_am: '2026-10-06',
  vb_erinnert_am: '', vb_eingang_am: '',
};

test('heuteBerlin rechnet in deutscher Zeit, nicht in UTC', () => {
  assert.equal(heuteBerlin(new Date('2026-10-06T22:30:00Z')), '2026-10-07');
  assert.equal(heuteBerlin(new Date('2026-10-06T21:30:00Z')), '2026-10-06');
  assert.equal(datumLang('2026-10-16'), 'Freitag, 16.10.2026');
});

test('Erinnerung ist ab 3 Tagen vor der Frist bis zur Frist faellig, nicht vorher und nicht danach', () => {
  const ids = (heute) => erinnerungenFaellig([basis], heute).map((x) => x.lead_id);
  assert.deepEqual(ids('2026-10-12'), []);
  assert.deepEqual(ids('2026-10-13'), ['L-1']);
  assert.deepEqual(ids('2026-10-15'), ['L-1']); // ausgefallener Lauf wird nachgeholt
  assert.deepEqual(ids('2026-10-16'), ['L-1']);
  assert.deepEqual(ids('2026-10-17'), []);
});

test('Keine Erinnerung nach Eingang, nach schon erfolgter Erinnerung oder in anderer Phase', () => {
  const heute = '2026-10-13';
  for (const abweichung of [
    { vb_eingang_am: '2026-10-10' }, { vb_erinnert_am: '2026-10-13' }, { status: 'fragebogen_da' },
    { status: 'termin' }, { archiviert_am: '2026-10-01' }, { vb_link: '' },
  ]) {
    assert.equal(erinnerungenFaellig([{ ...basis, ...abweichung }], heute).length, 0, JSON.stringify(abweichung));
  }
});

test('Ohne Frist zaehlt der Termin, ohne beides gibt es keine Erinnerung', () => {
  assert.equal(erinnerungenFaellig([{ ...basis, vb_frist: '' }], '2026-10-17').length, 1);
  assert.equal(erinnerungenFaellig([{ ...basis, vb_frist: '', vb_termin: '' }], '2026-10-17').length, 0);
});

test('Kurze Frist: unter 5 Tagen Laufzeit erst 1 Tag vor der Frist, unter 2 Tagen gar nicht', () => {
  const fuenf = { ...basis, vb_versand_am: '2026-10-11' };
  assert.equal(erinnerungenFaellig([fuenf], '2026-10-13').length, 1, '5 Tage: normal 3 Tage vorher');
  const vier = { ...basis, vb_versand_am: '2026-10-12' };
  assert.equal(erinnerungenFaellig([vier], '2026-10-13').length, 0, '4 Tage: nicht 3 Tage vorher');
  assert.equal(erinnerungenFaellig([vier], '2026-10-14').length, 0);
  assert.equal(erinnerungenFaellig([vier], '2026-10-15').length, 1, '4 Tage: 1 Tag vorher');
  assert.equal(erinnerungenFaellig([vier], '2026-10-16').length, 1, 'Nachholen am Fristtag');
  const zwei = { ...basis, vb_versand_am: '2026-10-14' };
  assert.equal(erinnerungenFaellig([zwei], '2026-10-15').length, 1, '2 Tage: 1 Tag vorher');
  const eins = { ...basis, vb_versand_am: '2026-10-15' };
  assert.equal(erinnerungenFaellig([eins], '2026-10-15').length, 0, '1 Tag: keine');
  assert.equal(erinnerungenFaellig([eins], '2026-10-16').length, 0);
});

test('Erinnerungsplan nennt Datum oder Grund', async () => {
  const { erinnerungsPlan } = await import('../functions/lib/agent.js');
  assert.deepEqual(erinnerungsPlan('2026-10-16', '', '2026-10-06'), { erinnerung_am: '2026-10-13', erinnerung_grund: '' });
  assert.equal(erinnerungsPlan('2026-10-09', '', '2026-10-06').erinnerung_am, '2026-10-08');
  assert.equal(erinnerungsPlan('2026-10-07', '', '2026-10-06').erinnerung_am, '');
  assert.match(erinnerungsPlan('2026-10-07', '', '2026-10-06').erinnerung_grund, /weniger als 2 Tage/);
  assert.match(erinnerungsPlan('', '', '2026-10-06').erinnerung_grund, /keine Frist/);
  assert.equal(erinnerungsPlan('', '2026-10-20', '2026-10-06').erinnerung_am, '2026-10-17');
});

test('Erinnerungsmail: Du und Sie, Link, Frist, Signatur, keine Gedankenstriche', () => {
  const du = erinnerungsMail(basis);
  assert.equal(du.an, 'tom@muster.de');
  assert.match(du.text, /^Hallo Tom,\n/);
  assert.match(du.text, /bis Freitag, 16\.10\.2026 abschickst/);
  assert.match(du.text, /Termin am Dienstag, 20\.10\.2026/);
  assert.ok(du.text.includes(basis.vb_link));
  assert.match(du.text, /Denis Schmidt\n360ai \| KI-Beratung/);

  const sie = erinnerungsMail({ ...basis, anrede: 'sie' });
  assert.match(sie.text, /^Guten Tag Tom Muster,\n/);
  assert.match(sie.text, /Wenn Sie sie bis/);
  assert.doesNotMatch(sie.text, /\bdu\b|\bdich\b/);

  const eigen = erinnerungsMail({ ...basis, vb_begruessung: 'Hallo Tom, hallo Leon,' });
  assert.match(eigen.text, /^Hallo Tom, hallo Leon,\n/);
  for (const m of [du, sie, eigen]) assert.doesNotMatch(m.text + m.betreff, /[–—]/);
});

test('Neue Felder sind schreibbar und werden geprueft', () => {
  const ok = (feld, wert) => validateWritePayload({ lead_id: 'L-1', feld, wert, erwarteter_status: 'termin' }).ok;
  assert.ok(ok('vb_kennung', 'REITTER-2026-10-09'));
  assert.ok(!ok('vb_kennung', 'mit leerzeichen'));
  assert.ok(ok('vb_link', 'https://360-ai.org/vorbereitung#t=x'));
  assert.ok(!ok('vb_link', 'http://360-ai.org/x'));
  assert.ok(ok('vb_frist', ''));
  assert.ok(!ok('vb_frist', '16.10.2026'));
  assert.ok(!ok('vb_mail', 'kaputt'));
});

test('Versand vermerken: Phase vorwaerts, Felder, Wiedervorlage auf Frist, Notiz', async () => {
  const lead = { ...basis, status: 'qualifiziert', vb_kennung: '', anrede: 'sie' };
  const { r, aufrufe } = await mitWf4([], () => vorbereitungVermerken(kontext(), {
    lead_id: 'L-1', kennung: 'MUSTER-2026-10-20', link: basis.vb_link, mail: 'tom@muster.de',
    anrede: 'du', frist: '2026-10-16', termin: '2026-10-20',
  }, { leads: [lead] }, '2026-10-06'));
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.phase, 'fragebogen_raus');
  assert.equal(body.erinnerung_am, '2026-10-13');
  assert.deepEqual(aufrufe[0], {
    aktion: 'update', lead_id: 'L-1', feld: 'status', wert: 'fragebogen_raus',
    erwarteter_status: 'qualifiziert', ruecksprung_bestaetigt: false,
  });
  const gesetzt = Object.fromEntries(aufrufe.filter((a) => a.feld).map((a) => [a.feld, a.wert]));
  assert.equal(gesetzt.vb_versand_am, '2026-10-06');
  assert.equal(gesetzt.next_action_at, '2026-10-16');
  assert.equal(gesetzt.anrede, 'du');
  assert.equal(gesetzt.vb_erinnert_am, '');
  assert.ok(aufrufe.slice(1).filter((a) => a.feld).every((a) => a.erwarteter_status === 'fragebogen_raus'));
  assert.equal(aufrufe.at(-1).aktion, 'notiz');
});

test('Versand vermerken: vergebene Kennung und kaputtes Datum werden vor jedem Schreiben abgelehnt', async () => {
  const daten = { leads: [{ ...basis, status: 'qualifiziert', vb_kennung: '' }, { ...basis, lead_id: 'L-2' }] };
  const { r, aufrufe } = await mitWf4([], async () => [
    await vorbereitungVermerken(kontext(), { lead_id: 'L-1', kennung: basis.vb_kennung, link: basis.vb_link }, daten),
    await vorbereitungVermerken(kontext(), { lead_id: 'L-1', kennung: 'NEU', link: basis.vb_link, frist: '16.10.' }, daten),
    await vorbereitungVermerken(kontext(), { lead_id: 'L-9', kennung: 'NEU', link: basis.vb_link }, daten),
  ]);
  assert.deepEqual(r.map((x) => x.status), [409, 400, 404]);
  assert.equal(aufrufe.length, 0);
});

test('Versand bei Lead, der schon weiter ist: keine Ruecksetzung der Phase', async () => {
  const lead = { ...basis, status: 'termin', vb_kennung: '' };
  const { aufrufe } = await mitWf4([], () => vorbereitungVermerken(kontext(), {
    lead_id: 'L-1', kennung: 'NEU', link: basis.vb_link,
  }, { leads: [lead] }));
  assert.ok(!aufrufe.some((a) => a.feld === 'status'));
});

test('Eingang: erste Fassung setzt Fragebogen da und Termin, zweite nur Notiz', async () => {
  const erst = await mitWf4([], () => eingangVermerken(kontext(), {
    kennung: basis.vb_kennung, fassung: 1, kurzfassung: 'Drei Ablaeufe, Engpass Angebote.',
  }, { leads: [basis] }, '2026-10-12'));
  const body = await erst.r.json();
  assert.equal(body.erneut, false);
  assert.equal(body.lead.phase, 'fragebogen_da');
  assert.equal(body.lead.mail, 'tom@muster.de');
  const gesetzt = Object.fromEntries(erst.aufrufe.filter((a) => a.feld).map((a) => [a.feld, a.wert]));
  assert.equal(gesetzt.status, 'fragebogen_da');
  assert.equal(gesetzt.vb_eingang_am, '2026-10-12');
  assert.equal(gesetzt.next_action_at, '2026-10-20');
  assert.match(erst.aufrufe.at(-1).wert, /Fragebogen da \(MUSTER-2026-10-20, Fassung 1\)\.\nDrei/);

  const zweit = await mitWf4([], () => eingangVermerken(kontext(), {
    kennung: basis.vb_kennung, fassung: 2,
  }, { leads: [{ ...basis, status: 'fragebogen_da', vb_eingang_am: '2026-10-12' }] }));
  assert.equal((await zweit.r.json()).erneut, true);
  assert.deepEqual(zweit.aufrufe.map((a) => a.aktion), ['notiz']);
  assert.match(zweit.aufrufe[0].wert, /ersetzt die vorige/);
});

test('Eingang mit unbekannter Kennung meldet 404 statt abzubrechen', async () => {
  const { r, aufrufe } = await mitWf4([], () => eingangVermerken(kontext(), { kennung: 'GIBTS-NICHT' }, { leads: [basis] }));
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'unbekannte_kennung');
  assert.equal(aufrufe.length, 0);
});

test('Erinnerung vermerken setzt das Datum und eine Notiz', async () => {
  const { r, aufrufe } = await mitWf4([], () => erinnerungVermerken(kontext(), { lead_id: 'L-1' }, { leads: [basis] }, '2026-10-13'));
  assert.equal((await r.json()).erinnert_am, '2026-10-13');
  assert.equal(aufrufe[0].feld, 'vb_erinnert_am');
  assert.equal(aufrufe[0].wert, '2026-10-13');
  assert.equal(aufrufe[1].aktion, 'notiz');
});
