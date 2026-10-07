# Langdock an das 360ai-CRM anbinden

Stand 04.10.2026. Gehört zu Etappe 2 im Plan `C:\Users\Ai Automations\.claude\plans\also-ich-m-chte-jetzt-toasty-truffle.md`.

Langdock spricht nur mit der Agent-Schnittstelle `https://360ai-akquise-crm.pages.dev/api/agent/*`.
Der Zugang läuft über ein **Cloudflare Access Service Token**. Damit kommt Langdock durch Access,
aber laut `functions/api/_middleware.js` nur auf `/api/agent/*`, nie auf `/sync`, `/api/write` oder `/api/ai`.

## 1. Cloudflare (einmalig, Denis)

1. Zero Trust → Access → Service Auth → **Service Tokens** → „Create Service Token“, Name `langdock-crm`,
   Laufzeit 1 Jahr (Ablaufdatum in den Kalender). **Client ID und Client Secret sofort kopieren**,
   das Secret wird nur einmal angezeigt.
2. Zero Trust → Access → Applications → die **Produktions-App des CRM** → Policies → „Add a policy“:
   Name `Langdock`, Action **Service Auth**, Include → Service Token → `langdock-crm`. Speichern.
   Die bestehende Google-Login-Policy bleibt unverändert. (Same-Site-Falle beim Speichern: siehe
   Memory `project_akquise_crm`, leere Pflichtfelder in anderen Abschnitten blockieren „Save“ lautlos.)
3. Pages-Variable setzen (die Client ID ist nicht geheim, nur das Secret):
   `npx wrangler pages secret put ALLOWED_SERVICE_TOKEN_ID --project-name 360ai-akquise-crm`
   Wert = die Client ID (endet auf `.access`).
4. CRM neu deployen (siehe `HANDOFF.md`).

Prüfen: Ohne Header liefert `curl -s -o /dev/null -w "%{http_code}" https://360ai-akquise-crm.pages.dev/api/agent/leads`
einen 302 oder 403. Mit den beiden Headern `CF-Access-Client-Id` und `CF-Access-Client-Secret` kommt 200.
Auf `/sync` kommt mit denselben Headern 403.

## 2. Langdock: Integration „360ai CRM“

Integrations → Add integration → Name `360ai CRM`, Beschreibung:
„Lead- und Kunden-Pipeline von 360ai. Leads suchen, Akte lesen, Verlaufsnotizen anhängen, Phase setzen.“

**Authentifizierung: API Key**, zwei Eingabefelder:

| Feld-ID | Typ | Pflicht |
|---|---|---|
| `client_id` | TEXT | ja |
| `client_secret` | PASSWORD | ja |

Test-Endpunkt (Schritt 3):

```javascript
const response = await ld.request({
  method: 'GET',
  url: 'https://360ai-akquise-crm.pages.dev/api/agent/leads?suche=zzz-test',
  headers: {
    'CF-Access-Client-Id': data.auth.client_id,
    'CF-Access-Client-Secret': data.auth.client_secret,
  },
});
return response.json;
```

Danach eine Verbindung mit Client ID und Secret aus Schritt 1 anlegen.

### Gemeinsamer Kopf für alle Actions

Jede Action beginnt mit diesem Block (Langdock lädt keine Bibliotheken, deshalb wird er kopiert):

```javascript
const BASIS = 'https://360ai-akquise-crm.pages.dev/api/agent';
const kopf = {
  'CF-Access-Client-Id': data.auth.client_id,
  'CF-Access-Client-Secret': data.auth.client_secret,
  'Content-Type': 'application/json',
};
```

### Action 1: `leads_suchen` (lesend)

Beschreibung: „Sucht Leads und Kunden nach Firma, Name, Mail, Ort oder lead_id. Immer zuerst aufrufen,
um die lead_id und die aktuelle Phase zu bekommen, bevor gelesen oder geschrieben wird. Liefert höchstens 50 Treffer.“

| Input | Typ | Beschreibung |
|---|---|---|
| `suche` | TEXT | Suchbegriff, leer = alle |
| `phase` | SELECT | optional, Werte siehe Phasenliste unten |
| `archiv` | BOOLEAN | auch archivierte Leads einbeziehen, Standard nein |

