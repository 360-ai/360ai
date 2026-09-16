# Lead-Magnet /ki-startleitfaden: Einrichtung

Stand 16.09.2026. Beschreibt die Schritte, die nur im Browser erledigt werden koennen.
Der Code selbst ist fertig und liegt im Repo.

## Was passiert, wenn jemand das Formular ausfuellt

1. `/ki-startleitfaden` schickt die Eingaben an die Pages Function `/api/lead`.
2. Die prueft die Angaben, packt sie in ein signiertes Token und verschickt ueber Resend
   die Bestaetigungsmail. **Gespeichert wird hier noch nichts.**
3. Der Empfaenger klickt in der Mail auf `Anmeldung bestaetigen` und landet auf
   `/ki-startleitfaden-bestaetigen`. Dort klickt er einen Knopf, der `/api/confirm` aufruft.
4. `/api/confirm` prueft die Signatur, schreibt die Zeile ins Google Sheet und schickt die
   Mail mit dem Downloadlink. Der Link steht zusaetzlich sofort auf der Seite.

Der Knopf auf der Bestaetigungsseite ist Absicht: Mailfilter von Firmen rufen Links in
Mails automatisch auf. Bei einem reinen Klicklink wuerden die eine Einwilligung
bestaetigen, die nie ein Mensch erteilt hat, und genau der Beweiswert des Double-Opt-In
waere weg.

## Schritt 1: Google Sheet anlegen

1. Neue Google-Tabelle anlegen, zum Beispiel `360ai Leads`.
2. Menue `Erweiterungen` > `Apps Script`.
3. Den kompletten Inhalt von `apps-script/lead-sheet.gs` in den Editor kopieren
   (vorhandenen Beispielcode ersetzen).
4. In Zeile 15 `HIER_DAS_SHEET_SECRET_EINSETZEN` durch das Sheet-Secret ersetzen
   (steht unten bei den Variablen).
5. Speichern, dann `Bereitstellen` > `Neue Bereitstellung` > Typ `Web-App`.
   - Ausfuehren als: **Ich selbst**
   - Zugriff: **Jeder** (die Adresse ist dann oeffentlich, deshalb das Secret)
6. Die angezeigte Web-App-Adresse kopieren, sie endet auf `/exec`. Das ist `SHEET_WEBHOOK_URL`.

Die Kopfzeile schreibt das Skript beim ersten Eintrag selbst.

## Schritt 2: Resend-API-Key

Im Resend-Konto (resend.com) unter `API Keys` einen neuen Key anlegen:
- Name zum Beispiel `360ai Leadmagnet`
- Permission **Sending access**, nicht Full access

Der Key wird nur einmal angezeigt.

Absenderdomain `send.360-ai.org` ist bereits verifiziert, dort ist nichts zu tun.

## Schritt 3: Variablen in Cloudflare Pages

Projekt `360ai` > `Settings` > `Variables and Secrets`. Alle Werte sowohl unter
**Production** als auch unter **Preview** eintragen, sonst funktioniert der Test auf der
Preview-Adresse nicht.

| Name | Typ | Wert |
|---|---|---|
| `RESEND_API_KEY` | Secret | der Key aus Schritt 2 |
| `TOKEN_SECRET` | Secret | siehe unten |
| `SHEET_SECRET` | Secret | siehe unten, identisch mit dem Wert im Apps Script |
| `SHEET_WEBHOOK_URL` | Secret | die `/exec`-Adresse aus Schritt 1 |
| `MAIL_FROM` | Text | `360ai <leitfaden@send.360-ai.org>` |
| `MAIL_TO` | Text | `info@360-ai.org` |
| `SITE_URL` | Text | `https://360-ai.org` (fuer den Preview-Test die Preview-Adresse) |

Nach dem Setzen ist ein neues Deployment noetig, damit die Werte greifen.

## Schritt 4 (empfohlen, aber nicht zwingend): Turnstile

Ohne Turnstile schuetzen zwei einfache Fallen das Formular: ein unsichtbares Feld und eine
Mindestzeit. Das haelt Standardbots ab, aber keinen gezielten Angriff. Da das Resend-Konto
nur 100 Mails am Tag fuer **alle** 360ai-Formulare hat, kann ein Ansturm auch die
Kundenformulare lahmlegen.

Einrichtung: Cloudflare Dashboard > `Turnstile` > `Add widget`
- Domains: `360-ai.org` und `360ai-190.pages.dev`
- Modus: `Managed`

Ergibt einen Sitekey (oeffentlich) und ein Secret. Das Secret als `TURNSTILE_SECRET` in
Cloudflare eintragen, den Sitekey an Claude geben, der baut das Widget in das Formular ein.
Solange `TURNSTILE_SECRET` fehlt, laeuft alles ohne Turnstile weiter.

## Die erzeugten Secrets

Einmalig am 16.09.2026 erzeugt. Nicht oeffentlich machen, nicht in Aussentexte kopieren.

```
TOKEN_SECRET=M0DCC0XtJGTDizin_0grH37WMG5J395dtRcEuqT9dZE
SHEET_SECRET=T0K9PFoT8xCEIHqQZfkoVVLvUMyfwTlU
```

`TOKEN_SECRET` signiert die Bestaetigungslinks. Wird es geaendert, werden alle noch nicht
geklickten Links ungueltig.

## Testlauf vor dem Livegang

1. Auf der Preview-Adresse das Formular mit einer eigenen Adresse ausfuellen.
2. Bestaetigungsmail muss ankommen, Link anklicken, Knopf druecken.
3. Zeile muss im Sheet stehen, Downloadmail muss ankommen, PDF muss sich oeffnen.
4. Denselben Bestaetigungslink ein zweites Mal klicken: es darf **keine** zweite Zeile
   im Sheet entstehen.
5. Mit einer Adresse bei einem anderen Anbieter wiederholen (GMX, Web.de, Outlook),
   damit klar ist, ob die Mails im Spam landen.

## Wenn etwas nicht geht

- **Keine Mail:** In Resend unter `Logs` nachsehen. Fehlt der Eintrag ganz, kam die Anfrage
  nicht an, dann Cloudflare Pages > `Functions` > Echtzeit-Log pruefen.
- **Mail ja, Sheet leer:** Dann kommt automatisch eine Warnmail an `info@360-ai.org` mit
  allen Daten des Leads, damit nichts verloren geht. Ursache ist meist eine falsche
  `SHEET_WEBHOOK_URL` oder ein abweichendes Secret.
- **Bestaetigungslink ungueltig:** `TOKEN_SECRET` weicht zwischen Preview und Production ab.

## Wenn spaeter weitere Dokumente dazukommen

In `functions/api/lead.ts` und `functions/api/confirm.ts` steht jeweils oben eine Liste
`DOCS`. Dort einen Eintrag ergaenzen, die PDF nach `assets/downloads/` legen und im Formular
das Feld `doc` entsprechend setzen. Der Dateiname sollte weiter eine zufaellige Endung
haben, damit die PDF nicht ohne Formular auffindbar ist.
