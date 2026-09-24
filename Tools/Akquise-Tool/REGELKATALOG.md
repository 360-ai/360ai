# Regelkatalog — 360ai Akquise-Tool

**Version:** 1.0.0 · **Stand:** 15.08.2026

Dieser Katalog ist verbindlich. Der Collector misst, die Rule Engine wertet nach diesen Regeln
aus, und Claude darf ausschließlich über Regelergebnisse sprechen — nie über Rohfakten.

Jede Änderung an einer Regel erhöht die `regelwerk_version`. Sie wird in jedem Audit
mitgeschrieben, damit alte Ergebnisse später einordbar bleiben.

---

## 1. Aufbau einer Regel

```json
{
  "id": "LOC-01",
  "name": "TEL_LINKS_PRESENT",
  "gruppe": "local",
  "achse": "local",
  "gewicht": 3,
  "messung": "Alle geprüften Seiten, DOM-Query a[href^='tel:'], gerenderte Sicht",
  "ergebnis": "FAIL",
  "wert": { "count": 0, "pages_checked": 7 },
  "belege": ["/", "/leistungen", "/kontakt"],
  "kundentext_erlaubt": true,
  "compliance_signal": null,
  "beispielformulierung": "Auf keiner der sieben geprüften Seiten lässt sich die Telefonnummer direkt anwählen."
}
```

**Feldbedeutung**

- `ergebnis` — `PASS` · `WARN` · `FAIL` · `NA` (nicht anwendbar) · `UNKNOWN` (Messung fehlgeschlagen)
- `gewicht` — 1 bis 3, relative Bedeutung innerhalb der Achse
- `kundentext_erlaubt` — nur wenn `true`, darf die Feststellung in Mail oder Kunden-Kurzauswertung
  auftauchen. Das ist eine Datenstruktur-Eigenschaft, keine Prompt-Bitte: Der Validator setzt
  `mail_tauglich` bei `false` zwangsweise auf `false`.
- `compliance_signal` — nur bei CMP-Regeln, siehe Abschnitt 8

**Verboten in jeder Regel:** ein Feld `abmahnrelevant` oder eine sonstige rechtliche
Schlussfolgerung. Der Collector stellt fest, dass eine Zeichenfolge vorkommt oder ein Request
ausgelöst wird. Ob daraus im Einzelfall ein Rechtsverstoß folgt, entscheidet das System nicht.

---

## 2. Score-Mechanik

Je Achse:

```
faktor(PASS) = 1.0   faktor(WARN) = 0.5   faktor(FAIL) = 0.0
NA und UNKNOWN fallen aus Zähler UND Nenner heraus

achsen_score = Σ(gewicht × faktor) / Σ(gewicht) × 100
```

Der Website-Score ist die gewichtete Summe der Achsen, gerundet auf 5er-Schritte:

| Achse | Gewicht | Regelgruppen | Quelle |
|---|---:|---|---|
| SEO | 20 | SEO | deterministisch |
| Technik | 15 | TEC + MOB | deterministisch |
| Content / AI-Readiness | 15 | AIR | deterministisch |
| Design / Modernität | 15 | — | Vision |
| Conversion / Nutzerführung | 15 | — | Vision |
| Local SEO | 10 | LOC | deterministisch |
| Vertrauen | 10 | TRU (5 Punkte) + Vision (5 Punkte) | gemischt |

**Mobil und Barrierefreiheit (MOB) laufen in der Technik-Achse.** Sie sind messbar und technisch;
in „Conversion" gehörten sie nur, wenn dort auch bewertet würde, und Conversion ist die reine
Vision-Achse.

**`UNKNOWN` ist kein stiller Ausfall.** Wenn mehr als 15 % der Regeln einer Achse `UNKNOWN`
liefern, wird die Achse im Bericht als „nicht ausreichend prüfbar" markiert statt geschätzt.

**Branchengewichtung.** `LOC-01`, `LOC-02` und `MOB-06` werden mit dem Faktor aus
`branchen.json → telefon_affin` multipliziert (1.5 hoch, 1.0 normal, 0.5 niedrig). Bei einem
Handwerksbetrieb wiegt eine nicht anwählbare Nummer schwerer als bei einem B2B-Maschinenbauer.

---

## 3. TEC — Technik

`G` = Gewicht · `KT` = kundentext_erlaubt