```javascript
// Kopf von oben hier einfügen
const q = new URLSearchParams();
if (data.input.suche) q.set('suche', data.input.suche);
if (data.input.phase) q.set('phase', data.input.phase);
if (data.input.archiv) q.set('archiv', 'ja');
const response = await ld.request({ method: 'GET', url: BASIS + '/leads?' + q.toString(), headers: kopf });
return response.json;
```

### Action 2: `lead_lesen` (lesend)

Beschreibung: „Liest die vollständige Akte eines Leads: Stammdaten, Phase, Notiz, Absagegrund und die
letzten 30 Verlaufseinträge. Braucht die lead_id aus leads_suchen.“

| Input | Typ | Beschreibung |
|---|---|---|
| `lead_id` | TEXT, Pflicht | z. B. `L-20260816-avas` |

```javascript
// Kopf von oben hier einfügen
const response = await ld.request({
  method: 'GET', url: BASIS + '/lead?id=' + encodeURIComponent(data.input.lead_id), headers: kopf,
});
return response.json;
```

### Action 3: `notiz_anhaengen` (schreibend, **Bestätigung einschalten**)

Beschreibung: „Hängt einen datierten Eintrag an den Verlauf eines Leads an, z. B. Gesprächsnotiz oder
Zusammenfassung. Ändert keine Felder. Wird im CRM mit ‚Langdock:‘ gekennzeichnet.“

| Input | Typ | Beschreibung |
|---|---|---|
| `lead_id` | TEXT, Pflicht | aus leads_suchen |
| `text` | MULTI_LINE_TEXT, Pflicht | höchstens 5000 Zeichen |

```javascript
// Kopf von oben hier einfügen
const response = await ld.request({
  method: 'POST', url: BASIS + '/notiz', headers: kopf,
  body: { lead_id: data.input.lead_id, text: data.input.text },
});
return response.json;
```

### Action 4: `phase_setzen` (schreibend, **Bestätigung einschalten**)

Beschreibung: „Setzt die Pipeline-Phase eines Leads. erwartete_phase ist die Phase aus dem letzten
leads_suchen oder lead_lesen; hat sie sich inzwischen geändert, kommt ein Konflikt zurück. Rücksprünge
in frühere Phasen sind nicht erlaubt, die macht Denis im CRM. Verloren (beendet) braucht grund und notiz.
Ruht braucht faellig_am.“

| Input | Typ | Beschreibung |
|---|---|---|
| `lead_id` | TEXT, Pflicht | |
| `phase` | SELECT, Pflicht | Phasenliste unten |
| `erwartete_phase` | TEXT, Pflicht | aktuelle Phase laut letztem Lesen |
| `grund` | SELECT | nur bei `beendet`, Werte unten |
| `notiz` | MULTI_LINE_TEXT | bei `beendet` Pflicht (was ist passiert), sonst optionaler Verlaufseintrag |
| `faellig_am` | TEXT | JJJJ-MM-TT, Pflicht bei `ruht` |

```javascript
// Kopf von oben hier einfügen
const body = {
  lead_id: data.input.lead_id,
  phase: data.input.phase,
  erwartete_phase: data.input.erwartete_phase,
};
for (const feld of ['grund', 'notiz', 'faellig_am']) {
  if (data.input[feld]) body[feld] = data.input[feld];
}
const response = await ld.request({ method: 'POST', url: BASIS + '/phase', headers: kopf, body });
return response.json;
```

### Werte für die SELECT-Felder

**Phasen** (Wert → Anzeige): `neu` Neu · `analysiert` Website analysiert · `kontaktiert` Kontaktiert ·
`qualifiziert` Im Gespräch · `fragebogen_raus` Fragebogen raus · `fragebogen_da` Fragebogen da ·
`termin` Termin · `angebot` Angebot raus · `gewonnen` Kunde: Umsetzung · `kunde_betreuung` Kunde: Betreuung ·
`ruht` Ruht · `beendet` Verloren

**Absagegründe:** `kein_bedarf` · `zu_teuer` · `zeitpunkt` (jetzt nicht) · `wettbewerber` · `intern_geloest` ·
`hat_agentur` · `keine_reaktion` · `ich_abgesagt` (passt nicht zu uns) · `ungeeignet` · `mail_unzustellbar` · `sonstiges`

