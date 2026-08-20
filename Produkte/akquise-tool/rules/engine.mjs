#!/usr/bin/env node
// Rule Engine: facts.json -> findings.json
//
// Diese Schicht ist der Grund, warum das Bewertungsmodell spaeter nicht
// halluzinieren kann. Sie verwandelt Rohmesswerte in benannte Regelergebnisse
// (PASS/WARN/FAIL). Das Modell sieht nur noch diese Ergebnisse, nie die Rohfakten -
// es kann deshalb nicht behaupten, eine H1 fehle, waehrend der Fakt sie enthaelt.
//
// Aufruf: node rules/engine.mjs <pfad/zu/facts.json> [--out findings.json]

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import technik from './regeln/technik.mjs';
import mobil from './regeln/mobil.mjs';
import seo from './regeln/seo.mjs';
import local from './regeln/local.mjs';
import air from './regeln/air.mjs';
import trust from './regeln/trust.mjs';
import compliance from './regeln/compliance.mjs';
import experimentell from './regeln/experimentell.mjs';

export const REGELWERK_VERSION = '1.0.0';

export const ALLE_REGELN = [
  ...technik, ...mobil, ...seo, ...local, ...air, ...trust, ...compliance, ...experimentell,
];

// Achsengewichte laut Regelkatalog Abschnitt 2.
export const ACHSEN = {
  seo: { label: 'SEO', gewicht: 20, gruppen: ['seo'] },
  technik: { label: 'Technik', gewicht: 15, gruppen: ['technik', 'mobil'] },
  air: { label: 'Content / AI-Readiness', gewicht: 15, gruppen: ['air'] },
  design: { label: 'Design / Modernitaet', gewicht: 15, gruppen: [], quelle: 'vision' },
  conversion: { label: 'Conversion / Nutzerfuehrung', gewicht: 15, gruppen: [], quelle: 'vision' },
  local: { label: 'Local SEO', gewicht: 10, gruppen: ['local'] },
  vertrauen: { label: 'Vertrauen', gewicht: 10, gruppen: ['trust'], quelle: 'gemischt', anteil_deterministisch: 0.5 },
};

const FAKTOR = { PASS: 1, WARN: 0.5, FAIL: 0 };
const ZAEHLT_NICHT = new Set(['NA', 'UNKNOWN']);

const BRANCHEN_FAKTOR = { hoch: 1.5, normal: 1.0, niedrig: 0.5 };

/** Fuehrt alle Regeln aus. Eine abstuerzende Regel liefert UNKNOWN, nie einen Abbruch. */
export function runRules(facts, branchenProfil = null) {
  const ctx = {
    branche: branchenProfil,
    seiten: facts.pages ?? [],
    seite: (rolle) => (facts.pages ?? []).find((p) => p.rolle === rolle) ?? null,
    seiten_mit: (rolle) => (facts.pages ?? []).filter((p) => p.rolle === rolle),
    erreichbar: facts.http?.reachable !== false,
  };

  const findings = [];
  for (const regel of ALLE_REGELN) {
    let ergebnis;
    try {
      ergebnis = regel.pruefe(facts, ctx) ?? { ergebnis: 'UNKNOWN', grund: 'Regel lieferte kein Ergebnis' };
    } catch (err) {
      ergebnis = { ergebnis: 'UNKNOWN', grund: `Regel abgebrochen: ${err.message}` };
    }
    if (!FAKTOR.hasOwnProperty(ergebnis.ergebnis) && !ZAEHLT_NICHT.has(ergebnis.ergebnis)) {
      ergebnis = { ergebnis: 'UNKNOWN', grund: `ungueltiges Ergebnis "${ergebnis.ergebnis}"` };
    }

    findings.push({
      rule_id: regel.id,
      name: regel.name,
      gruppe: regel.gruppe,
      achse: regel.achse ?? null,
      gewicht: regel.gewicht ?? 1,
      messung: regel.messung,
      kundentext_erlaubt: Boolean(regel.kundentext_erlaubt),
      compliance_signal: ergebnis.ergebnis === 'FAIL' || ergebnis.ergebnis === 'WARN'
        ? (regel.compliance_signal ?? null) : null,
      review_required: Boolean(regel.compliance_signal),
      ergebnis: ergebnis.ergebnis,
      wert: ergebnis.wert ?? null,
      belege: ergebnis.belege ?? [],
      befund: ergebnis.text ?? ergebnis.grund ?? null,
    });
  }
  return findings;
}

