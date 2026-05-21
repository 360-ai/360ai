# Local DeFi Tax Workbench Design

**Datum:** 2026-05-21

## Ziel

Dieses Projekt wird als neue lokale Arbeitsoberflaeche fuer die eigene
DeFi-Steuerarbeit aufgebaut. Es soll kurzfristig helfen, die offenen
CoinTracking-Pruefpunkte fuer das Steuerjahr 2025 sauber abzuarbeiten und die
DeFi-Bewegungen des Steuerjahres 2026 in CoinTracking-kompatible CSV-Dateien zu
ueberfuehren.

Die erste Version ist kein SaaS und kein Vertriebsprodukt. Sie ist eine
lokale, private Arbeitskonsole, die vorhandenes Wissen und brauchbare Logik aus
`02_CoinTracking-Tax` gezielt uebernimmt, ohne die dort entstandene Oberflaeche
weiter aufzublaehen.

## Erfolgskriterien

Die erste Version ist erfolgreich, wenn:

- 2025-CoinTracking-Reports lokal eingelesen und als Korrekturboard
  ausgewertet werden koennen.
- die vorhandenen 2025-Reports die bekannten fuenf harten
  `Short (Warning)`-Faelle reproduzierbar sichtbar machen.
- jeder 2025-Fund lokal einen Status, eine Notiz, einen naechsten Schritt und
  einen Recheck-Status erhalten kann.
- KI- oder regelgestuetzte Vorschlaege konkrete Hilfe geben, welche
  CoinTracking-Transaktionen geprueft oder ergaenzt werden sollten.
- aus geprueften Vorschlaegen Korrektur-CSV-Entwuerfe mit sichtbaren
  Platzhaltern entstehen koennen.
- 2026-Rohdaten aus priorisierten DeFi-Quellen in einer erweiterbaren Inbox
  erkannt, geprueft und in CoinTracking-CSV ueberfuehrt werden koennen.
- neue DeFi-Quellen erst generisch verarbeitet und spaeter als feste
  Connectoren nachgezogen werden koennen.

## Scope

### Enthalten

- lokale Jahresauswahl mit den Wegen `2025 pruefen` und `2026 importieren`
- Einlesen von CoinTracking-Report-CSVs fuer 2025 und spaeter 2026
- 2025-Korrekturboard fuer harte Findings und nachrangige Warnungen
- lokale Speicherung von Findings, Bearbeitungsstatus, Notizen und
  Korrekturentwuerfen
- KI-/Regelvorschlaege fuer Pruefung und moegliche Korrekturen
- Korrektur-CSV-Entwuerfe mit Platzhaltern und Importbereit-Pruefung
- 2026-Hybrid-Inbox fuer Dateien und API-Abrufe
- CoinTracking-CSV als einziges produktives Ausgabeformat in Phase 1
- erweiterbare Quellenlogik fuer Variational, Nado, Extended, GRVT, AFX und
  Paradex
- generischer Mapping-Flow fuer unbekannte oder neue Quellen
- lokale Secrets-Datei ausserhalb des Projektordners fuer API-Zugaenge

### Nicht enthalten

- Hosting, Login, Mandantenfaehigkeit, Billing oder Public SaaS
- automatisches Aendern von CoinTracking-Daten ohne Nutzerpruefung
- automatisches Freigeben steuerrelevanter CSV-Dateien bei unklaren Feldern
- direkte Abdeckung aller CEX- und Chain-Integrationen, die CoinTracking
  bereits selbst anbietet
- Produktmarketing oder Vermarktungsoberflaeche

## Nutzerfluss

### Einstieg

Die App startet mit einer schlichten Jahresauswahl:

1. `2025 pruefen`
2. `2026 importieren`

Der Einstieg erklaert nicht das gesamte Produkt. Er fuehrt direkt in die
Arbeitsaufgabe des jeweiligen Steuerjahres.

### 2025 pruefen