Die Liste muss zu `public/domain.js`, `functions/lib/validation.js` und WF-4 passen. Wer hier etwas ändert,
ändert alle vier Stellen.

## 3. Langdock: Agent „CRM-Assistent“

Agents → Neu → Name `CRM-Assistent`, Integration `360ai CRM` mit allen vier Actions, Modell aus der EU-Liste.

Anweisungen:

```
Du bist der CRM-Assistent von Denis (360ai, KI-Beratung und Umsetzung für den Mittelstand).
Du arbeitest nur mit der Integration "360ai CRM".

Ablauf:
1. Finde den Lead immer zuerst mit leads_suchen. Bei mehreren Treffern frag nach, welcher gemeint ist.
2. Lies vor jeder Änderung die Akte mit lead_lesen und nenne die aktuelle Phase.
3. Schreibe nur, wenn Denis es ausdrücklich will. Fasse vorher in einem Satz zusammen, was du schreibst.
4. Bei phase_setzen immer die zuletzt gelesene Phase als erwartete_phase mitgeben.
5. Bei Verloren immer Grund aus der Liste UND eine Notiz in Denis' Worten, was passiert ist.
6. Rücksprünge in frühere Phasen machst du nicht. Sag Denis, dass er das im CRM selbst bestätigt.

Antworte kurz, auf Deutsch, ohne Gedankenstriche. Erfinde keine Daten. Was nicht in der Akte steht, weißt du nicht.
```

Testfragen: „Was steht bei Lahnform an?“, „Notier bei X: Rückruf Dienstag 10 Uhr“,
„Setz X auf verloren, Grund zu teuer, er fand 990 zu viel für den Einstieg“.

---

# Fragebogen-Automatik (Stand 06.10.2026)

Zwei Langdock-Workflows rund um die Online-Vorbereitung:

| Workflow | Auslöser | Was passiert |
|---|---|---|
| **Rücklauf auswerten** | Webhook aus `vorbereitung.ts`, sobald ein Kunde abschickt | CRM auf „Fragebogen da“ mit Notiz, Rückfragen als **Gmail-Entwurf**, Label auf der Eingangsmail, Gesprächsvorbereitung als Datei in Drive, Vermerk im Kalendertermin, Meldung an Denis |
| **Fragebogen-Erinnerung** | Zeitplan, täglich 8 Uhr | Wer 3 Tage vor der Frist noch nichts geschickt hat, bekommt eine **feste Erinnerungsmail, die direkt rausgeht** (einzige Ausnahme von „nur Entwürfe“, Entscheidung Denis 06.10.). Danach Vermerk im CRM, damit sie nur einmal kommt |

Voraussetzung für beides: Der Lead steht im CRM. Damit die Erinnerung weiß, wer bis wann dran ist, muss der
Versand vermerkt sein. Das macht `_vorbereitung-link.mjs` automatisch, wenn in `kunde.json` eine `lead_id`
steht und `%USERPROFILE%\.360ai_crm_service_token` existiert (Inhalt `{"client_id": "...", "client_secret": "..."}`,
dieselben Werte wie in Abschnitt 1). Später übernimmt das der Agent „Nach dem Gespräch“ (Etappe 4).

**Regeln, die der Code schon erzwingt** (`functions/lib/agent.js`):
- Erinnerung nur in Phase „Fragebogen raus“, ohne Eingang, nur einmal, im Fenster 3 bis 0 Tage vor der Frist.
  Fällt ein Tageslauf aus, holt der nächste nach. Nach der Frist kommt keine Erinnerung mehr.
- Ohne Frist zählt der Termin. Ohne beides keine Erinnerung.
- Liegen zwischen Versand und Frist weniger als 5 Tage, kommt die Erinnerung erst 1 Tag vor der Frist.
  Bei weniger als 2 Tagen gibt es keine Erinnerung.
- Eine zweite Fassung desselben Rücklaufs ändert die Phase nicht mehr, sie bekommt nur eine Notiz.
- Die Phase geht nie zurück. Ist der Lead schon bei „Termin“ oder weiter, bleibt er dort.

## 4. Vier neue Actions in der Integration „360ai CRM“

