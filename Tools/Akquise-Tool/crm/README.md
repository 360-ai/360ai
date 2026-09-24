# 360ai Akquise-CRM

Das CRM ist eine kleine Cloudflare-Pages-Anwendung für die bestehende Lead-Pipeline. Es zeigt
Dashboard, Liste, Detail und Kanban mobil wie am Desktop. Es führt keine zweite Datenbank ein:

```
Browser → Pages Function → n8n Read-Webhook → Google Sheets (lesen)
Browser → Pages Function → WF-4 in n8n → Google Sheet / Activities (schreiben)
```

Cloudflare Access schützt die gesamte Anwendung. Die API-Middleware prüft den von Access gesetzten
Header `Cf-Access-Jwt-Assertion` zusätzlich kryptografisch gegen Cloudflares JWKS sowie auf Issuer,
Audience, Token-Typ und die exakt erlaubte Google-Adresse. Ein eigenes Passwortsystem gibt es nicht.

## 1. Lokal mit Demodaten starten

Voraussetzung ist Node.js 20 oder neuer.

```powershell
cd "$HOME\Documents\360ai\Tools\Akquise-Tool\crm"
Copy-Item .dev.vars.example .dev.vars
npm install
npm run check
npm test
npm run dev
```

Danach `http://127.0.0.1:8788` öffnen. Mit

```dotenv
LOCAL_DEV_BYPASS=true
LOCAL_DEMO_DATA=true
```

liefert die Anwendung fiktive Leads und simuliert Schreibvorgänge. Der Auth-Bypass gilt im Code nur
für `localhost`, `127.0.0.1` und `::1`; auf einer Pages-Domain kann er nicht aktiviert werden.
`.dev.vars` ist ignoriert und darf niemals committet werden. Für den Demomodus sind keine echten
n8n- oder Cloudflare-Zugangsdaten nötig.

`npm run build` kopiert die lokal ausgelieferte Outfit-Schrift nach `public/assets/`; die Anwendung
lädt zur Laufzeit keine Schrift oder Bibliothek von einem Drittanbieter.

## 2. Sheet und n8n vorbereiten

1. Im Blatt `Leads` die Spalte `berichte_drive_url` und im Blatt `Activities` als neunte Spalte
   `external_id` gemäß `../SHEET.md` ergänzen.
2. In Google Drive einen eigenen Stammordner nur für Akquise-Berichte anlegen und seine ID aus der
   URL kopieren.
3. Alle JSON-Dateien aus `../n8n/` in n8n importieren, einschließlich
   [`wf5-crm-read.json`](../n8n/wf5-crm-read.json) für den CRM-Lesepfad und
   [`wf6-bcc-mail-import.json`](../n8n/wf6-bcc-mail-import.json) für den BCC-Import.
4. In allen Workflows `SHEET_ID_HIER` ersetzen und jedem Sheets-Knoten die vorhandenen
   Google-Sheets-Zugangsdaten zuweisen.
5. In WF-1 und WF-3 `DRIVE_FOLDER_ID_HIER` durch dieselbe Stammordner-ID ersetzen und allen
   Drive-Knoten die Drive-Zugangsdaten zuweisen. Der Zugang braucht in diesem Stammordner Rechte
   zum Suchen, Anlegen, Hochladen und dauerhaften Löschen.
6. Gmail-, Telegram- und übrige bestehende Zugangsdaten wieder zuweisen. WF-6 benötigt das
   Gmail-Credential, je ein Sheets-Credential an beiden Leseknoten und beiden Schreibknoten sowie
   das Telegram-Credential.
7. In WF-1 `TOKEN_HIER` durch das bestehende `AKQUISE_WEBHOOK_TOKEN` ersetzen.
8. Für WF-4 einen neuen, unabhängigen Zufallswert erzeugen, dort `TOKEN_HIER` ersetzen und denselben
   Wert später als Pages-Secret `CRM_WEBHOOK_TOKEN` hinterlegen.
