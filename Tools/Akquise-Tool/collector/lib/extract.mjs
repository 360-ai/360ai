// Auswertung von HTML zu Rohfakten. Reine Textanalyse, kein Browser, keine Bewertung.

import * as cheerio from 'cheerio';

const GENERIC_ALT = /^(bild|image|img|foto|photo|grafik|logo|icon|picture|untitled|dsc[_-]?\d+|img[_-]?\d+|\d+)$/i;

/** Zerlegt eine HTML-Seite in Rohfakten. Bildgroessen kommen spaeter aus dem Netzwerkmitschnitt dazu. */
export function extractPage(html, pageUrl, { status = 200, headers = {} } = {}) {
  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;

  $('script, style, noscript, template').remove();

  removeConsentUi($);

  const bodyText = collapse(textWithSeparators($, $('body')));

  const headings = [];
  $('h1, h2, h3, h4').each((_, el) => {
    headings.push({ level: Number(el.tagName[1]), text: collapse($(el).text()) });
  });

  const images = [];
  $('img').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') ?? $el.attr('data-src') ?? '';
    if (!src || src.startsWith('data:')) return;
    const alt = $el.attr('alt');
    const w = Number($el.attr('width')) || null;
    const h = Number($el.attr('height')) || null;
    images.push({
      src: absolute(src, pageUrl),
      alt: alt ?? null,
      alt_meaningful: Boolean(alt && alt.trim().length > 2 && !GENERIC_ALT.test(alt.trim())),
      decorative: alt === '',
      width_attr: w,
      height_attr: h,
    });
  });

  const links = { internal: [], external: [] };
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return;

    // Reine Sprungmarken ueberspringen, Hash-Routen von Single-Page-Anwendungen
    // aber behalten - sonst findet der Collector bei Vue- oder React-Seiten
    // ausser der Startseite nichts (Fall Bravo, Quasar-SPA).
    const isHashRoute = /^#\/./.test(href);
    if (href.startsWith('#') && !isHashRoute) return;

    let abs;
    try { abs = new URL(href, pageUrl); } catch { return; }
    if (!/^https?:$/.test(abs.protocol)) return;

    const url = isHashRoute || /#\/./.test(abs.hash) ? abs.href : abs.href.split('#')[0];
    const entry = { url, text: collapse($(el).text()).slice(0, 120), hash_route: isHashRoute };
    (abs.origin === origin ? links.internal : links.external).push(entry);
  });

  const jsonld = [];
  cheerio.load(html)('script[type="application/ld+json"]').each((_, el) => {
    const raw = cheerio.load(html)(el).text();
    try {
      const parsed = JSON.parse(raw);
      for (const node of flattenJsonLd(parsed)) jsonld.push(node);
    } catch {
      jsonld.push({ '@type': '__PARSE_ERROR__' });
    }
  });

  const og = {};
  $('meta[property^="og:"]').each((_, el) => {
    const p = $(el).attr('property');
    if (p) og[p] = $(el).attr('content') ?? '';
  });

  const viewportContent = $('meta[name="viewport"]').attr('content') ?? null;

  return {
    url: pageUrl,
    status,
    title: collapse($('title').first().text()) || null,
    meta_description: $('meta[name="description"]').attr('content')?.trim() || null,
    meta_robots: $('meta[name="robots"]').attr('content')?.trim() || null,
    x_robots_tag: headers['x-robots-tag'] ?? null,
    canonical: $('link[rel="canonical"]').attr('href')
      ? absolute($('link[rel="canonical"]').attr('href'), pageUrl) : null,
    viewport_meta: viewportContent,
    headings,
    h1: headings.filter((h) => h.level === 1).map((h) => h.text),
    word_count: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    text: bodyText.slice(0, 60000),
    images,
    links,
    tel_links: unique($('a[href^="tel:"]').map((_, el) => $(el).attr('href')).get()),
    mailto_links: unique($('a[href^="mailto:"]').map((_, el) => $(el).attr('href')).get()),
    forms: $('form').length,
    jsonld_types: jsonld.map((n) => n['@type']).filter(Boolean).flat(),
    jsonld,
    og,
    og_site_name: og['og:site_name'] ?? null,
    html_bytes: Buffer.byteLength(html, 'utf8'),
  };
}

