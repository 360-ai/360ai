# 360ai – Firmen-Website

One-Pager für **360ai** (KI-gestützte Automatisierung & Webpräsenzen für KMU).  
Enthält Startseite, Impressum, Datenschutzerklärung, AGB und ist für Hosting bei **GitHub Pages** bzw. **Cloudflare Pages** vorbereitet.

---

## Vor dem Deployment

1. **Impressum anpassen**  
   In `impressum.html` die Platzhalter ersetzen:
   - Firmenname / Name Inhaber
   - Straße, PLZ, Ort
   - USt-IdNr. (falls vorhanden)

2. **Logo**  
   Die Datei `360ai_logo.svg` muss im gleichen Ordner wie `index.html` liegen. Ohne diese Datei erscheint das Logo nicht.

3. **Optional: Google Fonts**  
   Für strenge DSGVO-Optimierung können Google Fonts durch lokale Schriften ersetzt werden (Hinweis dazu steht in `index.html`).

---

## Hosting bei GitHub Pages

1. Repository auf GitHub anlegen (z. B. `360ai-website`).
2. Alle Dateien aus diesem Ordner ins Repository pushen:
   - `index.html`, `impressum.html`, `datenschutz.html`, `agb.html`, `404.html`
   - `360ai_logo.svg`
   - optional: `README.md`, `.gitignore`
3. **Settings → Pages**:  
   - Source: **Deploy from a branch**  
   - Branch: `main` (oder `master`)  
   - Folder: **/ (root)**  
   - Save.
4. Nach wenigen Minuten ist die Seite unter  
   `https://<username>.github.io/<repo-name>/` erreichbar.  
   Custom Domain kann unter Pages-Einstellungen hinterlegt werden.

---

## Hosting bei Cloudflare Pages

1. Bei [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. GitHub-Repository auswählen (oder zuerst Repo wie oben anlegen und pushen).
3. Build-Einstellungen:
   - **Framework preset:** None
   - **Build command:** leer lassen
   - **Build output directory:** `.` (oder der Ordner, in dem `index.html` liegt – bei Monorepo ggf. z. B. `website2`)
4. **Save and Deploy**.  
   Die Seite erhält eine URL wie `https://<projekt>.pages.dev`.  
   Unter **Custom domains** kann z. B. `360-ai.org` verbunden werden.

**Hinweis:** Die `404.html` wird von Cloudflare Pages automatisch bei unbekannten Pfaden ausgeliefert.

---

## Dateien im Überblick

| Datei              | Beschreibung                    |
|--------------------|----------------------------------|
| `index.html`       | Startseite (Hero, Leistungen, Kontakt) |
| `impressum.html`   | Impressum (§ 5 TMG)             |
| `datenschutz.html` | Datenschutzerklärung (DSGVO)    |
| `agb.html`         | Allgemeine Geschäftsbedingungen |
| `404.html`         | Fehlerseite (Cloudflare/GitHub)  |
| `360ai_logo.svg`   | Logo (muss von dir bereitgestellt werden) |

---

## Kontakt

Der Kontakt erfolgt per E-Mail: Ein Klick auf „E-Mail schreiben“ öffnet das Standard-E-Mail-Programm des Besuchers (mailto:). Bei Bedarf kann später wieder ein Kontaktformular mit Backend (z. B. Formspree, n8n-Webhook) ergänzt werden.

---

© 2026 360ai