9. Für WF-5 einen weiteren, vom Schreib-Token unabhängigen Zufallswert erzeugen,
   dort `CRM_READ_TOKEN_HIER` ersetzen und denselben Wert später als Pages-Secret
   `CRM_READ_WEBHOOK_TOKEN` hinterlegen.
10. Alle Workflows speichern und **publishen**.

WF-4 akzeptiert ausschließlich `status`, `notiz`, `ende_grund`, `wiedervorlage_am`, `next_action`
und `next_action_at`. Bei Statusänderungen ist `erwarteter_status` Pflicht. Ein veralteter Wert
führt zu HTTP 409; ein Rücksprung aus `gewonnen` oder `beendet` beziehungsweise zu einer früheren
Stufe erfordert eine ausdrückliche Bestätigung im CRM. Jeder erfolgreiche Statuswechsel hängt eine
Activity mit `typ = status_wechsel` an.

### Berichte und Drive

`pipeline/abschluss.mjs --senden` verlangt pro Lauf genau diese vier Dateien:

- `JJJJ-MM-TT_intern.md`
- `JJJJ-MM-TT_telefon.md`
- `JJJJ-MM-TT_mail.md`
- `JJJJ-MM-TT_kunde.html`

Die Pipeline sendet sie Base64-kodiert an WF-1. WF-1 verwendet unter dem konfigurierten
Stammordner genau einen Ordner mit dem Namen der `lead_id`; `berichte_drive_url` wird erst nach vier
bestätigten Uploads gespeichert. Das CRM öffnet diesen Link in Google Drive und besitzt keinen
eigenen Dokumenten-Viewer.

## 3. n8n-Lesepfad absichern

WF-5 verwendet den bereits in n8n verwalteten Google-Zugang. Cloudflare Pages
benötigt dadurch keinen privaten Google-Schlüssel und keine Google-Service-Account-Variablen.

1. In WF-5 für `Leads`, `Activities` und `Audits` das vorhandene Google-Sheets-Credential
   zuweisen und `SHEET_ID_HIER` durch die ID des Akquise-Sheets ersetzen.
2. Einen langen kryptografischen Zufallswert nur für diesen Lesepfad erzeugen. Read- und
   Write-Webhook dürfen niemals denselben Token verwenden.
3. Im n8n-Webhook die Prüfung auf `Authorization: Bearer <Token>` aktiv lassen und den Platzhalter
   `CRM_READ_TOKEN_HIER` durch den Read-Token ersetzen.
4. Prüfen, dass die erfolgreiche Antwort exakt `ok: true` sowie die drei Arrays `leads`,
   `activities` und `audits` enthält. Fehler müssen mit einem non-2xx-Status antworten.
5. Den Workflow publishen und seine Produktions-URL als `CRM_READ_WEBHOOK_URL` hinterlegen; die
   Test-Webhook-URL ist nicht für Cloudflare Pages geeignet.

Die Pages Function folgt keinen Redirects, überträgt weder Access-JWT noch Browser-Cookies an n8n
und gibt unbekannte n8n-Felder nicht an den Browser weiter. Non-2xx-Antworten, ungültiges JSON und
eine abweichende Datenform werden mit einer bereinigten HTTP-502-Antwort geschlossen abgelehnt.

## 4. Cloudflare Pages konfigurieren

Ein Pages-Projekt mit diesen Build-Einstellungen anlegen:

| Einstellung | Wert |
|---|---|
| Projektname | `360ai-akquise-crm` |
| Root-Verzeichnis | `Tools/Akquise-Tool/crm` (bei Repository-Root `360ai`) bzw. `crm` (wenn `akquise-tool` selbst das Repository ist) |
| Build-Befehl | `npm run build` |
| Ausgabeordner | `public` |
| Node.js | 20 oder neuer |

Cloudflare übernimmt die Funktionen automatisch aus `functions/`. `public/_routes.json` schickt
nur `/api/*` durch Pages Functions; die statischen Dateien bleiben leichtgewichtig.

Folgende Werte als normale Produktionsvariablen setzen:

| Variable | Inhalt |
|---|---|
| `TEAM_DOMAIN` | Access-Team-Domain, z. B. `https://firma.cloudflareaccess.com` |
| `POLICY_AUD` | Audience-Tag der Access-Anwendung |
| `ALLOWED_EMAIL` | exakt `info@360-ai.org` |

Diese Werte ausdrücklich als verschlüsselte Pages-Secrets anlegen, nicht als Klartextvariable:

- `CRM_READ_WEBHOOK_URL` (Produktions-URL des CRM-Leseworkflows)
- `CRM_READ_WEBHOOK_TOKEN` (eigener Bearer-Token nur für den Lesepfad)
- `CRM_WEBHOOK_URL` (Produktions-URL von WF-4, endet auf `/webhook/akquise-crm-write`)
- `CRM_WEBHOOK_TOKEN`

Nach dem ersten Anlegen des Projekts geht das auch über die CLI; der Wert wird jeweils interaktiv
eingelesen und erscheint nicht im Befehl:

```powershell
npx wrangler pages secret put CRM_READ_WEBHOOK_URL --project-name 360ai-akquise-crm
npx wrangler pages secret put CRM_READ_WEBHOOK_TOKEN --project-name 360ai-akquise-crm
npx wrangler pages secret put CRM_WEBHOOK_URL --project-name 360ai-akquise-crm
npx wrangler pages secret put CRM_WEBHOOK_TOKEN --project-name 360ai-akquise-crm
```

Variablen und Secrets für Produktion und Preview getrennt prüfen. `LOCAL_DEV_BYPASS` und
`LOCAL_DEMO_DATA` gehören in **keine** Cloudflare-Umgebung.

## 5. Cloudflare Access vor alle Routen setzen

1. Google als Identity Provider in Cloudflare Zero Trust verbinden.
2. Für jeden erreichbaren CRM-Host eine Access-Anwendung anlegen: Produktions-Custom-Domain,
   direkte `*.pages.dev`-Adresse und – sofern aktiv – Preview-URLs. Unbenutzte direkte oder Preview-
   Hosts deaktivieren statt ungeschützt stehen zu lassen.
3. Den Pfad der Anwendung hostweit als `/*` konfigurieren. Eine Regel nur für `/` oder nur für die
   HTML-Datei reicht nicht; `/api/leads` und `/api/write` müssen von derselben Policy erfasst sein.
4. Eine Allow-Policy mit genau `info@360-ai.org` anlegen. Keine allgemeine Domainfreigabe und
   keine Bypass-Policy verwenden.
5. Den Audience-Tag dieser Anwendung als `POLICY_AUD` setzen. Falls mehrere Hosts unterschiedliche
   Access-Anwendungen und damit unterschiedliche Audiences erhalten, jeden Host mit der zugehörigen
   Pages-Umgebung betreiben oder auf einen einzigen kanonischen Host reduzieren.

Access ist die äußere Schranke. Unabhängig davon lehnt `functions/api/_middleware.js` jede Anfrage
ohne gültiges Access-JWT und exakt passende E-Mail mit HTTP 403 ab. Der CRM-Webhook-Token und der
CRM-Read-Webhook-Token gelangen nie in den Browser.

## 6. Bauen und deployen

Vor jedem Deploy:

```powershell
cd "$HOME\Documents\360ai\Tools\Akquise-Tool\crm"
npm install
npm run check
npm test
npm run build
npm run deploy
```

`npm run deploy` verwendet den Projektnamen aus `wrangler.jsonc`. Alternativ kann das verbundene
Git-Repository den Build bei Push auslösen. Ein Deploy ersetzt keine n8n-Veröffentlichung: Nach
Änderungen an einem n8n-Workflow den jeweiligen Workflow erneut publishen.

## 7. Verifikation

Nach der ersten Einrichtung vollständig prüfen:

1. Einen Testlead durch `/akquise` und `pipeline/abschluss.mjs --senden` führen. Im Lead müssen vier
   Dateien im passenden Drive-Ordner liegen und `berichte_drive_url` muss genau diesen Ordner öffnen.
2. Im CRM Liste und Filter, Detailbearbeitung, Drive-Link, Kanban-Verschiebung und Dashboard-Zahlen
   über den n8n-Lesepfad gegen die drei Sheet-Blätter prüfen.