| ID | Name | Messung | WARN | FAIL | G | KT |
|---|---|---|---|---|---:|---|
| TEC-01 | HTTPS_ACTIVE | HTTPS-Aufruf der Startseite, Zertifikatskette | Mixed Content vorhanden | kein HTTPS oder Zertifikatsfehler | 3 | ja |
| TEC-02 | HTTP_TO_HTTPS_REDIRECT | `http://` → Statuskette | 302 statt 301 | keine Weiterleitung | 2 | ja |
| TEC-03 | CANONICAL_HOST | `www.` und Apex vergleichen | Redirect vorhanden, aber Kette > 1 Sprung | beide liefern 200 mit gleichem Inhalt | 2 | ja |
| TEC-04 | HTTP_VERSION | ALPN der Verbindung | HTTP/1.1 | — | 1 | ja |
| TEC-05 | TTFB | Startseite, 3 Messungen, Median | 500–1000 ms | > 1000 ms | 2 | ja |
| TEC-06 | BROKEN_INTERNAL_LINKS | alle internen Links, HEAD, bei 405 GET | 1–2 defekt | ≥ 3 defekt | 3 | ja |
| TEC-07 | RESOURCE_ERRORS_ON_LOAD | 5xx auf Unterressourcen beim normalen Seitenaufbau | 1 Ressource | ≥ 2 Ressourcen | 3 | ja |
| TEC-08 | IMG_MODERN_FORMAT | Anteil WebP/AVIF an allen Inhaltsbildern | 30–69 % | < 30 % | 2 | ja |
| TEC-09 | IMG_OVERSIZED | Bilder > 300 KB | 1–3 Bilder | ≥ 4 Bilder | 2 | ja |
| TEC-10 | IMG_PHOTO_AS_PNG | Foto (nicht Logo/Icon) als PNG > 200 KB | 1 Datei | ≥ 2 Dateien | 1 | ja |
| TEC-11 | HTML_SIZE | HTML-Dokument der Startseite | 150–250 KB | > 250 KB | 1 | nein |
| TEC-12 | PSI_PERFORMANCE_MOBILE | PageSpeed Insights, mobil | 50–69 | < 50 | 3 | ja |
| TEC-13 | LCP_MOBILE | PSI Feld- oder Labordaten | 2,5–4,0 s | > 4,0 s | 2 | ja |
| TEC-14 | CLS | PSI | 0,1–0,25 | > 0,25 | 1 | ja |
| TEC-15 | CMS_VERSION_CURRENT | `generator`-Meta, Asset-Pfade, Versionsstrings | 12–24 Monate alt | > 24 Monate alt | 1 | **nein** |

**Messdetails**

- **TEC-05** — Median aus drei Läufen, nicht ein Einzelwert. Der gemessene Wert wird als Spanne
  (min–max) mitgeschrieben.
- **TEC-07** — Das ist der Helfri-Fall: Einzeln abgerufen liefern die Dateien 200, bei
  gleichzeitigen Anfragen 503. Deshalb muss die Messung im **normalen Seitenaufbau** erfolgen
  (Playwright-Netzwerkmitschnitt), nicht in einer sequentiellen Nachprüfung.
- **TEC-09/10** — „Inhaltsbild" heißt: `<img>` oder CSS-Hintergrund mit Fläche > 5000 px².
  Icons, Logos und Tracking-Pixel zählen nicht.
- **TEC-12 bis TEC-14** — Werte schwanken zwischen Läufen. Sie gehen als Spanne in den Bericht
  und sind von der Fixture-Reproduzierbarkeitsprüfung ausgenommen (siehe Abschnitt 10).
- **TEC-15** — `kundentext_erlaubt: false`. Eine veraltete CMS-Version ist intern ein starkes
  Argument, in einer Erstansprache aber ein Sicherheitshinweis an einen Fremden. Gehört ins
  Gespräch, nicht in die Mail.

---

## 4. MOB — Mobil und Barrierefreiheit (Teil der Technik-Achse)