/** CMS, Theme und Bibliotheksversionen aus HTML und Headern ableiten. */
export function detectTech(html, headers = {}) {
  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? null;
  const tech = {
    generator,
    cms: null,
    cms_version: null,
    theme: null,
    jquery_version: /jquery[.-]?(?:min\.)?js\?ver=(\d+\.\d+(?:\.\d+)?)/i.exec(html)?.[1]
      ?? /jquery[/-](\d+\.\d+\.\d+)/i.exec(html)?.[1] ?? null,
    server: headers['server'] ?? null,
    powered_by: headers['x-powered-by'] ?? null,
  };

  if (generator) {
    const m = /^([A-Za-z .]+?)\s*([\d.]+)?$/.exec(generator.trim());
    if (m) {
      tech.cms = m[1].trim();
      tech.cms_version = m[2] ?? null;
    }
  }
  if (!tech.cms && /wp-content|wp-includes/i.test(html)) tech.cms = 'WordPress';
  if (/\/typo3(conf|temp)\//i.test(html)) tech.cms = 'TYPO3';
  if (/joomla/i.test(generator ?? '')) tech.cms = 'Joomla';
  if (/_next\/static/i.test(html)) tech.cms = tech.cms ?? 'Next.js';
  if (/\/_astro\//i.test(html)) tech.cms = tech.cms ?? 'Astro';

  const theme = /wp-content\/themes\/([A-Za-z0-9_-]+)/i.exec(html)?.[1] ?? null;
  if (theme) tech.theme = theme;
  tech.theme_version = plausibleVersion(
    /wp-content\/themes\/[A-Za-z0-9_-]+\/[^"']*?\?ver=([\d.]+)/i.exec(html)?.[1]
  );
  tech.cms_version = plausibleVersion(tech.cms_version);
  tech.jquery_version = plausibleVersion(tech.jquery_version);

  return tech;
}

const RECHTSFORMEN = [
  'GmbH & Co. KG', 'GmbH', 'UG (haftungsbeschränkt)', 'UG', 'AG', 'OHG', 'KG',
  'e.K.', 'eG', 'e.V.', 'GbR', 'eGbR', 'PartG', 'mbH',
];

/** Impressum in Einzelfelder zerlegen. Nur Feststellungen, keine rechtliche Wertung. */
export function extractImpressum(page) {
  const text = page.text ?? '';
  const flat = collapse(text);

  const placeholders = [];
  for (const re of [/\{[a-zäöüß ]{2,20}\}/gi, /\[[a-zäöüß ]{2,20}\]/gi, /musterstadt/gi,
    /max mustermann/gi, /lorem ipsum/gi, /musterfirma/gi, /musterstra(ss|ß)e/gi]) {
    for (const m of flat.matchAll(re)) placeholders.push(m[0]);
  }

  // Rechtsform aus dem Kopf des Impressums lesen, nicht aus dem Gesamttext:
  // in den Haftungsabsaetzen steht die Firmierung oft in einer zweiten Schreibweise
  // (bei Helfri "Helfri-Bau GmbH" gegenueber "Helfri Baugesellschaft mbH" im Kopf).
  const head = impressumHead(flat);
  const rechtsform = findRechtsform(head) ?? findRechtsform(flat);

  return {
    found: true,
    url: page.url,
    chars: flat.length,
    rechtsform,
    firmenname: extractCompanyLine(flat, rechtsform),
    // Ohne Rechtsform als Anker ist die Firmierung geraten. Der Vergleich der
    // Schreibweisen (AIR-07) laesst solche Werte deshalb aussen vor, statt einen
    // Widerspruch zu melden, den es womoeglich gar nicht gibt.
    firmenname_unsicher: !rechtsform,
    vertretung: cutAtNextLabel(
      /(?:vertreten durch|Vertretungsberechtigter?\s+Geschäftsführer(?:in)?|Geschäftsführer(?:in)?|Inhaber(?:in)?|Vorstand)\s*:?\s*([^.|\n]{3,120})/i
        .exec(flat)?.[1]
    ),
    register: /(?:HRA|HRB|VR|GnR)\s*:?\s*(\d{1,7})/i.exec(flat)?.[0]?.trim() ?? null,
    registergericht: /(?:Amtsgericht|Registergericht)\s*:?\s*([A-ZÄÖÜ][^,.|\n]{2,40})/i
      .exec(flat)?.[1]?.trim() ?? null,
    ustid: /DE\s?\d{9}\b/i.exec(flat.replace(/\s+/g, ' '))?.[0]?.replace(/\s/g, '') ?? null,
    telefon: extractPhones(flat)[0] ?? null,
    email: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.exec(flat)?.[0] ?? null,
    adresse: extractAddress(flat),
    mentions_tmg: /\bTMG\b|Telemediengesetz/i.test(flat),
    mentions_ddg: /\bDDG\b|Digitale-Dienste-Gesetz/i.test(flat),
    mentions_kammer: /(Handwerkskammer|Industrie- und Handelskammer|\bIHK\b|Kammer)/i.test(flat),
    mentions_berufsbezeichnung: /Berufsbezeichnung/i.test(flat),
    odr_link: page.links.external.some((l) => /ec\.europa\.eu\/consumers\/odr/i.test(l.url)),
    vsbg_hinweis: /Verbraucherschlichtungsstelle|VSBG|Streitbeilegung/i.test(flat),
    placeholders: unique(placeholders),
  };
}

/** Datenschutzerklaerung: Laenge und welche Dienste namentlich vorkommen. */
export function extractDatenschutz(page) {
  const flat = collapse(page.text ?? '');
  const services = {
    google_maps: /Google Maps/i.test(flat),
    google_fonts: /Google Fonts/i.test(flat),
    google_analytics: /Google Analytics|Universal Analytics|\bGA4\b/i.test(flat),
    google_tag_manager: /Tag Manager/i.test(flat),
    youtube: /YouTube/i.test(flat),
    vimeo: /Vimeo/i.test(flat),
    facebook: /Facebook|Meta Pixel/i.test(flat),
    instagram: /Instagram/i.test(flat),
    recaptcha: /reCAPTCHA/i.test(flat),
    hotjar: /Hotjar/i.test(flat),
    matomo: /Matomo|Piwik/i.test(flat),
    cloudflare: /Cloudflare/i.test(flat),
  };
  return {
    found: true,
    url: page.url,
    chars: flat.length,
    services,
    mentions_hosting: /Hosting|Webhoster|Hoster|Serverstandort/i.test(flat),
    mentions_tdddg: /TDDDG|TTDSG|Telekommunikation-Digitale-Dienste/i.test(flat),
    mentions_auftragsverarbeitung: /Auftragsverarbeitung|Auftragsverarbeiter/i.test(flat),
    mentions_speicherdauer: /Speicherdauer|Löschfrist|gelöscht, sobald/i.test(flat),
    placeholders: unique([...collapse(flat).matchAll(/\{[a-zäöüß ]{2,20}\}|\[[a-zäöüß ]{2,20}\]/gi)].map((m) => m[0])),
  };
}

/** Sammelt alle Firmierungs-Schreibweisen aus den Quellen, die sie ueberhaupt nennen (AIR-07). */
export function collectCompanyNames(pages, impressum) {
  const found = [];
  const home = pages[0];

  // Aus dem Titel den Abschnitt waehlen, der wie eine Firmierung aussieht -
  // nicht blind den ersten oder letzten, sonst landet der Werbeclaim im Vergleich.
  if (home?.title) {
    const segments = home.title.split(/[|\-–—·•]/).map((s) => s.trim()).filter((s) => s.length > 2);
    const value = pickCompanySegment(segments, impressum?.firmenname);
    if (value) found.push({ source: 'title', value });
  }
  if (home?.og_site_name) found.push({ source: 'og:site_name', value: home.og_site_name });

  for (const p of pages) {
    const copyright = /(?:©|&copy;|Copyright)\s*(?:\d{4}\s*(?:[-–]\s*\d{4})?)?\s*([A-ZÄÖÜ][^.|\n]{2,60})/
      .exec(p.text ?? '')?.[1]?.trim();
    const value = trimFooterNoise(copyright);
    if (value) { found.push({ source: 'footer', value, page: p.url }); break; }
  }

  for (const p of pages) {
    for (const node of p.jsonld ?? []) {
      if (node?.name && /Organization|LocalBusiness|Corporation|Store/i.test(String(node['@type'] ?? ''))) {
        found.push({ source: 'jsonld', value: String(node.name) });
      }
    }
  }

  if (impressum?.found && impressum.firmenname) {
    found.push({
      source: 'impressum',
      value: impressum.firmenname,
      unsicher: Boolean(impressum.firmenname_unsicher),
    });
  }

  // Drei getrennte Masse, weil sie unterschiedliche Befunde tragen:
  //  schreibweisen        - wie oft das Unternehmen wortwoertlich anders geschrieben wird
  //  variants             - abweichender Namenskern, Rechtsform bewusst neutralisiert
  //  rechtsform_konflikte - gleicher Kern, aber unterschiedliche Rechtsform
  //                         (bei Helfri "Baugesellschaft GmbH" gegen "Baugesellschaft mbH")
  // Unsichere Fundstellen zaehlen nicht als abweichende Schreibweise - sonst
  // meldet die Regel bei jedem Einzelunternehmen einen Widerspruch, der nur
  // aus der eigenen Rateunsicherheit stammt.
  const sicher = found.filter((f) => !f.unsicher);

  const normalized = new Map();
  for (const f of sicher) {
    const key = normalizeCompanyName(f.value);
    if (!key) continue;
    if (!normalized.has(key)) normalized.set(key, []);
    normalized.get(key).push(f);
  }

  const variants = [...normalized.entries()].map(([key, sources]) => ({ key, sources }));

  const rechtsform_konflikte = [];
  for (const v of variants) {
    const formen = unique(v.sources
      .map((s) => RECHTSFORM_TOKEN.exec(s.value)?.[1])
      .filter(Boolean)
      .map((x) => x.replace(/\./g, '')));
    if (formen.length > 1) {
      rechtsform_konflikte.push({ key: v.key, formen, sources: v.sources.map((s) => s.source) });
    }
  }

  const schreibweisen = unique(sicher.map((f) => collapse(f.value)));

  return {
    raw: found,
    schreibweisen,
    variants,
    rechtsform_konflikte,
    unsichere_fundstellen: found.filter((f) => f.unsicher).length,
  };
}

// Woerter, die eine Fundstelle als Fliesstext statt als Firmierung entlarven.
const NICHT_FIRMENNAME = /\b(entfernen|Haftung|haften|Inhalte|verpflichtet|Rechtsverletzung|umgehend|Urheberrecht|Betreiber dieser|Bei Bekanntwerden|Diese Website|Quelle|erstellt)\b/i;

// Navigations- und Rechtstextlinks, die im Fliesstext unmittelbar vor dem
// Impressumskopf landen.
const NAV_RAUSCHEN = /^(AGB|Impressum|Datenschutz|Datenschutzerkl(?:ä|ae)rung|Home|Start|Startseite|Kontakt|Leistungen|Angebot|Blog|News|Newsletter|Cookie[a-zäöüß]*|Men(?:ü|ue)|Navigation|Suche|Login|Sitemap|Barrierefreiheit|Widerruf|Widerrufsbelehrung)$/i;

// Beschriftungen im Impressumskopf, die vor der Firmierung stehen.
const LABEL_PHRASEN = /\b(Angaben\s+gem(?:ä|ae)ß[^:]{0,30}?(?:TMG|DDG)|Anbieter(?:kennzeichnung)?|Verantwortlich(?:e[rn]?)?\s+f(?:ü|ue)r\s+den\s+Inhalt(?:\s+nach\s+§?\s*18[^:]{0,20})?|Diensteanbieter|Herausgeber|Betreiber|Impressum|Vertreten\s+durch|Inhaber(?:in)?|Gesch(?:ä|ae)ftsf(?:ü|ue)hr(?:er|erin|ung))\s*:?/gi;

/**
 * Firmenzeile aus dem Impressumstext ziehen.
 * Sucht bewusst nur im Kopf des Impressums - weiter unten stehen Haftungs- und
 * Urheberrechtsabsaetze, in denen die Firmierung ebenfalls vorkommt und einen
 * ganzen Satz als vermeintlichen Firmennamen liefern wuerde.
 */
export function extractCompanyLine(flatText, rechtsform) {
  const head = impressumHead(flatText);

  const clean = (s) => {
    const c = collapse(s).replace(/^[^A-ZÄÖÜ]+/, '');
    return c.length >= 3 && c.length <= 70 && !NICHT_FIRMENNAME.test(c) ? c : null;
  };

  if (rechtsform) {
    const escaped = rechtsform.replace(/[.()&*+?^${}|[\]\\]/g, '\\$&');
    const re = new RegExp(`([A-ZÄÖÜ][\\wäöüß.&\\-]*(?:[ ][A-ZÄÖÜa-zäöüß.&\\-]+){0,5}[ ]${escaped})(?![\\wäöüß])`, 'g');
    for (const source of [head, flatText]) {
      for (const hit of source.matchAll(re)) {
        const value = clean(hit[1]);
        if (value) return value;
      }
    }
  }

  // Ohne Rechtsform - bei Einzelunternehmen der Normalfall, und die stellen
  // einen grossen Teil der Zielgruppe. Dann gibt es keinen Anker wie "GmbH",
  // sondern nur den Block zwischen den Beschriftungen und der Anschrift.
  const addr = extractAddress(head) ?? extractAddress(flatText);
  if (addr) {
    const strassenName = addr.strasse.replace(/\s+\d+\s*[a-zA-Z]?$/, '').trim();
    const idx = flatText.indexOf(strassenName);
    if (idx > 0) {
      let vor = flatText.slice(Math.max(0, idx - 140), idx);
      vor = vor.replace(/\([^)]*\)/g, ' ');        // "(Einzelunternehmer)" entfernen
      vor = vor.replace(LABEL_PHRASEN, ' ');
      let tokens = collapse(vor).split(/\s+/).filter((t) => t.length > 1 && !/^[-–/·|]$/.test(t));
      // Navigationseintraege stehen im zusammenhaengenden Text direkt vor dem
      // Impressumskopf und wuerden sonst zum Firmennamen gehoeren ("AGB Denis Schmidt").
      while (tokens.length > 1 && NAV_RAUSCHEN.test(tokens[0])) tokens.shift();
      const kandidat = clean(tokens.slice(-4).join(' '));
      if (kandidat) return kandidat;
    }
  }
  return null;
}

// Beschriftungen, an denen ein Impressumsfeld endet und das naechste beginnt.
const NAECHSTES_LABEL = /\b(Kontakt|Telefon|Tel\.?|Telefax|Fax|E-?Mail|Mail|Internet|Web|Registergericht|Handelsregister|Registernummer|USt|Umsatzsteuer|Aufsichtsbehörde|Zuständige|Berufsbezeichnung|Verantwortlich|Redaktionell|Haftung|Streitbeilegung|Quelle)\b/i;

// Rollenbezeichnungen, die dem Namen vorangestellt sein koennen. In der Praxis
// verschachtelt: "Vertreten durch: Vertretungsberechtigter Geschaeftsfuehrer: Markus Hoffmann".
const ROLLEN_PREFIX = /^(?:Alleinvertretungsberechtigt(?:er|e)?|Vertretungsberechtigt(?:er|e)?|Vertreten durch|Geschäftsführer(?:in)?|Geschäftsführung|Inhaber(?:in)?|Vorstand|Betreiber)\s*:?\s*/i;

/** Schneidet einen Feldwert vor der naechsten Beschriftung ab und entfernt Rollenpraefixe. */
function cutAtNextLabel(value) {
  if (!value) return null;
  let s = collapse(value);
  const hit = NAECHSTES_LABEL.exec(s);
  s = collapse(hit ? s.slice(0, hit.index) : s);
  let prev;
  do { prev = s; s = collapse(s.replace(ROLLEN_PREFIX, '')); } while (s !== prev && s.length);
  s = s.replace(/[:,;\-–]\s*$/, '').trim();
  return s.length >= 3 ? s : null;
}

/**
 * Rechtsform nach Fundposition waehlen, nicht nach Listenreihenfolge.
 * Im Impressum steht die echte Firmierung oben; weiter unten taucht in
 * Haftungsabsaetzen oft eine abweichende Schreibweise auf (bei Helfri
 * "Helfri-Bau GmbH" gegenueber "Helfri Baugesellschaft mbH" im Kopf).
 * Bei gleicher Position gewinnt die laengere Form ("GmbH & Co. KG" vor "GmbH").
 */
function findRechtsform(text) {
  const treffer = [];
  for (const rf of RECHTSFORMEN) {
    const re = new RegExp(`\\b${rf.replace(/[.()&*+?^${}|[\]\\]/g, '\\$&')}\\b`);
    const m = re.exec(text);
    if (m) treffer.push({ rf, index: m.index, len: rf.length });
  }
  if (!treffer.length) return null;
  treffer.sort((a, b) => a.index - b.index || b.len - a.len);
  return treffer[0].rf;
}

/**
 * Kopfbereich des Impressums: der Block, in dem Firmierung und Anschrift stehen.
 * Beginnt bei der Anbieterkennzeichnungs-Einleitung, sonst am Textanfang.
 */
function impressumHead(flatText) {
  const anchor = /Angaben\s+gem(?:ä|ae)ß\s*§?\s*5[^:]{0,40}?(?:TMG|DDG)\s*:?/i.exec(flatText)
    ?? /\bImpressum\b\s*:?/i.exec(flatText);
  const start = anchor ? anchor.index + anchor[0].length : 0;
  return flatText.slice(start, start + 400);
}

/** Verwirft Versionsangaben, die in Wahrheit Cache-Zeitstempel sind. */
function plausibleVersion(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d+){1,3}$/.test(s)) return null;
  if (Number(s.split('.')[0]) > 200) return null;
  return s;
}