3. Eine Statusänderung ausführen. Der Lead muss aktualisiert und genau eine neue
   `status_wechsel`-Zeile in `Activities` angelegt werden.
4. Konfliktfall: Status eines Testleads zwischen Laden und Speichern über einen automatischen
   Workflow oder kontrolliert im Sheet ändern. Die alte CRM-Karte muss HTTP 409 beziehungsweise
   „Status hat sich geändert, bitte neu laden“ erhalten und darf den neuen Wert nicht überschreiben.
5. Mit `info@360-ai.org` anmelden; dieselben URLs mit einer fremden Google-Adresse im privaten
   Browserfenster aufrufen und die Ablehnung prüfen.

Nach **jedem** Deploy, das Access, Domains, `_routes.json`, `_middleware.js` oder API-Funktionen
berührt, zusätzlich ohne Cookie und ohne Login testen (kein `-L`, damit eine Access-Weiterleitung
nicht verdeckt wird):

```powershell
curl.exe -i https://crm.example.de/api/leads
curl.exe -i https://360ai-akquise-crm.pages.dev/api/leads
```

Erwartet ist je nach Edge-Konfiguration eine Access-Weiterleitung oder HTTP 401/403 – niemals
HTTP 200 und niemals Lead-Daten. Dasselbe für aktive Preview-Hosts wiederholen. Anschließend den
angemeldeten Abruf prüfen; er muss HTTP 200 mit `ok: true` liefern.

## 8. Datenschutz und bekannte Grenzen

### Drive-Löschung nach 24 Monaten

WF-3 betrachtet nur Leads mit `status = beendet` und `ende_grund = kein_bedarf` oder `ungeeignet`. Nach Ablauf von
24 Monaten sucht er im fest konfigurierten Drive-Stammordner nach dem Lead-Ordner, vergleicht
sowohl Ordner-ID als auch den exakten Namen mit der `lead_id`, löscht ihn **dauerhaft** und leert
anschließend `berichte_drive_url`. Die Morgenmeldung fordert gleichzeitig zur Anonymisierung der
Personendaten im Sheet auf. Die dauerhafte Drive-Löschung ist nicht über den Papierkorb
wiederherstellbar.

Das aktuelle Sheet besitzt kein `beendet_am`. Deshalb verwendet WF-3 als einzig belastbares Datum
`unterlagen_gesendet_am`. Ist dieses Feld leer – etwa weil für einen ungeeigneten Lead nie Unterlagen
gesendet wurden –, wird der Drive-Ordner nicht automatisch gelöscht. Es wird bewusst kein Datum
geraten. Bis eine spätere Datenmigration ein eigenes Abschluss-/Löschdatum einführt, müssen solche
Fälle regelmäßig kontrolliert und nach dokumentierter Frist manuell gelöscht werden. Sheet-
Anonymisierung und Drive-Löschung sind erst vollständig, wenn beide Pfade geprüft wurden.

### Optimistic Locking ist nicht atomar

WF-4 liest den aktuellen Lead, vergleicht `erwarteter_status` und schreibt anschließend über
Google Sheets. WF-1, WF-2 und WF-3 bewahren zugleich fortgeschrittene beziehungsweise
terminale Status. Dadurch werden die praktisch relevanten stillen Rückstufungen abgefangen. Die
Sheets API stellt in diesem Aufbau aber keine atomare Compare-and-swap-Operation bereit: Zwischen
dem letzten Lesen und dem Schreiben bleibt ein kleines TOCTOU-Zeitfenster. `Activities` macht
Statuswechsel nachvollziehbar, ersetzt jedoch keine Transaktion. Bei später höherer Parallelität
muss der Schreibpfad serialisiert oder in einen transaktionalen Datenspeicher verlegt werden.

Die stabile `lead_id` bleibt der Übergabeschlüssel für eine spätere Kundenverwaltung; das CRM legt
dafür heute weder eine Kundentabelle noch eine zweite Kopie der Lead-Daten an.