| ID | Name | Messung | WARN | FAIL | G | KT |
|---|---|---|---|---|---:|---|
| MOB-01 | VIEWPORT_META | `<meta name=viewport>` | vorhanden, aber ohne `width=device-width` | fehlt | 3 | ja |
| MOB-02 | ZOOM_NOT_BLOCKED | `user-scalable`, `maximum-scale` | `maximum-scale` zwischen 1 und 2 | `user-scalable=0/no` oder `maximum-scale=1` | 3 | ja |
| MOB-03 | NO_HORIZONTAL_OVERFLOW | Viewport 375 px, `scrollWidth > clientWidth + 2` | 1 Seite betroffen | ≥ 2 Seiten betroffen | 3 | ja |
| MOB-04 | BASE_FONT_SIZE | berechnete Schriftgröße des längsten Textblocks, mobil | 14–15 px | < 14 px | 1 | ja |
| MOB-05 | TAP_TARGET_SIZE | interaktive Elemente, Bounding Box < 44×44 px | 10–25 % betroffen | > 25 % betroffen | 1 | nein |
| MOB-06 | CTA_IN_FIRST_VIEWPORT | sichtbares `a`/`button` mit Bounding Box vollständig innerhalb der ersten 800 px, mobil | nur ein Navigationslink | kein Element | 2 | ja |
| MOB-07 | CONTRAST_MAIN_TEXT | Kontrastverhältnis Fließtext zu Hintergrund | 3,0–4,5 | < 3,0 | 2 | ja |

**Messdetails**

- **MOB-06** misst Geometrie, nicht Qualität. Die Regel stellt fest, dass ein anklickbares Element
  im ersten Bildschirm liegt — ob es ein *guter* Handlungsaufruf ist, entscheidet erst die
  Vision-Bewertung. Ein reiner „Unsere Leistungen"-Link ergibt WARN, weil kein Kontaktweg
  angeboten wird.
- **MOB-02** ist der Helfri-Fall. Formulierung im Kundentext immer mit der Folge, nie mit dem
  Attribut: „Auf dem Smartphone lässt sich die Schrift nicht vergrößern."

---

## 5. SEO

| ID | Name | Messung | WARN | FAIL | G | KT |
|---|---|---|---|---|---:|---|
| SEO-01 | TITLE_PRESENT | `<title>` je Seite | vorhanden, aber < 30 oder > 65 Zeichen | fehlt oder leer | 3 | ja |
| SEO-02 | TITLE_UNIQUE | Titles über alle Seiten | 2 Dubletten | ≥ 3 Dubletten | 2 | ja |
| SEO-03 | META_DESCRIPTION_PRESENT | `meta[name=description]` | < 70 oder > 160 Zeichen | fehlt auf ≥ 50 % der Seiten | 3 | ja |
| SEO-04 | H1_PRESENT | genau eine `h1` je Seite | mehr als eine | keine | 3 | ja |
| SEO-05 | HEADING_HIERARCHY | Ebenensprünge (H1→H3) | 1–2 Sprünge | ≥ 3 Sprünge | 1 | nein |
| SEO-06 | CANONICAL_PRESENT | selbstreferenzierender Canonical | fehlt auf einzelnen Seiten | fehlt durchgehend | 1 | nein |
| SEO-07 | INDEXABLE | `meta robots`, `X-Robots-Tag`, `robots.txt` | einzelne Seiten gesperrt | Hauptseiten auf `noindex` | 3 | ja |
| SEO-08 | SITEMAP_PRESENT | `/sitemap.xml`, `/wp-sitemap.xml`, robots.txt-Verweis | vorhanden, aber Einträge mit 404 | fehlt | 2 | ja |
| SEO-09 | ROBOTS_TXT_PRESENT | `/robots.txt` | vorhanden, aber leer | fehlt | 1 | nein |
| SEO-10 | URL_SPEAKING | Pfadmuster wie `/324-2/`, `/?p=12`, `/index.php?id=` | 1–2 Seiten | ≥ 3 Seiten | 2 | ja |
| SEO-11 | ALT_TEXT_COVERAGE | Inhaltsbilder mit nicht-leerem, nicht-generischem Alt | 50–79 % | < 50 % | 2 | ja |
| SEO-12 | OG_TAGS | `og:title`, `og:description`, `og:image` | eines fehlt | alle fehlen | 2 | ja |
| SEO-13 | CONTENT_DEPTH | Wortzahl der Leistungsseiten, Median | 150–299 Wörter | < 150 Wörter | 2 | ja |
| SEO-14 | SERVICE_PAGES_SPLIT | eigenständige Seiten je Leistung | 2 Seiten | ≤ 1 Sammelseite | 2 | ja |
| SEO-15 | INTERNAL_LINKING | Leistungsseiten von der Startseite aus verlinkt | teilweise | keine | 1 | nein |
| SEO-16 | KEYWORD_IN_TITLE_H1 | Lead-Keyword in Title oder H1 der Startseite | nur im Fließtext | gar nicht | 2 | ja |

