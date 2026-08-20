// Tests des Akquise-Scores. Prueft vor allem, dass er sich anders verhaelt als
// "100 minus Website-Score" und dass die Knock-outs nur dort greifen, wo sie
// belastbar messbar sind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { akquiseScore } from '../scoring/akquise.mjs';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(path.join(wurzel, p), 'utf8'));
const branchen = json('scoring/branchen.json');
const blacklist = json('blacklist.json');

const helfriFacts = json('fixtures/helfri/facts.json');
const helfriFindings = json('fixtures/helfri/findings.json');
const helfriAssessment = json('fixtures/helfri/assessment.geprueft.json').assessment;

const helfriLead = {
  firma: 'Helfri Baugesellschaft mbH',
  website: 'https://helfri-bau.de/',
  ansprechpartner: 'Markus Hoffmann',
  telefon: '06451 - 69 46',
  mail: 'info@helfri-bau.de',
};

const basis = (over = {}) => ({
  assessment: helfriAssessment,
  findings: helfriFindings,
  facts: helfriFacts,
  lead: helfriLead,
  branche: branchen.bauunternehmen,
  blacklist,
  ...over,
});

test('Helfri landet im obersten Band', () => {
  const r = akquiseScore(basis());
  assert.ok(r.score >= 75, `Score war ${r.score}`);
  assert.equal(r.empfehlung, 'zeitnah anrufen');
  assert.equal(r.knockout, null);
});

test('Alle vier Bloecke tragen bei und bleiben in ihren Grenzen', () => {
  const r = akquiseScore(basis());
  for (const [name, b] of Object.entries(r.bloecke)) {
    assert.ok(b.punkte >= 0 && b.punkte <= b.max, `${name}: ${b.punkte} von ${b.max}`);
  }
  const summe = Object.values(r.bloecke).reduce((a, b) => a + b.punkte, 0);
  assert.equal(Math.round(summe), r.score);
});

// --- Der entscheidende Unterschied zu "100 minus Website-Score" -----------

test('Eine gute Website senkt den Score nicht automatisch', () => {
  // Gleicher Lead, aber die visuellen Achsen deutlich besser bewertet.
  const gut = {
    ...helfriAssessment,
    vision: { ...helfriAssessment.vision, design: 85, conversion: 80 },
  };
  const schlecht = akquiseScore(basis());
  const besser = akquiseScore(basis({ assessment: gut }));

  // Nur der Kontrast-Block gibt nach, die belegbaren Punkte bleiben bestehen.
  assert.ok(besser.score < schlecht.score, 'Kontrast muss nachgeben');
  assert.equal(besser.bloecke.schmerz.punkte, schlecht.bloecke.schmerz.punkte);
  assert.ok(besser.score > 55, `trotz guter Optik noch ein Lead: ${besser.score}`);
});

test('Ohne belegbare Punkte bricht der Schmerz-Block ein', () => {
  const ohne = { ...helfriAssessment, feststellungen: [] };
  const r = akquiseScore(basis({ assessment: ohne }));
  assert.equal(r.bloecke.schmerz.punkte, 0);
  assert.ok(r.score < 55, `Score war ${r.score}`);
});

// --- Knock-outs -----------------------------------------------------------

test('Blacklist-Domain fuehrt zum Knock-out', () => {
  const facts = { ...helfriFacts, http: { ...helfriFacts.http, final_url: 'https://www.schreck-kunststofftechnik.de/' } };
  const r = akquiseScore(basis({ facts }));
  assert.equal(r.score, 0);
  assert.equal(r.knockout.grund, 'blacklist');
  assert.equal(r.empfehlung, 'nicht kontaktieren');
});

test('Blacklist greift auch ueber den Firmennamen', () => {
  const r = akquiseScore(basis({ lead: { ...helfriLead, firma: 'Schreck Kunststofftechnik GmbH' } }));
  assert.equal(r.knockout.grund, 'blacklist');
});