const RECHTSFORM_TOKEN = /\b(GmbH|mbH|UG|AG|OHG|KG|e\.?K\.?|eG|e\.?V\.?|GbR|PartG)\b/i;

/** Waehlt aus Titel-Abschnitten den, der am ehesten die Firmierung ist. */
function pickCompanySegment(segments, impressumName) {
  if (!segments.length) return null;
  const withRechtsform = segments.find((s) => RECHTSFORM_TOKEN.test(s));
  if (withRechtsform) return withRechtsform;

  if (impressumName) {
    const target = normalizeCompanyName(impressumName);
    const match = segments.find((s) => {
      const n = normalizeCompanyName(s);
      return n && target && (n.includes(target) || target.includes(n));
    });
    if (match) return match;
  }
  // Ohne Anhaltspunkt: der kuerzeste Abschnitt ist eher der Name als der Werbeclaim.
  return [...segments].sort((a, b) => a.length - b.length)[0];
}

// Elemente, die im Footer direkt hinter dem Copyright stehen und nicht zur Firmierung gehoeren.
const FOOTER_NOISE = /\s*(Zustimmung verwalten|Cookie[- ]?Einstellungen|Alle Rechte|All rights|Impressum|Datenschutz|Sitemap|Nach oben|Powered by|Realisiert|Webdesign)\b.*$/i;