/** Berechnet Achsen- und Gesamtscore aus den Regelergebnissen. */
export function score(findings, branchenProfil = null) {
  const telefonFaktor = BRANCHEN_FAKTOR[branchenProfil?.telefon_affin ?? 'normal'] ?? 1;

  const achsen = {};
  for (const [key, def] of Object.entries(ACHSEN)) {
    if (def.gruppen.length === 0) {
      achsen[key] = {
        label: def.label, gewicht: def.gewicht, quelle: 'vision',
        score: null, hinweis: 'wird von der Bewertungsstufe geliefert',
      };
      continue;
    }

    const relevant = findings.filter((f) => def.gruppen.includes(f.gruppe));
    const gewertet = relevant.filter((f) => !ZAEHLT_NICHT.has(f.ergebnis));
    const unbekannt = relevant.filter((f) => f.ergebnis === 'UNKNOWN');

    let zaehler = 0;
    let nenner = 0;
    for (const f of gewertet) {
      const g = (f.gewicht ?? 1) * (BRANCHEN_GEWICHTETE_REGELN.has(f.rule_id) ? telefonFaktor : 1);
      zaehler += g * FAKTOR[f.ergebnis];
      nenner += g;
    }

    // Die Schwelle urteilt nach Gewicht, nicht nach Anzahl: eine fehlende
    // Messquelle darf nicht drei leichte Regeln in einen schweren Ausfall
    // verwandeln. NA zaehlt hier nicht mit - eine nicht anwendbare Regel ist
    // keine Messluecke.
    const anwendbar = relevant.filter((f) => f.ergebnis !== 'NA');
    const gewichtAnwendbar = anwendbar.reduce((a, f) => a + (f.gewicht ?? 1), 0);
    const gewichtUnbekannt = unbekannt.reduce((a, f) => a + (f.gewicht ?? 1), 0);
    const anteilUnbekannt = gewichtAnwendbar ? gewichtUnbekannt / gewichtAnwendbar : 1;
    const nichtPruefbar = anteilUnbekannt > 0.25;

    achsen[key] = {
      label: def.label,
      gewicht: def.gewicht,
      quelle: def.quelle ?? 'deterministisch',
      anteil_deterministisch: def.anteil_deterministisch ?? 1,
      score: nenner > 0 && !nichtPruefbar ? Math.round((zaehler / nenner) * 100) : null,
      regeln_gesamt: relevant.length,
      regeln_gewertet: gewertet.length,
      unbekannt: unbekannt.length,
      unbekannt_regeln: unbekannt.map((f) => f.rule_id),
      anteil_unbekannt_gewichtet: Math.round(anteilUnbekannt * 100),
      nicht_ausreichend_pruefbar: nichtPruefbar,
      fails: relevant.filter((f) => f.ergebnis === 'FAIL').map((f) => f.rule_id),
      warns: relevant.filter((f) => f.ergebnis === 'WARN').map((f) => f.rule_id),
    };
  }

  // Gesamtscore aus den Achsen, die bereits eine Zahl haben. Die Vision-Achsen
  // fehlen an dieser Stelle noch und werden von der Bewertungsstufe nachgereicht.
  let summe = 0;
  let gewichtSumme = 0;
  for (const a of Object.values(achsen)) {
    if (a.score == null) continue;
    const g = a.gewicht * (a.anteil_deterministisch ?? 1);
    summe += a.score * g;
    gewichtSumme += g;
  }

  return {
    achsen,
    deterministischer_teilscore: gewichtSumme > 0 ? rundeAuf5(summe / gewichtSumme) : null,
    abgedecktes_gewicht: gewichtSumme,
    website_score: null,
    hinweis: 'website_score wird erst nach der Vision-Bewertung gesetzt (siehe finalisiereScore)',
  };
}

/**
 * Setzt den Gesamtscore, sobald die Vision-Bewertung vorliegt.
 * visionScores: { design, conversion, vertrauen } jeweils 0-100.
 */
