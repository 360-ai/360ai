/* Fragenkatalog der 360ai-Vorbereitung (Kompakte KI-Potenzialanalyse).
   EINE Quelle fuer zwei Leser: die Seite /vorbereitung laedt diese Datei als
   normales Skript, die Function functions/api/vorbereitung.ts importiert sie
   fuer die lesbare Zusammenfassung in der Mail.
   1:1 aus Strategie/Neuausrichtung/prototyp/02_360ai-Vorbereitung.html
   uebernommen (Stand 2026-09-20). Kennungen identisch mit der Textvorlage,
   Wortlaut nur gemeinsam mit jener Datei aendern. */
(function(){
"use strict";
var STATUS_OPTIONS = [
  ["nicht beantwortet",  "(noch nicht beantwortet)"],
  ["beantwortet",        "beantwortet"],
  ["unbekannt",          "weiß ich nicht"],
  ["nicht zutreffend",   "trifft bei uns nicht zu"],
  ["Gespräch gewünscht", "möchte ich im Gespräch klären"]
];

var BASIS_OPTIONS = [
  ["", "(bitte wählen)"],
  ["geschätzt", "geschätzt"],
  ["aus System abgelesen", "aus System abgelesen"],
  ["gemessen", "gemessen"],
  ["unbekannt", "unbekannt"]
];

/* ------------------------------------------------------------------
   Fragen. Die Kennungen sind identisch mit der Textvorlage
   (Ersatzweg). Wortlaut nur gemeinsam mit jener Datei ändern.
------------------------------------------------------------------ */
var SECTIONS = [
{
  id: "A", title: "Betrieb und Ziel",
  sub: "Kurze Antworten genügen. Zwei bis drei Sätze reichen fast überall.",
  questions: [
    {id:"A01", type:"textarea", label:"Was macht Ihr Unternehmen, und für welche Kunden arbeiten Sie?",
     hint:"Zwei bis drei Sätze reichen.", required:true},
    {id:"A02", type:"textarea", label:"Wie groß ist Ihr Team, und welche Standorte oder Bereiche sollen wir betrachten?",
     hint:"Namen von Beschäftigten sind nicht erforderlich.", required:true},
    {id:"A03", type:"respondents", label:"Wer füllt diese Vorbereitung aus, und wer arbeitet täglich in den beschriebenen Abläufen?",
     hint:"Kontaktperson und beteiligte Rollen. Das können zwei verschiedene Personen sein.", required:true},
    {id:"A04", type:"textarea", label:"Was soll sich in den nächsten sechs bis zwölf Monaten konkret verbessern?",
     hint:"Bitte zuerst frei antworten. Die Auswahl darunter ist nur eine Gedächtnisstütze.", required:true,
     extraChecks:{key:"A04_kategorien", legend:"Optional: Richtung der Verbesserung",
       options:["Zeit sparen","weniger Fehler","schnellere Antworten","bessere Qualität","mehr Kapazität","anderes"]}},
    {id:"A05", type:"textarea", label:"An welchen ein bis drei Stellen verlieren Sie derzeit am meisten Zeit oder entstehen die meisten Rückfragen?",
     hint:"Es muss noch keine technische Lösung dahinterstehen.",
     hilfe:{
       titel:"Woran erkenne ich so eine Stelle?",
       bloecke:[
         {text:"Meist an einem von drei Anzeichen:"},
         {liste:[
           "Etwas wird gesucht, das eigentlich da sein müsste.",
           "Jemand fragt nach, weil eine Information nicht mitgekommen ist.",
           "Etwas wird ein zweites Mal eingegeben, weil zwei Programme nicht miteinander reden."
         ]},
         {text:"Wenn Ihnen dazu gerade nichts einfällt, lassen Sie das Feld offen. Der aufklappbare Kasten bei C01 hilft ebenfalls weiter."}
       ]
     }},
    {id:"A06", type:"textarea", label:"Was haben Sie dort bereits verändert oder ausprobiert, und was ist daraus geworden?",
     hint:"Auch „noch nichts“ ist eine hilfreiche Antwort."}
  ]
},
{
  id: "B", title: "Programme und Informationen",
  sub: "Papier, Excel und Messenger sind ebenfalls Antworten.",
  questions: [
    {id:"B00", type:"checkboxes", label:"Welche Basis nutzen Sie für E-Mail, Kalender und gemeinsame Dateien?",
     hint:"Mehrere Angaben möglich. Gemischte Umgebungen sind normal.", required:true,
     options:["Microsoft 365","Google Workspace","eigener Mail- oder Dateiserver","andere Anbieter oder Einzelkonten","weiß ich nicht"],
     freeLabel:"Falls „andere“: kurze Bezeichnung, soweit bekannt"},
    {id:"B01", type:"systems", label:"Welche Programme oder Hilfsmittel nutzen Sie im Alltag und wofür?",
     hint:"Eine Zeile je System. Kategorien nur als Gedächtnisstütze: E-Mail/Kalender, Angebote/Aufträge, Buchhaltung, Kundenverwaltung, Dateien/Dokumente, interne Kommunikation, Branchensoftware, vorhandene KI. Version oder Tarif nur eintragen, wenn Ihnen die Angabe ohne Nachfrage vorliegt. Sonst bitte leer lassen, wir klären das mit der unter B04 genannten Stelle.", required:true},
    {id:"B02", type:"textarea", label:"Zwischen welchen dieser Programme werden Informationen automatisch übertragen, und wo tippen oder kopieren Sie etwas erneut?",
     hint:"„Nicht bekannt“ ist eine gültige Antwort."},
    {id:"B03", type:"textarea", label:"Wo liegen wichtige Vorlagen, Unterlagen und Arbeitsanweisungen?",
     hint:"Wer pflegt sie, und woran erkennen Mitarbeitende die aktuelle Fassung?"},
    {id:"B04", type:"textarea", label:"Wer kann Fragen zu Ihren Programmen beantworten und gegebenenfalls einen Zugang oder Export ermöglichen?",
     hint:"Rolle oder Name des Dienstleisters genügt. Bitte keine Zugangsdaten."},
    {id:"B05", type:"textarea", label:"Stehen in nächster Zeit Softwarewechsel, neue Verträge oder größere Änderungen an?",
     hint:"Nein, unbekannt, oder ja. Bei ja bitte welche und wann."}
  ]
},
{
  id: "C", title: "Aufgaben entdecken",
  sub: "Erst frei sammeln, dann eine Aufgabe auswählen, die wir näher ansehen.",
  questions: [
    {id:"C01", type:"processes", label:"Welche wiederkehrenden Aufgaben würden Sie gern vereinfachen?",
     hint:"Ziel sind drei Aufgaben; eine genügt, wenn der Fall klar ist. Höchstens acht. Schreiben Sie zuerst auf, was Ihnen von selbst einfällt.", required:true,
     hilfe:{
       titel:"Mir fällt gerade nichts ein. Wie komme ich darauf?",
       bloecke:[
         {text:"Das ist völlig normal. Wer jeden Tag in seinen Abläufen steckt, sieht sie irgendwann nicht mehr. Drei Wege, die erfahrungsgemäß funktionieren."},
         {ueberschrift:"1. Gehen Sie einen normalen Arbeitstag durch",
          text:"Von morgens bis abends, der Reihe nach. Wo mussten Sie etwas suchen, jemanden fragen, dieselbe Information ein zweites Mal eintippen oder auf eine Antwort warten? Jede dieser Stellen ist ein Kandidat."},
         {ueberschrift:"2. Gehen Sie einen Auftrag durch",
          text:"Vom ersten Kontakt bis zur bezahlten Rechnung. Immer wenn etwas von einer Person zur nächsten oder von einem Programm ins nächste wandert, entsteht Arbeit. Genau dort steckt meistens etwas."},
         {ueberschrift:"3. Fragen Sie sich, was Sie sofort abgeben würden",
          text:"Wenn Ihnen morgen jemand eine einzige Aufgabe abnehmen könnte, ohne dass das Ergebnis schlechter wird: welche wäre das? Und was erledigen Sie abends noch, obwohl Sie eigentlich Feierabend hätten?"},
         {ueberschrift:"Sätze, die man in Betrieben oft hört",
          text:"Trifft einer davon bei Ihnen zu, steht dahinter fast immer eine Aufgabe für die Liste:",
          liste:[
            "„Das muss ich jedes Mal neu zusammensuchen.“",
            "„Das weiß nur der Kollege.“",
            "„Das tippen wir aus dem einen Programm ins andere.“",
            "„Am Monatsende hakt da immer jemand hinterher.“",
            "„Wenn die eine Person im Urlaub ist, bleibt das liegen.“",
            "„Wir merken erst beim Kunden, dass etwas fehlt.“",
            "„Dafür haben wir eine Excel-Liste.“",
            "„Das machen wir so, weil es damals mal Ärger gab.“"
          ]},
         {ueberschrift:"Beispiele aus anderen Betrieben",
          text:"Nur als Anstoß, nicht als Auswahl:",
          liste:[
            "Anfragen beantworten und nachfassen",
            "Angebote schreiben",
            "Unterlagen und Vorlagen suchen",
            "Daten von einem System ins andere übertragen",
            "Belege und Rechnungen bearbeiten",
            "Termine koordinieren",
            "Dokumente prüfen und freigeben",
            "Wissen an neue Mitarbeitende weitergeben"
          ]}
       ],
       schluss:"Sie müssen nichts davon auswählen. Wenn bei Ihnen etwas ganz anderes drückt, ist genau das die richtige Antwort."
     }},
    {id:"C02", type:"processpick", label:"Welche Aufgabe sollen wir zuerst näher ansehen, und warum?",
     hint:"Eine zweite Aufgabe können Sie optional zum Vergleich benennen. Wichtigkeit und Ärger dürfen Sie benennen; wir prüfen im Termin gemeinsam, ob ein anderer Kandidat aussichtsreicher ist.", required:true}
  ]
},
{
  id: "D", title: "Grenzen und Einführung",
  sub: "Sie müssen nichts rechtlich oder technisch bewerten. Ihre Einschätzung genügt.",
  questions: [
    {id:"D01", type:"checkboxes", label:"Welche Informationen kommen in den betrachteten Aufgaben vor?",
     hint:"Kategorien genügen, keine Originalinhalte.", required:true,
     options:["allgemeine Unternehmensinformationen","vertrauliche Geschäftsunterlagen","Kunden- oder Kontaktdaten","Personalinformationen","Gesundheitsdaten","andere","unbekannt"],
     freeLabel:"Falls „andere“: kurze Beschreibung"},
    {id:"D02", type:"textarea", label:"Was darf eine neue Lösung ausdrücklich nicht sehen, verändern oder selbst entscheiden?",
     hint:"Zum Beispiel: keine Kundennachrichten automatisch senden, keine Beträge freigeben, keine sensiblen Daten extern verarbeiten.", required:true},
    {id:"D03", type:"textarea", label:"Welche bestehenden Vorgaben müssen wir beachten, und wer muss beteiligt werden?",
     hint:"IT-Verantwortliche, Datenschutz, Betriebsrat falls vorhanden, Geschäftsführung, Softwareanbieter.", required:true},
    {id:"D04", type:"textarea", label:"Wer würde eine neue Lösung testen und später im Alltag verantworten?",
     hint:"Rolle und realistisch verfügbare Zeit. „Muss noch geklärt werden“ ist erlaubt.", required:true},
    {id:"D05", type:"textarea", label:"Was würde Mitarbeitenden die Nutzung erleichtern oder erschweren?",
     hint:"Konkrete Erfahrungen sind hilfreicher als eine allgemeine Einschätzung."},
    {id:"D06", type:"users", label:"Wie viele Personen würden die geplante Lösung voraussichtlich nutzen?",
     hint:"Regelmäßige und gelegentliche Nutzer sind Teilmengen der Gesamtzahl. Bitte nicht zusätzlich addieren. Bei reiner Hintergrundautomatisierung ist „keine direkte Bedienung“ richtig.", required:true}
  ]
},
{
  id: "E", title: "Budget, Entscheidung und Abschluss",
  sub: "„Noch offen“ ist überall eine gültige Antwort und führt zu keinem Nachteil.",
  questions: [
    {id:"E01", type:"textarea", label:"Welchen einmaligen Investitionsrahmen halten Sie bei nachgewiesenem Nutzen für denkbar?",
     hint:"Betrag, Bereich oder „noch offen / im Gespräch klären“.", required:true},
    {id:"E02", type:"textarea", label:"Gibt es einen Rahmen für laufende Software- und Betreuungskosten?",
     hint:"Getrennt vom Einmalbudget. „Noch offen“ ist möglich.", required:true},
    {id:"E03", type:"textarea", label:"Gibt es einen Zieltermin oder einen konkreten Anlass?",
     hint:"Bitte echte Frist, Wunschdatum und flexible Planung unterscheiden.", required:true},
    {id:"E04", type:"textarea", label:"Wer entscheidet über eine Umsetzung, und wer zeigt uns den Ablauf aus eigener täglicher Praxis?",
     hint:"Bitte die Teilnahme für den Prozessblock bestätigen oder den Klärungsbedarf nennen. Entscheider und Prozessperson können dieselbe Person sein.", required:true},
    {id:"E05", type:"textarea", label:"Welche Angaben sind noch unsicher, und was haben wir noch nicht gefragt?",
     hint:"Freies Schlussfeld."}
  ]
}
];

/* Unterfragen für die ausführlich beschriebene Aufgabe */
var P_FULL = [
  {id:"P01", type:"textarea", label:"Was löst die Aufgabe aus, und wann ist sie fertig?",
   hint:"Zum Beispiel „E-Mail mit Anfrage trifft ein“ bis „Angebot wurde geprüft und verschickt“.", required:true},
  {id:"P02", type:"textarea", label:"Wie lief ein typischer Vorgang zuletzt ab?",
   hint:"Drei bis sieben Schritte in eigenen Worten: wer macht was, in welchem Programm, mit welcher Übergabe?", required:true,
   hilfe:{
     titel:"Wie ausführlich soll das sein?",
     bloecke:[
       {text:"Nehmen Sie nicht den idealen Ablauf, sondern den letzten echten Vorgang. Gehen Sie ihn in Gedanken noch einmal durch und schreiben Sie mit, was tatsächlich passiert ist."},
       {ueberschrift:"So könnte das aussehen",
        text:"Ein erfundenes Beispiel aus einem Handwerksbetrieb, damit Sie die Flughöhe sehen:",
        liste:[
          "1. Anfrage kommt per Mail ins Sammelpostfach.",
          "2. Bürokraft sucht ein ähnliches altes Angebot im Ordner.",
          "3. Sie kopiert die Positionen in eine neue Datei und passt sie an.",
          "4. Materialpreise schaut sie im Portal des Großhändlers nach.",
          "5. Entwurf geht per Mail an den Chef.",
          "6. Chef korrigiert meist die Stundensätze und schickt zurück.",
          "7. Angebot geht raus, der Betrag wird ins Auftragsprogramm eingetragen."
        ]},
       {ueberschrift:"Woran Sie merken, dass ein Schritt fehlt",
        text:"Wenn zwischen zwei Ihrer Punkte etwas passiert sein muss, das Sie nicht aufgeschrieben haben. Ein Wechsel des Programms, eine Rückfrage, eine Freigabe oder eine Wartezeit sind eigene Schritte."}
     ],
     schluss:"Perfekt muss das nicht sein. Im Termin gehen wir den Ablauf gemeinsam durch und ergänzen, was fehlt."
   }},
  {id:"P03", type:"frequency", label:"Wie oft kommt die Aufgabe vor?",
   hint:"Anzahl und Zeitraum, bei Bedarf als Bandbreite. Einzelne Vorgänge und Stapel bitte unterscheiden.", required:true},
  {id:"P04", type:"duration", label:"Wie viele Minuten arbeiten Menschen insgesamt an einem Vorgang?",
   hint:"Aktive Arbeit über alle beteiligten Personen. Warte- und Liegezeit bitte getrennt. Eine Bandbreite ist völlig ausreichend.", required:true,
   hilfe:{
     titel:"Ich habe die Zeiten nie gemessen",
     bloecke:[
       {text:"Muss auch niemand. Eine grobe Schätzung ist uns lieber als eine erfundene genaue Zahl. Wichtig ist nur, dass Sie sie als Schätzung kennzeichnen."},
       {ueberschrift:"So kommen Sie auf eine brauchbare Zahl",
        liste:[
          "Denken Sie an den letzten Vorgang und schätzen Sie die einzelnen Schritte, nicht das Ganze.",
          "Rechnen Sie alle beteiligten Personen zusammen. Wenn zwei Leute je zehn Minuten brauchen, sind das zwanzig.",
          "Eine Bandbreite ist erlaubt und oft ehrlicher: „zwischen 20 und 40 Minuten“.",
          "Wenn Sie es wirklich nicht wissen, wählen Sie „weiß ich nicht“. Wir klären es dann gemeinsam."
        ]},
       {ueberschrift:"Der Unterschied zwischen aktiver Zeit und Wartezeit",
        text:"Aktive Zeit ist, woran jemand wirklich arbeitet. Wartezeit ist, wenn der Vorgang liegt, weil jemand antworten oder freigeben muss. Ein Angebot kann zwei Tage dauern und trotzdem nur 45 Minuten Arbeit sein. Beides ist für uns interessant, aber es sind zwei verschiedene Dinge."}
     ]
   }},
  {id:"P05", type:"textarea", label:"Was wird dabei eingegeben und was entsteht am Ende?",
   hint:"Formate und Systeme, etwa E-Mail, PDF, Foto, Excelzeile, Datensatz, Dokumententwurf."},
  {id:"P06", type:"textarea", label:"Welche Ausnahmen, Fehler oder Rückfragen kommen vor?",
   hint:"Ein echtes Beispiel und die ungefähre Häufigkeit, wenn bekannt. „Keine bekannt“ und „kommt nie vor“ sind verschiedene Antworten."},
  {id:"P07", type:"textarea", label:"Wer prüft das Ergebnis, und was würde ein Fehler auslösen?",
   hint:"Korrekturaufwand, falsche Kundeninformation, falsche Buchung oder andere Folge in eigenen Worten.", required:true},
  {id:"P08", type:"textarea", label:"Was wäre eine spürbare Verbesserung?",
   hint:"Weniger Arbeitszeit, weniger Fehler oder schnellerer Abschluss. Möglichst so, dass man es beobachten kann.", required:true},
  {id:"P09", type:"radio", label:"Können Sie im Gespräch einen bereinigten Beispielvorgang zeigen?",
   hint:"Keine Pflicht zum Zusenden von Originalunterlagen.",
   options:["ja","nach Vorbereitung","nein"]}
];

/* Kurzvergleich für den optionalen zweiten Kandidaten */
var P_SHORT = [
  {id:"P01", type:"textarea", label:"Was löst die Aufgabe aus, und wann ist sie fertig?", hint:"Kurz genügt."},
  {id:"P02", type:"textarea", label:"Wie läuft ein Vorgang ab?", hint:"Drei Stichpunkte genügen."},
  {id:"P03", type:"frequency", label:"Wie oft kommt die Aufgabe vor?", hint:"Anzahl und Zeitraum."},
  {id:"P08", type:"textarea", label:"Was wäre eine spürbare Verbesserung?", hint:""},
  {id:"P04", type:"duration", label:"Optional: bekannter Zeitaufwand je Vorgang", hint:"Nur wenn Ihnen der Wert vorliegt. Unbekannt ist hier normal."},
  {id:"P06", type:"textarea", label:"Optional: bekannte Besonderheiten, Fehlerfolgen oder Grenzen", hint:"Nur wenn Ihnen etwas dazu bekannt ist."}
];

/* ------------------------------------------------------------------
   KURZFASSUNG ONLINE (Entscheidung Denis 03.10.2026)
   Anlass: In allen drei Ruecklaeufen (Haase, WFG, Staupp) blieben Block D,
   Block E und der hintere Prozessteil leer. Diese Fragen sind abstrakt,
   solange kein Kandidat feststeht, und werden im Termin besser beantwortet.
   Sie stehen jetzt im Gespraechsbogen (Strategie/Neuausrichtung/
   online-vorbereitung/360ai_Gespraechsbogen.html), nicht mehr hier.
   Wortlaut und Kennungen der verbliebenen Fragen sind unveraendert.
------------------------------------------------------------------ */
var IM_GESPRAECH = ["D02","D03","D04","D05","D06","E01","E02","E04","P07"];

/* Pflichtkern fuer Fortschritt und "Zu klaeren" */
var REQUIRED_TOP = ["A01","A02","A04","B00","B01","C01","C02"];
var REQUIRED_PRIMARY_PROCESS = ["P01","P02","P03","P04"];

/* Reihenfolge auf der Seite. teil 1 = Pflichtkern, teil 2 = freiwillig.
   prozess: "primary" oder "comparison" fuer die Detailbloecke. */
var LAYOUT = [
  {teil:1, titel:"A · Betrieb und Ziel", sub:"Kurze Antworten genügen. Zwei bis drei Sätze reichen fast überall.",
   ids:["A01","A02","A04"]},
  {teil:1, titel:"B · Programme und Informationen", sub:"Papier, Excel und Messenger sind ebenfalls Antworten.",
   ids:["B00","B01"]},
  {teil:1, titel:"C · Aufgaben entdecken", sub:"Erst frei sammeln, dann eine Aufgabe auswählen, die wir näher ansehen.",
   ids:["C01","C02"]},
  {teil:1, prozess:"primary", titel:"Die ausgewählte Aufgabe",
   sub:"Diese Fragen beziehen sich auf die Aufgabe, die Sie unter C02 ausgewählt haben.",
   ids:["P01","P02","P03","P04"]},
  {teil:2, titel:"Betrieb und Ziel, Ergänzungen", sub:"",
   ids:["A03","A05","A06"]},
  {teil:2, titel:"Programme und Informationen, Ergänzungen", sub:"",
   ids:["B02","B03","B04","B05","D01"]},
  {teil:2, prozess:"primary", titel:"Die ausgewählte Aufgabe, Ergänzungen", sub:"",
   ids:["P05","P06","P08","P09"]},
  {teil:2, prozess:"comparison", titel:"Zweite Aufgabe, optionaler Kurzvergleich",
   sub:"Nur ausfüllen, wenn Sie unter C02 eine zweite Aufgabe zum Vergleich benannt haben.",
   ids:["P01","P02","P03","P08","P04","P06"]},
  {teil:2, titel:"Zum Schluss", sub:"",
   ids:["E03","E05"]}
];

var SCHEMA_VERSION        = "1.0.0";
var QUESTIONNAIRE_VERSION = "2026-10-03-kurz";
var DOC_TYPE              = "360ai.preassessment";

/* Fragen nach Kennung. P-Fragen getrennt nach Vertiefung und Vergleich. */
var BY_ID = {}, P_BY_ID = {}, PS_BY_ID = {};
SECTIONS.forEach(function(s){ s.questions.forEach(function(q){ BY_ID[q.id] = q; }); });
P_FULL.forEach(function(q){ P_BY_ID[q.id] = q; });
P_SHORT.forEach(function(q){ PS_BY_ID[q.id] = q; });

globalThis.VB_FRAGEN = {
  STATUS_OPTIONS: STATUS_OPTIONS, BASIS_OPTIONS: BASIS_OPTIONS,
  SECTIONS: SECTIONS, P_FULL: P_FULL, P_SHORT: P_SHORT,
  BY_ID: BY_ID, P_BY_ID: P_BY_ID, PS_BY_ID: PS_BY_ID,
  LAYOUT: LAYOUT, IM_GESPRAECH: IM_GESPRAECH,
  REQUIRED_TOP: REQUIRED_TOP, REQUIRED_PRIMARY_PROCESS: REQUIRED_PRIMARY_PROCESS,
  SCHEMA_VERSION: SCHEMA_VERSION, QUESTIONNAIRE_VERSION: QUESTIONNAIRE_VERSION, DOC_TYPE: DOC_TYPE
};
})();
