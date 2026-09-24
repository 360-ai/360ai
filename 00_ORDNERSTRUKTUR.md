# 360ai Ordnerstruktur

Stand 24.09.2026. Hauptablage für alles rund um 360ai ist `Documents\360ai`.
Der Google-Drive-Ordner `Meine Ablage\360ai` ist nur noch Verwaltung (Buchhaltung, Steuer, Versicherungen).
Private Themen gehören nicht hierher, sondern nach `Documents\Privat` bzw. `Documents\DeFi-Krypto`.

## Was gehört wohin

| Ordner | Inhalt | Beispiele |
|---|---|---|
| `Strategie\` | Positionierung und Richtungsentscheidungen für 360ai als Ganzes | Value-Ladder, Neuausrichtung, Betriebsmodell, Partnernetzwerk, Fahrplan |
| `Angebote\` | Ein Ordner je Leistung, die wir verkaufen | KI-Buddy, Websites, Workshops, GEO, Langdock, Automationen |
| `Vertrieb\` | Alles, um Kunden zu gewinnen | Branche Abschlepp, Gesprächsleitfaden, Prospekte und Leitfäden, akquise-daten |
| `Marketing\` | Eigene Sichtbarkeit von 360ai | LinkedIn, Erklärvideos |
| `Kunden\<Name>\` | Alles zu einem konkreten Kunden, darin `Projekte\`, `Kommunikation\`, `Verträge\` | AVAS, Haase, Reitter, Schreck |
| `Tools\` | Interne Werkzeuge, die wir selbst bauen und nutzen | Beratungstool (Repo `kiberatungstool`), Akquise-Tool (mit CRM), Kunden-Tool, Prozess-Assessment, KI-Readiness, kie, SlopMonster |
| `Labor\` | Entwürfe, Experimente, generierte Bilder | Website-Entwürfe, `generations\` (media-Skill) |
| `Archiv\` | Abgeschlossenes und Altstände, nur lesen | alte Sicherung April 2026, Tests |
| `Firma\` | Alles, was 360ai als Unternehmen braucht | `Rechnungen`, `Vertragsvorlagen`, `Vorlagen`, `Brand` (Logo, Unterschrift, EU-KI-Icons), `Recht\AVV`, `Technik` (Google, Hetzner, Strato, kie ai, n8n, Playbooks), `Foerderung RKW`, Mailsignatur |
| `Eigene Projekte\` | Eigene Vorhaben außerhalb des 360ai-Angebots | meinumzugsrechner |
| `Allgemeine Orga360ai\Brand\Website\` | **Quelle der 360ai-Website** (hier editieren, dann `build.sh`) | Logo-Neubau, Rebranding, Apps Script |
| `Produkte\360ai-website\` | **Deploy-Ordner von 360-ai.org**, wird von `build.sh` erzeugt, nie von Hand ändern | |

## Faustregeln

1. **Neues Thema? Erst hier einordnen, dann anlegen.** Nie in den gerade offenen Ordner legen, nur weil er offen ist.
2. Betrifft es **einen bestimmten Kunden** → `Kunden\<Name>\Projekte\...`
3. Ist es **eine Leistung, die wir verkaufen** → `Angebote\<Leistung>\`
4. Dient es dazu, **Kunden zu gewinnen** (Branche, Leads, Leitfäden, Prospekte) → `Vertrieb\`
5. Ist es **ein Werkzeug**, das wir bauen → `Tools\`
6. Betrifft es **360ai als Ganzes** (Preise, Positionierung, Fahrplan) → `Strategie\`
7. Ordnernamen ohne Nummernpräfix, deutsch, Leerzeichen sind erlaubt.

## Bewusst nicht verschoben

- `Produkte\360ai-website` und `Allgemeine Orga360ai\Brand\Website`: Cloudflare Pages (Projekt `360ai`) veröffentlicht 360-ai.org direkt aus `Produkte/360ai-website` auf `main`, und `build.sh` schreibt relativ dorthin. Ein Umzug geht nur zusammen mit einer Änderung des Ausgabeverzeichnisses im Cloudflare-Dashboard und einer Anpassung von `build.sh`. Erst beides ändern, dann verschieben, dann pushen.

## Abhängigkeiten, die beim Verschieben brechen

- Kunden-Tool: `Tools\Kunden-Tool\lib\pfade.mjs` erwartet `Firma\Rechnungen`, `Firma\Vertragsvorlagen` und `Kunden` und liegt selbst genau zwei Ebenen unter `360ai`.
- `Firma\Vertragsvorlagen\signatur.mjs` findet die Unterschrift über `..\Brand`, beide Ordner müssen nebeneinander bleiben.
- `Vertrieb\Prospekte und Leitfaeden\scripts\build_ki_start_guide.py` nutzt einen festen Logo-Pfad in `Allgemeine Orga360ai\Brand\Website\assets\brand`.
- Akquise-Tool schreibt Leaddaten nach `Kunden\Akquise` (per `AKQUISE_DATA_ROOT` änderbar).

## Offene Reste

- Leere, gesperrte Ordner löschen: `Strategie\KI Buddy`, `Allgemeine Orga360ai\Marketing`.
- `Downloads\Unterlagen Allgemein` enthält noch alte Kopien von Vorlagen (AGB, AVV, 360ai_VORLAGE.html usw.). Abgleichen mit `Firma\Vorlagen`, dann löschen.