export function finalisiereScore(scoreObj, visionScores = {}) {
  const achsen = structuredClone(scoreObj.achsen);

  for (const key of ['design', 'conversion']) {
    if (typeof visionScores[key] === 'number') {
      achsen[key].score = clamp(visionScores[key]);
      achsen[key].quelle = 'vision';
    }
  }

  // Vertrauen: haelftig deterministisch, haelftig Vision.
  if (typeof visionScores.vertrauen === 'number' && achsen.vertrauen.score != null) {
    achsen.vertrauen.score_deterministisch = achsen.vertrauen.score;
    achsen.vertrauen.score_vision = clamp(visionScores.vertrauen);
    achsen.vertrauen.score = Math.round(
      achsen.vertrauen.score * 0.5 + clamp(visionScores.vertrauen) * 0.5
    );
    achsen.vertrauen.anteil_deterministisch = 1;
  }

  let summe = 0;
  let gewichtSumme = 0;
  const fehlend = [];
  for (const [key, a] of Object.entries(achsen)) {
    if (a.score == null) { fehlend.push(key); continue; }
    summe += a.score * a.gewicht;
    gewichtSumme += a.gewicht;
  }

  return {
    ...scoreObj,
    achsen,
    website_score: gewichtSumme > 0 ? rundeAuf5(summe / gewichtSumme) : null,
    abgedecktes_gewicht: gewichtSumme,
    achsen_ohne_wert: fehlend,
    hinweis: fehlend.length
      ? `Achsen ohne Wert: ${fehlend.join(', ')} - Score bezieht sich auf ${gewichtSumme} von 100 Gewichtspunkten`
      : null,
  };
}

/** Compliance-Ampel laut Regelkatalog Abschnitt 9. */
export function complianceAmpel(findings) {
  const cmp = findings.filter((f) => f.gruppe === 'compliance');
  const fails = cmp.filter((f) => f.ergebnis === 'FAIL');
  const warns = cmp.filter((f) => f.ergebnis === 'WARN');
  const kritisch = fails.filter((f) => KRITISCHE_CMP.has(f.rule_id));

  let ampel = 'gruen';
  if (kritisch.length) ampel = 'kritischer_hinweis';
  else if (fails.length || warns.length) ampel = 'pruefen';

  return {
    ampel,
    signale: [...new Set(cmp.map((f) => f.compliance_signal).filter(Boolean))],
    fails: fails.map((f) => f.rule_id),
    warns: warns.map((f) => f.rule_id),
    kritisch: kritisch.map((f) => f.rule_id),
    review_required: cmp.some((f) => f.ergebnis === 'FAIL' || f.ergebnis === 'WARN'),
  };
}

// Regeln, deren Gewicht vom Branchenprofil abhaengt (Regelkatalog Abschnitt 2).
const BRANCHEN_GEWICHTETE_REGELN = new Set(['LOC-01', 'LOC-02', 'MOB-06']);

// Compliance-Regeln, die die Ampel auf Rot setzen.
const KRITISCHE_CMP = new Set(['CMP-05', 'CMP-06', 'CMP-10']);

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const rundeAuf5 = (n) => Math.round(n / 5) * 5;

/** Vollstaendiger Lauf: Regeln, Scores, Ampel. */
export function auswerten(facts, branchenProfil = null) {
  const findings = runRules(facts, branchenProfil);
  return {
    meta: {
      regelwerk_version: REGELWERK_VERSION,
      collector_version: facts.meta?.collector_version ?? null,
      lead_id: facts.meta?.lead_id ?? null,
      url: facts.http?.final_url ?? facts.meta?.input_url ?? null,
      branche: facts.meta?.branche ?? null,
      ausgewertet_am: new Date().toISOString(),
      seiten_geprueft: facts.meta?.pages_checked?.length ?? 0,
    },
    findings,
    scores: score(findings, branchenProfil),
    compliance: complianceAmpel(findings),
    zusammenfassung: {
      fails: findings.filter((f) => f.ergebnis === 'FAIL').length,
      warns: findings.filter((f) => f.ergebnis === 'WARN').length,
      passes: findings.filter((f) => f.ergebnis === 'PASS').length,
      na: findings.filter((f) => f.ergebnis === 'NA').length,
      unknown: findings.filter((f) => f.ergebnis === 'UNKNOWN').length,
    },
  };
}

// ---------------------------------------------------------------- Einstieg

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const factsPath = process.argv[2];
  if (!factsPath) {
    console.error('Aufruf: node rules/engine.mjs <pfad/zu/facts.json> [--out findings.json]');
    process.exit(1);
  }
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : path.join(path.dirname(factsPath), 'findings.json');

  const facts = JSON.parse(await readFile(factsPath, 'utf8'));
  const branchenDatei = JSON.parse(await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scoring', 'branchen.json'), 'utf8'));
  const profil = branchenDatei[facts.meta?.branche] ?? branchenDatei._default;

  const result = auswerten(facts, profil);
  await writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');

  const z = result.zusammenfassung;
  console.error(`  Regeln: ${z.fails} FAIL, ${z.warns} WARN, ${z.passes} PASS, ${z.na} NA, ${z.unknown} UNKNOWN`);
  console.error(`  Compliance: ${result.compliance.ampel}`);
  console.error(`  Deterministischer Teilscore: ${result.scores.deterministischer_teilscore}`);
  console.log(outPath);
}
