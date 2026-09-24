#!/usr/bin/env node
// Validator der Bewertungsstufe.
//
// Das Modell darf Regelergebnisse gewichten und in Sprache uebersetzen. Es darf
// keine neuen Tatsachen ueber die Website erfinden. Diese Datei setzt das
// technisch durch, statt es im Prompt zu erbitten.
//
// Sechs Pruefungen:
//   1. Struktur       - Pflichtfelder und Wertebereiche
//   2. Belegbindung   - jede zitierte Regel existiert
//   3. Richtungspruefung - zitierte Regel muss FAIL oder WARN sein; ueber ein PASS
//                       laesst sich nicht klagen
//   4. Zahlenherkunft - jede Zahl im Text muss in den zitierten Regelergebnissen
//                       vorkommen; das unterbindet erfundene Genauigkeit
//   5. Kundentextschutz - mail_tauglich nur, wenn alle zitierten Regeln es erlauben
//   6. Sicherheitsdeckel - visuelle Aussagen nie mit Sicherheit "hoch"
//
// Aufruf: node validator/pruefe.mjs <assessment.json> <findings.json> [--out datei]

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ABBRUCH_SCHWELLE = 0.2;

// Kleine Zahlen kommen in normaler Prosa vor ("zwei Punkte", "3 Seiten") und
// werden nicht auf Herkunft geprueft. Alles darueber ist eine Messangabe.
const PROSA_GRENZE = 3;

/** Zieht alle pruefwuerdigen Zahlen aus einem Text. */
export function zahlenAus(text) {
  const treffer = [];
  for (const m of String(text ?? '').matchAll(/\d+(?:[.,]\d+)?/g)) {
    const roh = m[0].replace(',', '.');
    const zahl = Number(roh);
    if (!Number.isFinite(zahl)) continue;
    if (zahl <= PROSA_GRENZE && Number.isInteger(zahl)) continue;
    treffer.push({ text: m[0], zahl });
  }
  return treffer;
}

/** Alle Zahlen, die in den zitierten Regelergebnissen tatsaechlich vorkommen. */
function belegteZahlen(findings) {
  const menge = new Set();
  for (const f of findings) {
    const quelle = `${f.befund ?? ''} ${JSON.stringify(f.wert ?? {})} ${JSON.stringify(f.belege ?? [])}`;
    for (const m of quelle.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const zahl = Number(m[0].replace(',', '.'));
      if (Number.isFinite(zahl)) menge.add(zahl);
    }
  }
  return menge;
}

/** Erlaubt Rundungen: 1,66 Sekunden darf als "1,7" oder "2" auftauchen. */
function zahlBelegt(zahl, belegte) {
  if (belegte.has(zahl)) return true;
  for (const b of belegte) {
    if (Math.abs(b - zahl) < 0.05) return true;
    if (Math.round(b) === zahl || Math.round(b * 10) / 10 === zahl) return true;
    // Einheitenwechsel: 1660 Millisekunden gegen 1,66 Sekunden, 870400 Byte gegen 870 KB
    if (Math.abs(b / 1000 - zahl) < 0.05) return true;
    if (Math.abs(b / 1024 - zahl) < 1) return true;
    if (Math.abs(b * 100 - zahl) < 1) return true;
  }
  return false;
}

/**
 * Prueft ein Assessment gegen die Regelergebnisse.
 * Gibt bereinigte Feststellungen und ein Protokoll aller Verwuerfe zurueck.
 */