function trimFooterNoise(value) {
  if (!value) return null;
  const cleaned = collapse(String(value).replace(FOOTER_NOISE, ''));
  return cleaned.length >= 3 && cleaned.length <= 70 ? cleaned : null;
}

/** Firmierung vergleichbar machen: Rechtsformkuerzel, Bindestriche, Gross-/Kleinschreibung. */
export function normalizeCompanyName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\b(gmbh|mbh|ug|ag|ohg|kg|e\.?k\.?|e\.?g\.?|e\.?v\.?|gbr|co\.?)\b/g, ' ')
    .replace(/\(haftungsbeschränkt\)/g, ' ')
    .replace(/[^a-zäöüß0-9]+/g, '')
    .trim();
}

/** Telefonnummern vergleichbar machen: +49 gegen 0, Trenner entfernen. */
export function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+49')) p = '0' + p.slice(3);
  else if (p.startsWith('0049')) p = '0' + p.slice(4);
  return p;
}

/** Adresse vergleichbar machen: Str./Straße, Leerzeichen, Satzzeichen. */
export function normalizeAddress(addr) {
  if (!addr) return '';
  return String(addr)
    .toLowerCase()
    .replace(/stra(ss|ß)e|str\.|str\b/g, 'str')
    .replace(/[^a-zäöüß0-9]+/g, '')
    .trim();
}

