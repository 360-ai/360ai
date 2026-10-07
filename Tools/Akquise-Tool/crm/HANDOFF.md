# Akquise-CRM – Übergabestand

## Stand 6. Oktober 2026: LIVE, plus Fragebogen-Automatik

- n8n-Patch WF-2 bis WF-5 **geschrieben und aktiv** (Sicherung `n8n-backup-2026-10-06T18-09-51-833Z/`).
  Gegenprobe: WF-4 nimmt `termin` und `vb_frist` an. WF-5 liest `Leads` jetzt `A:BZ` und liefert die `vb_*`-Spalten.
- CRM **deployed** (Deployment `a8c6da3c`, Produktion). Anonym weiterhin 302. Code ist deployed, aber **nicht committet**.
- Neu: Felder `vb_kennung, vb_link, vb_mail, vb_begruessung, vb_frist, vb_termin, vb_versand_am, vb_erinnert_am,
  vb_eingang_am` (validation.js, WF-4, WF-5) und Routen `/api/agent/vorbereitung` (Versand), `.../faellig`
  (Erinnerungen mit fertigem Mailtext), `.../erinnert`, `.../eingang` (Rücklauf). Logik in `functions/lib/agent.js`,
  Tests `tests/vorbereitung.test.mjs` (111 Tests grün). Schreib-Lese-Probe auf neuer Spalte am Testlead ok, Spalte vb_kennung im Sheet angelegt.
- Langdock-Seite: `langdock/EINRICHTUNG.md` Abschnitte 4 bis 9. Website-Seite (Webhook in `vorbereitung.ts`,
  CRM-Vermerk in `_vorbereitung-link.mjs`) liegt im Branch `vorbereitung-online`, noch nicht auf `main`.
- Offen bei Denis: Service Token (Abschnitt 1), Actions 1 bis 8, Gmail/Kalender/Drive prüfen, Workflows bauen,
  Cloudflare-Variablen, Merge nach main. Danach Testdurchlauf Abschnitt 9.

## Stand 4. Oktober 2026: eine Pipeline von Lead bis Kunde, Agent-Schnittstelle für Langdock

Plan: `C:/Users/Ai Automations/.claude/plans/also-ich-m-chte-jetzt-toasty-truffle.md` (Etappen 1 und 2).
**Lokal fertig und getestet (97 Tests), NICHT deployed, NICHT committet.** Reihenfolge beim Livegang unten.

**Phasen.** Die internen Werte der ersten Phasen bleiben, weil WF-1 bis WF-4 sie automatisch setzen
(WF-2/WF-3 setzen `qualifiziert` bei eingehender Antwort, WF-3 löscht Drive-Ordner nur bei `beendet`).
Nur die Anzeige ändert sich, dazu kommen neue Phasen:
`neu` Neu · `analysiert` Website analysiert · `kontaktiert` · `qualifiziert` **Im Gespräch** ·
`fragebogen_raus` · `fragebogen_da` · `termin` · `angebot` Angebot raus · `gewonnen` **Kunde: Umsetzung** ·
`kunde_betreuung` · Seitenwege `ruht` und `beendet` **Verloren**. Keine Datenmigration nötig.
Rücksprung (Bestätigung nötig) nur rückwärts innerhalb der Pipeline oder aus Verloren heraus; `ruht` ist nie ein Rücksprung.
Fällig-Liste schließt nur noch Verlorene aus, Kunden können fällige Aufgaben haben.

**Verloren** verlangt im Dialog Absagegrund **und** Notiz (neue Spalte `verlust_notiz`). Neue Gründe:
`zeitpunkt`, `wettbewerber`, `intern_geloest`, `ich_abgesagt`, `sonstiges`. Neue Spalte `kunden_id` für die
spätere Übergabe ans Kunden-Tool. Die DSGVO-Löschung in WF-3 greift unverändert nur bei `kein_bedarf`/`ungeeignet`.

