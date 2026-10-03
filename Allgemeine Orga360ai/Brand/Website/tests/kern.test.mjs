// Unit-Tests fuer Katalog und Kern der Online-Vorbereitung v2.
// Aufruf im Website-Ordner: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../vorbereitung-fragen.js");
const K = globalThis.VB2;

test("Katalog: Versionen und Schalter", () => {
  assert.equal(K.SCHEMA_VERSION, "2.0.0");
  assert.equal(K.QUESTIONNAIRE_VERSION, "2026-10-v2");
  assert.equal(K.FOTOS_AKTIV, false);
});
test("Katalog: jeder Text hat Du und Sie", () => {
  for (const [k, v] of Object.entries(K.TEXTE)) assert.ok(v.du && v.sie, "fehlt bei " + k);
});
test("Katalog: keine Gedankenstriche", () => {
  assert.ok(!/[–—]/.test(JSON.stringify(K)), "Gedankenstrich gefunden");
});
test("Katalog: Kachel-Listen vollstaendig", () => {
  assert.deepEqual(K.WEITER.map(w => w.id), ["automatisch","abgetippt","weitergeleitet","bescheid","weissnicht"]);
  assert.equal(K.HAEUFIGKEIT.length, 6);
  assert.equal(K.DAUER.length, 6);
  assert.ok(K.PROGRAMM_BEREICHE.length >= 7);
});

// ---------------------------------------------------------------- Kern
require("../vorbereitung-kern.js");
const C = globalThis.VB2_KERN;

test("leerer Stand hat alle Felder", () => {
  const s = C.leererStand();
  assert.deepEqual(Object.keys(s).sort(), ["ablaeufe","betrieb","nochEtwas","programme","weissNicht","ziel"]);
  assert.equal(s.ablaeufe.length, 0);
});
test("Vorbelegung markiert Herkunft", () => {
  const s = C.leererStand();
  C.prefillAnwenden(s, { betrieb:{taetigkeit:"Malerbetrieb"},
    programme:[{name:"CATS"},{name:"Outlook"}], ablaeufe:[{name:"Stundenzettel"}] });
  assert.equal(s.betrieb.taetigkeit, "Malerbetrieb");
  assert.equal(s.betrieb.herkunft, "vorbelegt");
  assert.equal(s.programme[0].herkunft, "vorbelegt");
  assert.equal(s.programme[1].quelle, "kachel");
  assert.equal(s.programme[0].quelle, "frei");
  assert.equal(s.ablaeufe[0].name, "Stundenzettel");
  assert.equal(s.ablaeufe[0].schritte.length, 0);
});
test("neuerAblauf und neuerSchritt erzeugen eindeutige Kennungen", () => {
  const a = C.neuerAblauf("X"), b = C.neuerAblauf("Y");
  assert.notEqual(a.id, b.id);
  assert.match(C.neuerSchritt().id, /^stp-/);
});