Der 2025-Weg startet mit einem Korrekturboard fuer CoinTracking-Reports.

Aktuell vorhandene Projektdateien:

- `CT Berichtsdaten 2025/CoinTracking - Capital Gains Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Closing Position Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Income Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Fee Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Gifts and Donation Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Lost and Stolen Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Tax Export - 2025.pdf`
- `CT Berichtsdaten 2025/CoinTracking - Tax Export - 2025.xlsx`

Der aktuelle 2025-Datensatz liefert als erste Verifikation:

| Report | Erwartete Datenzeilen |
| --- | ---: |
| Capital Gains | 164 |
| Closing Position | 113 |
| Income | 24 |
| Fee | 89 |
| Gifts and Donation | 0 |
| Lost and Stolen | 0 |

Im Capital-Gains-Report muessen die bekannten fuenf harten
`Short (Warning)`-Faelle mit Kostenbasis 0 sichtbar sein:

| Reportzeile | Asset | Datum | Ausgang | Gewinn/Verlust EUR |
| ---: | --- | --- | --- | ---: |
| 17 | ETH | 05.04.2025 | S Transaction | 1,44248864 |
| 125 | USDC | 10.10.2025 | Binance | 0,62339358 |
| 127 | FET | 16.10.2025 | Bitpanda | 0,13228886 |
| 130 | USDC | 17.10.2025 | Binance | 0,14387075 |
| 134 | ETH | 08.11.2025 | AETH Transaction | 0,79041260 |

Das Board priorisiert:

1. harte Findings wie `Short (Warning)` und fehlende Kostenbasis
2. Warnungen wie moegliche Gebuehren-Dubletten, auffaellige Income-Zeilen und
   Closing-Position-Hinweise
3. Report-Zusammenfassungen fuer die manuelle Steuerarbeit

Jeder Fund bietet:

- Datenbezug zum Report und zur Zeile
- Status `offen`, `in CoinTracking korrigiert`, `bewusst dokumentiert` oder
  `erneut pruefen`
- lokale Notiz
- naechster Schritt
- letzten Pruefzeitpunkt
- Recheck-Ergebnis nach erneutem Report-Upload

### 2026 importieren

Der 2026-Weg startet mit einer Hybrid-Inbox:

- Dateien koennen in die Inbox gezogen oder ausgewaehlt werden.
- API-Abrufe koennen fuer geeignete Quellen gestartet werden.
- die App erkennt Quelle und Datentyp soweit moeglich automatisch.
- jede Erkennung landet vor Export in einer Vorschau.

Die erste Prioritaet fuer 2026 sind:

- Variational
- Nado
- Extended
- GRVT
- AFX
- Paradex

Die Inbox soll pro Eingang unterscheiden koennen zwischen:

- sicher erkannter Quelle mit passendem Parser oder Connector
- erkannter Quelle mit Pruefbedarf
- unbekannter Quelle mit generischem Mapping-Flow

Neue Quellen duerfen den Workflow nicht blockieren. Sie beginnen im generischen
Mapper und koennen spaeter als Parser-/Connector-Profil verfestigt werden.

## KI-Korrekturassistent

Der Korrekturassistent ist Hilfe zur Bearbeitung, nicht eine stille
Steuerautomatik.

Pro Finding soll er liefern:

- was auffaellig ist
- wahrscheinliche Ursache
- konkrete Pruefschritte in CoinTracking
- moegliche Korrekturart, zum Beispiel fehlender Eingang, Transfer,
  Exchange-Zuordnung, Kostenbasis-Kontext, Fee- oder Funding-Thema
- welche Daten fuer eine belastbare Korrektur noch fehlen
- Einschaetzung der Sicherheit
- Begruendung mit Reportbezug und verwendeter Regel