/**
 * Telefonnummern in deutscher Schreibweise, auch mit Leerzeichen- und
 * Bindestrichgruppen wie "06451 - 69 46". Die Plausibilitaet entscheidet die
 * normalisierte Ziffernlaenge, nicht das Trennzeichenmuster.
 */
export function extractPhones(text) {
  const matches = [];
  for (const m of String(text).matchAll(/(?:\+49|0049|0)[\d\s/().-]{6,22}\d/g)) {
    const raw = m[0].trim().replace(/[\s.\-/]+$/, '');
    const norm = normalizePhone(raw);
    if (norm.length < 9 || norm.length > 15) continue;
    if (/^0\d{4}$/.test(norm)) continue;          // reine Postleitzahl-Reste
    matches.push(collapse(raw));
  }
  return unique(matches);
}

// Ueberschriften, die einer Anschrift unmittelbar vorangehen und faelschlich als
// Teil des Strassennamens gelesen wuerden ("Kontakt Siegener Strasse 53").
const ADRESS_LABEL = /^(Adresse|Anschrift|Kontakt|Standort|Sitz|Firmensitz|Postanschrift|Impressum|Zentrale|Buero|Büro|Hauptsitz|Niederlassung|Werk|Filiale|So|Hier)$/i;

// Typische Strassenendungen. Dient als Anker, nicht als Pflicht - Namen wie
// "An der Muehle" haben keine und werden ueber die Artikelregel erfasst.
const STRASSEN_SUFFIX = /(stra(ss|ß)e|str\.?|weg|allee|platz|ring|gasse|damm|chaussee|ufer|steig|pfad|winkel|zeile|berg|feld|garten|park|markt|hof|kamp|au|graben|br(ü|ue)cke)\.?$/i;

