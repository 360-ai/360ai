# 360ai-Website Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bestehende `index.html` der 360ai-Website überarbeiten (Ansatz B): Logo-Bug fixen, Webdesign zu gleichwertigem Hauptcase aufwerten, Hero mit 360°-Motiv, og:image erzeugen, Texte auffrischen — ohne Neubau.

**Architecture:** Eine statische `index.html` (CSS+JS inline) im Ordner `Produkte/360ai-website/`, Deployment via Cloudflare Pages. Alle Änderungen in dieser Datei plus neue Asset-Dateien. CI (Lavender/Mint, Outfit) und Grundstruktur bleiben. „Verifikation" = grep-Checks + Browser-Render statt Unit-Tests.

**Tech Stack:** Reines HTML/CSS/JS, SVG-Logo, claude-in-chrome für Render-Checks. Git-Root: `Documents/360ai`.

**Spec:** `Produkte/360ai-website/docs/superpowers/specs/2026-07-13-360ai-website-refresh-design.md`

**Arbeitsverzeichnis:** `C:\Users\Ai Automations\Documents\360ai\Produkte\360ai-website`

---

### Task 1: Logo-Referenzen fixen + Favicon

**Files:**
- Copy: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1.svg` → `Produkte/360ai-website/360ai-logo-1zu1.svg`
- Modify: `Produkte/360ai-website/index.html` (Nav-Logo, Footer-Logo, Favicon-Link, JSON-LD `logo`/`image`)

- [ ] **Step 1: Favicon-SVG kopieren**

```bash
cp "/c/Users/Ai Automations/Documents/360ai/Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1.svg" "/c/Users/Ai Automations/Documents/360ai/Produkte/360ai-website/360ai-logo-1zu1.svg"
```

- [ ] **Step 2: Referenz-Bestand prüfen (Baseline)**

Run: `grep -n "LogoOhneHintergrund" index.html`
Expected: mehrere Treffer (Nav `src`, Footer `src`, `<link rel=icon>`, `og:image`, `twitter:image`, JSON-LD `logo`/`image`).

- [ ] **Step 3: Alle Logo-Bild-Referenzen ersetzen**

- Nav-Logo `<img src="LogoOhneHintergrund.png">` → `src="360ai_logo.svg"`
- Footer-Logo `<img src="LogoOhneHintergrund.png">` → `src="360ai_logo.svg"`
- Favicon `<link rel="icon" href="/LogoOhneHintergrund.png" type="image/png">` → `href="/360ai-logo-1zu1.svg" type="image/svg+xml"`
- JSON-LD `"logo"` und `"image"`: `https://360-ai.org/LogoOhneHintergrund.png` → `https://360-ai.org/og-image.png` (og:image aus Task 2; für JSON-LD ist ein Raster-Bild sinnvoller als SVG)

(og:image/twitter:image kommen in Task 2 dran — hier nur die reinen Logo-Vorkommen.)

- [ ] **Step 4: Verifizieren, dass Nav/Footer/Favicon sauber sind**

Run: `grep -n "360ai_logo.svg\|360ai-logo-1zu1.svg" index.html`
Expected: Nav-`src`, Footer-`src`, Favicon-`href` gesetzt.

- [ ] **Step 5: Commit**

```bash
git add "Produkte/360ai-website/360ai-logo-1zu1.svg" "Produkte/360ai-website/index.html"
git commit -m "fix(website): Logo-Referenzen auf vorhandenes SVG, Favicon 1:1"
```

---

### Task 2: og:image (1200×630) erzeugen + einbinden

**Files:**
- Create: `Produkte/360ai-website/og-image.html` (Render-Vorlage, temporär)
- Create: `Produkte/360ai-website/og-image.png` (finales Bild)
- Modify: `index.html` (`og:image`, `twitter:image`)

- [ ] **Step 1: Render-Vorlage bauen**

`og-image.html`: 1200×630 Fläche, dunkler CI-Verlauf (`#171A30 → #232842 → #1B3B42`), zentriert das Logo `360ai_logo.svg` (Breite ~620px) + Claim „KI-Beratung & Webdesign, bevor Sie investieren." in Outfit, Mint-Akzent. Subtiles 360°-Kreis-Motiv als Deko.

