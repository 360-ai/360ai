import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STATUS_VALUES,
  activitiesForLead,
  argumentMetrics,
  asNumber,
  auditsForLead,
  dashboardMetrics,
  filterLeads,
  formatDate,
  formatDateTime,
  hasBrokenDate,
  isArchived,
  isBackwardTransition,
  isDue,
  isOverdue,
  kanbanColumns,
  leadDisplayName,
  mailHref,
  parseRouteHash,
  safeDriveUrl,
  safeHttpUrl,
  telHref,
  todayIso,
} from '../public/domain.js';

const offsetDay = (offset) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return todayIso(date);
};

test('Statusmodell enthaelt die sieben dokumentierten Pipeline-Stufen', () => {
  assert.deepEqual(STATUS_VALUES, [
    'neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen', 'beendet',
  ]);
});

test('Leads ohne Firma bleiben ueber Name oder Kontaktdaten erkennbar', () => {
  assert.equal(leadDisplayName({ ansprechpartner: 'Frau Beispiel', mail: 'info@example.org' }), 'Frau Beispiel');
  assert.equal(leadDisplayName({ mail: 'info@example.org' }), 'info@example.org');
  assert.equal(leadDisplayName({ telefon: '+49 123 456' }), '+49 123 456');
  assert.equal(leadDisplayName({ lead_id: 'L-1' }), 'L-1');
});

test('Faelligkeit schliesst terminale Leads aus', () => {
  assert.equal(isDue({ status: 'neu', next_action_at: offsetDay(0) }), true);
  assert.equal(isOverdue({ status: 'angebot', next_action_at: offsetDay(-1) }), true);
  assert.equal(isDue({ status: 'gewonnen', next_action_at: offsetDay(-2) }), false);
  assert.equal(isOverdue({ status: 'beendet', next_action_at: offsetDay(-2) }), false);
  assert.equal(isDue({ status: 'neu', next_action_at: '' }), false);
});

test('Lead-Filter kombiniert Suche, Status und Mindestscore ohne Eingabe zu mutieren', () => {
  const leads = [
    { lead_id: 'L-1', firma: 'Alpha Holz', ort: 'Marburg', status: 'neu', akquise_score: '82' },
    { lead_id: 'L-2', firma: 'Beta Bau', ort: 'Giessen', status: 'neu', akquise_score: 54 },
    { lead_id: 'L-3', firma: 'Gamma', mail: 'team@alpha.example', status: 'angebot', akquise_score: 90 },
  ];
  const result = filterLeads(leads, { search: 'ALPHA', status: 'neu', minScore: '75' });
  assert.deepEqual(result.map((lead) => lead.lead_id), ['L-1']);
  assert.deepEqual(leads.map((lead) => lead.lead_id), ['L-1', 'L-2', 'L-3']);
});

test('Faellige Leads werden vor zukuenftigen Leads und dann nach Datum sortiert', () => {
  const leads = [
    { lead_id: 'morgen', status: 'neu', next_action_at: offsetDay(1), akquise_score: 99 },
    { lead_id: 'heute', status: 'neu', next_action_at: offsetDay(0), akquise_score: 50 },
    { lead_id: 'gestern', status: 'neu', next_action_at: offsetDay(-1), akquise_score: 40 },
  ];
  assert.deepEqual(filterLeads(leads).map((lead) => lead.lead_id), ['gestern', 'heute', 'morgen']);
  assert.deepEqual(
    filterLeads(leads, { due: 'due' }).map((lead) => lead.lead_id),
    ['gestern', 'heute'],
  );
});

test('Argumentstatistik zaehlt ein Argument je Aktivitaet nur einmal', () => {
  const metrics = argumentMetrics([
    { verwendete_argumente: 'local, local; seo', ergebnis: 'zusage' },
    { verwendete_argumente: 'local', ergebnis: 'absage' },
    { verwendete_argumente: 'trust', ergebnis: 'zusage' },
  ]);
  assert.deepEqual(metrics, [
    { argument: 'seo', uses: 1, wins: 1, rate: 100 },
    { argument: 'trust', uses: 1, wins: 1, rate: 100 },
    { argument: 'local', uses: 2, wins: 1, rate: 50 },
  ]);
});