// Woerter, mit denen ein Strassenname zulaessig beginnt ("Am Markt", "An der Muehle").
const STRASSEN_ARTIKEL = /^(Am|An|Auf|Aus|In|Im|Zur|Zum|Bei|Vor|Hinter|Alte[rn]?|Neue[rn]?|Obere[rn]?|Untere[rn]?|Große[rn]?|Kleine[rn]?|Lange[rn]?|Kurze[rn]?|Der|Die|Das|Den)$/i;

/**
 * Schneidet vorangestellte Ueberschriften vom Strassennamen ab.
 * Ohne das meldet der Adressvergleich Abweichungen, wo keine sind - und ein
 * falscher Befund wie "Ihre Adresse steht in drei Fassungen auf der Seite"
 * darf niemals in einem Kundentext landen.
 */
function bereinigeStrasse(namensteil, hausnummer) {
  let tokens = collapse(namensteil).split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && ADRESS_LABEL.test(tokens[0])) tokens.shift();

  // Am zuverlaessigsten ist die Strassenendung selbst. Ist sie ein zusammen-
  // gesetztes Wort ("Hauptstr."), traegt sie den Namen bereits in sich und
  // steht allein. Ist sie generisch ("Strasse", "Str.", "Weg"), gehoert das
  // Wort davor dazu ("Siegener Strasse"). Ohne diese Unterscheidung wandert
  // bei "Malerbetrieb Schmidt Hauptstr. 12" der Nachname in die Strasse.
  const suffixIndex = tokens.map((t) => STRASSEN_SUFFIX.test(t)).lastIndexOf(true);
  if (suffixIndex >= 0) {
    const suffix = tokens[suffixIndex].replace(/\.$/, '');
    const generisch = suffix.length <= 7;
    let start = generisch ? Math.max(0, suffixIndex - 1) : suffixIndex;
    // Verbindungswort davor mitnehmen ("An der Muehle").
    if (start > 0 && STRASSEN_ARTIKEL.test(tokens[start - 1])) start -= 1;
    if (start > 0 && STRASSEN_ARTIKEL.test(tokens[start - 1])) start -= 1;
    tokens = tokens.slice(start, suffixIndex + 1);
  } else if (tokens.length > 2 && !STRASSEN_ARTIKEL.test(tokens[0])) {
    // Ohne erkennbare Endung die letzten zwei Woerter nehmen - aber vorangehende
    // Verbindungswoerter mitziehen, sonst wird aus "An der Muehle" nur "der Muehle".
    let start = tokens.length - 2;
    while (start > 0 && STRASSEN_ARTIKEL.test(tokens[start - 1])) start -= 1;
    tokens = tokens.slice(start);
  }

  if (!tokens.length) return null;
  return collapse(`${tokens.join(' ')} ${hausnummer}`);
}