- [ ] **Step 2: Auf 1200×630 rendern und als PNG exportieren**

Mit claude-in-chrome: `og-image.html` öffnen, Fenster/Viewport auf 1200×630, Screenshot der Fläche → speichern als `og-image.png`.
Expected: `og-image.png` existiert, 1200×630, Logo + Claim lesbar.

- [ ] **Step 3: Meta-Tags referenzieren**

In `index.html`: `og:image` und `twitter:image` → `https://360-ai.org/og-image.png`. `og:image:width`/`height` (1200/630) ergänzen falls nicht vorhanden.

- [ ] **Step 4: Render-Vorlage entfernen**

```bash
rm "/c/Users/Ai Automations/Documents/360ai/Produkte/360ai-website/og-image.html"
```

- [ ] **Step 5: Keine toten Logo-Referenzen mehr**

Run: `grep -n "LogoOhneHintergrund" index.html`
Expected: **keine Treffer**.

- [ ] **Step 6: Commit**

```bash
git add "Produkte/360ai-website/og-image.png" "Produkte/360ai-website/index.html"
git commit -m "feat(website): og:image 1200x630 aus CI+Logo, tote PNG-Referenzen entfernt"
```

---

### Task 3: Leistungen — zwei gleichwertige Haupt-Cards

**Files:**
- Modify: `index.html` (`.services-grid` und Inhalt, ~Zeilen 426–465)

- [ ] **Step 1: `.services-grid` auf zwei gleiche Spalten**

CSS `.services-grid { grid-template-columns: 1.18fr 0.82fr; }` → `1fr 1fr`. `.mini-stack`-Sonderbehandlung entfernen bzw. auf normale Card umstellen.

- [ ] **Step 2: Zweite Haupt-Card „Webdesign / Onepager"**

Aus der bisherigen Zweit-Kachel eine vollwertige `service-card` (wie die Beratungs-Card) mit `service-kicker` „Hauptangebot", `<h3>Webdesign & Onepager</h3>` und eigener `check-grid`:
- Modern, schnell, mobiloptimiert
- SEO-Grundausstattung (Meta, JSON-LD, Sitemap)
- DSGVO-konforme Rechtstexte
- Klare Struktur statt Baukasten-Look
- Hosting & Pflege optional
- Übergabe oder laufende Betreuung

- [ ] **Step 3: „KI-Roadmap & Lastenheft" als Ergebnis-Baustein**

Aus der Services-Spalte raus, unter die zwei Cards als schmaler Ergebnis-Hinweis (eine Zeile/kleine Card), damit die zwei Hauptangebote gleichwertig bleiben.

- [ ] **Step 4: Hero-Subline + Ticker anpassen**

Hero-Sub: Webdesign gleichwertig erwähnen. Ticker-Begriffe: „Onepager Websites bleiben" → gleichwertiger Wortlaut (z.B. „Webdesign & Onepager").

- [ ] **Step 5: Render-Check**

claude-in-chrome: `index.html` öffnen, Services-Sektion prüfen — zwei gleich große Cards nebeneinander, Mobile (< 720px) untereinander.
Expected: kein Layout-Bruch, beide Cards gleichwertig.

- [ ] **Step 6: Commit**

```bash
git add "Produkte/360ai-website/index.html"
git commit -m "feat(website): Webdesign als gleichwertige zweite Haupt-Card"
```

---

### Task 4: Beratungstool-Reife in Texten spiegeln

**Files:**
- Modify: `index.html` (Deliverables-Sektion ~471–478, Leistungen-Checkliste)

- [ ] **Step 1: Deliverables benennen die konkreten Tool-Bausteine**

In den 6 Deliverable-Cards die gereiften Bausteine namentlich verankern: Readiness-Score, Engpass-Landkarte, ROI-Einschätzung, Prozess-Inventar. Nur Textfeinschliff, gleiche Card-Anzahl/-Struktur.

- [ ] **Step 2: Beratungs-Card-Checkliste schärfen**