**Agent-Schnittstelle** `functions/api/agent/` (leads, lead, notiz, phase), Logik in `functions/lib/agent.js`,
Schreibweg gemeinsam mit /api/write in `functions/lib/crm-write.js`. Zugang per Cloudflare Access **Service Token**
(`ALLOWED_SERVICE_TOKEN_ID` = Client-ID), per `identitaetDarfPfad` in `_middleware.js` nur auf `/api/agent/*`.
Agenten schreiben Notizen mit Präfix „Langdock: “ und dürfen nie rückwärts springen. Einrichtung in Langdock:
`langdock/EINRICHTUNG.md`.

**Deploy-Blocker behoben:** `tests/ui.test.mjs` kannte den Import von `leitfaden.js` nicht (und CRLF). `npm run deploy` läuft wieder.

**Lokal testen:** Die aktuelle wrangler-Version setzt `CF_PAGES=1` auch bei `pages dev`; damit ist der lokale
Bypass gesperrt. In der (gitignorierten) `.dev.vars` steht deshalb zusätzlich `CF_PAGES=` (leer).

**Achtung n8n:** `scripts/build-crm-workflows.mjs` und `n8n/*.json` sind **älter als der Live-Stand** vom 20.08.
Nicht daraus neu bauen. Die Phasen-Änderung an WF-2 bis WF-5 macht `scripts/n8n-phasen-patch.cjs`
(Probelauf ohne Schalter, schreiben mit `--schreiben`, sichert vorher in `n8n-backup-*/`).

### Livegang, in dieser Reihenfolge

1. `node scripts/n8n-phasen-patch.cjs --schreiben` (aus `Tools/Akquise-Tool`). Vorher kann das CRM die neuen Phasen nicht speichern.
2. **Prüfen, ob der Patch aktiv ist:** Diese n8n-Instanz hat ein Editor/Publish-Modell. Im Editor bei WF-2 bis WF-5
   nachsehen, ob die neue Version aktiv ist (sonst Publish). Gegenprobe: WF-4 mit einem neuen Statuswert
   (z. B. `termin`) darf nicht mehr `invalid_status` liefern. **Erst dann** Schritt 3.
3. CRM deployen (`npm run deploy` bzw. wrangler, siehe unten).
4. Prüfung mit echtem Bestand statt Testlead (ein neuer Lead bekäme `next_action: analyse` und landete in der
   Morgenmeldung): bei einem der vier verlorenen Altleads die Absage-Notiz nachtragen, im Sheet prüfen, dass die
   Spalte `verlust_notiz` entstanden ist und das CRM sie nach dem Neuladen anzeigt (WF-5 liefert sie aus).
5. Service Token und Langdock nach `langdock/EINRICHTUNG.md`.

Hinweis: WF-3 setzt bei unzustellbarer Mail automatisch Verloren ohne Notiz. Solche Leads zeigen danach den
Hinweis „Absagegrund oder Notiz fehlt“. Das ist erwartet.

---

## Stand 20. August 2026

## Was sich in der Nacht vom 20. August geändert hat

Das CRM kann jetzt Leads anlegen, archivieren und Stammdaten bearbeiten, hat einen
Notizverlauf, einen KI-Textassistenten und einen Link ins Google Sheet. Dazu wurden
mehrere Fehler behoben, die im Betrieb zu falschen oder fehlenden Anzeigen führten.

**Geändert wurde auch außerhalb des CRM:**

- **WF-4** schreibt jetzt zusätzlich Stammdaten und kennt die Aktionen `create`,
  `archivieren`, `reaktivieren` und `notiz`. Die Sheets-Knoten schreiben mit
  `cellFormat: RAW`; damit deutet Google eine Notiz wie `=1+1` nicht mehr als Formel
  und wandelt Datumsangaben nicht mehr in ein lokales Format um.
- **WF-5** liest `Leads` jetzt bis `A:AZ` und `Activities` bis `A:L` und liefert die
  Felder `strasse`, `handy`, `archiviert_am` und `external_id` mit aus.
- Backups beider Workflows liegen im Sitzungsordner unter `wf4-backup-*.json` und
  `wf5-backup-*.json`.