// Ortsnamen aus mehreren Woertern folgen festen Mustern: ein kleingeschriebenes
// Verbindungswort ("Frankfurt am Main") oder ein bekanntes Praefix ("Bad Homburg").
// Alles andere hinter dem Ortsnamen ist die naechste Ueberschrift und gehoert nicht dazu.
// Eine Stoppwortliste waere hier der falsche Ansatz - sie muesste jedes denkbare
// Folgewort kennen ("Kontakt", "Anfahrt", "Oeffnungszeiten", ...).
const ORT_VERBINDER = /^(am|an|der|die|das|ob|im|in|auf|vor|bei|unter|ueber|über|a\.|i\.|o\.)$/i;
const ORT_PRAEFIX = /^(Bad|Sankt|St\.|Neu|Alt|Gross|Groß|Klein|Ober|Nieder|Unter|Hohen|Markt)$/i;

/**
 * Kuerzt einen Ortsnamen auf seine tatsaechlichen Bestandteile.
 * Ein Folgewort wird nur uebernommen, wenn es strukturell dazugehoert -
 * kleingeschriebenes Verbindungswort oder Fortsetzung nach einem Praefix.
 */
function bereinigeOrt(rohOrt) {
  const teile = collapse(rohOrt).split(/\s+/).filter(Boolean);
  if (!teile.length) return null;

  const behalten = [teile[0]];
  for (let i = 1; i < teile.length; i++) {
    const wort = teile[i];
    if (wort.startsWith('(')) { behalten.push(wort); continue; }
    const vorheriges = teile[i - 1];
    const istVerbinder = ORT_VERBINDER.test(wort);
    const folgtVerbinder = ORT_VERBINDER.test(vorheriges);
    const folgtPraefix = i === 1 && ORT_PRAEFIX.test(vorheriges);
    if (istVerbinder || folgtVerbinder || folgtPraefix) { behalten.push(wort); continue; }
    break;
  }
  // Ein Verbindungswort am Ende ("Frankfurt am") ist immer abgeschnitten.
  while (behalten.length > 1 && ORT_VERBINDER.test(behalten[behalten.length - 1])) behalten.pop();
  return behalten.join(' ');
}

/**
 * Anschrift in zwei Schritten: erst Postleitzahl und Ort, dann rueckwaerts die
 * Strassenzeile. Ein einzelner gieriger Ausdruck verschluckt sonst die
 * Firmierung davor und den naechsten Abschnitt dahinter.
 */
export function extractAddress(text) {
  const s = collapse(text);
  const plzMatch = /\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß.\-]{1,30}(?:\s*\([\wäöüß.\- ]{1,20}\))?(?:\s+[\wäöüß.\-]{1,30}){0,2})/.exec(s);
  if (!plzMatch) return null;

  const ort = bereinigeOrt(plzMatch[2]);
  if (!ort) return null;

  // Strasse: letztes "Wort(e) Hausnummer" vor der Postleitzahl.
  const before = s.slice(Math.max(0, plzMatch.index - 90), plzMatch.index);
  // Der fuehrende Wortanfang ist Pflicht: sonst startet der Treffer mitten in
  // einem Wort ("mbH" liefert sonst die Strasse "H Siegener Strasse").
  // Kleingeschriebene Verbindungswoerter muessen mitlaufen, sonst wird aus
  // "An der Muehle 7" nur "Muehle 7".
  const strasseMatch = [...before.matchAll(
    /(?:^|[\s,;(])([A-ZÄÖÜ][\wäöüß.\-]*(?:[ ](?:der|die|das|dem|den|zur|zum|im|am|an|auf|vor|hinter|zu|de[rs])(?=[ ])|[ ][A-ZÄÖÜ][\wäöüß.\-]*){0,3})\s+(\d{1,4}\s*[a-zA-Z]?)\s*,?\s*$/g
  )].pop();
  if (!strasseMatch) return null;

  const strasse = bereinigeStrasse(strasseMatch[1], strasseMatch[2]);
  if (!strasse) return null;
  return { strasse, plz: plzMatch[1], ort, raw: `${strasse}, ${plzMatch[1]} ${ort}` };
}