export function pruefe(assessment, findingsDatei) {
  const findings = findingsDatei.findings ?? [];
  const nachId = new Map(findings.map((f) => [f.rule_id, f]));
  const strukturfehler = [];
  const verworfen = [];
  const behalten = [];

  // --- 1. Struktur auf oberster Ebene -------------------------------------
  for (const feld of ['meta', 'vision', 'feststellungen', 'staerken', 'nicht_sagen', 'akquise']) {
    if (assessment[feld] == null) strukturfehler.push(`Pflichtfeld fehlt: ${feld}`);
  }
  if (!Array.isArray(assessment.nicht_sagen) || !assessment.nicht_sagen.length) {
    strukturfehler.push('nicht_sagen ist leer - das Feld ist Pflicht');
  }
  for (const achse of ['design', 'conversion', 'vertrauen']) {
    const v = assessment.vision?.[achse];
    if (!Number.isInteger(v) || v < 0 || v > 100) strukturfehler.push(`vision.${achse} ist kein Wert zwischen 0 und 100`);
  }
  if (!Array.isArray(assessment.feststellungen) || !assessment.feststellungen.length) {
    strukturfehler.push('keine Feststellungen geliefert');
    return ergebnis(assessment, [], [], strukturfehler, findingsDatei);
  }

  const gesehen = new Set();

  for (const f of assessment.feststellungen) {
    const gruende = [];
    const istVisuell = f.kategorie === 'visuell';
    const ids = Array.isArray(f.rule_ids) ? f.rule_ids : [];

    // --- 2. Belegbindung --------------------------------------------------
    const unbekannt = ids.filter((id) => !nachId.has(id));
    if (unbekannt.length) gruende.push(`unbekannte Regel-ID: ${unbekannt.join(', ')}`);

    if (!istVisuell && ids.length === 0) {
      gruende.push('keine Regel zitiert, Kategorie ist aber nicht "visuell"');
    }

    const zitierte = ids.map((id) => nachId.get(id)).filter(Boolean);

    // --- 3. Richtungspruefung --------------------------------------------
    // Der Kern gegen Halluzination: Ueber eine Regel, die PASS liefert, laesst
    // sich kein Mangel behaupten - auch wenn die ID formal existiert.
    const falscheRichtung = zitierte.filter((r) => !['FAIL', 'WARN'].includes(r.ergebnis));
    if (falscheRichtung.length) {
      gruende.push(`zitierte Regel widerspricht der Aussage: ${falscheRichtung.map((r) => `${r.rule_id}=${r.ergebnis}`).join(', ')}`);
    }

    // --- 4. Zahlenherkunft ------------------------------------------------
    if (zitierte.length) {
      const belegte = belegteZahlen(zitierte);
      const unbelegte = [...zahlenAus(f.feststellung), ...zahlenAus(f.beleg)]
        .filter((z) => !zahlBelegt(z.zahl, belegte));
      if (unbelegte.length) {
        gruende.push(`Zahl ohne Deckung in den zitierten Regeln: ${[...new Set(unbelegte.map((z) => z.text))].join(', ')}`);
      }
    } else if (istVisuell) {
      const zahlen = [...zahlenAus(f.feststellung), ...zahlenAus(f.beleg)];
      if (zahlen.length) gruende.push(`visuelle Aussage enthaelt Messangaben: ${zahlen.map((z) => z.text).join(', ')}`);
    }

    // --- 6. Sicherheitsdeckel --------------------------------------------
    if (istVisuell && f.sicherheit === 'hoch') {
      gruende.push('visuelle Aussage mit Sicherheit "hoch" - hoechstens "mittel" zulaessig');
    }

    // --- Formales ---------------------------------------------------------
    if (!f.id || !/^F\d+$/.test(f.id)) gruende.push('ungueltige oder fehlende Feststellungs-ID');
    if (gesehen.has(f.id)) gruende.push(`doppelte Feststellungs-ID ${f.id}`);
    gesehen.add(f.id);
    if (!f.feststellung || f.feststellung.length < 15) gruende.push('Feststellung zu knapp');
    if (!f.beleg || f.beleg.length < 15) gruende.push('Beleg zu knapp');

    if (gruende.length) {
      verworfen.push({ id: f.id ?? '(ohne ID)', feststellung: f.feststellung?.slice(0, 120), gruende });
      continue;
    }

    // --- 5. Kundentextschutz ----------------------------------------------
    // Wird nicht verworfen, sondern korrigiert: die Aussage ist richtig, gehoert
    // aber nur in den internen Bericht.
    const gesperrt = zitierte.filter((r) => !r.kundentext_erlaubt);
    const bereinigt = { ...f };
    if (gesperrt.length && f.mail_tauglich) {
      bereinigt.mail_tauglich = false;
      bereinigt.mail_gesperrt_durch = gesperrt.map((r) => r.rule_id);
    }
    if (istVisuell && f.mail_tauglich && f.sicherheit === 'niedrig') {
      bereinigt.mail_tauglich = false;
      bereinigt.mail_gesperrt_durch = ['sicherheit_niedrig'];
    }
    bereinigt.compliance = zitierte.some((r) => r.gruppe === 'compliance');
    behalten.push(bereinigt);
  }

  return ergebnis(assessment, behalten, verworfen, strukturfehler, findingsDatei);
}

