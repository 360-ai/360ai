import assert from 'node:assert/strict';
import test from 'node:test';

import { EDITABLE_FIELDS, validateWritePayload } from '../functions/lib/validation.js';

const valid = (overrides = {}) => ({
  lead_id: 'L-2026-001',
  feld: 'notiz',
  wert: 'Rueckruf am Freitag',
  erwarteter_status: 'qualifiziert',
  ...overrides,
});

test('CRM- und Stammdatenfelder sind editierbar, berechnete Felder nicht', () => {
  assert.deepEqual([...EDITABLE_FIELDS], [
    'status', 'notiz', 'ende_grund', 'wiedervorlage_am', 'next_action', 'next_action_at',
    'firma', 'ansprechpartner', 'strasse', 'ort', 'branche',
    'telefon', 'handy', 'mail', 'website', 'anrede', 'kontaktquelle',
  ]);
  // Scores und Drive-Verweise bleiben der Analyse vorbehalten.
  for (const feld of ['website_score', 'akquise_score', 'berichte_drive_url', 'lead_id']) {
    const result = validateWritePayload(valid({ feld, wert: '100' }));
    assert.equal(result.ok, false, feld + ' darf nicht editierbar sein');
    assert.equal(result.error, 'field_not_allowed');
  }
});

test('gueltige Nutzlast wird normalisiert und Zusatzfelder werden entfernt', () => {
  const result = validateWritePayload(valid({
    lead_id: ' L-2026_001 ',
    feld: 'next_action',
    wert: ' termin ',
    admin: true,
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    aktion: 'update',
    lead_id: 'L-2026_001',
    feld: 'next_action',
    wert: 'termin',
    erwarteter_status: 'qualifiziert',
    ruecksprung_bestaetigt: false,
  });
});

test('Stammdaten werden je Feldtyp geprueft', () => {
  const gueltig = [
    ['firma', 'Muster GmbH & Co. KG'],
    ['strasse', 'Hauptstraße 5a'],
    ['telefon', '06451 / 71 20 0'],
    ['handy', '+49 170 1234567'],
    ['mail', 'info@muster-gmbh.de'],
    ['website', 'https://muster-gmbh.de'],
    ['anrede', 'du'],
    ['kontaktquelle', 'empfehlung'],
    ['handy', ''],
  ];
  for (const [feld, wert] of gueltig) {
    const result = validateWritePayload(valid({ feld, wert }));
    assert.equal(result.ok, true, feld + '=' + wert + ' sollte gueltig sein');
  }
  const ungueltig = [
    ['mail', 'kein-at-zeichen', 'invalid_mail'],
    ['mail', 'a@b.de?bcc=fremd@x.de', 'invalid_mail'],
    ['telefon', '0645 abc', 'invalid_telefon'],
    ['website', 'javascript:alert(1)', 'invalid_website'],
    ['website', 'muster.de', 'invalid_website'],
    ['anrede', 'ihr', 'invalid_anrede'],
    ['kontaktquelle', 'messe', 'invalid_kontaktquelle'],
    ['firma', 'x'.repeat(201), 'value_too_long'],
  ];
  for (const [feld, wert, error] of ungueltig) {
    const result = validateWritePayload(valid({ feld, wert }));
    assert.equal(result.ok, false, feld + '=' + wert + ' sollte abgelehnt werden');
    assert.equal(result.error, error, feld + '=' + wert);
  }
});

test('Anlegen verlangt ein Erkennungsmerkmal und liefert saubere Stammdaten', () => {
  const leer = validateWritePayload({
    aktion: 'create', lead_id: 'L-20260820-test', lead: { ort: 'Frankenberg' },
  });
  assert.equal(leer.ok, false);
  assert.equal(leer.error, 'identity_required');

  const ok = validateWritePayload({
    aktion: 'create',
    lead_id: 'L-20260820-muster',
    lead: { firma: '  Muster GmbH  ', mail: 'info@muster.de', unbekannt: 'wird verworfen' },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.lead.firma, 'Muster GmbH');
  assert.equal('unbekannt' in ok.value.lead, false);
  assert.equal(ok.value.lead.handy, '');
});

test('Archivieren und Notiz-Verlauf sind eigene Aktionen', () => {
  const archiv = validateWritePayload({ aktion: 'archivieren', lead_id: 'L-1' });
  assert.equal(archiv.ok, true);
  assert.deepEqual(archiv.value, { aktion: 'archivieren', lead_id: 'L-1' });

  const notiz = validateWritePayload({ aktion: 'notiz', lead_id: 'L-1', wert: '  Angerufen  ' });
  assert.equal(notiz.ok, true);
  assert.equal(notiz.value.wert, 'Angerufen');

  assert.equal(validateWritePayload({ aktion: 'notiz', lead_id: 'L-1', wert: '   ' }).error,
    'value_required');
  assert.equal(validateWritePayload({ aktion: 'loeschen', lead_id: 'L-1' }).error, 'invalid_aktion');
});

test('Notiz behaelt bewusst Leerzeichen, ist aber auf 5000 Zeichen begrenzt', () => {
  const result = validateWritePayload(valid({ wert: '  wichtige Notiz\n' }));
  assert.equal(result.ok, true);
  assert.equal(result.value.wert, '  wichtige Notiz\n');
  const tooLong = validateWritePayload(valid({ wert: 'x'.repeat(5001) }));
  assert.equal(tooLong.error, 'value_too_long');
});

test('Lead-ID muss kurz und frei von Steuer- oder Pfadzeichen sein', () => {
  for (const lead_id of ['', '../secret', 'L id', 'x'.repeat(101), '<script>']) {
    assert.equal(validateWritePayload(valid({ lead_id })).error, 'invalid_lead_id');
  }
  assert.equal(validateWritePayload(valid({ lead_id: 'L.a_b-9' })).ok, true);
});

test('Statusaenderung verlangt gueltigen Ziel- und Erwartungsstatus', () => {
  assert.equal(validateWritePayload(valid({
    feld: 'status', wert: 'angebot', erwarteter_status: 'qualifiziert',
  })).ok, true);
  assert.equal(validateWritePayload(valid({
    feld: 'status', wert: 'kunde', erwarteter_status: 'qualifiziert',
  })).error, 'invalid_status');
  assert.equal(validateWritePayload(valid({
    feld: 'status', wert: 'angebot', erwarteter_status: '',
  })).error, 'expected_status_required');
});

test('Datumsfelder akzeptieren nur echte ISO-Kalendertage oder leer', () => {
  for (const wert of ['', '2024-02-29', '2026-12-31']) {
    assert.equal(validateWritePayload(valid({ feld: 'next_action_at', wert })).ok, true);
  }
  for (const wert of ['2025-02-29', '2026-13-01', '16.08.2026', '2026-01-01T10:00:00Z']) {
    assert.equal(validateWritePayload(valid({ feld: 'wiedervorlage_am', wert })).error, 'invalid_date');
  }
});

test('Abschlussgruende und Aktionen sind auf definierte Werte begrenzt', () => {
  assert.equal(validateWritePayload(valid({ feld: 'ende_grund', wert: 'kein_bedarf' })).ok, true);
  assert.equal(validateWritePayload(valid({ feld: 'ende_grund', wert: 'sonstiges' })).error, 'invalid_ende_grund');
  assert.equal(validateWritePayload(valid({ feld: 'next_action', wert: 'angebot_erstellen' })).ok, true);
  assert.equal(validateWritePayload(valid({ feld: 'next_action', wert: 'delete_all' })).error, 'invalid_next_action');
});

test('ungueltige Body-Typen werden abgelehnt', () => {
  for (const body of [null, [], 'text', 12]) {
    assert.equal(validateWritePayload(body).error, 'invalid_body');
  }
});
