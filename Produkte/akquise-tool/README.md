# 360ai Akquise-Tool

Internes Werkzeug für selbst gefundene Akquise-Leads. Analysiert die Website eines Betriebs
immer nach denselben Regeln, erzeugt Telefonleitfaden und Mailtext und verwaltet den Lead bis
zum Abschluss oder zur Absage.

**Kein Lead-Generator.** Die Leads findest du selbst; das Werkzeug bewertet und verwaltet sie.

---

## Das Grundprinzip

```
Messen  →  Regel  →  Bewerten
Code       Code      Claude
```

Der Collector misst und erzeugt `facts.json` — reine Messwerte, keine Wertung.
Die Rule Engine wendet 75 benannte Regeln an und erzeugt `findings.json` mit PASS/WARN/FAIL.
Claude bewertet **ausschließlich Regelergebnisse**, nie Rohfakten.

Der Grund für die mittlere Schicht: Aus einem Rohfakt lässt sich eine falsche Aussage bauen, die
formal belegt aussieht — „keine H1 vorhanden, Beleg F023", wobei F023 die H1 enthält. Aus einem
Regelergebnis (`SEO-04 H1_PRESENT = PASS`) nicht. Der Validator weist eine Feststellung zurück,
die sich auf eine Regel mit PASS stützt.

**n8n ist der einzige Prozess, der CRM-Zustand verändert.** Der lokale Lauf schreibt nie ins
Google Sheet; er liefert eine Nutzlast an einen Webhook, n8n prüft und schreibt.

---

## Einmalige Einrichtung

### 1. Abhängigkeiten

```bash
cd ~/Documents/360ai/Produkte/akquise-tool
npm install
npx playwright install chromium   # nur nötig, wenn kein Chromium im Cache liegt
npm test                          # muss grün sein
```

### 2. PageSpeed-Schlüssel (empfohlen, kostenlos)

Ohne Schlüssel bleiben drei Regeln unbekannt — sauber ausgewiesen, aber die Technik-Achse ist
unvollständig.

1. In der Google Cloud Console ein Projekt anlegen
2. „PageSpeed Insights API" aktivieren
3. Unter „Anmeldedaten" einen API-Schlüssel erstellen
4. Dauerhaft setzen:

```bash
setx PSI_API_KEY "dein-schluessel"
```

Neue Shell öffnen, damit die Variable greift.

### 3. Google Sheet

Siehe `SHEET.md` — drei Blätter mit exakt den dort genannten Spaltenüberschriften.
Danach die Tabellen-ID notieren.

### 4. n8n-Workflows

Die sechs Dateien unter `n8n/` importieren:

- `akquise-wf1-lead-quickcheck.json` — Erfassung, Analyse-Webhook und Drive-Upload
- `akquise-wf2-kommunikation.json` — Gesprächsergebnis und Gmail-Entwurf
- `akquise-wf3-watcher.json` — Gmail-Wächter, Aufgaben und Drive-Löschfristen
- `wf4-crm-write.json` — geprüfte Schreibschnittstelle für das Web-CRM
- `wf5-crm-read.json` — token-geschützte Nur-Lese-Schnittstelle für das Web-CRM
- `wf6-bcc-mail-import.json` — Import markierter, selbst gesendeter BCC-Mails

In **jeder** Datei:

- `SHEET_ID_HIER` durch die Tabellen-ID ersetzen
- Den Google-Sheets-Knoten die vorhandenen Sheets-Zugangsdaten zuweisen
- Den jeweils vorhandenen Telegram-, Gmail- (`gmailOAuth2`) und Drive-Knoten die passenden
  Zugangsdaten zuweisen
- In WF-1, Knoten „Nutzlast prüfen“, `TOKEN_HIER` durch das lokale
  `AKQUISE_WEBHOOK_TOKEN` ersetzen
- In WF-4, Knoten „Anfrage prüfen“, `TOKEN_HIER` durch einen **anderen**, langen
  `CRM_WEBHOOK_TOKEN` ersetzen