Einen Punkt so formulieren, dass klar wird: strukturiertes Tool, nicht Bauchgefühl (z.B. „Digitaler Readiness-Score + Engpass-Landkarte aus strukturiertem Assessment-Tool").

- [ ] **Step 3: Render-Check + Rechtschreibung**

claude-in-chrome: Sektionen lesen, keine Platzhalter/Tippfehler.

- [ ] **Step 4: Commit**

```bash
git add "Produkte/360ai-website/index.html"
git commit -m "content(website): Assessment-Tool-Reife in Deliverables/Leistungen"
```

---

### Task 5: Hero — subtiles 360°-Kreismotiv

**Files:**
- Modify: `index.html` (CSS `.hero::after` ~174–181, ggf. neue `.hero-orbit`-Ebene + `@keyframes`)

- [ ] **Step 1: Punkt-Grid ersetzen**

`.hero::after` (das doppelte `linear-gradient`-Grid) durch ein 360°-Motiv ersetzen: konzentrische Ringe / rotierender Kreisbogen via `radial-gradient` + `conic-gradient` oder inline-SVG-Ebene. Sehr dezent (Opacity ~0.06–0.12), CI-Farben, hinter dem Text.

- [ ] **Step 2: Bewegung + Reduced-Motion**

Langsame Rotation (`@keyframes spin360 { to { transform: rotate(360deg); } }`, ~40s). `@media (prefers-reduced-motion: reduce)` → Animation aus.

- [ ] **Step 3: Render-Check (Desktop + Mobile)**

claude-in-chrome: Hero prüfen — Motiv sichtbar aber dezent, Text bleibt gut lesbar, kein Overflow, Mobile ok.
Expected: eigenständiger Hero, keine Lesbarkeitsprobleme.

- [ ] **Step 4: Commit**

```bash
git add "Produkte/360ai-website/index.html"
git commit -m "feat(website): Hero mit subtilem 360-Grad-Kreismotiv"
```

---

### Task 6: Textauffrischung + mailto-Feinschliff

**Files:**
- Modify: `index.html` (Hero, Problem, Unabhängigkeit, CTA, Kontakt)

- [ ] **Step 1: Texte kürzen/schärfen**

Durchgang: überlange Absätze straffen, konkretere Verben, keine Buzzwords. Positionierung unverändert.

- [ ] **Step 2: Kontakt-Sektion aufwerten (mailto bleibt)**

`mailto:`-Buttons/Optionen hübscher (Icons/Hover), evtl. Betreff/Body des `mailto` vorbelegen. Kein Formular-Backend.

- [ ] **Step 3: Meta-Description/Title gegenprüfen**

Title/Description spiegeln „KI-Beratung + Webdesign" gleichwertig.

- [ ] **Step 4: Render-Check**

claude-in-chrome: Gesamtseite durchscrollen (Desktop + Mobile), Konsole ohne Fehler.

- [ ] **Step 5: Commit**

```bash
git add "Produkte/360ai-website/index.html"
git commit -m "content(website): Texte aufgefrischt, mailto-Kontakt aufgewertet"
```

---

### Task 7: Abnahme + Checklisten

**Files:** keine (Verifikation)

- [ ] **Step 1: Tote Referenzen ausgeschlossen**

Run: `grep -rn "LogoOhneHintergrund" .`
Expected: keine Treffer.

- [ ] **Step 2: Render-Gesamtcheck**

claude-in-chrome: `index.html` Desktop + Mobile (375px) durchscrollen. Logo in Nav+Footer sichtbar, Favicon im Tab, Hero-Motiv da, zwei Service-Cards, keine Konsolen-Fehler.

- [ ] **Step 3: Rechts-/SEO-Checklisten gegenprüfen**

Checklisten anwenden: `checklist_template_altfehler` (OS-Link, AggregateRating, GA4-Consent, Storyblok-Abschnitt) und `checklist_seo_website_launch` (Canonical, robots.txt, JSON-LD, GA4 nur nach Consent). Abweichungen an Denis melden, nicht blind fixen.

- [ ] **Step 4: Zusammenfassung an Denis**

Kurzbericht: was geändert, Screenshots, offene Punkte (Deploy, Search Console, echtes Formular später). Deploy erst nach Freigabe.
