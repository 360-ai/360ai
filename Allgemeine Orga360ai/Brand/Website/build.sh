#!/usr/bin/env bash
# Baut das Deploy-Ergebnis nach ../../../Produkte/360ai-website/ (das Verzeichnis, das
# Cloudflare Pages fuer 360-ai.org veroeffentlicht). Editiert wird immer HIER in Website/,
# dann build.sh laufen lassen und committen.
#
# Nur ausgelieferte Dateien landen im Ziel: gebuendeltes app.css, WebP, Logo, PDFs.
# Quell-CSS, PNG-Originale der KI-Bilder und *.md bleiben nur hier.
set -euo pipefail
cd "$(dirname "$0")"
SRC="$(pwd)"
OUT="$SRC/../../../Produkte/360ai-website"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

# 1. CSS buendeln (Reihenfolge fix, siehe BUILD-CSS.md)
cat styles.css overrides.css refinements.css offer-carousel.css contact-conversion.css \
    statement-fan.css about-craft.css hero-planet.css hero-earth.css legal.css seo-local.css polish.css \
  > app.css
printf '\n/* build: 12 Quelldateien, siehe BUILD-CSS.md */\n' >> app.css

# 2. Ziel leeren (ausser .git-Metadaten gibt es dort keine)
rm -rf "$OUT"/*
mkdir -p "$OUT/assets"

# 3. Seiten + Root-Dateien
cp index.html impressum.html datenschutz.html 404.html app.css script.js \
   robots.txt sitemap.xml llms.txt _headers _redirects site.webmanifest \
   favicon.ico favicon.svg favicon-16.png favicon-32.png apple-touch-icon.png \
   "$OUT/"

# 4. Assets: nur ausgelieferte Formate
cp -r assets/brand assets/og "$OUT/assets/"
for sub in offers hero region certificates references; do
  mkdir -p "$OUT/assets/$sub"
  find "assets/$sub" -type f \( -name '*.webp' -o -name '*.svg' -o -name '*.pdf' \) \
    -exec cp {} "$OUT/assets/$sub/" \;
done

echo "Deploy-Ordner: $OUT"
du -sh "$OUT"
find "$OUT" -type f | wc -l