/** Zaehlt belegbare Zahlenangaben mit Bezug - keine PLZ, keine Telefonnummern (AIR-05). */
export function countConcreteFacts(text) {
  const flat = collapse(text);
  const patterns = [
    /\b(?:seit|gegründet|Gründung)\s+(?:im Jahr\s+)?(19|20)\d{2}\b/gi,
    /\b\d{1,4}(?:[.,]\d+)?\s?(?:t|to|Tonnen|kg|m²|qm|m³|cbm|km|kW|PS|Meter|m\b|Liter|l\b|Stück|Mitarbeiter|Beschäftigte|Jahre|Jahren|Standorte|Filialen|Betten|Plätze|Sitzplätze)\b/gi,
    /\bDIN\s?(?:EN\s?)?(?:ISO\s?)?\d{3,5}\b/gi,
    /\bnach\s+(?:DIN|EN|ISO|VDE|VDI|TRGS)\b/gi,
  ];
  const hits = [];
  for (const re of patterns) for (const m of flat.matchAll(re)) hits.push(m[0].trim());
  return { count: unique(hits).length, samples: unique(hits).slice(0, 15) };
}

/** Erkennt Frage-Antwort-Abschnitte im sichtbaren Inhalt (AIR-03). */
export function detectFaq(page) {
  const questionHeadings = (page.headings ?? []).filter((h) => /\?\s*$/.test(h.text) && h.text.length > 12);
  const schemaFaq = (page.jsonld_types ?? []).some((t) => /FAQPage|Question/i.test(String(t)));
  return {
    visible_questions: questionHeadings.length,
    has_schema: schemaFaq,
    samples: questionHeadings.slice(0, 5).map((h) => h.text),
  };
}

// -- Hilfsfunktionen -------------------------------------------------------

function flattenJsonLd(node, out = []) {
  if (Array.isArray(node)) { for (const n of node) flattenJsonLd(n, out); return out; }
  if (node && typeof node === 'object') {
    out.push(node);
    if (node['@graph']) flattenJsonLd(node['@graph'], out);
  }
  return out;
}

const CONSENT_SELECTOR = '[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [class*="cmplz" i], [id*="cmplz" i], [class*="borlabs" i], [id*="usercentrics" i], [class*="klaro" i], [id*="CybotCookiebot" i]';

/**
 * Entfernt Consent-Oberflaechen aus dem Text. Sie liegen im DOM meist vor dem Inhalt
 * und wuerden sonst jede Seite mit dem Cookie-Hinweis beginnen lassen.
 *
 * Wichtig: Consent-Werkzeuge setzen ihre Klassen teilweise auf <body> selbst
 * (Complianz etwa "cmplz-optin"). Ein naiver remove() loescht dann die ganze Seite.
 * Geschuetzt wird deshalb inhaltlich: Was die Hauptueberschrift oder den
 * Hauptinhaltsbereich enthaelt, ist kein Banner - unabhaengig von seiner Textmenge.
 * Ein Cookie-Hinweis enthaelt nie die H1 der Seite.
 */
function removeConsentUi($) {
  $(CONSENT_SELECTOR).each((_, el) => {
    const tag = String(el.tagName ?? '').toLowerCase();
    if (tag === 'body' || tag === 'html') return;
    const $el = $(el);
    if ($el.find('h1, main, article').length > 0) return;
    $el.remove();
  });
}

const BLOCK_TAGS = 'p,div,section,article,li,tr,td,th,h1,h2,h3,h4,h5,h6,header,footer,nav,address,blockquote,dt,dd,figcaption,label,option';

/**
 * Textextraktion mit Trennzeichen zwischen Blockelementen.
 * Ohne das klebt der Text benachbarter Elemente zusammen ("mbHSiegener Strasse"),
 * was Adress-, Namens- und Wortzahlmessungen unbrauchbar macht.
 */
function textWithSeparators($, $root) {
  const $clone = $root.clone();
  $clone.find('br').replaceWith(' \n ');
  $clone.find(BLOCK_TAGS).each((_, el) => { $(el).append(' \n '); });
  // Navigationslinks liegen inline nebeneinander und wuerden sonst verschmelzen
  // ("HomeSpeisekarteStandortImpressum").
  $clone.find('a').each((_, el) => { $(el).append(' '); });
  return $clone.text();
}

function absolute(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

export function collapse(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}
