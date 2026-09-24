# Google Sheet „360ai Akquise"

Das Sheet ist gleichzeitig CRM-Zustand und Dashboard. Es funktioniert auf dem Handy und wird
ausschließlich von n8n beschrieben.

**Aufgabenteilung, damit es keine zwei Wahrheiten gibt:**

| | führend für | wird beschrieben von |
|---|---|---|
| Google Sheet | Status, Termine, Gmail-IDs, Score-Zahlen, Drive-Link | **nur n8n (WF-1 bis WF-4)** |
| Lokale Dateien | Fakten, Regelergebnisse, Berichte, Screenshots | nur der lokale Lauf |
| Google Drive | mobile Kopie der vier Berichte je Lead | nur n8n (WF-1/WF-3) |

Claude Code schreibt **nie** direkt ins Sheet. Es liefert `zusammenfassung.json` an den
n8n-Webhook; n8n prüft und schreibt. Verbindung ist die `lead_id`.

---

## Anlegen

Neue Tabelle „360ai Akquise" mit **drei Blättern**. Die Spaltenüberschriften müssen exakt so
heißen — n8n ordnet nach Namen zu, nicht nach Position.

### Blatt 1: `Leads`

Eine Zeile je Lead. Das ist die Arbeitsansicht.

| Spalte | Inhalt | wer setzt |
|---|---|---|
| `lead_id` | `L-JJJJMMTT-kurzform`; Mailimport nutzt `L-JJJJMMTT-mail-<Gmail-ID>` | WF-1 / WF-6 |
| `firma` | Firmenname | WF-1, ergänzt durch Analyse |
| `website` | Endgültige URL nach Weiterleitungen | WF-1 |
| `ort` | Ort | WF-1 / Analyse |
| `branche` | Schlüssel aus `branchen.json` | WF-1 |
| `ansprechpartner` | Name | WF-1 / Impressum / WF-6 aus dem An-Feld |
| `anrede` | `du` oder `sie` | WF-1 |
| `mail` | E-Mail | WF-1 / Impressum / WF-6 |
| `telefon` | Telefonnummer | WF-1 / Impressum |
| `kontaktquelle` | `website`, `telefonat`, `empfehlung`, `direkt_mail`, `sonstiges` | WF-1 / WF-6 |
| `website_score` | 0–100 | Webhook |
| `akquise_score` | 0–100 | Webhook |
| `akquise_ansatz` | `relaunch`, `teilsanierung`, `sichtbarkeit`, `kein_ansatz` | Webhook |
| `compliance` | `gruen`, `pruefen`, `kritischer_hinweis` | Webhook |
| `status` | siehe unten | WF-1, WF-2, WF-3, WF-4, WF-6 |
| `next_action` | `analyse`, `anruf`, `followup_call`, `followup_mail`, `wiedervorlage`, `antwort_bearbeiten`, `angebot_erstellen`, `termin` oder leer | WF-1 bis WF-4 / WF-6 |
| `next_action_at` | Datum `JJJJ-MM-TT` | WF-1 bis WF-4 / WF-6 |
| `email_freigabe` | `ja` / `nein` | WF-2 |
| `email_freigabe_am` | Datum | WF-2 |
| `email_freigabe_notiz` | Wortlaut der Zusage | WF-2 |
| `gmail_draft_id` | Entwurfs-ID | WF-2 |
| `gmail_thread_id` | Thread-ID | WF-2 / WF-6 |
| `gmail_empfaenger` | Adresse | WF-2 / WF-6 |
| `gmail_betreff` | Betreff | WF-2 / WF-6 |
| `unterlagen_gesendet_am` | Datum des erkannten Versands; bei WF-6 auch Datum der markierten Direktmail (historischer Spaltenname) | WF-3 / WF-6 |
| `ende_grund` | siehe unten | WF-2, WF-3, WF-4 (CRM) |
| `wiedervorlage_am` | Datum | WF-3, WF-4 (CRM) |
| `notiz` | frei | WF-1, WF-4 (CRM) |
| `berichte_pfad` | lokaler Pfad zu den Dokumenten | Webhook |
| `berichte_drive_url` | Link zum Drive-Ordner mit den 4 Berichten (für Handy-Zugriff im CRM) | WF-1; Löschung/Leeren durch WF-3 |
| `mail_betreff` | Betreffzeile des vorbereiteten Entwurfs | Webhook |
| `mail_entwurf` | vollständiger Mailtext | Webhook |
| `strasse` | Straße und Hausnummer, getrennt vom Ansprechpartner | WF-4 (CRM) |
| `handy` | Mobilnummer, zusätzlich zu `telefon` | WF-4 (CRM) |
| `archiviert_am` | Datum der Archivierung; gesetzt heißt „im CRM ausgeblendet“ | WF-4 (CRM) |