Gleicher Kopf wie oben. Für die Workflows brauchen die Actions **keine** Bestätigung (es sitzt niemand davor).
Im CRM-Assistenten (Chat) diese vier Actions nicht anhängen.

### Action 5: `vorbereitung_vermerken`

Beschreibung: „Vermerkt, dass der Vorbereitungslink verschickt wurde. Setzt Fragebogen raus, Frist, Termin und Link.“

| Input | Typ |
|---|---|
| `lead_id`, `kennung`, `link` | TEXT, Pflicht |
| `mail`, `begruessung`, `anrede` (du/sie), `frist`, `termin` (JJJJ-MM-TT) | TEXT |

```javascript
// Kopf von oben hier einfügen
const body = {};
for (const feld of ['lead_id', 'kennung', 'link', 'mail', 'begruessung', 'anrede', 'frist', 'termin']) {
  if (data.input[feld]) body[feld] = data.input[feld];
}
const response = await ld.request({ method: 'POST', url: BASIS + '/vorbereitung', headers: kopf, body });
return response.json;
```

### Action 6: `erinnerungen_faellig` (lesend)

Beschreibung: „Liefert alle Leads, die heute eine Fragebogen-Erinnerung bekommen, jeweils mit fertigem Empfänger,
Betreff und Text.“ Keine Inputs.

```javascript
// Kopf von oben hier einfügen
const response = await ld.request({ method: 'GET', url: BASIS + '/vorbereitung/faellig', headers: kopf });
return response.json;
```

Antwort: `{ ok, anzahl, faellig: [{ lead_id, firma, kennung, frist, termin, an, betreff, text }] }`

### Action 7: `erinnerung_vermerken`

Beschreibung: „Vermerkt im CRM, dass die Erinnerung verschickt wurde. Danach kommt sie nicht noch einmal.“

| Input | Typ |
|---|---|
| `lead_id` | TEXT, Pflicht |

```javascript
// Kopf von oben hier einfügen
const response = await ld.request({
  method: 'POST', url: BASIS + '/vorbereitung/erinnert', headers: kopf, body: { lead_id: data.input.lead_id },
});
return response.json;
```

### Action 8: `eingang_vermerken`

Beschreibung: „Vermerkt einen eingegangenen Rücklauf über die Kennung: Phase Fragebogen da, Notiz, Wiedervorlage
auf den Termin. Liefert Firma, Ansprechpartner, Anrede, Mail, Termin und Drive-Ordner des Leads.“

| Input | Typ |
|---|---|
| `kennung` | TEXT, Pflicht |
| `fassung` | NUMBER |
| `kurzfassung` | MULTI_LINE_TEXT, höchstens 4000 Zeichen |

```javascript
// Kopf von oben hier einfügen
const response = await ld.request({
  method: 'POST', url: BASIS + '/vorbereitung/eingang', headers: kopf,
  body: { kennung: data.input.kennung, fassung: data.input.fassung || 1, kurzfassung: data.input.kurzfassung || '' },
});
return response.json;
```

Antwort bei Erfolg: `{ ok, erneut, lead: { lead_id, firma, ansprechpartner, anrede, mail, begruessung, termin, frist, drive_url, phase } }`.
Bei unbekannter Kennung HTTP 404 mit `error: "unbekannte_kennung"`.

## 5. Gmail, Kalender, Drive vorbereiten

1. **Gmail (info@):** Für die Erinnerung muss die Aktion **„Send email“** an sein. Dafür ist die Entwurfs-Regel
   nur noch eine Absprache: Send in keinem Agenten anhängen, nur im Workflow „Fragebogen-Erinnerung“.
   Außerdem in Gmail ein Label **`360ai/Fragebogen da`** anlegen.
   **Prüfen:** Hat die Gmail-Integration eine Aktion zum Labeln (z. B. „Add label to email“) und eine Suche
   („Search emails“)? Wenn nicht, entfällt Schritt 6 im Rücklauf-Workflow, der Rest läuft trotzdem.
2. **Google Calendar** verbinden (Konto, in dem die Kundentermine stehen). **Prüfen:** Gibt es „Search events“
   und „Update event“?
