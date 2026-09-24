// Seitenauswahl. Pflichtseiten zuerst, danach auffuellen - nie einfach "die ersten 15".

const ROLLEN = [
  { rolle: 'impressum', prio: 1, url: /impressum|imprint|anbieterkennzeichnung|legal-notice/i, text: /impressum|anbieterkennzeichnung/i },
  { rolle: 'datenschutz', prio: 2, url: /datenschutz|privacy|privacy-policy/i, text: /datenschutz|privacy/i },
  { rolle: 'kontakt', prio: 3, url: /kontakt|contact|anfrage|angebot-anfordern/i, text: /kontakt|anfrage|schreiben sie uns/i },
  { rolle: 'leistungen', prio: 4, url: /leistung|service|angebot|produkt|portfolio|dienstleistung|sortiment|behandlung|speisekarte/i, text: /leistung|service|angebot|produkt|was wir|behandlung|speisekarte/i },
  { rolle: 'ueber_uns', prio: 5, url: /ueber-uns|ueber_uns|about|unternehmen|team|wir-ueber-uns|philosophie|historie/i, text: /über uns|ueber uns|unternehmen|team|wer wir sind/i },
  { rolle: 'referenzen', prio: 6, url: /referenz|projekt|portfolio|galerie|kunden|bewertung/i, text: /referenz|projekt|kunden|bewertung/i },
  { rolle: 'karriere', prio: 7, url: /karriere|jobs|stellen|bewerbung|ausbildung/i, text: /karriere|jobs|stellen|ausbildung/i },
  { rolle: 'standort', prio: 8, url: /standort|filiale|anfahrt|niederlassung/i, text: /standort|anfahrt|filiale/i },
];

/**
 * Ordnet einer URL eine Rolle zu - erst ueber den Pfad, ersatzweise ueber den Linktext.
 * Bei Single-Page-Anwendungen steht die eigentliche Route im Hash, deshalb wird
 * er mitgelesen.
 */
export function classify(url, linkText = '') {
  let path;
  try {
    const u = new URL(url);
    path = /^#\/./.test(u.hash) ? u.pathname.replace(/\/$/, '') + u.hash.slice(1) : u.pathname;
  } catch { path = url; }
  if (path === '/' || path === '') return { rolle: 'startseite', prio: 0 };
  for (const r of ROLLEN) {
    if (r.url.test(path)) return { rolle: r.rolle, prio: r.prio };
  }
  for (const r of ROLLEN) {
    if (linkText && r.text.test(linkText)) return { rolle: r.rolle, prio: r.prio };
  }
  return { rolle: 'sonstige', prio: 50 };
}

/**
 * Stellt die zu pruefende Seitenliste zusammen.
 * Reihenfolge: Startseite, dann Pflichtrollen nach Prioritaet, dann Auffuellung.
 * Durch robots.txt gesperrte Pfade werden ausgelassen und gemeldet.
 */
export function selectPages({ origin, homeUrl, internalLinks = [], sitemapUrls = [], robots, limit = 15 }) {
  const seen = new Map();
  const skipped_by_robots = [];

  const add = (url, linkText = '', quelle = 'link') => {
    let u;
    try { u = new URL(url, origin); } catch { return; }
    if (u.origin !== new URL(origin).origin) return;
    if (/\.(pdf|jpg|jpeg|png|webp|gif|svg|zip|docx?|xlsx?|mp4|mp3)$/i.test(u.pathname)) return;
    // Hash-Routen sind eigene Seiten und muessen erhalten bleiben; alles andere
    // ist eine Sprungmarke auf derselben Seite und wird zusammengefasst.
    const isHashRoute = /^#\/./.test(u.hash);
    if (!isHashRoute) u.hash = '';
    const key = (isHashRoute ? u.href : u.href.replace(/\/$/, '')) || u.href;
    if (seen.has(key)) {
      const existing = seen.get(key);
      if (existing.rolle === 'sonstige' && linkText) {
        const c = classify(u.href, linkText);
        if (c.rolle !== 'sonstige') { existing.rolle = c.rolle; existing.prio = c.prio; }
      }
      return;
    }
    if (robots && typeof robots.allows === 'function' && !robots.allows(u.pathname)) {
      skipped_by_robots.push(u.href);
      return;
    }
    const c = classify(u.href, linkText);
    seen.set(key, { url: u.href, rolle: c.rolle, prio: c.prio, quelle });
  };

  add(homeUrl, '', 'startseite');
  for (const l of internalLinks) add(l.url, l.text, 'link');
  for (const s of sitemapUrls) add(s, '', 'sitemap');

  const all = [...seen.values()];

  // Je Pflichtrolle hoechstens zwei Seiten, damit ein grosser Leistungsbereich
  // nicht das gesamte Kontingent frisst.
  const chosen = [];
  const perRolle = new Map();
  for (const page of all.sort((a, b) => a.prio - b.prio)) {
    const count = perRolle.get(page.rolle) ?? 0;
    const cap = page.rolle === 'leistungen' ? 4 : page.rolle === 'sonstige' ? Infinity : 2;
    if (count >= cap) continue;
    if (chosen.length >= limit) break;
    perRolle.set(page.rolle, count + 1);
    chosen.push(page);
  }

  return {
    pages: chosen,
    candidates_total: all.length,
    skipped_by_robots,
    rollen_gefunden: [...new Set(chosen.map((p) => p.rolle))],
  };
}
