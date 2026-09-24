// Regressionstests der Rule Engine gegen eingefrorene Fixtures.
//
// Positivfaelle: Was im Handaudit steht, muss die Engine eigenstaendig finden.
// Negativfall:   Eine von 360ai gebaute Seite darf die dort geloesten Punkte
//                nicht als Maengel melden. Ohne diesen Test misst man nur die
//                Trefferquote, nicht die Falschalarmquote.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auswerten, ALLE_REGELN, score, finalisiereScore, complianceAmpel } from '../rules/engine.mjs';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const laden = (name) => JSON.parse(readFileSync(path.join(wurzel, 'fixtures', name, 'facts.json'), 'utf8'));
const branchen = JSON.parse(readFileSync(path.join(wurzel, 'scoring', 'branchen.json'), 'utf8'));
const profil = (f) => branchen[f.meta?.branche] ?? branchen._default;

const ergebnisse = (r) => Object.fromEntries(r.findings.map((f) => [f.rule_id, f.ergebnis]));
const befund = (r, id) => r.findings.find((f) => f.rule_id === id);

// --- Aufbau des Regelwerks ------------------------------------------------

test('Regel-IDs sind eindeutig', () => {
  const ids = ALLE_REGELN.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'doppelte Regel-ID');
});

test('Jede Regel traegt Pflichtangaben', () => {
  for (const r of ALLE_REGELN) {
    assert.ok(r.id && r.name && r.gruppe, `unvollstaendig: ${r.id}`);
    assert.equal(typeof r.messung, 'string', `${r.id} ohne Messbeschreibung`);
    assert.equal(typeof r.pruefe, 'function', `${r.id} ohne Pruefung`);
  }
});

test('Keine Regel enthaelt eine rechtliche Schlussfolgerung', () => {
  // Der Collector stellt fest, dass etwas vorkommt. Ob daraus ein Verstoss folgt,
  // entscheidet dieses System nicht.
  for (const r of ALLE_REGELN) {
    assert.equal(r.abmahnrelevant, undefined, `${r.id} trifft eine rechtliche Wertung`);
  }
});

test('Compliance-Regeln fliessen in keine Score-Achse', () => {
  for (const r of ALLE_REGELN.filter((x) => x.gruppe === 'compliance')) {
    assert.ok(!r.achse, `${r.id} haengt an einer Score-Achse`);
    assert.ok(r.compliance_signal, `${r.id} ohne compliance_signal`);
  }
});

test('Experimentelle Regeln haben Gewicht 0 und sind nie kundentexttauglich', () => {
  for (const r of ALLE_REGELN.filter((x) => x.gruppe === 'experimentell')) {
    assert.equal(r.gewicht, 0, `${r.id} hat Gewicht`);
    assert.equal(r.kundentext_erlaubt, false, `${r.id} darf nicht in den Kundentext`);
  }
});

// --- Positivfall Helfri ---------------------------------------------------

test('Helfri: die Befunde des Handaudits werden eigenstaendig gefunden', () => {
  const facts = laden('helfri');
  const r = auswerten(facts, profil(facts));
  const e = ergebnisse(r);

  const erwartetFail = {
    'LOC-01': 'keine anwaehlbare Telefonnummer',
    'SEO-03': 'Meta-Description fehlt durchgehend',
    'SEO-10': 'automatisch vergebene URLs wie /324-2/',
    'SEO-12': 'keine OpenGraph-Angaben',
    'AIR-01': 'keine strukturierten Unternehmensdaten',
    'AIR-07': 'mehrere Firmierungen',
    'AIR-08': 'Inhaltsstand 2020',
    'MOB-02': 'Zoom auf dem Handy gesperrt',
    'TEC-08': 'kein WebP',
    'TEC-09': 'ueberdimensionierte Bilder',
    'CMP-02': 'Impressum nennt TMG statt DDG',
    'CMP-03': 'Handwerkskammer-Angaben fehlen',
  };
  for (const [id, was] of Object.entries(erwartetFail)) {
    assert.equal(e[id], 'FAIL', `${id} (${was}) lieferte ${e[id]}`);
  }
});

test('Helfri: die im Handaudit gelobten Punkte loesen keinen Mangel aus', () => {
  const facts = laden('helfri');
  const r = auswerten(facts, profil(facts));
  const e = ergebnisse(r);

  // Aus dem Handaudit: Schriften lokal, Einwilligungsbanner blockiert, HTTPS aktiv.
  assert.equal(e['CMP-09'], 'PASS', 'Schriften werden lokal ausgeliefert');
  assert.equal(e['CMP-06'], 'PASS', 'vor Einwilligung keine Fremdserver');
  assert.equal(e['TEC-01'], 'PASS', 'HTTPS aktiv');
  assert.equal(e['LOC-03'], 'PASS', 'Adresse ist einheitlich - dieser Befund war ein Fehlalarm');
});