**Neue Sheet-Spalten** (`strasse`, `handy`, `archiviert_am`) werden vom
Google-Sheets-Knoten beim ersten Schreiben selbst angelegt und müssen nicht von Hand
erstellt werden. Bis dahin liefert WF-5 sie als leere Werte aus.

**Noch offen:** `ANTHROPIC_API_KEY` ist nicht gesetzt, deshalb meldet der
KI-Assistent „Der KI-Schlüssel ist noch nicht hinterlegt“. Setzen mit:

```powershell
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name 360ai-akquise-crm
```

Diese Datei ist der dauerhafte Einstiegspunkt für einen neuen Codex-Chat. Sie enthält bewusst keine Tokens, privaten Schlüssel oder Login-Cookies.

## Einstieg für einen neuen Chat

1. Diese Datei vollständig lesen.
2. Danach `crm/README.md`, das Root-`README.md` und `SHEET.md` nur soweit für die aktuelle Aufgabe nötig lesen.
3. Vor Änderungen `git status --short` prüfen. Das übergeordnete Repository enthält fremde/ältere Änderungen; nichts davon zurücksetzen oder pauschal committen.
4. Secrets niemals ausgeben. Nur Secret-Namen prüfen.

Empfohlener Startsatz an Codex:

> Lies zuerst `crm/HANDOFF.md`, prüfe anschließend den aktuellen Arbeitsbaum und mache am dort dokumentierten Stand weiter.

## Live-Stand

- CRM: https://360ai-akquise-crm.pages.dev/
- Cloudflare-Pages-Projekt: `360ai-akquise-crm`
- Zugriff: Cloudflare Access mit Google-Login, erlaubt ist `info@360-ai.org`
- Aktuell zuletzt veröffentlichte Version: Deployment `59d865ae`
- Google Sheet bleibt die fachliche Wahrheit.
- n8n bleibt der einzige Schreiber ins Sheet und nach Google Drive.
- Letzte Live-Prüfung am 18. August 2026: Dashboard und Leadliste laden echte Daten; zum Prüfzeitpunkt waren es 2 Leads, 4 Activities und 2 Audits. Leads ohne Firma verwenden in der Oberfläche Ansprechpartner, Mailadresse oder Telefonnummer als Anzeigenamen.
- Anonyme Zugriffe auf `/`, `/api/config` und `/api/crm/leads` werden durch Cloudflare Access mit HTTP 302 abgefangen. Das gilt auch für den Deployment-Host `59d865ae.360ai-akquise-crm.pages.dev`.

## Architektur

```text
Brave/Handy
  -> Cloudflare Access
  -> Cloudflare Pages SPA
     -> Lesen: /sync -> Pages Function -> WF-5 -> Google Sheet
     -> Schreiben: /api/write -> Pages Function -> WF-4 -> Google Sheet

Lokale Akquise-Pipeline
  -> WF-1 -> Google Sheet + Google Drive

Automatische Kommunikation
  -> WF-2 / WF-3 -> Google Sheet

Markierte Direktmails
  -> WF-6 (BCC info@360-ai.org + #Anfrage) -> Google Sheet
```

Der Lesepfad heißt absichtlich `/sync`: Brave blockierte `/api/leads` und `/crm-data` lokal als vermeintliche Tracker. Der Client lädt die Daten deshalb CSP-konform als Same-Origin-Script. Den Pfad nicht ohne erneuten Brave-Test umbenennen.

## n8n-Workflows