**Messdetails**

- **SEO-11** — „generischer Alt-Text" heißt: Dateiname, `image`, `bild`, `foto`, `IMG_1234`,
  reine Zahlenfolgen. Diese zählen als fehlend.
- **SEO-16** ist `NA`, wenn im Lead kein Keyword hinterlegt wurde.
- **SEO-13/14** brauchen die Klassifikation „Leistungsseite". Der Collector erkennt sie über
  Navigationstext, URL-Muster (`leistung`, `service`, `angebot`, `produkt`) und
  Überschriftenmuster. Findet er keine, ist die Regel `NA` und wird im Bericht als Lücke benannt.

---

## 6. LOC — Local SEO

| ID | Name | Messung | WARN | FAIL | G | KT |
|---|---|---|---|---|---:|---|
| LOC-01 | TEL_LINKS_PRESENT | `a[href^='tel:']` über alle Seiten, gerenderte Sicht | nur auf der Kontaktseite | count = 0 | 3 | ja |
| LOC-02 | TEL_IN_HEADER | anwählbare Nummer in den ersten 800 px, mobil | Nummer als Text sichtbar, nicht anwählbar | nicht vorhanden | 2 | ja |
| LOC-03 | NAP_CONSISTENT | Adresse und Telefon über alle Fundstellen inkl. Impressum und Schema | eine abweichende Schreibweise | ≥ 2 Abweichungen | 3 | ja |
| LOC-04 | LOCATION_IN_TITLE_H1 | Ortsname in Title oder H1 der Startseite | nur im Title | in keinem von beiden | 3 | ja |
| LOC-05 | ADDRESS_ON_CONTACT | vollständige Anschrift auf der Kontaktseite | unvollständig | fehlt | 2 | ja |
| LOC-06 | OPENING_HOURS | Öffnungszeiten im Text oder Schema | nur im Text, nicht im Schema | fehlen | 1 | ja |
| LOC-07 | SERVICE_AREA_NAMED | Einzugsgebiet ausgeschrieben (Orte, Umkreis, Landkreis) | nur ein Ort genannt | nicht benannt | 2 | ja |
| LOC-08 | LOCALBUSINESS_SCHEMA | JSON-LD `LocalBusiness` mit `address` und `telephone` | vorhanden, aber unvollständig | fehlt | 3 | ja |

**Messdetails**

- **LOC-03** normalisiert vor dem Vergleich: Straße/Str., Leerzeichen in Telefonnummern,
  `+49` gegen `0`. Nur echte Abweichungen zählen.
- **LOC-06** ist `NA` für Branchen mit `oeffnungszeiten_relevant: false` in `branchen.json`
  (z. B. Bauunternehmen, Handwerk auf Baustelle).

---

## 7. AIR — Content und AI-Readiness

| ID | Name | Messung | WARN | FAIL | G | KT |
|---|---|---|---|---|---:|---|
| AIR-01 | ORGANIZATION_SCHEMA | JSON-LD `Organization` oder `LocalBusiness` | vorhanden, Pflichtfelder unvollständig | fehlt | 3 | ja |
| AIR-02 | SERVICE_SCHEMA | JSON-LD `Service` oder `Offer` | nur auf einer Seite | fehlt | 1 | ja |
| AIR-03 | FAQ_SECTION | Frage-Antwort-Block im sichtbaren Inhalt | nur `FAQPage`-Schema ohne sichtbaren Inhalt | fehlt | 2 | ja |
| AIR-04 | ENTITY_CLARITY | Firmenname, Tätigkeit und Ort in den ersten 200 Wörtern der Startseite | zwei von drei | ≤ eines | 3 | ja |
| AIR-05 | CONCRETE_FACTS | belegbare Zahlenangaben im Fließtext (Jahre, Kapazitäten, Normen, Stückzahlen) | 3–7 Angaben | < 3 Angaben | 2 | ja |
| AIR-06 | TEXT_NOT_IN_IMAGES | Anteil der Überschriften und Kernaussagen, die nur als Bild vorliegen | 10–25 % | > 25 % | 2 | ja |
| AIR-07 | CONSISTENT_COMPANY_NAME | Firmierung in Title, Footer, Impressum, Schema, `og:site_name` | 2 Varianten | ≥ 3 Varianten | 3 | ja |
| AIR-08 | CONTENT_FRESHNESS | Copyright-Jahr, jüngstes Beitragsdatum, `Last-Modified` | 2–3 Jahre alt | > 3 Jahre alt | 2 | ja |
| AIR-09 | CRAWLABLE_WITHOUT_JS | Textmenge roh-HTTP gegen gerenderte Sicht | roh enthält 40–70 % des Textes | roh enthält < 40 % | 3 | ja |