test('Ohne jeden Kontaktweg gibt es keinen Lead', () => {
  const facts = {
    ...helfriFacts,
    impressum: { found: false },
    pages: (helfriFacts.pages ?? []).map((p) => ({ ...p, mailto_links: [], tel_links: [] })),
  };
  const r = akquiseScore(basis({ facts, lead: { firma: 'Test' } }));
  assert.equal(r.knockout.grund, 'kein_kontaktweg');
});

test('Website-Alter fuehrt nur zu einem Hinweis, nicht zum Knock-out', () => {
  // Nicht zuverlaessig messbar - deshalb bewusst kein Ausschlusskriterium.
  const findings = {
    ...helfriFindings,
    findings: helfriFindings.findings.map((f) => (f.rule_id === 'AIR-08' ? { ...f, ergebnis: 'PASS' } : f)),
  };
  const r = akquiseScore(basis({ findings }));
  assert.equal(r.knockout, null);
  assert.ok(r.hinweise.some((h) => /Agentur/.test(h)), JSON.stringify(r.hinweise));
});

// --- Branchengewichtung ---------------------------------------------------

test('Telefonaffine Branchen gewichten Kontaktwege staerker', () => {
  const handwerk = akquiseScore(basis({ branche: branchen.dachdecker }));
  const b2b = akquiseScore(basis({ branche: branchen.industrie_b2b }));
  assert.ok(handwerk.bloecke.schmerz.punkte >= b2b.bloecke.schmerz.punkte,
    `${handwerk.bloecke.schmerz.punkte} gegen ${b2b.bloecke.schmerz.punkte}`);
});

// --- Wirtschaftliches Potenzial ------------------------------------------

test('Ohne manuelle Einschaetzung wird geschaetzt und das ausgewiesen', () => {
  const r = akquiseScore(basis());
  assert.equal(r.bloecke.potenzial.quelle, 'geschaetzt');
  assert.ok(r.hinweise.some((h) => /Potenzial/.test(h)));
  assert.ok(r.bloecke.potenzial.punkte <= 16, 'Schaetzung muss gedeckelt bleiben');
});

test('Manuelle Einschaetzung schlaegt die Schaetzung', () => {
  const r = akquiseScore(basis({ lead: { ...helfriLead, potenzial_manuell: 5 } }));
  assert.equal(r.bloecke.potenzial.quelle, 'manuell');
  assert.equal(r.bloecke.potenzial.punkte, 20);
});

test('Manuelle Einschaetzung wird auf 1 bis 5 begrenzt', () => {
  const hoch = akquiseScore(basis({ lead: { ...helfriLead, potenzial_manuell: 9 } }));
  const tief = akquiseScore(basis({ lead: { ...helfriLead, potenzial_manuell: -3 } }));
  assert.equal(hoch.bloecke.potenzial.punkte, 20);
  assert.equal(tief.bloecke.potenzial.punkte, 4);
});

// --- Zugang ---------------------------------------------------------------

test('Fehlender Ansprechpartner kostet Punkte und erzeugt eine Aufgabe', () => {
  const facts = { ...helfriFacts, impressum: { ...helfriFacts.impressum, vertretung: null } };
  const r = akquiseScore(basis({ facts, lead: { ...helfriLead, ansprechpartner: null } }));
  assert.ok(r.hinweise.some((h) => /Ansprechpartner/.test(h)));
  assert.ok(r.bloecke.zugang.punkte < akquiseScore(basis()).bloecke.zugang.punkte);
});

test('Eine persoenliche Verbindung zaehlt', () => {
  const mit = akquiseScore(basis({ lead: { ...helfriLead, persoenliche_verbindung: 'Schulfreund vom Bruder' } }));
  const ohne = akquiseScore(basis());
  assert.ok(mit.bloecke.zugang.punkte > ohne.bloecke.zugang.punkte);
});

test('Eine Sammeladresse zaehlt weniger als eine persoenliche', () => {
  const sammel = akquiseScore(basis({ lead: { ...helfriLead, mail: 'info@helfri-bau.de' } }));
  const direkt = akquiseScore(basis({ lead: { ...helfriLead, mail: 'm.hoffmann@helfri-bau.de' } }));
  assert.ok(direkt.bloecke.zugang.punkte > sammel.bloecke.zugang.punkte);
});