function beispiel(){
  const s = C.leererStand();
  s.betrieb.taetigkeit = "Personal Training"; s.betrieb.personen.auswahl = "6 bis 20";
  const sales = C.neuesProgramm("Sales Suite"); const click = C.neuesProgramm("ClickUp");
  s.programme.push(sales, click);
  const a = C.neuerAblauf("Lead bis Termin");
  a.ausloeser.auswahl = "Formular oder Website"; a.haeufigkeit.auswahl = "täglich"; a.dauer.auswahl = "5 bis 15 Min";
  const s1 = C.neuerSchritt(); s1.was = "Lead kommt rein"; s1.womit.art = "telefon"; s1.weiter.art = "abgetippt";
  const s2 = C.neuerSchritt(); s2.was = "Lead anlegen"; s2.womit.programmId = sales.id; s2.weiter.art = "automatisch"; s2.weiter.womit = "Zapier";
  const s3 = C.neuerSchritt(); s3.was = "Aufgabe für Trainer"; s3.womit.programmId = click.id;
  a.schritte.push(s1, s2, s3); s.ablaeufe.push(a);
  return s;
}
test("Luecken: vollstaendiger Stand hat keine", () => {
  assert.deepEqual(C.luecken(beispiel()), []);
});
test("Luecken: fehlende Angaben werden benannt, weissNicht erfuellt", () => {
  const s = beispiel(); const a = s.ablaeufe[0];
  a.dauer.auswahl = ""; a.schritte.splice(1);
  const l = C.luecken(s).map(x => x.schluessel);
  assert.ok(l.includes(`ablauf:${a.id}:dauer`));
  assert.ok(l.includes(`ablauf:${a.id}:schritte`));
  s.weissNicht.push(`ablauf:${a.id}:dauer`);
  assert.ok(!C.luecken(s).map(x => x.schluessel).includes(`ablauf:${a.id}:dauer`));
});
test("Luecken: ohne Ablauf und ohne Programm", () => {
  const l = C.luecken(C.leererStand()).map(x => x.schluessel);
  assert.deepEqual(l.sort(), ["ablaeufe","betrieb.personen","betrieb.taetigkeit","programme"]);
});
test("Kette als Text", () => {
  const s = beispiel();
  assert.equal(C.ketteText(s.ablaeufe[0], s.programme),
    "Lead kommt rein (Telefon) → abgetippt → Lead anlegen (Sales Suite) → automatisch (Zapier) → Aufgabe für Trainer (ClickUp)");
});
test("Programmkarte: Paare mit Uebergang", () => {
  const s = beispiel();
  assert.deepEqual(C.programmkarte(s), [
    { von:"Telefon", nach:"Sales Suite", art:"abgetippt", womit:"", ablauf:"Lead bis Termin" },
    { von:"Sales Suite", nach:"ClickUp", art:"automatisch", womit:"Zapier", ablauf:"Lead bis Termin" }
  ]);
});
test("Geloeschtes Programm bleibt als Text im Schritt", () => {
  const s = beispiel(); const sales = s.programme[0];
  assert.deepEqual(C.programmInVerwendung(s, sales.id), ["Lead bis Termin"]);
  C.programmEntfernen(s, sales.id);
  assert.equal(s.ablaeufe[0].schritte[1].womit.programmId, "");
  assert.equal(s.ablaeufe[0].schritte[1].womit.frei, "Sales Suite");
});
test("Dokument: Huelle, Revision, leere Zeilen raus", () => {
  const s = beispiel(); s.ablaeufe[0].schritte.push(C.neuerSchritt());
  s.ablaeufe.push(C.neuerAblauf(""));
  const meta = { kennung:"T-1", kunde:"Test", anrede:"du", createdAt:"2026-10-03T10:00:00Z", lastSubmissionId:null, lastRevision:-1 };
  const d = C.dokument(s, meta);
  assert.equal(d.schemaVersion, "2.0.0"); assert.equal(d.questionnaireId, "T-1");
  assert.equal(d.revision, 0); assert.equal(d.anrede, "du");
  assert.equal(d.ablaeufe.length, 1); assert.equal(d.ablaeufe[0].schritte.length, 3);
});
test("normalisieren fuellt fehlende Teilobjekte", () => {
  const d = { betrieb:{}, programme:[{name:"X"}], ablaeufe:[{ name:"A", schritte:[{ was:"a" }, { was:"b" }] }] };
  C.normalisieren(d);
  assert.equal(d.betrieb.personen.auswahl, "");
  assert.equal(d.ablaeufe[0].schritte[0].womit.programmId, "");
  assert.equal(d.ablaeufe[0].schritte[0].weiter.art, "");
  assert.doesNotThrow(() => { C.luecken(d); C.ketteText(d.ablaeufe[0], d.programme); C.programmkarte(d); });
});
test("Pruefung: gueltiges Dokument ohne Fehler", () => {
  const d = C.dokument(beispiel(), { kennung:"T-1", kunde:"Test", anrede:"sie", createdAt:"x", lastSubmissionId:null, lastRevision:-1 });
  assert.deepEqual(C.pruefen(d, "T-1"), []);
});
test("Pruefung: falsche Kennung, zu viele Ablaeufe, zu langer Text", () => {
  const s = beispiel();
  s.ablaeufe.push(C.neuerAblauf("b"), C.neuerAblauf("c"), C.neuerAblauf("d"));
  s.nochEtwas = "x".repeat(5001);
  const d = C.dokument(s, { kennung:"T-1", kunde:"", anrede:"sie", createdAt:"x", lastSubmissionId:null, lastRevision:-1 });
  const f = C.pruefen(d, "ANDERS");
  assert.ok(f.some(x => /Kennung/.test(x))); assert.ok(f.some(x => /Abläufe/.test(x))); assert.ok(f.some(x => /Zeichen/.test(x)));
});

test("Eigenes Programm merkt sich seinen Bereich", () => {
  const p = C.neuesProgramm("Hero", "", "kunde", "kunden");
  assert.equal(p.quelle, "frei"); assert.equal(p.bereich, "kunden");
  assert.equal(C.neuesProgramm("Outlook", "", "kunde", "kunden").bereich, "mail"); // Kachel behaelt ihren Bereich
});
test("Katalog: jede Zeile hat ein Beispiel fuer eigene Eintraege, keine Kachel Branchensoftware", () => {
  for (const b of K.PROGRAMM_BEREICHE) assert.ok(b.beispiel, "fehlt bei " + b.id);
  assert.ok(!K.PROGRAMM_BEREICHE.some(b => b.kacheln.includes("Branchensoftware")));
});