**Messdetails**

- **AIR-07** ist der Helfri-Fall mit vier Firmierungen. Vergleich nach Normalisierung von
  Rechtsformkürzeln (GmbH/mbH), Bindestrichen und Groß-/Kleinschreibung — nur echte Abweichungen
  zählen. Der Kundentext argumentiert mit der Folge („erschwert die eindeutige Zuordnung durch
  Google und KI-Systeme"), nicht mit einer Rechtsformkritik.
- **AIR-09** ist der Bravo-Fall (Vue/Quasar-SPA). Diese Regel begründet, warum der Collector
  zwei Sichten braucht.
- **AIR-05** zählt nur Zahlen mit Einheit oder Bezug („25 t", „seit 1978", „DIN 1610"), nicht
  Telefonnummern, Postleitzahlen oder Preise in Fließtext-Aufzählungen.

---

## 8. TRU — Vertrauenssignale (deterministische Hälfte)

Die Achse „Vertrauen" hat 10 Punkte. Diese Regeln bestimmen **5 davon**; die anderen 5 kommen
aus der Vision-Bewertung (Gesamteindruck, Wirkung der Bildsprache, Glaubwürdigkeit der
Darstellung). Die Trennung ist Absicht: Käme die Achse rein aus dem Bild, läge der Modellanteil
am Gesamtscore bei 40 % — und schwankende Ergebnisse waren der Anlass für dieses Werkzeug.

| ID | Name | Messung | WARN | FAIL | G | KT |
|---|---|---|---|---|---:|---|
| TRU-01 | NAMED_CONTACT_PERSON | Personenname mit Funktion auf Kontakt- oder Über-uns-Seite | nur im Impressum | nirgends | 3 | ja |
| TRU-02 | TEAM_PAGE | Team mit Namen und Funktionen | Team ohne Funktionen | keine Teamdarstellung | 2 | ja |
| TRU-03 | REFERENCES_NAMED | Referenzen mit Kundennamen oder Logos | Logos ohne Zuordnung | keine Referenzen | 2 | ja |
| TRU-04 | TESTIMONIALS | Kundenstimmen mit Name oder Ort | anonyme Zitate | keine | 1 | ja |
| TRU-05 | REAL_PHOTOS | Verdacht auf Bestandsfotos über Dateinamen und bekannte Bildhoster | 1–2 Verdachtsfälle | ≥ 3 Verdachtsfälle | 1 | **nein** |
| TRU-06 | ABOUT_PAGE_SUBSTANCE | Über-uns-Seite mit Geschichte, Zahlen oder Werdegang | vorhanden, < 150 Wörter | fehlt | 2 | ja |

**Messdetails**

- **TRU-05** ist ein Verdacht, keine Feststellung — deshalb `kundentext_erlaubt: false`. Erkannt
  wird über Dateinamensmuster (`shutterstock`, `istock`, `adobestock`, `pexels`, `unsplash`,
  `gettyimages`, reine Hash-Namen) und Auslieferung von bekannten Bild-CDNs. Ein Treffer beweist
  nichts; die Angabe geht ausschließlich in den internen Bericht als Hinweis für das Gespräch.
- **TRU-01** normalisiert gegen die Impressum-Extraktion: Steht der Geschäftsführer nur im
  Impressum, ist das WARN — ein Impressum ist Pflichtangabe, keine Vertrauensmaßnahme.
- **TRU-04** ist `NA`, wenn die Branche in `branchen.json` als `testimonials_unueblich: true`
  markiert ist (z. B. Arztpraxen, wo Patientenstimmen berufsrechtlich heikel sind).

---

## 9. CMP — Compliance-Signale (kein Score)

CMP-Regeln fließen **nicht** in den Website-Score. Sie erzeugen eine eigene Ampel:

| Ampel | Bedingung |
|---|---|
| **Grün** | keine CMP-Regel auf FAIL |
| **Prüfen** | mindestens eine CMP-Regel auf WARN oder FAIL, aber keine der als kritisch markierten |
| **Kritischer Hinweis** | CMP-05, CMP-06 oder CMP-10 auf FAIL |

Jede CMP-Regel trägt `review_required: true`. Ihre Formulierung ist immer eine Beobachtung,
niemals eine rechtliche Bewertung.

| ID | Name | Messung | FAIL wenn | Signal | KT |
|---|---|---|---|---|---|
| CMP-01 | IMPRESSUM_REACHABLE | Link zum Impressum von jeder Seite, max. 2 Klicks | nicht erreichbar | `provider_information_possible_gap` | ja |
| CMP-02 | LEGAL_REFERENCE_CURRENT | Impressumstext auf „TMG" / „Telemediengesetz" | Treffer ohne gleichzeitige DDG-Nennung | `outdated_legal_reference` | ja |
| CMP-03 | PROVIDER_INFO_FIELDS | Pflichtangaben nach § 5 DDG: Name, Anschrift, Vertretung, Kontakt, Register, USt-IdNr., Kammer und Berufsbezeichnung bei zulassungspflichtigem Handwerk | ein Feld fehlt, das für die erkannte Rechtsform/Branche einschlägig ist | `provider_information_possible_gap` | ja |
| CMP-04 | ODR_LINK_PRESENT | Link auf `ec.europa.eu/consumers/odr` | Link vorhanden | `outdated_legal_reference` | ja |
| CMP-05 | PRIVACY_POLICY_PRESENT | Datenschutzerklärung auffindbar und > 1500 Zeichen | fehlt | `privacy_policy_missing` | ja |
| CMP-06 | THIRD_PARTY_PRE_CONSENT | Fremdhosts im Clean-Lauf ohne jede Interaktion | ≥ 1 Fremdhost außerhalb der Whitelist | `third_party_request_pre_consent` | ja |
| CMP-07 | CONSENT_BANNER_BLOCKS | Fremdhosts im Reject-Lauf gegen Clean-Lauf | zusätzliche Hosts nach Ablehnung | `consent_not_respected` | ja |
| CMP-08 | PRIVACY_COVERS_SERVICES | jeder im Accept-Lauf geladene Fremdhost wird in der Datenschutzerklärung genannt | ≥ 1 Dienst nicht genannt | `privacy_policy_possible_mismatch` | ja |
| CMP-09 | FONTS_LOCAL | Requests an `fonts.googleapis.com` / `fonts.gstatic.com` | vorhanden | `third_party_request_pre_consent` | ja |
| CMP-10 | PLACEHOLDER_TEXT | Vorlagen-Platzhalter in Rechtstexten: `{...}`, `[...]`, „Musterstadt", „Lorem ipsum", „Max Mustermann" | ≥ 1 Treffer | `provider_information_possible_gap` | ja |
| CMP-11 | STORAGE_PRE_CONSENT | nicht-essentielle Cookies oder localStorage-Einträge im Clean-Lauf | ≥ 1 Eintrag außerhalb der Whitelist | `storage_pre_consent` | ja |

**Messdetails**

- **Whitelist** für CMP-06/09/11: eigene Domain, Subdomains der eigenen Domain, sowie technisch
  notwendige Einträge des erkannten Consent-Werkzeugs selbst (z. B. `cmplz_*` bei Complianz).
  Die Whitelist steht in `collector/whitelist-consent.json` und wird bei jeder Änderung
  versioniert.
- **CMP-03** braucht die Rechtsform und die Branche. Fehlt beides, ist die Regel `UNKNOWN`,
  nicht `FAIL`. Die Kammer-Prüfung greift nur, wenn die Branche in `branchen.json` als
  `handwerk_anlage_a: true` markiert ist.
- **CMP-04** — Die EU-Streitschlichtungsplattform wurde im Juli 2025 abgeschaltet. Der Befund
  lautet deshalb „verweist auf eine abgeschaltete Plattform", nicht „fehlerhafter Pflichtlink".

**Formulierungsregel für alle CMP-Befunde im Kundentext**

Erlaubt: „Das Impressum verweist auf das TMG. Das wurde im Mai 2024 durch das DDG ersetzt."
Verboten: „Ihr Impressum ist abmahnfähig." · „Sie verstoßen gegen die DSGVO." · jede Nennung
von Bußgeldhöhen oder Abmahnkosten.
Jeder Kundentext mit CMP-Befunden trägt den Zusatz: *technische Bestandsaufnahme, keine
Rechtsberatung.*

---

## 10. EXP — Experimentell (Gewicht 0)

Diese Regeln werden erhoben und im internen Bericht genannt. Sie bewegen **keinen** Score und
sind nie `kundentext_erlaubt`. Grund: Für ihre Wirkung gibt es derzeit keinen belastbaren
Nachweis, und 360ai verkauft nichts, was nicht belegbar wirkt.

| ID | Name | Messung |
|---|---|---|
| EXP-01 | LLMS_TXT | `/llms.txt` erreichbar und wohlgeformt |
| EXP-02 | AI_CRAWLER_POLICY | Einträge für GPTBot, ClaudeBot, PerplexityBot, Google-Extended in `robots.txt` — reine Feststellung, keine Wertung in beide Richtungen |
| EXP-03 | ANSWER_SHAPED_CONTENT | Anteil an Abschnitten, die eine konkrete Frage in ≤ 3 Sätzen beantworten |

Sollte sich die Belegbarkeit ändern, werden einzelne Regeln in die AIR-Achse überführt und
bekommen ein Gewicht. Der Katalog dokumentiert diesen Wechsel dann in der Versionshistorie.

---

## 11. Prüfbarkeit und Tests

| Regelgruppe | gegen Fixture reproduzierbar | Begründung |
|---|---|---|
| SEO, LOC, AIR, TRU, CMP, MOB-01/02/04 | **ja, bitweise identisch** | reine DOM- und Textauswertung |
| TEC-01 bis TEC-11, TEC-15 | ja | Header, Dateigrößen, Statuscodes |
| MOB-03, MOB-05, MOB-06, MOB-07 | ja, bei identischem Browser-Build | Layoutmessung, abhängig von der Chromium-Version |
| TEC-12, TEC-13, TEC-14 | **nein — als Spanne führen** | PageSpeed-Werte hängen von Netz, Gerät und Auslieferung ab |

**Pflichttests je Regel**

1. **Positivfall** — eine Fixture, in der die Regel FAIL liefert
2. **Negativfall** — eine Fixture, in der die Regel PASS liefert und **keinen** Fehlalarm auslöst
3. **NA-Fall**, wo sinnvoll — z. B. SEO-16 ohne hinterlegtes Keyword

Ohne Negativfall misst man nur die Trefferquote, nicht die Falschalarmquote. Eine Regel ohne
beide Tests gilt als nicht fertig.

**Referenz-Fixtures**

| Fixture | Quelle | erwartete FAIL-Regeln (Auszug) |
|---|---|---|
| `helfri` | helfri-bau.de, Stand 05.08.2026 | LOC-01, LOC-02, SEO-03, SEO-10, SEO-12, AIR-01, AIR-07, AIR-08, MOB-02, TEC-06, TEC-07, TEC-10, CMP-02, CMP-03 |
| `bravo` | bravo-fkb.de, Stand 22.07.2026 | CMP-05, CMP-06, CMP-10, AIR-09 |
| `sauber` | selbst gebaute Referenzseite | **keine** — reiner Negativtest |

Die Fixture `sauber` wird aus einem bestehenden 360ai-Kundenprojekt abgeleitet (Astro, lokale
Schriften, vollständige Rechtstexte, LocalBusiness-Schema). Löst dort eine Regel FAIL aus, ist
die Regel zu scharf.

---

## 12. Versionshistorie

| Version | Datum | Änderung |
|---|---|---|
| 1.0.0 | 15.08.2026 | Erstfassung, 75 Regeln: 61 bewertet (TEC 15, MOB 7, SEO 16, LOC 8, AIR 9, TRU 6 — MOB zählt zur Technik-Achse), 11 Compliance ohne Score, 3 experimentell mit Gewicht 0 |
