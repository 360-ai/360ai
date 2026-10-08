// Unit-Tests fuer Katalog und Kern der Online-Vorbereitung v2.
// Aufruf im Website-Ordner: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../vorbereitung-fragen.js");
const K = globalThis.VB2;

test("Katalog: Versionen und Schalter", () => {
  assert.equal(K.SCHEMA_VERSION, "2.1.0");
  assert.equal(K.QUESTIONNAIRE_VERSION, "2026-10-v2.1");
  assert.deepEqual(K.SCHEMA_VERSIONEN_OK, ["2.0.0","2.1.0"]);
  assert.equal(K.FOTOS_AKTIV, false);
});
test("Katalog: jeder Text hat Du und Sie", () => {
  for (const [k, v] of Object.entries(K.TEXTE)) assert.ok(v.du && v.sie, "fehlt bei " + k);
});
test("Katalog: keine Gedankenstriche", () => {
  assert.ok(!/[–—]/.test(JSON.stringify(K)), "Gedankenstrich gefunden");
});
test("Katalog: Kachel-Listen vollstaendig", () => {
  assert.deepEqual(K.WEITER.map(w => w.id), ["automatisch","abgetippt","weitergeleitet","uebergeben","bescheid","weissnicht"]);
  assert.equal(K.HAEUFIGKEIT.length, 6);
  assert.equal(K.DAUER.length, 6);
  assert.ok(K.PROGRAMM_BEREICHE.length >= 7);
});

// ---------------------------------------------------------------- Kern
require("../vorbereitung-kern.js");
const C = globalThis.VB2_KERN;