test('Dashboard berechnet Quote, Statussummen und Scores', () => {
  const metrics = dashboardMetrics([
    { status: 'gewonnen', akquise_score: 80 },
    { status: 'beendet', akquise_score: 0 },
    { status: 'neu', akquise_score: '60', next_action_at: offsetDay(0) },
  ], []);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.won, 1);
  assert.equal(metrics.successRate, 33);
  assert.equal(metrics.averageScore, 70);
  assert.equal(metrics.byStatus.gewonnen, 1);
  assert.equal(metrics.due, 1);
});

test('Aktivitaeten und Audits werden je Lead absteigend sortiert', () => {
  const rows = [
    { lead_id: 'L-1', datum: '2026-01-01' },
    { lead_id: 'L-2', datum: '2026-03-01' },
    { lead_id: 'L-1', datum: '2026-02-01' },
  ];
  assert.deepEqual(activitiesForLead(rows, 'L-1').map((row) => row.datum), [
    '2026-02-01', '2026-01-01',
  ]);
  assert.deepEqual(auditsForLead(rows, 'L-1').map((row) => row.datum), [
    '2026-02-01', '2026-01-01',
  ]);
});

test('Rueckwaertsspruenge und terminale Status werden erkannt', () => {
  assert.equal(isBackwardTransition('qualifiziert', 'analysiert'), true);
  assert.equal(isBackwardTransition('qualifiziert', 'angebot'), false);
  assert.equal(isBackwardTransition('qualifiziert', 'beendet'), false);
  assert.equal(isBackwardTransition('gewonnen', 'angebot'), true);
  assert.equal(isBackwardTransition('beendet', 'gewonnen'), true);
  assert.equal(isBackwardTransition('angebot', 'angebot'), false);
});

// Ein einziger unlesbarer Datumswert im Sheet legte frueher die gesamte App lahm.
test('Datumsanzeige wirft nie, auch nicht bei kaputten Sheet-Werten', () => {
  for (const wert of ['2026-13-01', '2026-00-10', '9999-99-99', '2026-02-30', '2026-04-31',
    '20.08.2026', 46264, '', null, undefined, 'morgen', {}]) {
    assert.doesNotThrow(() => formatDate(wert), 'formatDate(' + String(wert) + ')');
    assert.equal(formatDate(wert), '–', 'formatDate(' + String(wert) + ') muss zurueckfallen');
  }
  assert.equal(formatDate('2026-08-20'), '20. Aug. 2026');
  // Zeitstempel bleiben lesbar, der Kalendertag darf nicht kippen.
  assert.equal(formatDate('2026-08-20T23:30:00Z'), '20. Aug. 2026');
  assert.equal(formatDate('', 'Kein Termin'), 'Kein Termin');
  assert.doesNotThrow(() => formatDateTime('kaputt'));
  assert.equal(formatDateTime('kaputt'), '–');
});

// Google kann ein Datum als "20.08.2026" oder als Seriennummer zurueckliefern.
// Beides darf nicht als gueltiger Termin durchgehen.
test('Faelligkeit ignoriert Datumsformate, die nicht ISO sind', () => {
  const heute = todayIso();
  assert.equal(isDue({ next_action_at: heute, status: 'neu' }), true);
  for (const wert of ['20.08.2026', 46264, '08/20/2026', 'gestern']) {
    const lead = { next_action_at: wert, status: 'neu' };
    assert.equal(isDue(lead), false, String(wert) + ' darf nicht faellig sein');
    assert.equal(isOverdue(lead), false, String(wert) + ' darf nicht ueberfaellig sein');
    // Der Wert verschwindet nicht lautlos, sondern wird als unlesbar markiert.
    assert.equal(hasBrokenDate(lead), true, String(wert) + ' muss als unlesbar gelten');
  }
  assert.equal(hasBrokenDate({ next_action_at: heute }), false);
  assert.equal(hasBrokenDate({ next_action_at: '' }), false);
});

test('Archivierte Leads verschwinden aus Arbeitsansichten und Kennzahlen', () => {
  const leads = [
    { lead_id: 'A', status: 'neu', akquise_score: 80 },
    { lead_id: 'B', status: 'neu', akquise_score: 70, archiviert_am: '2026-08-01' },
  ];
  assert.equal(isArchived(leads[1]), true);
  assert.deepEqual(filterLeads(leads, {}).map((l) => l.lead_id), ['A']);
  assert.deepEqual(filterLeads(leads, { archiv: 'nur' }).map((l) => l.lead_id), ['B']);
  const metrics = dashboardMetrics(leads, []);
  assert.equal(metrics.total, 1);
  assert.equal(metrics.archiviert, 1);
  assert.equal(isDue({ next_action_at: todayIso(), status: 'neu', archiviert_am: '2026-08-01' }), false);
});