Regelchecks bleiben der verlaessliche Unterbau fuer harte Erkennung. Eine
LLM-Schicht kann die Vorschlaege erklaeren, priorisieren und aus den
vorliegenden Daten CSV-Entwuerfe vorbereiten. Die erste Implementierung darf
regelbasierte Vorschlaege bereits liefern und die LLM-Anbindung als Adapter
erganzen.

## Korrektur-CSV-Workflow

Gepruefte Vorschlaege koennen zu CoinTracking-Korrektur-CSV-Entwuerfen werden.

Der Ablauf:

1. Finding wird analysiert.
2. Vorschlag wird vom Nutzer geprueft.
3. die App erzeugt ergaenzende Korrekturzeilen als Entwurf.
4. unbekannte Werte werden sichtbar als Platzhalter ausgegeben.
5. die App prueft, ob Platzhalter oder fehlende Pflichtfelder verbleiben.
6. nur vollstaendige CSVs erhalten den Status `importbereit`.

Beispiele fuer Platzhalter:

- `TODO_DATUM`
- `TODO_EXCHANGE`
- `TODO_KOSTENBASIS`
- `TODO_TX_ID`

Eine Entwurfs-CSV darf heruntergeladen werden, muss aber klar als nicht
importbereit markiert sein, solange Platzhalter verbleiben.

## Review- und Qualitaetsmodell

Importe und Korrekturentwuerfe nutzen gemeinsame Status:

- `sicher`: Struktur und Pflichtfelder sind plausibel.
- `pruefen`: Daten sind nutzbar, aber fachlich oder technisch zu bestaetigen.
- `unklar`: kein finaler CoinTracking-Export ohne Nacharbeit.

Typische Gruende fuer `pruefen` oder `unklar`:

- fehlende Pflichtfelder
- Platzhalter in Korrekturentwuerfen
- unbekannte Quellstruktur
- unvollstaendige API-Antwort
- unklare Funding-, Fee- oder Perp-Zuordnung
- nur heuristisch erkannte Quelle

## Architektur

### Lokales Backend

Das Backend laeuft lokal und stellt die Arbeits-API fuer Frontend, Parser,
Reportanalyse und Korrekturentwuerfe bereit.

Vorgesehene Bausteine:

- FastAPI-Anwendung
- SQLite-Datenbank fuer lokale Bearbeitungsdaten
- Report-Audit-Schicht fuer CoinTracking-Reports
- Connector-/Parser-Schicht fuer 2026-Quellen
- generischer Mapping-Flow fuer unbekannte Quellen
- CoinTracking-CSV-Generator und CSV-Validierung
- Vorschlagsadapter fuer Regeln und LLM

### Frontend

Das Frontend wird als ruhige Arbeitskonsole aufgebaut:

- Jahresauswahl
- 2025-Korrekturboard
- 2026-Hybrid-Inbox
- Finding-Detailansicht mit Vorschlag, Notiz und CSV-Entwurf
- Entwurfsbereich fuer Platzhalter und Importbereit-Pruefung
- kompakte Anzeige der verwendeten Regeln und Annahmen

Die Oberflaeche priorisiert Scannen, Vergleichen und Abarbeiten statt
Marketing-Layout.

### Datenhaltung

Lokal gespeichert werden:

- Findings und deren Reportbezug
- Status, Notizen und naechste Schritte
- Vorschlaege und deren Begruendung
- Korrektur-CSV-Entwuerfe
- Importlaeufe und Review-Status
- Connector-Konfigurationen ohne Secrets
- optional Pfade zu externen Secrets-Dateien

Originaldateien bleiben zunaechst nutzerkontrolliert im Dateisystem. Die App
kann Metadaten und abgeleitete Ergebnisse speichern, ohne alle Quelldateien in
eine interne Ablage zu kopieren.

### Secrets

API-Keys und Tokens liegen nicht im Projektordner. Die App unterstuetzt eine
externe lokale Secrets-Datei und manuelle Eingabe fuer einzelne Abrufe.