- In WF-5, Knoten „Lesetoken prüfen“, `CRM_READ_TOKEN_HIER` durch einen weiteren,
  langen `CRM_READ_WEBHOOK_TOKEN` ersetzen und allen drei Leseknoten dieselben vorhandenen
  Google-Sheets-Zugangsdaten zuweisen
- In WF-6 dem Gmail-, den beiden Google-Sheets- und dem Telegram-Knoten die bereits vorhandenen
  Zugangsdaten zuweisen. Im Blatt `Activities` muss zuvor die neunte Spalte `external_id`
  ergänzt werden.
- In WF-1 und WF-3 `DRIVE_FOLDER_ID_HIER` durch die ID eines ausschließlich für die
  Lead-Berichte vorgesehenen Drive-Stammordners ersetzen
- **Publish klicken.** Eine gespeicherte, aber unveröffentlichte Änderung wird nicht aktiv —
  das hat schon einmal einen Tag gekostet.

Danach lokal setzen:

```bash
setx AKQUISE_WEBHOOK_URL "https://n8n.360-ai.org/webhook/akquise-assessment"
setx AKQUISE_WEBHOOK_TOKEN "dasselbe-kennwort"
```

Die Formular-Adressen von WF-1 und WF-2 als Lesezeichen auf den Handy-Startbildschirm legen.

WF-4 und WF-5 werden nicht direkt im Browser aufgerufen. Die Cloudflare Pages Function hält URLs
und Tokens serverseitig. Änderungen gehen an `/webhook/akquise-crm-write`; Lesezugriffe erfolgen
per GET und `Authorization: Bearer <CRM_READ_WEBHOOK_TOKEN>` an `/webhook/akquise-crm-read`.

### Direkt gesendete Mail als Lead erfassen

Beim manuellen Versand aus `info@360-ai.org` gelten gleichzeitig diese beiden Markierungen:

- BCC: `info@360-ai.org`
- Betreff enthält das eigenständige Wort `#Anfrage`, zum Beispiel
  `Kurze Frage zu Ihrem Webauftritt #Anfrage`

WF-6 sucht alle fünf Minuten im Ordner „Gesendet“. Es ist deshalb nicht davon abhängig, ob Gmail
die BCC-Kopie zusätzlich im Posteingang anzeigt, und es wird kein zweites Postfach benötigt. Genau
ein externer Empfänger im An-Feld ist erlaubt. Ein unbekannter Empfänger erzeugt einen Lead ohne
Website und optional ohne Firma; ein bekannter Empfänger wird über die normalisierte Mailadresse
zugeordnet. Die Gmail-ID in `Activities.external_id` verhindert Doppelimporte. Fortgeschrittene
oder terminale CRM-Status werden nicht zurückgesetzt. Der Workflow versendet selbst keine Mail.

### 5. Mobiles CRM

Das grafische CRM liegt unter `crm/` und bietet Dashboard, filterbare Liste, Detailansicht mit
Bearbeitung und ein Kanban-Board. Google Sheets bleibt die Wahrheit: Die Pages Function liest über
den token-geschützten WF-5, der das bereits in n8n verwaltete Google-Credential verwendet; jede
Änderung läuft über WF-4 zurück zu n8n. Damit benötigt Cloudflare keinen privaten Google-Schlüssel.

Die vollständige, ausführbare Einrichtung für WF-5, Cloudflare Pages, Cloudflare Access, Secrets,
Deployment und die Prüfungen nach dem Deploy steht in
[`crm/README.md`](crm/README.md).

---

## Alltag

### Unterwegs: Lead erfassen

Formular von WF-1 öffnen, Website und was bekannt ist eintragen. Binnen 30 Sekunden kommt per
Telegram ein Sofort-Check: erreichbar, Redaktionssystem, Impressum verlinkt, anwählbare Nummer,
Rechtsstand, Einschätzung ob sich die Tiefenanalyse lohnt.

### Am Laptop: analysieren

```
/akquise
```

