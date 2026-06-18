# 360ai Logo-Neubau und ThreesixtyAI Wortmarke - Design Spec

Datum: 2026-06-19

## Ziel

Das bestehende 360ai-Logo soll so nah wie technisch moeglich als echte SVG-Vektordatei nachgebaut bzw. bereinigt werden. Der Zielwert ist eine 1:1-nahe Rekonstruktion des aktuell genutzten PNGs `Logo/LogoOhneHintergrund.png`, nicht eine neue Interpretation.

Zusaetzlich soll eine neue Wortmarke `ThreesixtyAI` im Stil des 360ai-Logos entstehen.

## Ausgangsmaterial

- Primaere visuelle Referenz: `Logo/LogoOhneHintergrund.png`
- Beste vorhandene Vektorquellen:
  - `Rebranding/360ai_logo_vektor.svg`
  - `Rebranding/360ai_logo (1) vektor.svg`
- Nicht als echte Vektorquelle geeignet:
  - `Rebranding/360ai_logo.svg`, da diese Datei ein eingebettetes Rasterbild enthaelt.

## Ergebnisordner

Alle neuen Artefakte werden in einem eigenen Ordner im Brand-Verzeichnis abgelegt:

`Logo_Neubau_360ai/`

Geplante Dateien:

- `360ai-logo-1zu1.svg`
- `360ai-logo-1zu1-preview.png`
- `threesixtyai-logo-vorschlag.svg`
- `threesixtyai-logo-vorschlag-preview.png`
- `preview.html`
- optional `README.md` mit kurzer Herkunfts- und Nutzungsnotiz

## Designrichtung 360ai

Der Nachbau bleibt moeglichst nah am vorhandenen Logo:

- gleiche breite, abgerundete Formensprache
- gleiche Wort-/Zeichenfolge `360ai`
- gleiche optische Verbindung von `0` und `a` als fliessende Schleife
- gleicher weicher Verlauf von Lavendelblau nach Mint/Teal
- keine eingebetteten Rasterbilder im finalen SVG
- transparente Hintergrundflaeche

Die vorhandene echte Vektorquelle wird als Basis verwendet und gegen das PNG visuell abgeglichen. Falls mehrere Quellen unterschiedlich nah wirken, gewinnt die visuelle Naehe zum PNG.

## Designrichtung ThreesixtyAI

Die Wortmarke `ThreesixtyAI` uebernimmt den Stil des 360ai-Logos, bleibt aber als ausgeschriebene Marke lesbar:

- runde, moderne Sans-Serif-Anmutung
- weicher horizontaler Verlauf aus der 360ai-Farbwelt
- optional dezenter Akzent auf `AI`
- keine kuenstlich erzwungene Symbolik, wenn sie die Lesbarkeit verschlechtert
- transparente Hintergrundflaeche

## Qualitaetsregeln

- SVG-Dateien muessen echte Vektordaten enthalten und duerfen kein `data:image`, `base64` oder `<image>` als Hauptlogo nutzen.
- Die Preview-Dateien muessen schnell visuell pruefbar sein.
- `preview.html` zeigt Originalreferenz, 360ai-Vektor und ThreesixtyAI-Vorschlag nebeneinander.
- Die bestehenden Dateien in `Logo/` und `Rebranding/` bleiben unveraendert.

## Offene Entscheidung

Keine offene Designentscheidung. Der Nutzer hat bestaetigt, dass der 360ai-Nachbau so nah wie moeglich am aktuellen Logo bleiben soll.