test("leerer Stand hat alle Felder", () => {
  const s = C.leererStand();
  assert.deepEqual(Object.keys(s).sort(), ["ablaeufe","betrieb","extra","nochEtwas","programme","weissNicht","ziel"]);
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
  assert.equal(d.schemaVersion, "2.1.0"); assert.equal(d.questionnaireId, "T-1");
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

test("Extra-Runde: beantwortete Felder mit Gespraechsbogen-Kennung", () => {
  const s = C.leererStand();
  assert.deepEqual(C.extraBeantwortet(s), []);
  s.extra.betreut = "IT-Dienstleister Meier"; s.extra.budgetEinmal.auswahl = "noch offen"; s.extra.daten.kacheln.push("Gesundheitsdaten");
  assert.deepEqual(C.extraBeantwortet(s).map(x => x.code).sort(), ["B04","D01","E01"]);
});
test("Extra-Runde: normalisieren ergaenzt fehlendes extra", () => {
  const d = { betrieb:{}, programme:[], ablaeufe:[] };
  C.normalisieren(d);
  assert.equal(d.extra.nutzer.auswahl, ""); assert.deepEqual(d.extra.grenzen.kacheln, []);
});
test("Katalog: Extra-Runde mit Texten und Kacheln", () => {
  for (const k of ["extra_titel","extra_text","extra_ja","extra_nein","x_betreut","x_einmal","x_grenzen"]) assert.ok(K.TEXTE[k], k);
  assert.ok(K.EXTRA.EINMAL.includes("noch offen")); assert.ok(K.EXTRA.DATEN.includes("Gesundheitsdaten"));
});

// ---------------------------------------------------------------- v2.1 (Reitter-Ruecklauf 08.10.)
test("Uebergaenge: offene werden als Luecke gemeldet, weissNicht erfuellt", () => {
  const s = beispiel(); const a = s.ablaeufe[0];
  a.schritte[0].weiter.art = "";
  assert.deepEqual(C.uebergaengeOffen(a), [0]);
  const k = `ablauf:${a.id}:uebergaenge`;
  assert.ok(C.luecken(s).map(x => x.schluessel).includes(k));
  s.weissNicht.push(k);
  assert.ok(!C.luecken(s).map(x => x.schluessel).includes(k));
});
test("Uebergaenge: bei weniger als zwei Schritten keine Extra-Luecke", () => {
  const s = beispiel(); const a = s.ablaeufe[0]; a.schritte.splice(1);
  assert.ok(!C.luecken(s).map(x => x.schluessel).includes(`ablauf:${a.id}:uebergaenge`));
});
test("Kette: neuer Uebergang 'uebergeben'", () => {
  const s = beispiel(); s.ablaeufe[0].schritte[0].weiter.art = "uebergeben";
  assert.match(C.ketteText(s.ablaeufe[0], s.programme), /^Lead kommt rein \(Telefon\) → übergeben →/);
});
test("Ausloeser: Mehrfachauswahl, alte Einzelauswahl wird uebernommen", () => {
  const d = { betrieb:{}, programme:[], ablaeufe:[{ name:"A", ausloeser:{ auswahl:"Anruf", frei:"" }, schritte:[] }] };
  C.normalisieren(d);
  assert.deepEqual(d.ablaeufe[0].ausloeser.kacheln, ["Anruf"]);
  assert.equal(d.ablaeufe[0].ausloeser.auswahl, "");
  d.ablaeufe[0].ausloeser.kacheln.push("E-Mail"); d.ablaeufe[0].ausloeser.frei = "Website";
  assert.equal(C.ausloeserText(d.ablaeufe[0]), "Anruf, E-Mail, Website");
  const s = beispiel(); const a = s.ablaeufe[0];
  a.ausloeser.auswahl = ""; a.ausloeser.kacheln = ["E-Mail"];
  assert.ok(!C.luecken(s).map(x => x.schluessel).includes(`ablauf:${a.id}:ausloeser`));
});
test("Menge: Hochrechnung pro Woche aus Kacheln und Zahl", () => {
  const a = C.neuerAblauf("X");
  assert.equal(C.wochenStunden(a), null);
  a.haeufigkeit.auswahl = "täglich"; a.dauer.auswahl = "30 bis 60 Min";
  assert.deepEqual(C.wochenStunden(a), { von:2.5, bis:5 });
  assert.equal(C.stundenText(C.wochenStunden(a)), "2,5 bis 5 Std. pro Woche");
  a.haeufigkeit.proWoche = "3"; a.dauer.auswahl = "1 bis 2 Std";
  assert.equal(C.stundenText(C.wochenStunden(a)), "3 bis 6 Std. pro Woche");
  a.haeufigkeit.proWoche = "2 bis 4"; a.dauer.auswahl = "5 bis 15 Min";
  assert.equal(C.stundenText(C.wochenStunden(a)), "10 bis 60 Min. pro Woche");
  a.dauer.auswahl = "länger";
  assert.equal(C.wochenStunden(a), null);
});
test("Menge: Zahl pro Woche reicht als Angabe zu wie oft", () => {
  const s = beispiel(); const a = s.ablaeufe[0];
  a.haeufigkeit.auswahl = ""; a.haeufigkeit.proWoche = "5";
  assert.ok(!C.luecken(s).map(x => x.schluessel).includes(`ablauf:${a.id}:haeufigkeit`));
});
test("Personen: Buero und draussen reichen als Angabe", () => {
  const s = beispiel(); s.betrieb.personen.auswahl = ""; s.betrieb.personen.buero = "1";
  assert.ok(!C.luecken(s).map(x => x.schluessel).includes("betrieb.personen"));
});
test("Rueckfragen: richtige Fragen je Programm", () => {
  const ids = n => C.rueckfragenFuer(C.neuesProgramm(...n)).map(r => r.id);
  assert.deepEqual(ids(["Outlook"]), ["postfach","gemeinsam"]);
  assert.deepEqual(ids(["Apple Mail"]), ["postfach","gemeinsam"]);
  assert.deepEqual(ids(["GMX","","kunde","mail"]), ["postfach","gemeinsam"]);
  assert.deepEqual(ids(["Excel"]), ["office"]);
  assert.deepEqual(ids(["Excel-Listen"]), []);
  assert.deepEqual(ids(["Google Drive"]), ["googlekonto"]);
  assert.deepEqual(ids(["ChatGpt"]), ["kiversion","kiwer"]);
  assert.deepEqual(ids(["Zapier"]), ["automationen"]);
  assert.deepEqual(ids(["Hero","","kunde","kunden"]), ["laeuft"]);
  assert.deepEqual(ids(["Excellent P.2","","vorbelegt"]), ["laeuft"]);
  assert.deepEqual(ids(["HubSpot"]), []);
  assert.deepEqual(ids(["WhatsApp"]), []);
  assert.deepEqual(ids(["Canva","","kunde","sonst"]), []);
});
test("Rueckfragen: Stand mit beantworteten und offenen", () => {
  const s = C.leererStand();
  const o = C.neuesProgramm("Outlook"); o.details.postfach = "Microsoft 365 (Firmenkonto)"; o.details.gemeinsam = K.RUECK_WEISSNICHT;
  const c = C.neuesProgramm("Claude"); const w = C.neuesProgramm("WhatsApp");
  s.programme.push(o, c, w);
  assert.deepEqual(C.rueckfragenStand(s), [
    { name:"Outlook", antworten:[{ kurz:"Postfach", wert:"Microsoft 365 (Firmenkonto)" }], offen:["Gemeinsames Postfach"] },
    { name:"Claude", antworten:[], offen:["Version","Nutzung"] }
  ]);
});
test("Normalisieren: eigener Eintrag mit passender Kachel wird zugeordnet", () => {
  const d = { betrieb:{}, programme:[{ name:"ChatGpt", quelle:"frei", bereich:"sonst" }, { name:"Canva", quelle:"frei", bereich:"sonst" }], ablaeufe:[] };
  C.normalisieren(d);
  assert.deepEqual([d.programme[0].name, d.programme[0].quelle, d.programme[0].bereich], ["ChatGPT","kachel","ki"]);
  assert.equal(d.programme[1].quelle, "frei");
});
test("Rueckfragen: Office nur einmal je Familie, Antwort gilt fuer alle", () => {
  const s = C.leererStand();
  const w = C.neuesProgramm("Word"), e = C.neuesProgramm("Excel"), t = C.neuesProgramm("Microsoft Teams");
  s.programme.push(w, e, t);
  const office = K.RUECKFRAGEN.find(r => r.id === "office");
  assert.deepEqual(C.rueckfragenFuer(w, s.programme).map(r => r.id), ["office"]);
  assert.deepEqual(C.rueckfragenFuer(e, s.programme), []);
  assert.deepEqual(C.rueckfragenStand(s), [{ name:"Word", antworten:[], offen:["Office"] }]);
  C.rueckfrageSetzen(s, w, office, "Microsoft-365-Abo");
  assert.equal(C.rueckfrageWert(s, e, office), "Microsoft-365-Abo");
  C.programmEntfernen(s, w.id);
  assert.deepEqual(C.rueckfragenStand(s), [{ name:"Excel", antworten:[{ kurz:"Office", wert:"Microsoft-365-Abo" }], offen:[] }]);
});
test("Rueckfragen: alte Programme ohne details werden ergaenzt", () => {
  const d = { betrieb:{}, programme:[{ name:"Outlook", quelle:"kachel", bereich:"mail" }], ablaeufe:[] };
  C.normalisieren(d);
  assert.deepEqual(d.programme[0].details, {});
  assert.doesNotThrow(() => C.rueckfragenStand(d));
});
test("Pruefung: Dokumente nach Schema 2.0.0 werden weiter angenommen", () => {
  const d = C.dokument(beispiel(), { kennung:"T-1", kunde:"Test", anrede:"sie", createdAt:"x", lastSubmissionId:null, lastRevision:-1 });
  d.schemaVersion = "2.0.0";
  assert.deepEqual(C.pruefen(d, "T-1"), []);
  d.schemaVersion = "1.0.0";
  assert.ok(C.pruefen(d, "T-1").length);
});
test("Reitter-Ruecklauf 08.10. laeuft durch und meldet die offenen Uebergaenge", async () => {
  const fs = await import("node:fs");
  // Kundendaten liegen nicht in jedem Checkout (Worktree): Pfad dann per VB_REITTER setzen.
  const pfad = process.env.VB_REITTER || new URL("../../../../Kunden/Reitter/Projekte/KI-Beratung/REITTER-2026-10-09_r0.json", import.meta.url);
  if (!fs.existsSync(pfad)) return;
  const d = C.normalisieren(JSON.parse(fs.readFileSync(pfad, "utf8")));
  const l = C.luecken(d).map(x => x.schluessel);
  assert.equal(l.filter(k => k.endsWith(":uebergaenge")).length, 3);
  assert.equal(d.ablaeufe[0].ausloeser.kacheln[0], "Anruf");
  assert.equal(C.stundenText(C.wochenStunden(d.ablaeufe[1])), "2,5 bis 5 Std. pro Woche");
  const offen = C.rueckfragenStand(d).map(x => x.name);
  for (const n of ["Outlook","Word","Google Drive","Claude","ChatGPT","Excellent P.2 (UNI-Electronic)"]) assert.ok(offen.includes(n), n);
  for (const n of ["Excel","Microsoft Teams"]) assert.ok(!offen.includes(n), n + " fragt Office nicht ein zweites Mal");
});