Der Skill fragt nach der URL und führt durch Erhebung, Regeln, Bewertung, Prüfung und die vier
Dokumente. Dauert zwei bis vier Minuten Rechenzeit. Beim Senden liest die Pipeline den vollständigen
Satz aus `berichte/` (`<datum>_intern.md`, `<datum>_telefon.md`, `<datum>_mail.md`,
`<datum>_kunde.html`) und übergibt die Inhalte
Base64-kodiert an WF-1. WF-1 legt beziehungsweise verwendet den Drive-Ordner mit dem Namen der
`lead_id`, lädt alle vier Dateien hoch und schreibt den Link erst nach vier bestätigten Uploads in
`berichte_drive_url`. Das lokale Skript schreibt weder ins Sheet noch nach Drive.

Einzelschritte, falls etwas klemmt:

```bash
node collector/scan.mjs <url> --lead-id <id> --branche <branche> --keyword "..." --limit 15
node rules/engine.mjs <auditordner>/facts.json
# Claude erzeugt assessment.json
node validator/pruefe.mjs <auditordner>/assessment.json <auditordner>/findings.json
# Claude schreibt die vier Dokumente
node pipeline/abschluss.mjs <auditordner> --senden
```

### Danach: anrufen

`berichte/<datum>_telefon.md` öffnen. Ziel des Anrufs ist ausschließlich die ausdrückliche
Zusage, die Auswertung per Mail schicken zu dürfen.

Anschließend das Formular von WF-2 ausfüllen. **Nur bei erteilter Freigabe** entsteht ein
Gmail-Entwurf. Du prüfst ihn und sendest selbst.

### Ab dann: automatisch

WF-3 läuft täglich. 06:50 prüft er Gmail, 07:00 kommt die Morgenmeldung mit allem, was ansteht.
Das CRM zeigt denselben Sheet-Stand auf Laptop und Handy. Status, Notiz, Abschlussgrund,
Wiedervorlage und nächste Aktion werden dort über WF-4 gepflegt; jeder Statuswechsel erzeugt eine
`status_wechsel`-Zeile in `Activities`.

WF-4 vergleicht bei Statusänderungen den zuletzt im Browser gelesenen Status mit dem aktuellen
Sheet-Wert und antwortet bei Abweichung mit HTTP 409. WF-1 bis WF-3 schützen zusätzlich
fortgeschrittene und terminale Status vor einer automatischen Rückstufung. Google Sheets bietet
jedoch keine atomare Compare-and-swap-Transaktion; das kleine TOCTOU-Zeitfenster zwischen Lesen
und Schreiben bleibt. Details und Betriebshinweise stehen in `crm/README.md`.

---

## Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `REGELKATALOG.md` | verbindliche Beschreibung aller 75 Regeln |
| `SHEET.md` | Aufbau des Google Sheets |
| `collector/` | Erhebung (Playwright, HTTP, PageSpeed) |
| `rules/` | Regelwerk und Score-Berechnung |
| `scoring/` | Akquise-Score, Branchenprofile, Gewichte |
| `validator/` | Halluzinationssperre |
| `pipeline/` | Zusammenführung, `lead.json`, Webhook-Nutzlast |
| `n8n/` | die sechs Workflows zum Import |
| `crm/` | Cloudflare-Pages-CRM mit serverseitigen API-Funktionen |
| `fixtures/` | eingefrorene Fälle für die Regressionstests |
| `tests/` | automatisierte Regressionstests |
| `blacklist.json` | Firmen und Domains, die nie kontaktiert werden |

**Leaddaten liegen außerhalb dieses Verzeichnisses** unter `~/Documents/360ai/akquise-daten/`
und sind per `.gitignore` von der Versionierung ausgeschlossen. Screenshots, gespeichertes HTML
und Ansprechpartner gehören nicht in eine Historie, aus der sich Löschen nicht zurücknehmen lässt.

---

## Rechtliche Leitplanken

Diese Punkte sind technisch erzwungen, nicht bloß empfohlen:

- **Erstkontakt ist telefonisch.** Ein Gmail-Entwurf entsteht erst, wenn im Gesprächsformular
  eine ausdrückliche Zusage eingetragen ist (§ 7 Abs. 2 Nr. 2 UWG — Werbe-E-Mail ohne vorherige
  Einwilligung ist auch im B2B unzulässig).
- **Kein automatischer Versand.** Kein Workflow enthält eine Sendeoperation; ein Test prüft das.
- **WF-6 protokolliert nur.** BCC und `#Anfrage` sind keine Einwilligung und keine rechtliche
  Freigabe. Der Workflow importiert eine bereits manuell gesendete Nachricht, bewertet aber nicht,
  ob ihr Versand zulässig war.
- **Keine rechtliche Bewertung.** Der Collector stellt fest, dass eine Zeichenfolge vorkommt oder
  ein Aufruf ausgelöst wird. Compliance-Regeln erzeugen ein Signal mit `review_required`, nie ein
  Urteil. Wörter wie „abmahnfähig" sind in den Formulierungsregeln ausgeschlossen.
- **Datenschutzhinweis** nach Art. 14 DSGVO steht als Pflichtfußzeile in jeder ersten Mail.
- **Löschfrist:** Bei Leads mit `ende_grund = kein_bedarf` oder `ungeeignet` meldet WF-3 nach
  24 Monaten die Personendaten im Sheet zur Anonymisierung, löscht zusätzlich den eindeutig
  verifizierten Drive-Ordner dauerhaft und leert
  `berichte_drive_url`. Als derzeit einzig vorhandenes Bezugsdatum dient
  `unterlagen_gesendet_am`; ist es leer, kann WF-3 die Frist nicht berechnen und löscht nicht
  automatisch. Diese bekannte Datenmodell-Grenze und die notwendige Betriebskontrolle sind in
  `crm/README.md` beschrieben.
- Der Collector beachtet `robots.txt` und identifiziert sich mit eigenem User-Agent.

---

## Wenn etwas nicht stimmt

**Der Validator bricht ab.** Mehr als 20 Prozent der Feststellungen wurden verworfen. Die Gründe
stehen in der Ausgabe. Häufigste Ursache: Zahlen im Text, die in keinem zitierten Regelergebnis
stehen. Das ist kein Fehler des Werkzeugs, sondern der Zweck.

**Eine Achse zeigt keinen Wert.** Mehr als 25 Prozent des Achsengewichts konnte nicht gemessen
werden. Steht mit Begründung im internen Bericht. Meist fehlt der PageSpeed-Schlüssel.

**Der Collector findet nur eine Seite.** Entweder gibt es wirklich nur eine, oder die Navigation
läuft über etwas, das nicht als Verweis erkennbar ist. Hash-Routen von Single-Page-Anwendungen
werden unterstützt.

**Ein Befund wirkt falsch.** Regel im `REGELKATALOG.md` nachschlagen, `findings.json` prüfen. Wenn
die Regel zu scharf ist: anpassen, Test ergänzen, `regelwerk_version` erhöhen. Die Fixture
`sauber` ist der Maßstab — löst dort eine Regel FAIL aus, ist sie zu scharf.

---

## Noch offen

- PageSpeed-Schlüssel setzen
- Google Sheet anlegen, IDs und Drive-Stammordner in die vier Workflows eintragen, Zugangsdaten
  zuweisen und alle Workflows publishen
- Cloudflare Pages und Access nach `crm/README.md` einrichten; Secrets setzen und die geschützten
  `/api/*`-Routen nach jedem relevanten Deploy erneut testen
- Eigene Absenderadresse oder Subdomain für die Akquise, damit Beschwerden nicht die
  Zustellbarkeit von `info@360-ai.org` treffen
- Datenschutzinformation für die Akquise formulieren, passend zu `kontaktquelle`
- Branchenprofile in `scoring/branchen.json` nachschärfen, sobald Erfahrungswerte vorliegen