Secrets duerfen nicht in SQLite-Exports, Git-Artefakte oder Korrekturpakete
geraten.

## Quellen- und Connector-Modell

Jede Quelle soll langfristig ein kleines Profil erhalten:

- Erkennungsmerkmale
- unterstuetzte Input-Arten
- Parser oder API-Connector
- CoinTracking-Mapping
- Validierungs- und Review-Regeln
- bekannte Grenzen und Fallback-Pfad

CoinTracking-native CEX- und Chain-Schnittstellen wie gaengige Exchanges oder
groessere Chains werden in Phase 1 nicht nachgebaut. Die App konzentriert sich
auf die DeFi-/Perp-Luecken und auf Korrekturhilfe.

## Fehlerbehandlung

- Unbekannte Dateien werden nicht verworfen, sondern in den generischen Mapper
  gefuehrt.
- API-Fehler zeigen Abrufkontext und moegliche naechste Checks, zum Beispiel
  Key, Zeitraum, Endpoint, Rate Limit oder leere Antwort.
- Pflichtfeldfehler blockieren finalen Export und zeigen betroffene Zeilen.
- Platzhalter blockieren Status `importbereit`, aber nicht den
  Entwurfs-Workflow.
- Reports mit leeren Datenzeilen werden als leere Sonderreports erkannt und
  nicht als Parserfehler behandelt.

## Teststrategie

### 2025-Reportpruefung

Fokussierte Tests gegen die vorhandenen 2025-Dateien pruefen:

- Reporttyp-Erkennung
- erwartete Zeilenzahlen pro Hauptreport
- Erkennung der fuenf harten `Short (Warning)`-Faelle
- Behandlung der leeren Gifts-/Lost-Reports
- Persistenz von Status, Notiz und Recheck
- Korrektur-CSV-Entwuerfe mit Platzhaltern
- Importbereit-Pruefung nach Platzhalterersetzung

### 2026-Import

Parser-/Connector-Tests pruefen:

- Quelle und Input-Typ fuer Variational, Nado, Extended, GRVT, AFX und Paradex
- Plausibilitaet von Trade-, Funding-, Fee- und Income-Mappings
- CoinTracking-Header, Datumsformate und Pflichtfelder
- generischen Mapping-Fallback fuer neue Quellen
- Review-Status bei unsicheren Imports

### UI-Pruefung

Die lokale UI wird fuer Desktop und mobile Breiten geprueft:

- Jahresauswahl ist eindeutig.
- harte 2025-Faelle stehen im Korrekturboard zuerst.
- Findings bleiben lesbar bei langen Reportwerten und Notizen.
- Inbox, Mapping, Vorschau und CSV-Entwurf sind ohne Ueberlappungen nutzbar.

## Reihenfolge fuer die Umsetzung

1. neues lokales App-Grundgeruest im aktuellen Projektordner
2. 2025-Reportparser und Korrekturboard mit lokaler Persistenz
3. Regelvorschlaege und Korrektur-CSV-Entwuerfe mit Platzhalterpruefung
4. zuschaltbarer KI-Adapter fuer Vorschlaege
5. 2026-Hybrid-Inbox und CoinTracking-CSV-Pipeline
6. priorisierte Quellenprofile fuer Variational, Nado, Extended, GRVT, AFX und
   Paradex

## Offene Annahmen

- Die erste Version bleibt lokal und ist fuer die eigene Steuerarbeit gebaut.
- CoinTracking bleibt in Phase 1 das einzige finale Zielsystem.
- 2025 fokussiert auf Korrektur und Plausibilisierung vorhandener Reports.
- 2026 fokussiert auf DeFi-/Perp-Importe, die nicht bequem ueber bestehende
  CoinTracking-Schnittstellen abgedeckt sind.
- KI-Vorschlaege duerfen helfen und Entwuerfe vorbereiten, ersetzen aber nicht
  den manuellen Pruefschritt vor steuerrelevantem Import.