test('Helfri: die Kammer-Pruefung greift nur ueber das Branchenprofil', () => {
  const facts = laden('helfri');
  const mitHandwerk = auswerten(facts, branchen.bauunternehmen);
  const ohneHandwerk = auswerten(facts, branchen.industrie_b2b);
  assert.equal(befund(mitHandwerk, 'CMP-03').ergebnis, 'FAIL');
  assert.notEqual(befund(ohneHandwerk, 'CMP-03').wert?.fehlend?.includes('kammer'), true);
});

// --- Positivfall Bravo (Single-Page-Anwendung) ----------------------------

test('Bravo: fehlende Rechtstexte und Vorlagenreste werden gefunden', () => {
  const facts = laden('bravo');
  const r = auswerten(facts, profil(facts));
  const e = ergebnisse(r);

  assert.equal(e['CMP-05'], 'FAIL', 'keine Datenschutzerklaerung');
  assert.equal(e['CMP-10'], 'FAIL', 'unausgefuellter Platzhalter im Impressum');
  assert.equal(e['AIR-09'], 'FAIL', 'Inhalt entsteht erst im Browser');
  assert.equal(r.compliance.ampel, 'kritischer_hinweis');
});

test('Bravo: die Hash-Routen der Anwendung werden als Seiten erfasst', () => {
  const facts = laden('bravo');
  const rollen = facts.meta.pages_checked.map((p) => p.rolle);
  assert.ok(rollen.includes('impressum'), `Impressum nicht erfasst: ${rollen.join(', ')}`);
  assert.ok(facts.meta.pages_checked.length >= 3, 'zu wenige Seiten erfasst');
});

// --- Negativfall: eigene Referenzseite ------------------------------------

test('Referenzseite: geloeste Punkte werden nicht als Mangel gemeldet', () => {
  const facts = laden('sauber');
  const r = auswerten(facts, profil(facts));
  const e = ergebnisse(r);

  // Diese Punkte sind auf einer von 360ai gebauten Seite bewusst geloest.
  // Jeder FAIL hier waere ein Fehlalarm.
  const darfNichtFehlschlagen = [
    'TEC-01', 'TEC-02', 'TEC-04', 'TEC-06', 'TEC-07', 'TEC-08',
    'MOB-01', 'MOB-02', 'MOB-03', 'MOB-05',
    'SEO-01', 'SEO-03', 'SEO-04', 'SEO-07', 'SEO-08', 'SEO-10', 'SEO-11', 'SEO-12',
    'LOC-01', 'LOC-02', 'LOC-03', 'LOC-05', 'LOC-08',
    'AIR-01', 'AIR-04', 'AIR-07', 'AIR-08', 'AIR-09',
    'CMP-01', 'CMP-05', 'CMP-09', 'CMP-10',
  ];
  const fehlalarme = darfNichtFehlschlagen.filter((id) => e[id] === 'FAIL');
  assert.deepEqual(fehlalarme, [], `Fehlalarme: ${fehlalarme.map((id) => `${id} (${befund(r, id).befund})`).join(' | ')}`);
});

test('Referenzseite erreicht einen deutlich hoeheren Wert als die Altfaelle', () => {
  const s = auswerten(laden('sauber'), branchen.maschinenbau).scores.deterministischer_teilscore;
  const h = auswerten(laden('helfri'), branchen.bauunternehmen).scores.deterministischer_teilscore;
  const b = auswerten(laden('bravo'), branchen.gastronomie).scores.deterministischer_teilscore;
  assert.ok(s > h + 15, `sauber ${s} gegen helfri ${h}`);
  assert.ok(s > b + 15, `sauber ${s} gegen bravo ${b}`);
});

// --- Score-Mechanik -------------------------------------------------------

const kunst = (liste) => liste.map((x, i) => ({
  rule_id: `X-${i}`, gruppe: 'seo', achse: 'seo', gewicht: x.g ?? 1, ergebnis: x.e,
}));

test('WARN zaehlt halb, NA und UNKNOWN fallen aus der Rechnung', () => {
  // Gewichte so gewaehlt, dass die Messluecken-Schwelle hier nicht mithineinspielt -
  // die pruefen die eigenen Tests weiter unten.
  const s = score(kunst([{ e: 'PASS', g: 3 }, { e: 'WARN', g: 3 }, { e: 'NA', g: 3 }, { e: 'UNKNOWN', g: 1 }]));
  // (3*1 + 3*0.5) / 6 = 75
  assert.equal(s.achsen.seo.score, 75);
  assert.equal(s.achsen.seo.regeln_gewertet, 2);
});