function ergebnis(assessment, behalten, verworfen, strukturfehler, findingsDatei) {
  const gesamt = behalten.length + verworfen.length;
  const quote = gesamt ? verworfen.length / gesamt : 1;
  const abbruch = strukturfehler.length > 0 || quote > ABBRUCH_SCHWELLE;

  // Argumentreihenfolge auf ueberlebende Feststellungen eindampfen.
  const ueberlebendeIds = new Set(behalten.map((f) => f.id));
  const reihenfolge = (assessment.akquise?.reihenfolge ?? []).filter((id) => ueberlebendeIds.has(id));

  return {
    ok: !abbruch,
    abbruchgrund: abbruch
      ? (strukturfehler.length
        ? `Strukturfehler: ${strukturfehler.join('; ')}`
        : `Verwurfsquote ${Math.round(quote * 100)} Prozent ueber der Schwelle von ${ABBRUCH_SCHWELLE * 100} Prozent`)
      : null,
    statistik: {
      geliefert: gesamt,
      behalten: behalten.length,
      verworfen: verworfen.length,
      verwurfsquote_prozent: Math.round(quote * 100),
      mail_tauglich: behalten.filter((f) => f.mail_tauglich).length,
      nachtraeglich_gesperrt: behalten.filter((f) => f.mail_gesperrt_durch).length,
    },
    strukturfehler,
    verworfen,
    assessment: {
      ...assessment,
      feststellungen: behalten,
      akquise: { ...assessment.akquise, reihenfolge },
    },
    findings_meta: findingsDatei.meta ?? null,
  };
}

// ---------------------------------------------------------------- Einstieg

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const [assessmentPfad, findingsPfad] = process.argv.slice(2);
  if (!assessmentPfad || !findingsPfad) {
    console.error('Aufruf: node validator/pruefe.mjs <assessment.json> <findings.json> [--out datei]');
    process.exit(1);
  }
  const outIdx = process.argv.indexOf('--out');
  const outPfad = outIdx > -1 ? process.argv[outIdx + 1] : path.join(path.dirname(assessmentPfad), 'assessment.geprueft.json');

  const assessment = JSON.parse(await readFile(assessmentPfad, 'utf8'));
  const findings = JSON.parse(await readFile(findingsPfad, 'utf8'));
  const r = pruefe(assessment, findings);

  await writeFile(outPfad, JSON.stringify(r, null, 2), 'utf8');

  const s = r.statistik;
  console.error(`  Feststellungen: ${s.behalten} behalten, ${s.verworfen} verworfen (${s.verwurfsquote_prozent} Prozent)`);
  console.error(`  Fuer die Mail freigegeben: ${s.mail_tauglich}${s.nachtraeglich_gesperrt ? `, ${s.nachtraeglich_gesperrt} nachtraeglich gesperrt` : ''}`);
  for (const v of r.verworfen) console.error(`  verworfen ${v.id}: ${v.gruende.join(' | ')}`);
  if (!r.ok) {
    console.error(`  ABBRUCH: ${r.abbruchgrund}`);
    console.log(outPfad);
    process.exit(2);
  }
  console.log(outPfad);
}
