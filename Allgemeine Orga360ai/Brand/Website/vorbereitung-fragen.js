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
  prog_titel:    t("Ihre Programme", "Eure Programme"),
  prog_frage:    t("Welche Programme und Hilfsmittel nutzen Sie im Alltag? Tippen Sie alles an, was vorkommt.", "Welche Programme und Hilfsmittel nutzt ihr im Alltag? Tipp alles an, was vorkommt."),
  prog_frei:     t("eigenes", "eigenes"),
  prog_wofuer:   t("wofür? (optional)", "wofür? (optional)"),
  prog_inuse:    t("Wird in einem Ablauf verwendet. Dort bleibt der Name als Text stehen.", "Wird in einem Ablauf verwendet. Dort bleibt der Name als Text stehen."),
  ziel_titel:    t("Ihr Ziel", "Euer Ziel"),
  ziel_frage:    t("Was soll in einem Jahr anders sein als heute?", "Was soll in einem Jahr anders sein als heute?"),
  abl_titel:     t("Ihre Abläufe", "Eure Abläufe"),
  abl_frage:     t("Welche Abläufe kosten Sie am meisten Zeit oder Nerven? Bis zu drei, einer genügt.", "Welche Abläufe kosten euch am meisten Zeit oder Nerven? Bis zu drei, einer genügt."),
  abl_hilfe:     t("Mir fällt nichts ein", "Mir fällt nichts ein"),
  ausl_frage:    t("Wann geht es los? Was löst den Ablauf aus?", "Wann geht es los? Was löst den Ablauf aus?"),
  kette_frage:   t("Denken Sie an das letzte Mal. Was ist Schritt für Schritt passiert?", "Denk an das letzte Mal. Was ist Schritt für Schritt passiert?"),
  kette_was:     t("Was passiert?", "Was passiert?"),
  kette_womit:   t("Womit?", "Womit?"),
  kette_weiter:  t("Wie geht es zum nächsten Schritt?", "Wie geht es zum nächsten Schritt?"),
  kette_auto_womit: t("womit, z. B. Zapier (falls bekannt)", "womit, z. B. Zapier (falls bekannt)"),
  kette_plus:    t("+ nächster Schritt", "+ nächster Schritt"),
  kette_beispiel:t("Beispiel ansehen", "Beispiel ansehen"),
  menge_oft:     t("Wie oft kommt das vor?", "Wie oft kommt das vor?"),
  menge_dauer:   t("Wie lange dauert ein Vorgang, alle Beteiligten zusammen?", "Wie lange dauert ein Vorgang, alle Beteiligten zusammen?"),
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
  danke_titel:   t("Vielen Dank, Ihre Vorbereitung ist bei 360ai angekommen.", "Danke, deine Vorbereitung ist bei 360ai angekommen."),
  danke_text:    t("Wenn Ihnen noch etwas einfällt, öffnen Sie denselben Link wieder und senden Sie erneut. Die neue Fassung ersetzt die vorige.", "Wenn dir noch etwas einfällt, öffne denselben Link wieder und sende erneut. Die neue Fassung ersetzt die vorige.")
};
var PERSONEN = ["1 bis 5","6 bis 20","21 bis 50","mehr als 50"];
var PROGRAMM_BEREICHE = [
  {id:"mail",   titel:"Mail und Kalender",                 kacheln:["Outlook","Gmail","Apple Mail"],                beispiel:"z. B. GMX, iCloud"},
  {id:"buero",  titel:"Büro",                              kacheln:["Word","Excel","Google Docs und Tabellen"],     beispiel:"z. B. Pages"},
  {id:"buch",   titel:"Buchhaltung",                       kacheln:["DATEV","lexoffice","sevDesk"],                 beispiel:"z. B. Lexware"},
  {id:"kunden", titel:"Kunden, Aufträge und Projekte",     kacheln:["HubSpot","Pipedrive"],                         beispiel:"z. B. Hero, CATS"},
  {id:"komm",   titel:"Kommunikation",                     kacheln:["WhatsApp","Microsoft Teams","Slack"],          beispiel:"z. B. Telegram"},
  {id:"ablage", titel:"Ablage und Cloud",                  kacheln:["OneDrive oder SharePoint","Google Drive","Dropbox","Server im Büro"], beispiel:"z. B. NAS"},
  {id:"auto",   titel:"Automatisierung",                   kacheln:["Zapier","Make","Power Automate","n8n"],        beispiel:"z. B. IFTTT"},
  {id:"papier", titel:"Papier und Listen",                 kacheln:["Papier und Ordner","Excel-Listen"],            beispiel:"z. B. Whiteboard"},
  {id:"sonst",  titel:"Sonstiges",                         kacheln:[],                                              beispiel:"z. B. Canva"}
];
var WOMIT_EXTRA = [ {id:"telefon",titel:"Telefon"}, {id:"papier",titel:"Papier"},
                    {id:"kopf",titel:"im Kopf"}, {id:"persoenlich",titel:"persönlich"} ];
var WEITER = [
  {id:"automatisch",    titel:"läuft automatisch"},
  {id:"abgetippt",      titel:"abgetippt/kopiert"},
  {id:"weitergeleitet", titel:"per Mail/Messenger"},
  {id:"bescheid",       titel:"jemand sagt Bescheid"},
  {id:"weissnicht",     titel:"weiß nicht"}
];
var AUSLOESER = ["Anruf","E-Mail","WhatsApp oder Messenger","Formular oder Website","feste Zeit","Papier","persönlich"];
var HAEUFIGKEIT = ["mehrmals täglich","täglich","mehrmals pro Woche","wöchentlich","monatlich","seltener"];
var DAUER = ["unter 5 Min","5 bis 15 Min","15 bis 30 Min","30 bis 60 Min","1 bis 2 Std","länger"];
var ZIEL = ["Zeit sparen","weniger Fehler","schneller antworten","mehr Kapazität","weniger abhängig von einzelnen Personen"];
var AERGER = ["doppelt tippen","suchen","warten","Rückfragen","Fehler","hängt an einer Person"];
var BEISPIEL_KETTE = [
  "Kunde ruft an · Telefon · wird abgetippt",
  "Anfrage eintragen · Branchensoftware · jemand sagt Bescheid",
  "Angebot schreiben · Word · per Mail weitergeleitet",
  "Chef prüft und gibt frei · Outlook · ..."
];
var BEISPIEL_ABLAEUFE = ["Anfrage bis Angebot","Stundenzettel bis Abrechnung","Eingangsrechnung bis Buchhaltung","Neuer Kunde bis erster Termin"];
globalThis.VB2 = {
  SCHEMA_VERSION:"2.0.0", QUESTIONNAIRE_VERSION:"2026-10-v2", DOC_TYPE:"360ai.preassessment",
  FOTOS_AKTIV:false, MAX_ABLAEUFE:3, MAX_SCHRITTE:12, MAX_PROGRAMME:40, MAX_TEXT:5000,
  TEXTE:TEXTE, PERSONEN:PERSONEN, PROGRAMM_BEREICHE:PROGRAMM_BEREICHE, WOMIT_EXTRA:WOMIT_EXTRA,
  WEITER:WEITER, AUSLOESER:AUSLOESER, HAEUFIGKEIT:HAEUFIGKEIT, DAUER:DAUER, ZIEL:ZIEL, AERGER:AERGER,
  BEISPIEL_KETTE:BEISPIEL_KETTE, BEISPIEL_ABLAEUFE:BEISPIEL_ABLAEUFE
};
})();