3. **Google Drive** verbinden. **Prüfen:** Gibt es „Create file“ oder „Create document“ mit Zielordner?
   Der Drive-Ordner je Lead steht im CRM (`berichte_drive_url`, legt WF-1 an). Fehlt er, landet die Datei
   in einem festen Ordner `360ai Vorbereitungen` (einmal anlegen).

Was davon fehlt, bitte melden. Dann baue ich die fehlende Stelle über einen eigenen CRM-Endpunkt (n8n hat
Zugriff auf Kalender und Drive).

## 6. Workflow „Rücklauf auswerten“

Workflows → Neu → Name `Rücklauf auswerten`. Ausgabenlimit für diesen Workflow: **10 USD/Monat**.
Fehlerstrategie aller Knoten: **mit Fehler weiterlaufen**, am Ende Benachrichtigung (Schritt 10).

1. **Auslöser Webhook.** URL kopieren. Ein langes Zufallswort als Token ausdenken (z. B. 40 Zeichen aus
   einem Passwortgenerator). Beides geht an Cloudflare, siehe Abschnitt 8.
2. **Condition „Token ok?“:** Header `X-360ai-Token` ist gleich dem Token. Nein → Ende.
   (Falls Langdock Header im Webhook nicht anzeigt: melden, dann kommt das Token zusätzlich in den Body.)
3. **Action `eingang_vermerken`:** `kennung` = `kennung` aus dem Webhook, `fassung` = `fassung`,
   `kurzfassung` = die Liste `zu_klaeren` als Zeilen.
   Bei Fehler (unbekannte Kennung) → **Notification** an Denis: „Rücklauf zu Kennung … ohne Lead im CRM.
   Lead anlegen und Versand vermerken, dann Workflow mit Replay neu starten.“ → Ende.
4. **Agent-Knoten „Auswertung“:** Modell aus der EU-Liste, die vier Dateien aus dem Projekt
   „360ai Kompaktanalyse“ anhängen. Anweisung = die Projektanweisung aus
   `Firma/Technik/Langdock/EINRICHTUNG_Workspace.md` Abschnitt 4, darunter dieser Zusatz:

   ```
   Du bekommst einen Rücklauf (Feld text als Lesefassung, Feld doc als JSON), die Liste zu_klaeren
   und die Lead-Daten aus dem CRM (Firma, Ansprechpartner, Anrede, Begrüßung, Termin).
   Nimm Anrede und Namen aus den Lead-Daten. Steht eine Begrüßung drin, nimm genau diese.
   Ist fassung größer als 1, schreib in den Betreff "(ergänzt)" und frag nichts, was die vorige
   Fassung schon hatte.

   Antworte NUR mit diesem JSON, ohne Text davor oder danach:
   {
     "betreff": "...",
     "rueckfragen_mail": "... (fertiger Mailtext mit Signatur, ohne die Notiz für Denis)",
     "notiz_fuer_denis": "... (höchstens drei Zeilen)",
     "gespraechsvorbereitung": "... (Markdown: Ausgangslage in 5 Sätzen, Programmkarte mit
        den abgetippten Übergängen als Ansatzpunkte, 3 Hypothesen, Fragen für 75 Minuten)",
     "potenzial": "... (Abgleich mit dem Lösungsregister: bekannter Bautyp oder Neuland,
        je Ablauf ein Satz)"
   }
   Keine Gedankenstriche, nirgends.
   ```

   Eingabe an den Agenten: `text`, `doc`, `zu_klaeren`, `fassung` aus dem Webhook und `lead` aus Schritt 3.
   Bietet Langdock eine **strukturierte Ausgabe** (Output-Schema) am Agent-Knoten an, die fünf Felder dort
   anlegen. Sonst danach einen **Code-Knoten** mit `return JSON.parse(input)` (Variable je nach Langdock-Ansicht).
5. **Gmail „Create email draft“:** an `lead.mail`, Betreff `betreff`, Text `rueckfragen_mail`.
   Der Entwurf liegt dann in info@, Denis liest, ändert und schickt selbst.
6. **Gmail „Search emails“** mit `subject:"<betreff_intern aus dem Webhook>"`, dann **„Add label“**
   `360ai/Fragebogen da` auf den Treffer.