// Frueher fielen Leads mit unbekanntem Status lautlos aus dem Kanban,
// wurden in der Kopfzeile aber weiter mitgezaehlt.
test('Kanban zeigt auch Leads ohne gueltigen Status', () => {
  const leads = [
    { lead_id: 'A', status: 'neu', akquise_score: 10 },
    { lead_id: 'B', status: '', akquise_score: 20 },
    { lead_id: 'C', status: 'Neu', akquise_score: 30 },
    { lead_id: 'D', status: 'neu ', akquise_score: 40 },
    { lead_id: 'E', akquise_score: 50 },
    { lead_id: 'F', status: 'neu', archiviert_am: '2026-08-01' },
  ];
  const spalten = kanbanColumns(leads);
  const sichtbar = spalten.flatMap((spalte) => spalte.leads.map((lead) => lead.lead_id));
  assert.deepEqual(sichtbar.sort(), ['A', 'B', 'C', 'D', 'E']);
  const waisen = spalten.find((spalte) => spalte.value === 'ohne-status');
  assert.equal(waisen.ablegbar, false);
  assert.deepEqual(waisen.leads.map((lead) => lead.lead_id), ['E', 'D', 'C', 'B']);
  assert.equal(dashboardMetrics(leads, []).ohneStatus, 4);
});

test('Telefon- und Mail-Links bleiben waehlbar und lassen sich nicht erweitern', () => {
  assert.equal(telHref('+49 170 1234567'), 'tel:+491701234567');
  assert.equal(telHref('06451 / 71 20 0'), 'tel:0645171200');
  assert.equal(telHref(''), null);
  assert.equal(telHref('kein Anschluss'), null);
  assert.equal(mailHref('info@firma.de'), 'mailto:info@firma.de');
  assert.equal(mailHref('a+b@firma.de'), 'mailto:a+b@firma.de');
  // Kein Anhaengen fremder Kopfzeilen ueber die Adresse.
  assert.equal(mailHref('a@b.de?bcc=fremd@x.de'), null);
  assert.equal(mailHref('kein-at-zeichen'), null);
});

test('Zahlen aus dem Sheet werden auch mit Dezimalkomma gelesen', () => {
  assert.equal(asNumber('82,5'), 82.5);
  assert.equal(asNumber('82.5'), 82.5);
  assert.equal(asNumber(''), 0);
  assert.equal(asNumber('keine Zahl'), 0);
});

test('URLs werden strikt auf sichere Protokolle und den Drive-Host begrenzt', () => {
  assert.equal(safeHttpUrl('https://example.org/a'), 'https://example.org/a');
  assert.equal(safeHttpUrl('http://example.org'), 'http://example.org/');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(
    safeDriveUrl('https://drive.google.com/drive/folders/abc'),
    'https://drive.google.com/drive/folders/abc',
  );
  assert.equal(safeDriveUrl('https://accounts.google.com/'), null);
  assert.equal(safeDriveUrl('https://drive.google.com.evil.example/drive/folders/abc'), null);
  assert.equal(safeDriveUrl('http://drive.google.com/drive/folders/abc'), null);
});

test('Hash-Routing faellt bei unbekannten und ungueltig codierten Hashes sicher zurueck', () => {
  assert.deepEqual(parseRouteHash(''), { view: 'dashboard' });
  assert.deepEqual(parseRouteHash('#kanban'), { view: 'kanban' });
  assert.deepEqual(parseRouteHash('#lead/L-DEMO-001'), { view: 'detail', leadId: 'L-DEMO-001' });
  assert.deepEqual(parseRouteHash('#lead/L%20A'), { view: 'detail', leadId: 'L A' });
  assert.deepEqual(parseRouteHash('#lead/%E0%A4%A'), { view: 'leads' });
  assert.deepEqual(parseRouteHash('#nicht-vorhanden'), { view: 'dashboard' });
});