- WF-1, ID `KFaVEEXX3vNpxMzP`: Analyse-Abschluss, Sheet-Update und Upload der vier Berichte nach Drive. Bei bestehenden Leads werden CRM-/Lifecycle-Felder nicht mehr durch eine erneute Analyse zurückgesetzt.
- WF-2, ID `j6FzVR8nm0apVvPp`: Kommunikation. Re-Read/Status-Guards verhindern, dass fortgeschrittene oder terminale CRM-Status rückwärts überschrieben werden.
- WF-3, ID `ZyMc3ufxeGnQ7o1k`: Mail-Watcher/Follow-ups. Status-Guards sind aktiv. Die DSGVO-Löschung des Drive-Ordners ist fail-closed: nur `status = beendet`, zulässiger `ende_grund`, gültiges Datum, sichere `lead_id` und erfüllte 24-Monats-Frist.
- WF-4, ID `7vKzuyhNfyXkAFj1`: CRM-Schreiben. Kennt die Aktionen `update` (Vorgabe), `create`, `archivieren`, `reaktivieren` und `notiz`. Whitelist für `update`: die sechs CRM-Felder `status`, `notiz`, `ende_grund`, `wiedervorlage_am`, `next_action`, `next_action_at` sowie die Stammdaten `firma`, `ansprechpartner`, `strasse`, `ort`, `branche`, `telefon`, `handy`, `mail`, `website`, `anrede`, `kontaktquelle`. Scores, Drive-Links und `archiviert_am` bleiben gesperrt. Statuswechsel nutzen `erwarteter_status`; Konflikte liefern 409, doppelte `lead_id` beim Anlegen ebenfalls. Statuswechsel, Anlegen, Archivieren und Verlaufsnotizen erzeugen je eine Activity.
  **Achtung:** Optimistic Locking greift weiterhin nur beim Feld `status`. Für alle anderen Felder gilt „last write wins“ – eine gleichzeitige Änderung durch WF-6 kann eine CRM-Eingabe überschreiben.
- WF-5, ID `IsQp7BWYIrv0dNlb`: CRM-Lesen per GET und Bearer-Token. Liest Leads `A:AZ`, Activities `A:L`, Audits `A:Q`; keine Schreiboperationen und keine gespeicherten Ausführungsdaten. Antwort: `{ok, leads, activities, audits}`. Die ausgelieferten Spalten stehen fest verdrahtet im Knoten `Antwort bauen` – **eine neue Sheet-Spalte kommt erst im CRM an, wenn sie dort ergänzt wird.**
- WF-6, ID `i1O7c6eicXu1imZP`, veröffentlicht: sucht alle fünf Minuten in „Gesendet“ nach `bcc:info@360-ai.org` und dem Betreffmarker `#Anfrage`, ordnet über die Empfängeradresse zu und dedupliziert über `Activities.external_id`. Gmail-, Sheets- und Telegram-Credentials sind zugewiesen; der kontrollierte Live-Probelauf am 18. August 2026 war erfolgreich und erzeugte mangels passender Mail keine neue Activity.
- Das Live-Sheet enthält in `Activities!I1` die Spalte `external_id`; WF-5 und WF-6 lesen Activities über `A:I`.

Die lokalen Workflow-JSONs werden deterministisch mit `scripts/build-crm-workflows.mjs` erzeugt. Credentials und echte Tokens gehören nicht in die JSON-Dateien. Beim n8n-Import muss das vorhandene Google-Sheets-Credential zugeordnet werden.

## Frontend

Pfad: `crm/`

- Vanilla HTML/CSS/JavaScript als Cloudflare-Pages-Projekt
- Ansichten: Dashboard, Leadliste/Filter, Lead-Detail/Bearbeitung, Kanban
- Leads ohne Firma werden mit Ansprechpartner, Mailadresse oder Telefonnummer statt nur mit der
  technischen Lead-ID angezeigt.
- Lokale Outfit-Webfont und lokales 360ai-Logo; keine externen Frontend-Assets
- Dark Mode ist Standard: dunkles Navy statt reines Schwarz, helle Outfit-Schrift, AA-konforme Textkontraste, mindestens 3:1 für relevante Control-Ränder und 44-px-Touchziele
- Desktop und 390-x-844-Handyansicht wurden visuell geprüft
- Kanban scrollt auf Mobilgeräten lokal horizontal, ohne die Dokumentbreite zu vergrößern
- Berichte öffnen über `berichte_drive_url` direkt in Google Drive. Die zwei vorhandenen Testleads haben noch keinen Drive-Link; deshalb zeigt die Detailansicht dort aktuell „Noch kein Drive-Ordner verknüpft“.