7. **Drive „Create document“:** Name `Gesprächsvorbereitung <lead.firma> <termin>`, Inhalt
   `gespraechsvorbereitung` plus darunter `potenzial` und `notiz_fuer_denis`, Ordner `lead.drive_url`
   (leer → `360ai Vorbereitungen`).
8. **Kalender „Search events“** am Tag `lead.termin` mit Suchwort `lead.firma`. Treffer →
   **„Update event“**: an die Beschreibung anhängen „Unterlagen da (Fassung …). Vorbereitung: <Drive-Link>“.
   Kein Treffer → nichts tun, Schritt 10 meldet es.
9. **Action `notiz_anhaengen`:** `lead.lead_id`, Text „Auswertung: “ + `potenzial` + Drive-Link.
10. **Notification an Denis:** „Rücklauf <lead.firma> da. Rückfragen-Entwurf liegt in info@.
    Kalender: <gefunden ja/nein>.“

Veröffentlichen (Publish), sonst läuft nur der Entwurf v0.

## 7. Workflow „Fragebogen-Erinnerung“

Workflows → Neu → Name `Fragebogen-Erinnerung`. Ausgabenlimit **2 USD/Monat** (es läuft kein Modell, nur Actions).
Rund 30 Läufe im Monat, weit unter den 2.500 inklusive.

1. **Auslöser Zeitplan:** täglich 08:00, Zeitzone Europe/Berlin.
2. **Action `erinnerungen_faellig`.**
3. **Condition:** `anzahl` größer 0. Nein → Ende.
4. **Loop** über `faellig`, je Eintrag:
   1. **Gmail „Send email“:** an `an`, Betreff `betreff`, Text `text` (Klartext, nichts umformulieren lassen).
   2. **Action `erinnerung_vermerken`:** `lead_id`.
      Reihenfolge bewusst so: Scheitert der Versand, wird nicht vermerkt und der nächste Tag versucht es erneut.
5. **Fehlerstrategie:** bei Fehler im Loop weiterlaufen, am Ende **Notification** mit den gescheiterten Firmen.

Den Text erzeugt das CRM aus einer festen Vorlage (`erinnerungsMail` in `functions/lib/agent.js`): Begrüßung aus
dem Link (oder Du/Sie mit Namen), Termin, Frist, Link, „lieber unvollständig als gar nicht“, Signatur.
Änderungen am Wortlaut dort, nicht in Langdock.

## 8. Cloudflare: Webhook einschalten (Denis oder ich)

Im Pages-Projekt **`360ai`** (360-ai.org), Production **und** Preview:

```powershell
npx wrangler pages secret put LANGDOCK_WEBHOOK_URL --project-name 360ai
npx wrangler pages secret put LANGDOCK_WEBHOOK_TOKEN --project-name 360ai
```

Danach den Branch `vorbereitung-online` (Commits `a7aa56c`, `162613d`, `e98d019`) nach `main` bringen, dann geht der Code live.
Ohne die Variable passiert nichts. Ein Fehler beim Webhook stört den Versand an den Kunden nie (lokal getestet).

## 9. Erster Durchlauf

1. Testlead im CRM anlegen (Firma „ZZ Test“, Mail = eigene Gmail).
2. `kunde.json` mit `lead_id` des Testleads, Frist **in 3 Tagen**, Termin in 5 Tagen, Link erzeugen.
   Im CRM steht jetzt „Fragebogen raus“. Weil zwischen Versand und Frist sonst weniger als 5 Tage liegen
   (dann käme die Erinnerung erst 1 Tag vor der Frist), im Google Sheet beim Testlead `vb_versand_am`
   auf ein Datum vor einer Woche setzen.
3. Workflow „Fragebogen-Erinnerung“ einmal manuell starten → Mail kommt in der eigenen Gmail an,
   CRM-Notiz „Erinnerung verschickt“. Zweiter manueller Start → nichts (schon erinnert).
4. Bogen über den Link ausfüllen und senden → Workflow „Rücklauf auswerten“ läuft: Phase „Fragebogen da“,
   Entwurf in info@, Label, Drive-Datei, Kalendervermerk (vorher Testtermin anlegen).
5. Laufkosten des Rücklauf-Workflows im Langdock-Verlauf notieren.
6. Testlead archivieren.
