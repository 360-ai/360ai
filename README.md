# 360ai Website

Statische Onepager-Website fuer **360ai**: KI-Beratung, KI-Readiness Checks, Prozess- und Engpassanalyse sowie moderne Onepager-Websites fuer KMU aus Frankenberg (Eder), Waldeck-Frankenberg und darueber hinaus.

Der aktuelle Stand basiert auf dem neuen Branding mit `LogoOhneHintergrund.png`. Die visuelle Linie ist in [`360ai_Design_Spezifikationen.md`](360ai_Design_Spezifikationen.md) dokumentiert und dient als Referenz fuer kuenftige Layout-, Farb- und Logo-Entscheidungen.

## Aktueller Aufbau

| Datei | Zweck |
| --- | --- |
| `index.html` | Startseite mit Beratungs-Hero, Problemsektion, Leistungen, Ablauf, Ueber-mich-Bereich, CTA und Kontakt |
| `LogoOhneHintergrund.png` | Aktuelles 360ai Logo und zentrale Bildmarke |
| `360ai_Design_Spezifikationen.md` | Branding- und Logo-Spezifikation |
| `impressum.html` | Impressum |
| `datenschutz.html` | Datenschutzerklaerung |
| `agb.html` | Allgemeine Geschaeftsbedingungen |
| `404.html` | Fehlerseite mit `noindex` |
| `robots.txt` | Crawler-Freigabe und Sitemap-Verweis |
| `sitemap.xml` | Sitemap fuer Suchmaschinen |

## SEO / GEO

Die Startseite enthaelt:

- Title, Meta Description, Canonical und Robots-Meta.
- Open-Graph- und Twitter-Bilddaten fuer Social Previews.
- JSON-LD als `ProfessionalService` mit Leistungsangeboten und lokalem Bezug.
- Sichtbare lokale Signale fuer Frankenberg (Eder), Waldeck-Frankenberg, Nordhessen und Deutschland.
- Neue Hauptpositionierung: KI-Beratung vor Investitions- und Implementierungsentscheidungen.

Referenzen sind aktuell bewusst entfernt, bis echte Kundenlogos oder freigegebene Case Studies vorliegen.

## Branding

Aktive Logo-Datei:

```text
LogoOhneHintergrund.png
```

Alte SVG-Logo-Varianten sollen nicht mehr verwendet werden. Neue Designarbeiten sollen auf der dokumentierten Farbpalette und dem minimalistischen 360ai-Logo-Konzept aufbauen.

## Hosting

Die Seite benoetigt keinen Build-Schritt.

### Cloudflare Pages

- Framework preset: `None`
- Build command: leer lassen
- Build output directory: `.`
- Custom Domain: `360-ai.org`

### GitHub Pages

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

## Deployment-Hinweise

- Vor Livegang pruefen, ob alle Rechtstexte inhaltlich aktuell sind.
- Es werden keine externen Google Fonts geladen; die Seite nutzt eine lokale Systemschrift-Auswahl.
- Nach Aenderungen an Seitenstruktur oder URLs `sitemap.xml` aktualisieren.

## Kontakt

Kontakt erfolgt aktuell per E-Mail-Link:

```text
info@360-ai.org
```

Ein Kontaktformular kann spaeter wieder ergaenzt werden, wenn ein passendes Backend oder ein datenschutzkonformer Formularanbieter festgelegt ist.
