/* Fragenkatalog der 360ai-Vorbereitung v2 (gefuehrter Assistent).
   Nur Texte (Du und Sie), Kachel-Listen und Grenzen. Logik steht in
   vorbereitung-kern.js. Geladen von der Seite /vorbereitung (klassisches
   Skript) und von functions/api/vorbereitung.ts (Seiteneffekt-Import).
   Spezifikation: Strategie/Neuausrichtung/online-vorbereitung/
   2026-10-03_Spezifikation_Vorbereitung_v2.md */
(function(){
"use strict";
function t(sie, du){ return {sie:sie, du:du}; }
var TEXTE = {
  start_titel:   t("Vorbereitung auf Ihren Termin", "Vorbereitung auf unseren Termin"),
  start_text:    t("Damit wir im Termin direkt an Ihren echten Abläufen arbeiten können, beschreiben Sie uns vorab, wie bei Ihnen gearbeitet wird. Das dauert etwa 20 bis 30 Minuten. Ihr Stand wird in diesem Browser automatisch gespeichert, Sie können jederzeit unterbrechen.",
                   "Damit wir im Termin direkt an euren echten Abläufen arbeiten können, beschreib uns vorab, wie bei euch gearbeitet wird. Das dauert etwa 20 bis 30 Minuten. Dein Stand wird in diesem Browser automatisch gespeichert, du kannst jederzeit unterbrechen."),
  start_hinweis: t("Bitte tragen Sie keine Passwörter oder Zugangsdaten ein.", "Bitte trag keine Passwörter oder Zugangsdaten ein."),
  start_los:     t("Los geht es", "Los geht es"),
  betrieb_titel: t("Ihr Betrieb", "Euer Betrieb"),
  betrieb_was:   t("Was macht Ihr Betrieb, und für wen?", "Was macht ihr, und für wen?"),
  betrieb_wer:   t("Wie viele Personen arbeiten bei Ihnen?", "Wie viele Leute arbeiten bei euch?"),
  betrieb_davon: t("Davon ungefähr", "Davon ungefähr"),
  betrieb_buero: t("im Büro", "im Büro"),
  betrieb_draussen: t("draußen (Baustelle, Außendienst, bei Kunden)", "draußen (Baustelle, Außendienst, bei Kunden)"),
  betrieb_azubis: t("Sind Auszubildende mitgezählt?", "Sind Azubis mitgezählt?"),
  prog_titel:    t("Ihre Programme", "Eure Programme"),
  prog_frage:    t("Welche Programme und Hilfsmittel nutzen Sie im Alltag? Tippen Sie alles an, was vorkommt.", "Welche Programme und Hilfsmittel nutzt ihr im Alltag? Tipp alles an, was vorkommt."),
  prog_frei:     t("eigenes", "eigenes"),
  prog_wofuer:   t("wofür? (optional)", "wofür? (optional)"),
  prog_rueck:    t("Bei einigen Programmen fragen wir kurz nach. Das erspart uns Rückfragen im Termin.", "Bei einigen Programmen fragen wir kurz nach. Das erspart uns Rückfragen im Termin."),
  prog_inuse:    t("Wird in einem Ablauf verwendet. Dort bleibt der Name als Text stehen.", "Wird in einem Ablauf verwendet. Dort bleibt der Name als Text stehen."),
  ziel_titel:    t("Ihr Ziel", "Euer Ziel"),
  ziel_frage:    t("Wenn wir Ihnen eine Arbeit abnehmen könnten, welche wäre das?", "Wenn wir dir eine Arbeit abnehmen könnten, welche wäre das?"),
  abl_titel:     t("Ihre Abläufe", "Eure Abläufe"),
  abl_frage:     t("Welche Abläufe kosten Sie am meisten Zeit oder Nerven? Bis zu drei, einer genügt.", "Welche Abläufe kosten euch am meisten Zeit oder Nerven? Bis zu drei, einer genügt."),
  abl_hilfe:     t("Mir fällt nichts ein", "Mir fällt nichts ein"),
  beschr_frage:  t("Erzählen Sie, wie das beim letzten Mal gelaufen ist: Wer hat was gemacht, womit, und wie ging es dann weiter?", "Erzähl, wie das beim letzten Mal gelaufen ist: Wer hat was gemacht, womit, und wie ging es dann weiter?"),
  beschr_hinweis:t("In Ihren eigenen Worten, so wie Sie es einem neuen Kollegen erklären würden. Bitte schreiben Sie bei jedem Schritt in Klammern dazu, womit er passiert, z. B. (Excel), (Zettel) oder (WhatsApp).", "In deinen eigenen Worten, so wie du es einem neuen Kollegen erklären würdest. Bitte schreib bei jedem Schritt in Klammern dazu, womit er passiert, z. B. (Excel), (Zettel) oder (WhatsApp)."),
  beschr_beispiel: t("Beispiel aus einem Malerbetrieb", "Beispiel aus einem Malerbetrieb"),
  menge_oft:     t("Wie oft kommt das vor?", "Wie oft kommt das vor?"),
  menge_dauer:   t("Wie lange sind Sie insgesamt mit einem Fall beschäftigt, ungefähr?", "Wie lange seid ihr insgesamt mit einem Fall beschäftigt, ungefähr?"),
  menge_dauer_hinweis: t("Ein Fall ist z. B. ein Angebot oder eine Bestellung. Alle Beteiligten zusammen, grob geschätzt reicht.", "Ein Fall ist z. B. ein Angebot oder eine Bestellung. Alle Beteiligten zusammen, grob geschätzt reicht."),
  menge_frei:    t("Genauer, falls Sie mögen", "Genauer, falls du magst"),
  aerger_frage:  t("Was nervt daran?", "Was nervt daran?"),
  noch_titel:    t("Noch etwas?", "Noch etwas?"),
  noch_frage:    t("Was sollten wir vor dem Termin noch wissen?", "Was sollten wir vor dem Termin noch wissen?"),
  pruef_titel:   t("Kurz prüfen und senden", "Kurz prüfen und senden"),
  pruef_luecken: t("Diese Angaben fehlen noch. Sie können trotzdem senden, den Rest klären wir im Termin.", "Diese Angaben fehlen noch. Du kannst trotzdem senden, den Rest klären wir im Termin."),
  senden:        t("An 360ai senden", "An 360ai senden"),
  weissnicht:    t("Weiß ich nicht", "Weiß ich nicht"),
  weiter:        t("Weiter", "Weiter"),
  zurueck:       t("Zurück", "Zurück"),
  frei:          t("Anderes, bitte eintragen", "Anderes, bitte eintragen"),
  extra_titel:   t("Fast geschafft. Noch 10 Minuten?", "Fast geschafft. Noch 10 Minuten?"),
  extra_text:    t("Die folgenden Fragen sind freiwillig. Jede Antwort, die Sie hier schon geben, müssen wir im Termin nicht mehr klären. So bleibt im Gespräch mehr Zeit für Lösungen, und wir können uns gezielter auf Ihren Betrieb vorbereiten. Jede Frage dürfen Sie leer lassen.",
                   "Die folgenden Fragen sind freiwillig. Jede Antwort, die du hier schon gibst, müssen wir im Termin nicht mehr klären. So bleibt im Gespräch mehr Zeit für Lösungen, und wir können uns gezielter auf euren Betrieb vorbereiten. Jede Frage darfst du leer lassen."),
  extra_ja:      t("Ja, weiter", "Ja, weiter"),
  extra_nein:    t("Überspringen", "Überspringen"),
  extra_eyebrow: t("Extra · spart Zeit im Termin", "Extra · spart Zeit im Termin"),
  extra_prog_titel:   t("Programme und Daten", "Programme und Daten"),
  extra_team_titel:   t("Team und Entscheidung", "Team und Entscheidung"),
  extra_rahmen_titel: t("Zeit und Budget", "Zeit und Budget"),
  x_betreut:     t("Wen rufen Sie an, wenn ein Programm nicht läuft?", "Wen ruft ihr an, wenn ein Programm nicht läuft?"),
  x_wechsel:     t("Steht bei Ihren Programmen ein Wechsel oder eine größere Änderung an?", "Steht bei euren Programmen ein Wechsel oder eine größere Änderung an?"),
  x_vorlagen:    t("Wo liegen Vorlagen und Arbeitsanweisungen?", "Wo liegen Vorlagen und Arbeitsanweisungen?"),
  x_daten:       t("Welche Daten kommen in den beschriebenen Abläufen vor?", "Welche Daten kommen in den beschriebenen Abläufen vor?"),
  x_imablauf:    t("Wer arbeitet täglich in den beschriebenen Abläufen?", "Wer arbeitet täglich in den beschriebenen Abläufen?"),
  x_nutzer:      t("Wie viele Personen würden eine Lösung nutzen?", "Wie viele Leute würden eine Lösung nutzen?"),
  x_entscheider: t("Wer entscheidet über eine Umsetzung?", "Wer entscheidet über eine Umsetzung?"),
  x_probiert:    t("Was haben Sie schon ausprobiert, und was ist daraus geworden?", "Was habt ihr schon ausprobiert, und was ist daraus geworden?"),
  x_zieltermin:  t("Gibt es einen Zieltermin oder einen konkreten Anlass?", "Gibt es einen Zieltermin oder einen konkreten Anlass?"),
  x_einmal:      t("Was wäre Ihnen eine Lösung einmalig ungefähr wert?", "Was wäre euch eine Lösung einmalig ungefähr wert?"),
  x_laufend:     t("Und laufend pro Monat für Software und Betreuung?", "Und laufend pro Monat für Software und Betreuung?"),
  x_budget_hinweis: t("Nur eine grobe Orientierung, keine Zusage.", "Nur eine grobe Orientierung, keine Zusage."),
  danke_titel:   t("Vielen Dank, Ihre Vorbereitung ist bei 360ai angekommen.", "Danke, deine Vorbereitung ist bei 360ai angekommen."),
  danke_text:    t("Wenn Ihnen noch etwas einfällt, öffnen Sie denselben Link wieder und senden Sie erneut. Die neue Fassung ersetzt die vorige.", "Wenn dir noch etwas einfällt, öffne denselben Link wieder und sende erneut. Die neue Fassung ersetzt die vorige.")
};
var PERSONEN = ["1 bis 5","6 bis 20","21 bis 50","mehr als 50"];
var AZUBIS = ["ja","nein","keine Azubis"];
var PROGRAMM_BEREICHE = [
  {id:"mail",   titel:"Mail und Kalender",                 kacheln:["Outlook","Gmail","Apple Mail"],                beispiel:"z. B. GMX, iCloud"},
  {id:"buero",  titel:"Büro",                              kacheln:["Word","Excel","Google Docs und Tabellen"],     beispiel:"z. B. Pages"},
  {id:"buch",   titel:"Buchhaltung",                       kacheln:["DATEV","lexoffice","sevDesk"],                 beispiel:"z. B. Lexware"},
  {id:"kunden", titel:"Kunden, Aufträge und Projekte",     kacheln:["HubSpot","Pipedrive"],                         beispiel:"z. B. Hero, CATS"},
  {id:"komm",   titel:"Kommunikation",                     kacheln:["WhatsApp","Microsoft Teams","Slack"],          beispiel:"z. B. Telegram"},
  {id:"ablage", titel:"Ablage und Cloud",                  kacheln:["OneDrive oder SharePoint","Google Drive","Dropbox","Server im Büro"], beispiel:"z. B. NAS"},
  {id:"auto",   titel:"Automatisierung",                   kacheln:["Zapier","Make","Power Automate","n8n"],        beispiel:"z. B. IFTTT"},
  {id:"ki",     titel:"KI-Werkzeuge",                      kacheln:["ChatGPT","Claude","Microsoft Copilot","Gemini"], beispiel:"z. B. Perplexity, DeepL"},
  {id:"papier", titel:"Papier und Listen",                 kacheln:["Papier und Ordner","Excel-Listen"],            beispiel:"z. B. Whiteboard"},
  {id:"sonst",  titel:"Sonstiges",                         kacheln:[],                                              beispiel:"z. B. Canva"}
];
var WOMIT_EXTRA = [ {id:"telefon",titel:"Telefon"}, {id:"papier",titel:"Papier"},
                    {id:"kopf",titel:"im Kopf"}, {id:"persoenlich",titel:"persönlich"} ];
var WEITER = [
  {id:"automatisch",    titel:"läuft automatisch"},
  {id:"abgetippt",      titel:"abgetippt/kopiert"},
  {id:"weitergeleitet", titel:"per Mail/Messenger"},
  {id:"uebergeben",     titel:"Zettel oder persönlich übergeben"},
  {id:"bescheid",       titel:"jemand sagt Bescheid"},
  {id:"weissnicht",     titel:"weiß nicht"}
];
var AUSLOESER = ["Anruf","E-Mail","WhatsApp oder Messenger","Formular oder Website","feste Zeit","Papier","persönlich"];
var HAEUFIGKEIT = ["mehrmals täglich","täglich","mehrmals pro Woche","wöchentlich","monatlich","seltener"];
var DAUER = ["unter 5 Min","5 bis 15 Min","15 bis 30 Min","30 bis 60 Min","1 bis 2 Std","länger"];
/* Fuer die Rueckrechnung auf Stunden pro Woche: Spanne je Kachel.
   null = nicht hochrechnen (zu ungenau). */
var HAEUFIGKEIT_PRO_WOCHE = {"mehrmals täglich":[10,25], "täglich":[5,5], "mehrmals pro Woche":[2,4],
                             "wöchentlich":[1,1], "monatlich":[0.25,0.25], "seltener":null};
var DAUER_MINUTEN = {"unter 5 Min":[2,5], "5 bis 15 Min":[5,15], "15 bis 30 Min":[15,30],
                     "30 bis 60 Min":[30,60], "1 bis 2 Std":[60,120], "länger":null};
var MENGE_PASST = ["passt", "eher mehr", "eher weniger"];
var ZIEL = ["Zeit sparen","weniger Fehler","schneller antworten","mehr Kapazität","weniger abhängig von einzelnen Personen"];
var AERGER = ["doppelt tippen","suchen","warten","Rückfragen","Fehler","hängt an einer Person"];
/* Freiwillige Extra-Runde (Denis 04.10.): Fragen, die sonst im Termin Zeit kosten. */
var EXTRA = {
  WECHSEL:    ["nein", "ja, geplant", "unklar"],
  DATEN:      ["Kunden- oder Kontaktdaten", "vertrauliche Geschäftsunterlagen", "Personalinformationen", "Gesundheitsdaten", "weiß nicht"],
  NUTZER:     ["1 bis 2", "3 bis 5", "6 bis 15", "mehr als 15"],
  ZIELTERMIN: ["feste Frist", "Wunschtermin", "flexibel"],
  EINMAL:     ["bis 1.000 €", "1.000 bis 2.500 €", "2.500 bis 5.000 €", "5.000 bis 10.000 €", "über 10.000 €", "noch offen"],
  LAUFEND:    ["bis 50 €", "50 bis 150 €", "150 bis 300 €", "über 300 €", "noch offen"],
  GRENZEN:    ["nichts ohne Freigabe an Kunden senden", "keine Beträge oder Preise freigeben", "nichts im Hauptsystem ändern", "sensible Daten nicht nach außen geben"]
};
/* Rueckfragen am Programm (Denis 08.10.): nur dort, wo die Antwort spaeter
   entscheidet, was technisch geht. Kundensprache, keine Begruendung.
   Wann eine Frage erscheint: bereiche (Zeile der Kachel), namen (genaue
   Kachel) oder frei (eigener Eintrag in diesen Zeilen, "" = vorbelegt ohne Zeile).
   kurz: Bezeichnung in der Mail an 360ai.
   einmal: gilt fuer die ganze Programmfamilie (Word, Excel, Teams sind ein Office),
   wird nur beim ersten passenden Programm gefragt und fuer alle gespeichert. */
var RUECKFRAGEN = [
  {id:"postfach", kurz:"Postfach", bereiche:["mail"],
   frage:t("Wo haben Sie Ihre Firmen-Mailadresse her?", "Wo habt ihr eure Firmen-Mailadresse her?"),
   optionen:["mit der Website, z. B. IONOS, Strato, one.com", "Telekom oder anderer Internetanbieter", "Microsoft (Outlook im Abo)", "Google (Gmail mit eigener Adresse)", "private Adresse, z. B. GMX, web.de, Gmail"]},
  {id:"gemeinsam", kurz:"Gemeinsames Postfach", bereiche:["mail"],
   frage:t("Gibt es ein gemeinsames Postfach, z. B. info@?", "Gibt es ein gemeinsames Postfach, z. B. info@?"),
   optionen:["ja", "nein"]},
  {id:"office", kurz:"Office", einmal:true, namen:["Word","Excel","Microsoft Teams","OneDrive oder SharePoint"],
   frage:t("Zahlen Sie für Office regelmäßig oder haben Sie es einmal gekauft?", "Zahlt ihr für Office regelmäßig oder habt ihr es einmal gekauft?"),
   optionen:["regelmäßig, monatlich oder jährlich (Abo)", "einmal gekauft, z. B. Office 2021"]},
  {id:"googlekonto", kurz:"Google-Konto", einmal:true, namen:["Google Drive","Google Docs und Tabellen"],
   frage:t("Mit welchem Konto?", "Mit welchem Konto?"),
   optionen:["Firmenkonto (Google Workspace)", "privates Google-Konto"]},
  {id:"kiversion", kurz:"Version", bereiche:["ki"],
   frage:t("Welche Version?", "Welche Version?"),
   optionen:["kostenlos", "eigenes Abo, z. B. Plus oder Pro", "Team oder Business"]},
  {id:"kiwer", kurz:"Nutzung", bereiche:["ki"],
   frage:t("Wer nutzt es?", "Wer nutzt es?"),
   optionen:["nur eine Person", "mehrere", "alle"]},
  {id:"automationen", kurz:"Automationen", bereiche:["auto"],
   frage:t("Wie viele Automationen laufen darüber?", "Wie viele Automationen laufen darüber?"),
   optionen:["1 bis 3", "4 bis 10", "mehr als 10"]},
  {id:"laeuft", kurz:"Läuft", frei:["kunden","buch",""],
   frage:t("Wie öffnen Sie das Programm?", "Wie öffnet ihr das Programm?"),
   optionen:["auf dem Rechner installiert", "im Internet-Browser, mit Anmeldung"]}
];
var RUECK_WEISSNICHT = "weiß nicht";
/* Beispiel unter dem Freitext (Denis 22.10.: sichtbar, nicht zugeklappt). Absichtlich aus
   einer Branche, die in der Akquise selten vorkommt, damit es nicht abgeschrieben wird. */
var BEISPIEL_BESCHREIBUNG = t(
  "Ein Kunde ruft an (Telefon), meine Frau schreibt Name und Nummer auf (Zettel). Abends tippe ich das ab (Excel). Am nächsten Tag fahre ich raus, messe auf (Notizblock) und schreibe das Angebot (Word). Das schicke ich dem Kunden (Outlook). Ob er zusagt, merke ich erst, wenn er zurückruft (Telefon). Dann trage ich den Termin ein (Google Kalender) und sage den Jungs Bescheid (WhatsApp).",
  "Ein Kunde ruft an (Telefon), meine Frau schreibt Name und Nummer auf (Zettel). Abends tippe ich das ab (Excel). Am nächsten Tag fahre ich raus, messe auf (Notizblock) und schreibe das Angebot (Word). Das schicke ich dem Kunden (Outlook). Ob er zusagt, merke ich erst, wenn er zurückruft (Telefon). Dann trage ich den Termin ein (Google Kalender) und sage den Jungs Bescheid (WhatsApp).");
/* Nur noch fuer Staende aus 2.0/2.1 (Kette Schritt fuer Schritt). */
var BEISPIEL_KETTE = [
  "Kunde ruft an · Telefon · wird abgetippt",
  "Anfrage eintragen · Branchensoftware · jemand sagt Bescheid",
  "Angebot schreiben · Word · per Mail weitergeleitet",
  "Chef prüft und gibt frei · Outlook · ..."
];
var BEISPIEL_ABLAEUFE = ["Anfrage bis Angebot","Stundenzettel bis Abrechnung","Eingangsrechnung bis Buchhaltung","Neuer Kunde bis erster Termin"];
globalThis.VB2 = {
  SCHEMA_VERSION:"2.2.0", SCHEMA_VERSIONEN_OK:["2.0.0","2.1.0","2.2.0"], QUESTIONNAIRE_VERSION:"2026-10-v2.2", DOC_TYPE:"360ai.preassessment",
  FOTOS_AKTIV:false, MAX_ABLAEUFE:3, MAX_SCHRITTE:12, MAX_PROGRAMME:40, MAX_TEXT:5000,
  TEXTE:TEXTE, PERSONEN:PERSONEN, PROGRAMM_BEREICHE:PROGRAMM_BEREICHE, WOMIT_EXTRA:WOMIT_EXTRA,
  WEITER:WEITER, AUSLOESER:AUSLOESER, HAEUFIGKEIT:HAEUFIGKEIT, DAUER:DAUER, ZIEL:ZIEL, AERGER:AERGER,
  AZUBIS:AZUBIS, HAEUFIGKEIT_PRO_WOCHE:HAEUFIGKEIT_PRO_WOCHE, DAUER_MINUTEN:DAUER_MINUTEN, MENGE_PASST:MENGE_PASST,
  RUECKFRAGEN:RUECKFRAGEN, RUECK_WEISSNICHT:RUECK_WEISSNICHT,
  EXTRA:EXTRA, BEISPIEL_BESCHREIBUNG:BEISPIEL_BESCHREIBUNG, BEISPIEL_KETTE:BEISPIEL_KETTE, BEISPIEL_ABLAEUFE:BEISPIEL_ABLAEUFE
};
})();