Die letzten drei Spalten legt der Google-Sheets-Knoten beim ersten Schreiben selbst an.
Sie hängen deshalb hinten an und stehen nicht an der oben gelisteten Position.

**Archivieren statt Löschen:** Das CRM entfernt nie eine Zeile. „Lead löschen“ setzt
`archiviert_am`; der Lead verschwindet aus allen Arbeitsansichten, bleibt im Sheet
erhalten und lässt sich über die Archivansicht zurückholen. Der Status bleibt dabei
unverändert, damit die Automationen in WF-1 bis WF-3 nicht durcheinandergeraten.

Die letzten beiden Spalten sind nötig, weil n8n auf dem Server läuft und die lokalen Berichte
nicht lesen kann. Der fertige Mailtext reist deshalb mit der Nutzlast mit und wartet im Sheet,
bis das Telefonat die Freigabe liefert.

**Status — sieben Stufen, mehr nicht:**

`neu` → `analysiert` → `kontaktiert` → `qualifiziert` → `angebot` → `gewonnen` | `beendet`

Alles Weitere ist ein Feld, kein Status. `ende_grund`: `kein_bedarf`, `hat_agentur`, `zu_teuer`,
`keine_reaktion`, `ungeeignet`, `mail_unzustellbar`.

Follow-ups stoppen bei `gewonnen` und `beendet` — außer `wiedervorlage_am` ist gesetzt und erreicht.

Manuell gepflegt bedeutet nicht, dass direkt im Sheet geschrieben wird: Das CRM sendet nur die
freigegebenen Felder an WF-4. Bei einer Statusänderung vergleicht WF-4 `erwarteter_status` mit dem
aktuellen Sheet-Wert. Ein Konflikt wird abgewiesen; der Browser muss neu laden. Rücksprünge müssen
im CRM ausdrücklich bestätigt werden.

### Blatt 2: `Activities`

Eine Zeile je Kontaktereignis. **Hier steckt die spätere Auswertung.**

| Spalte | Inhalt |
|---|---|
| `activity_id` | eindeutige ID, `A-` plus Zeitstempel oder bei Mailimport `A-mail-<Gmail-ID>` |
| `lead_id` | Verweis |
| `datum` | Zeitpunkt |
| `typ` | `anruf`, `mail`, `antwort`, `followup`, `termin`, `angebot`, `status_wechsel`, `notiz` |
| `richtung` | `raus` / `rein`; leer bei `status_wechsel` |
| `verwendete_argumente` | Feststellungs-Kategorien, kommagetrennt, z. B. `local,air` |
| `ergebnis` | `erreicht`, `nicht_erreicht`, `zusage`, `absage`, `offen` |
| `notiz` | frei |
| `external_id` | externe Ereignis-ID zur Deduplizierung, derzeit `gmail:<Gmail-ID>` bei WF-6 |

`verwendete_argumente` gehört hierher und nicht an den Lead: Im Telefonat nutzt du andere
Argumente als in der Mail. Die spätere Frage lautet „welches Argument wirkt bei welcher
Kontaktart" — die ist nur mit Historie beantwortbar.

WF-2 schreibt Kontaktaktivitäten. WF-4 schreibt bei jedem erfolgreichen Statuswechsel eine eigene
Zeile mit `typ = status_wechsel`; `ergebnis` bleibt `offen`, und `notiz` enthält den Übergang vom
alten zum neuen Status. Ebenfalls über WF-4 entstehen Zeilen mit `typ = notiz`: beim Anlegen eines
Leads, beim Archivieren und Zurückholen sowie für jede Notiz, die im CRM in den Verlauf
geschrieben wird. Damit ist die Historie eines Leads vollständig in `Activities` ablesbar, während
die Spalte `Leads.notiz` weiterhin die aktuelle Dauernotiz trägt. So bleiben auch bestätigte ungewöhnliche Rücksprünge nachvollziehbar.
WF-6 schreibt für jede neu erkannte BCC-Mail eine Aktivität `typ = mail`, `richtung = raus` und
verhindert über `external_id`, dass dieselbe Gmail-Nachricht mehrfach importiert wird.