Wichtige Dateien:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/domain.js`
- `functions/sync.js`
- `functions/api/write.js`
- `functions/api/ai.js` (KI-Textassistent, ruft die Anthropic-API serverseitig auf)
- `functions/lib/` (inkl. `ai-prompt.js`: Standardprompt und Kontextaufbau)
- `tests/` (inkl. `ui.test.mjs`: rendert die Oberfläche gegen jsdom)
- `wrangler.jsonc`

## Sicherheitsannahmen, die im Code stehen

- `/sync` liefert die Leaddaten als ausführbares Skript aus. Der Endpunkt akzeptiert
  deshalb nur Anfragen mit `Sec-Fetch-Site: same-origin` **und** `Sec-Fetch-Dest: script`.
  Ohne diese Prüfung könnte eine fremde Seite die Daten per `<script src>` mitlesen,
  sofern das Access-Cookie `SameSite=None` trägt. **Bitte im Zero-Trust-Dashboard einmal
  nachsehen, welchen Wert das Cookie hat.**
- `/api/write` und `/api/ai` verlangen ebenfalls `Sec-Fetch-Site: same-origin`.
  Ein fehlender Header gilt als Ablehnung.
- Der Entwicklungs-Bypass ist zusätzlich über `CF_PAGES` gesperrt und kann in einer
  Pages-Umgebung nicht mehr wirken.

## Cloudflare-Konfiguration

Normale Bindings:

- `TEAM_DOMAIN`
- `POLICY_AUD`
- `ALLOWED_EMAIL=info@360-ai.org`

Verschlüsselte Secrets:

- `CRM_READ_WEBHOOK_URL`
- `CRM_READ_WEBHOOK_TOKEN`
- `CRM_WEBHOOK_URL`
- `CRM_WEBHOOK_TOKEN`

Keine Google-Service-Account-Schlüssel im Pages-Projekt: Das Lesen läuft über WF-5 und das bestehende n8n-Google-Credential.

Das Pages-Projekt wird per Direct Upload veröffentlicht, nicht per Git-Integration. Immer Wrangler verwenden, weil nur damit die Functions mit veröffentlicht werden.

## Verifikation und Deploy

Aus `crm/`:

```powershell
npm test
npm run check
npm run build
npx --no-install wrangler pages deploy public --project-name 360ai-akquise-crm --branch main
```

Letzter Stand nach dem Dark-Mode-Update:

- CRM: 55/55 Tests bestanden
- `npm run check`: bestanden
- `npm run build`: bestanden
- Root-/n8n-Suite zuletzt: 150/150 Tests bestanden

Nach jedem Deploy:

1. Ohne Cookies und ohne Redirect-Following prüfen, dass `/`, `/api/leads` und `/sync?request_id=<UUID>` nicht 200 liefern, sondern von Access abgefangen werden.
2. Mit Denis' Login das Dashboard öffnen; echte Daten und „Gerade aktualisiert“ prüfen.
3. Liste, Detail und Kanban read-only kontrollieren.
4. Einen echten Write-/Kanban-Test nur bewusst durchführen, weil er das Sheet verändert.

## Noch offene bzw. später zu prüfende Punkte

- Ein vollständiger neuer `/akquise`-Durchlauf sollte den Drive-Upload der vier Berichte und `berichte_drive_url` noch einmal Ende-zu-Ende mit einem geeigneten Testlead belegen.
- Bei späterer Kundenverwaltung bleibt `lead_id` der stabile Übergabeschlüssel; jetzt keine Kundentabelle oder Datenkopie vorwegnehmen.
- Der größere Git-Arbeitsbaum ist nicht sauber. Die CRM-Dateien waren während der Umsetzung teilweise noch untracked. Vor einem Commit deshalb Umfang gezielt prüfen und keine fremden Änderungen aufnehmen.
- Bei Änderungen an Cloudflare Access immer Produktionshost und Deployment-/Preview-Hosts getrennt auf Schutz prüfen.
