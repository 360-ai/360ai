# 360ai-Website Refresh — Design (Ansatz B)

**Datum:** 2026-07-13
**Scope:** Überarbeitung der bestehenden `index.html`, kein Neubau. CI und Grundstruktur bleiben.
**Datei(en):** `Produkte/360ai-website/` (statisches HTML, Deployment Cloudflare Pages)

## Ausgangslage

- Eine in sich geschlossene `index.html` (CSS+JS inline), plus `impressum/datenschutz/agb/404.html`, `robots.txt`, `sitemap.xml`.
- CI-konform: Lavender `#7B8CB6` / Mint `#84C1BC`, Font Outfit, dunkler Hero.
- Positionierung: unabhängige KI-Beratung (Hauptangebot) + Onepager-Websites (aktuell nur „weiterhin verfügbar").
- Kontakt nur per `mailto:`, kein Formular.

## Problembefund

1. **Logo-Bug:** `index.html` referenziert `LogoOhneHintergrund.png` (Nav, Footer, Favicon, og:image, JSON-LD) — Datei existiert nicht. Vorhanden ist `360ai_logo.svg` (= saubere Brand-Version `360ai-logo-clean.svg`, helles Verlaufs-Wortmark ~3:1, funktioniert auf dunklem Nav/Footer).
2. **Webdesign untergewichtet:** Soll gleichwertiger Hauptcase neben KI-Beratung sein, steht aber nur als kleine Zweit-Kachel.
3. **Optik wirkt austauschbar:** generisches Punkt-Grid im Hero.
4. **og:image tot:** kein Social-Vorschaubild.

## Entscheidungen (mit Denis abgestimmt)

- Umfang: **Ansatz B** (Bugfix + gezielter Feinschliff), nicht Minimal, nicht Umbau.
- Positionierung: bleibt, aber **KI-Beratung + Webdesign gleichwertig**.
- Inhalt: **nur Texte auffrischen**, keine strukturelle Umstellung; Beratungstool-Reife einfließen lassen.
- Kontakt: **mailto bleibt**, nur optisch aufgewertet. Kein Formular-Backend jetzt.
- Hero-Optik: **subtiles 360°-Kreismotiv** statt Punkt-Grid.
- og:image: **selbst erzeugtes 1200×630-PNG** aus CI + Logo.

## Umsetzung

### 1. Logo & Assets
- Alle `LogoOhneHintergrund.png`-Referenzen → `360ai_logo.svg` (Nav, Footer, JSON-LD `logo`/`image`).
- Favicon: `360ai-logo-1zu1.svg` aus `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/` in den Website-Ordner kopieren, als Favicon setzen.
- `og:image` / `twitter:image`: neues 1200×630-PNG erzeugen (dunkler CI-Hintergrund, Logo, kurzer Claim), in Website-Ordner ablegen, referenzieren.

### 2. Leistungen: zwei gleichwertige Haupt-Cards
- `.services-grid` umbauen: statt „primary + mini-stack" zwei gleichwertige Cards nebeneinander:
  - **KI-Beratung & Assessment** (bestehende Check-Liste)
  - **Webdesign / Onepager** (eigene Check-Liste: modern, schnell, mobiloptimiert, SEO-Grundausstattung, Rechtstexte, Pflege)
- „KI-Roadmap & Lastenheft" als Ergebnis-Baustein darunter (nicht mehr in der Zweitspalte).
- Hero-Subline + Ticker so anpassen, dass Webdesign gleichwertig mitschwingt.

### 3. Beratungstool-Reife einfließen
- In Deliverables/Leistungen die konkreten Tool-Bausteine benennen (Readiness-Score, Engpass-Landkarte, ROI-Einschätzung, Prozess-Inventar) als Beleg für ein echtes strukturiertes Assessment. Nur Textfeinschliff, keine neue Sektion.

### 4. Optik-Akzente (leicht, CI-treu)
- Hero: `.hero::after`-Punkt-Grid durch ein subtiles, dezent rotierendes 360°-Kreis-/Ring-Motiv ersetzen (Bezug zum „360"-Namen). Bewegung minimal, `prefers-reduced-motion` respektieren.
- Feinschliff Typo-Spacing + Card-Hover. Sonst nichts angefasst.

### 5. Texte
- Durchgehend auffrischen (kürzer, konkreter). Kontakt-Sektion: `mailto`-Buttons/Optionen hübscher, inhaltlich unverändert.

## Nicht enthalten (YAGNI)
- Echtes Formular-Backend (n8n/Formspree/Cloudflare).
- Astro-/Multi-Page-Umbau.
- Neue Unterseiten.
- Rechtsseiten-Änderungen (Impressum/Datenschutz/AGB bleiben, wurden zuletzt aktualisiert).

## Abnahme-Kriterien
- Logo sichtbar in Nav + Footer, Favicon im Browser-Tab, og:image beim Teilen.
- Keine toten Asset-Referenzen mehr (grep auf `LogoOhneHintergrund` = leer).
- Zwei gleichwertige Service-Cards.
- Hero zeigt 360°-Motiv, funktioniert auf Mobile, keine Layout-Brüche.
- CI-Farben/Font unverändert.
- Rechtlich: vor Deploy Checklisten `checklist_template_altfehler` + `checklist_seo_website_launch` gegenprüfen (GA4 nur nach Consent, OS-Link, AggregateRating etc.).