### Blatt 3: `Audits`

Eine Zeile je Analyselauf. Erlaubt den Vorher-Nachher-Vergleich.

| Spalte | Inhalt |
|---|---|
| `audit_id` | Ordnername des Laufs |
| `lead_id` | Verweis |
| `datum` | Zeitpunkt der Erhebung |
| `collector_version` | z. B. `1.0.0` |
| `regelwerk_version` | z. B. `1.0.0` |
| `website_score` | 0–100 |
| `akquise_score` | 0–100 |
| `seo` `technik` `air` `design` `conversion` `local` `vertrauen` | Achsenwerte |
| `compliance` | Ampel |
| `seiten_geprueft` | Anzahl |
| `pfad` | lokaler Auditordner |

Ohne `regelwerk_version` sind zwei Läufe nicht vergleichbar — eine geänderte Regel verschiebt
Scores, ohne dass sich die Website geändert hat.

---

## Empfohlene Ansichten

**Heute zu tun** — Filteransicht auf `Leads`: `next_action_at` ist heute oder früher **und**
`status` ist nicht `gewonnen`/`beendet`. Sortiert nach `akquise_score` absteigend.

**Neue Leads** — `status = neu`. Das ist die Warteschlange für die Tiefenanalyse am Laptop.

**Bedingte Formatierung** — `akquise_score` ≥ 75 grün, 55–74 gelb, darunter grau.
`compliance = kritischer_hinweis` rot einfärben.

---

## Einrichtung

1. Tabelle anlegen, drei Blätter mit genau diesen Überschriften in Zeile 1.
2. Tabellen-ID aus der URL kopieren (der Teil zwischen `/d/` und `/edit`).
3. In allen sechs n8n-Workflows die Platzhalter `SHEET_ID_HIER` ersetzen.
4. Google-Sheets-Zugangsdaten in n8n den Sheets-Knoten zuweisen.
5. In WF-1 und WF-3 denselben dedizierten Drive-Stammordner unter `DRIVE_FOLDER_ID_HIER`
   eintragen und die Drive-Zugangsdaten zuweisen.
6. WF-1 mit dem Analyse-Webhook-Token, WF-4 mit einem davon unabhängigen CRM-Schreibtoken und
   WF-5 mit einem dritten, unabhängigen CRM-Lesetoken konfigurieren.
7. Allen drei Leseknoten in WF-5 das bereits in n8n verwaltete Google-Sheets-Credential zuweisen
   und alle sechs Workflows publishen. Cloudflare benötigt dadurch keinen Google-Privatschlüssel.

## Aufbewahrung der Drive-Berichte

WF-3 löscht bei `ende_grund = kein_bedarf` oder `ungeeignet` nach 24 Monaten den eindeutig über
ID, Namen und Stammordner geprüften Drive-Ordner dauerhaft und leert danach
`berichte_drive_url`. Das derzeitige Datenmodell besitzt kein `beendet_am`; als Bezugsdatum dient
deshalb `unterlagen_gesendet_am`. Ist es leer, wird keine automatische Drive-Löschung ausgelöst.
Diese Leads müssen bis zu einer späteren Schema-Erweiterung in einer separaten Löschkontrolle
geführt werden; kein Workflow soll dafür ein Abschlussdatum erfinden.

## Nebenläufigkeit

WF-4 verwendet Optimistic Locking und WF-1 bis WF-3 schützen fortgeschrittene und terminale Status
gegen automatische Rückstufungen. Lesen, Vergleichen und Schreiben sind in Google Sheets dennoch
keine atomare Transaktion. Ein kleines TOCTOU-Zeitfenster bleibt; bei ungewöhnlichen Ergebnissen
die `status_wechsel`-Activities prüfen. Bei künftig höherer Schreibparallelität ist ein
serialisierter oder transaktionaler Schreibpfad erforderlich.