test('Gewichte schlagen auf den Achsenwert durch', () => {
  const s = score(kunst([{ e: 'FAIL', g: 3 }, { e: 'PASS', g: 1 }]));
  assert.equal(s.achsen.seo.score, 25);
});

test('Eine Achse mit zu vielen Messluecken liefert keinen Wert', () => {
  const s = score(kunst([{ e: 'UNKNOWN', g: 3 }, { e: 'PASS', g: 1 }]));
  assert.equal(s.achsen.seo.score, null);
  assert.equal(s.achsen.seo.nicht_ausreichend_pruefbar, true);
});

test('Eine fehlende Messquelle allein kippt die Achse nicht', () => {
  // Drei unbekannte Regeln bei sonst vollstaendiger Achse bleiben unter der Schwelle.
  const s = score(kunst([
    { e: 'UNKNOWN', g: 1 }, { e: 'UNKNOWN', g: 1 }, { e: 'UNKNOWN', g: 1 },
    { e: 'PASS', g: 3 }, { e: 'PASS', g: 3 }, { e: 'PASS', g: 3 },
  ]));
  assert.equal(s.achsen.seo.score, 100);
});

test('Nicht anwendbare Regeln zaehlen nicht als Messluecke', () => {
  const s = score(kunst([{ e: 'NA', g: 3 }, { e: 'NA', g: 3 }, { e: 'UNKNOWN', g: 1 }, { e: 'PASS', g: 3 }]));
  assert.equal(s.achsen.seo.score, 100);
});

test('Der Gesamtscore entsteht erst mit der Vision-Bewertung', () => {
  const facts = laden('helfri');
  const roh = auswerten(facts, profil(facts)).scores;
  assert.equal(roh.website_score, null);

  const fertig = finalisiereScore(roh, { design: 40, conversion: 45, vertrauen: 60 });
  assert.ok(fertig.website_score > 0 && fertig.website_score <= 100);
  assert.equal(fertig.website_score % 5, 0, 'nicht auf 5er-Schritte gerundet');
  assert.deepEqual(fertig.achsen_ohne_wert, []);
});

test('Vertrauen mischt deterministische Haelfte und Vision-Haelfte', () => {
  const roh = score(kunst([]).concat([{ rule_id: 'TRU-1', gruppe: 'trust', achse: 'vertrauen', gewicht: 1, ergebnis: 'PASS' }]));
  const fertig = finalisiereScore(roh, { design: 50, conversion: 50, vertrauen: 40 });
  assert.equal(fertig.achsen.vertrauen.score_deterministisch, 100);
  assert.equal(fertig.achsen.vertrauen.score_vision, 40);
  assert.equal(fertig.achsen.vertrauen.score, 70);
});

// --- Compliance-Ampel -----------------------------------------------------

test('Ampel schlaegt nur bei den als kritisch benannten Regeln auf Rot', () => {
  const rot = complianceAmpel([{ rule_id: 'CMP-05', gruppe: 'compliance', ergebnis: 'FAIL' }]);
  const gelb = complianceAmpel([{ rule_id: 'CMP-02', gruppe: 'compliance', ergebnis: 'FAIL' }]);
  const gruen = complianceAmpel([{ rule_id: 'CMP-02', gruppe: 'compliance', ergebnis: 'PASS' }]);
  assert.equal(rot.ampel, 'kritischer_hinweis');
  assert.equal(gelb.ampel, 'pruefen');
  assert.equal(gruen.ampel, 'gruen');
});

test('Jeder Compliance-Befund verlangt eine menschliche Pruefung', () => {
  const facts = laden('bravo');
  const r = auswerten(facts, profil(facts));
  for (const f of r.findings.filter((x) => x.gruppe === 'compliance')) {
    assert.equal(f.review_required, true, `${f.rule_id} ohne review_required`);
  }
});

// --- Schutz des Kundentexts -----------------------------------------------

test('Interne Regeln sind in den Ergebnissen als nicht kundentexttauglich markiert', () => {
  const facts = laden('helfri');
  const r = auswerten(facts, profil(facts));
  const intern = ['TEC-11', 'TEC-15', 'MOB-05', 'SEO-05', 'SEO-06', 'SEO-09', 'SEO-15', 'TRU-05', 'EXP-01', 'EXP-02', 'EXP-03'];
  for (const id of intern) {
    assert.equal(befund(r, id).kundentext_erlaubt, false, `${id} waere im Kundentext erlaubt`);
  }
});

test('Jeder Befund traegt eine nachvollziehbare Begruendung', () => {
  const facts = laden('helfri');
  const r = auswerten(facts, profil(facts));
  for (const f of r.findings) {
    assert.ok(f.befund && f.befund.length > 10, `${f.rule_id} ohne Begruendung`);
    assert.ok(f.messung && f.messung.length > 10, `${f.rule_id} ohne Messbeschreibung`);
  }
});
