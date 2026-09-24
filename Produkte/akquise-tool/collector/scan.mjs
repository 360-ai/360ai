#!/usr/bin/env node
// Collector-Orchestrator. Erzeugt facts.json, Screenshots und Roh-HTML.
// Diese Datei misst und protokolliert. Sie bewertet nichts - das macht die Rule Engine.
//
// Aufruf:
//   node collector/scan.mjs https://beispiel.de --lead-id L-0001 --branche dachdecker --keyword "Dachdecker Frankenberg"

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  USER_AGENT, fetchWithMeta, measureTtfb, checkLinks, loadRobots, loadSitemapUrls, loadPageSpeed, sleep,
} from './lib/net.mjs';
import {
  extractPage, detectTech, extractImpressum, extractDatenschutz,
  collectCompanyNames, normalizePhone, normalizeAddress, extractPhones, extractAddress,
  countConcreteFacts, detectFaq, collapse, unique,
} from './lib/extract.mjs';
import { withBrowser, captureConsentRuns, captureDesktop, captureMobile, renderPage, checkOverflow } from './lib/browser.mjs';
import { selectPages } from './lib/pages.mjs';

// 1.1.0: Anschriften- und Firmierungserkennung ueberarbeitet - Strassenendung
// als Anker, Einzelunternehmen ohne Rechtsform werden erkannt und als unsicher
// gekennzeichnet, Navigationsrauschen vor dem Impressumskopf wird entfernt.
export const COLLECTOR_VERSION = '1.1.0';

const DATA_ROOT = process.env.AKQUISE_DATA_ROOT
  ?? path.join(os.homedir(), 'Documents', '360ai', 'Kunden', 'Akquise');

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const args = { url: null, leadId: null, branche: null, keyword: null, limit: 15, outDir: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lead-id') args.leadId = argv[++i];
    else if (a === '--branche') args.branche = argv[++i];
    else if (a === '--keyword') args.keyword = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]) || 15;
    else if (a === '--out') args.outDir = argv[++i];
    else rest.push(a);
  }
  args.url = rest[0] ?? null;
  return args;
}

function normalizeStartUrl(input) {
  let u = String(input).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = new URL(u);
  url.hash = '';
  return url;
}

async function makeAuditDir(leadId, host) {
  const day = new Date().toISOString().slice(0, 10);
  const lead = leadId ?? host.replace(/[^a-z0-9.-]/gi, '_');
  let dir = path.join(DATA_ROOT, lead, day);
  let n = 2;
  while (existsSync(dir)) dir = path.join(DATA_ROOT, lead, `${day}-${n++}`);
  await mkdir(path.join(dir, 'screenshots'), { recursive: true });
  await mkdir(path.join(dir, 'html'), { recursive: true });
  return dir;
}

const log = (msg) => process.stderr.write(`  ${msg}\n`);

// ---------------------------------------------------------------- Hauptlauf

export async function scan(options) {
  const startUrl = normalizeStartUrl(options.url);
  const origin = startUrl.origin;
  const errors = [];
  const auditDir = options.outDir ?? (await makeAuditDir(options.leadId, startUrl.host));

  log(`Ziel: ${startUrl.href}`);
  log(`Ablage: ${auditDir}`);

  // --- Schritt 1: Erreichbarkeit, Weiterleitungen, Hostvarianten -----------
  log('Schritt 1/9  Erreichbarkeit und Weiterleitungen');
  const home = await fetchWithMeta(startUrl.href);
  if (!home.ok) {
    const facts = baseFacts(startUrl, auditDir, options);
    facts.meta.fatal = `Startseite nicht erreichbar: ${home.error}`;
    facts.http = { reachable: false, error: home.error };
    await writeFile(path.join(auditDir, 'facts.json'), JSON.stringify(facts, null, 2), 'utf8');
    return { facts, auditDir };
  }

  const finalUrl = new URL(home.final_url);
  const httpVariant = await fetchWithMeta(`http://${startUrl.host}${startUrl.pathname}`);
  const otherHost = startUrl.host.startsWith('www.')
    ? startUrl.host.replace(/^www\./, '') : `www.${startUrl.host}`;
  const otherHostRes = await fetchWithMeta(`https://${otherHost}/`).catch(() => ({ ok: false }));

  // --- Schritt 2: robots.txt, Sitemap, llms.txt ---------------------------
  log('Schritt 2/9  robots.txt, Sitemap, llms.txt');
  const robots = await loadRobots(finalUrl.origin);
  let sitemapUrls = [];
  let sitemapSource = null;
  for (const cand of [...robots.sitemaps, `${finalUrl.origin}/sitemap.xml`, `${finalUrl.origin}/wp-sitemap.xml`, `${finalUrl.origin}/sitemap_index.xml`]) {
    const found = await loadSitemapUrls(cand);
    if (found.length) { sitemapUrls = found; sitemapSource = cand; break; }
  }
  const llmsTxt = await fetchWithMeta(`${finalUrl.origin}/llms.txt`);

  // --- Schritt 3: Browserlaeufe -------------------------------------------
  log('Schritt 3/9  Browser: Desktop, Mobil, drei Consent-Zustaende');
  const browserData = await withBrowser(async (browser) => {
    const desktop = await captureDesktop(browser, finalUrl.href, path.join(auditDir, 'screenshots'));
    const mobile = await captureMobile(browser, finalUrl.href, path.join(auditDir, 'screenshots'));
    const consent = await captureConsentRuns(browser, finalUrl.href);
    return { desktop, mobile, consent, browser: null };
  });
  if (browserData.desktop.error) errors.push(`Desktop-Lauf: ${browserData.desktop.error}`);
  if (browserData.mobile.error) errors.push(`Mobil-Lauf: ${browserData.mobile.error}`);

  // --- Schritt 4: Seitenauswahl -------------------------------------------
  log('Schritt 4/9  Seitenauswahl');
  const homeRaw = extractPage(home.body, finalUrl.href, { status: home.status, headers: home.headers });
  const homeRendered = browserData.desktop.rendered_html
    ? extractPage(browserData.desktop.rendered_html, finalUrl.href, { status: home.status, headers: home.headers })
    : null;

  const selection = selectPages({
    origin: finalUrl.origin,
    homeUrl: finalUrl.href,
    internalLinks: (homeRendered ?? homeRaw).links.internal,
    sitemapUrls,
    robots,
    limit: options.limit,
  });
  log(`             ${selection.pages.length} Seiten: ${selection.rollen_gefunden.join(', ')}`);

  // --- Schritt 5: Unterseiten roh und gerendert ---------------------------
  log('Schritt 5/9  Seiten abrufen (roh und gerendert)');
  const pages = [];
  const allResources = [...(browserData.desktop.resources ?? [])];
  await withBrowser(async (browser) => {
    for (const entry of selection.pages) {
      const isHome = entry.url === finalUrl.href;
      const raw = isHome ? home : await fetchWithMeta(entry.url);
      if (!raw.ok) {
        pages.push({ url: entry.url, rolle: entry.rolle, status: null, error: raw.error });
        continue;
      }
      const rendered = isHome && browserData.desktop.rendered_html
        ? { ok: true, html: browserData.desktop.rendered_html, status: raw.status, resources: [] }
        : await renderPage(browser, entry.url);
      for (const r of rendered.resources ?? []) allResources.push({ ...r, seite: entry.url });

      const rawFacts = extractPage(raw.body, entry.url, { status: raw.status, headers: raw.headers });
      const renderedFacts = rendered.ok
        ? extractPage(rendered.html, entry.url, { status: rendered.status ?? raw.status, headers: raw.headers })
        : null;

      // Gerenderte Sicht ist fuehrend; die Roh-Sicht bleibt fuer AIR-09 erhalten.
      const merged = renderedFacts ?? rawFacts;
      merged.rolle = entry.rolle;
      merged.quelle = entry.quelle;
      // Bei Hash-Routen liefert der Roh-Abruf immer dieselbe Anwendungshuelle.
      // Ein Roh-gegen-gerendert-Vergleich waere hier bedeutungslos.
      merged.hash_route = /#\/./.test(entry.url);
      merged.raw_word_count = merged.hash_route ? null : rawFacts.word_count;
      merged.rendered_word_count = renderedFacts?.word_count ?? null;
      merged.raw_html_bytes = raw.bytes;
      merged.response_headers = pickHeaders(raw.headers);
      pages.push(merged);

      const safeName = entry.url.replace(finalUrl.origin, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 60) || 'index';
      await writeFile(path.join(auditDir, 'html', `${safeName}.raw.html`), raw.body, 'utf8');
      if (rendered.ok) await writeFile(path.join(auditDir, 'html', `${safeName}.rendered.html`), rendered.html, 'utf8');

      await sleep(500);
    }
  });

  // --- Schritt 6: Bildgroessen, Ressourcenfehler, tote Links ---------------
  log('Schritt 6/9  Ressourcen, Bildgroessen, interne Links');
  // Mitschnitte aller Seitenaufrufe zusammenfuehren. Groesster Messwert je Datei gewinnt,
  // damit ein Treffer aus dem Browser-Cache (bytes 0) einen echten Wert nicht ueberschreibt.
  const resources = allResources;
  const bySrc = new Map();
  for (const r of resources) {
    if (!r.url) continue;
    const key = r.url.split('#')[0];
    const prev = bySrc.get(key);
    if (!prev || (r.bytes ?? 0) > (prev.bytes ?? 0)) bySrc.set(key, r);
  }

  for (const p of pages) {
    for (const img of p.images ?? []) {
      const res = bySrc.get(img.src.split('#')[0]);
      img.bytes = res?.bytes ?? null;
      img.mime = res?.mime ?? null;
      img.format = formatFromUrl(img.src, res?.mime);
    }
  }

  // Abgebrochene Medien-Bereichsanfragen sind normal (Video/Audio mit Range-Requests)
  // und duerfen nicht als Serverfehler gezaehlt werden.
  const isRealError = (r) => {
    if (r.status && r.status >= 400) return true;
    if (!r.failed) return false;
    if (/ERR_ABORTED/i.test(r.failed) && (r.status ?? 0) < 400) return false;
    return true;
  };
  const resourceErrors = resources
    .filter(isRealError)
    .map((r) => ({
      url: r.url, status: r.status ?? null, failed: r.failed ?? null,
      type: r.type ?? null, seite: r.seite ?? finalUrl.href,
    }));

  const internalTargets = unique(
    pages.flatMap((p) => (p.links?.internal ?? []).map((l) => l.url))
  ).slice(0, 60);
  const linkCheck = await checkLinks(internalTargets);
  const brokenLinks = linkCheck.filter((l) => l.status === null || l.status >= 400);

  // --- Schritt 7: Mobilmessung auf Unterseiten ----------------------------
  log('Schritt 7/9  Mobilmessung');
  const overflowUrls = pages.slice(0, 6).map((p) => p.url);
  const overflowResults = await withBrowser((browser) => checkOverflow(browser, overflowUrls));

  // --- Schritt 8: TTFB und PageSpeed --------------------------------------
  log('Schritt 8/9  TTFB und PageSpeed Insights');
  const ttfb = await measureTtfb(finalUrl.href);
  const psiMobile = await loadPageSpeed(finalUrl.href, 'mobile');
  const psiDesktop = await loadPageSpeed(finalUrl.href, 'desktop');
  if (!psiMobile.available) errors.push(`PageSpeed mobil nicht verfuegbar: ${psiMobile.reason}`);

  // --- Schritt 9: Rechtstexte, Firmierung, NAP ----------------------------
  log('Schritt 9/9  Impressum, Datenschutz, Firmierung');
  const impressumPage = pages.find((p) => p.rolle === 'impressum');
  const datenschutzPage = pages.find((p) => p.rolle === 'datenschutz');
  const impressum = impressumPage ? extractImpressum(impressumPage) : { found: false };
  const datenschutz = datenschutzPage ? extractDatenschutz(datenschutzPage) : { found: false };
  const companyNames = collectCompanyNames(pages, impressum);

  const nap = [];
  for (const p of pages) {
    const addr = extractAddress(p.text ?? '');
    const phones = extractPhones(p.text ?? '');
    if (addr || phones.length) {
      nap.push({
        source: p.rolle === 'startseite' ? 'startseite' : p.url,
        adresse: addr,
        adresse_norm: addr ? normalizeAddress(addr.raw) : null,
        telefon: phones[0] ?? null,
        telefon_norm: phones[0] ? normalizePhone(phones[0]) : null,
      });
    }
  }
  for (const p of pages) {
    for (const node of p.jsonld ?? []) {
      if (node?.address || node?.telephone) {
        const raw = [node.address?.streetAddress, node.address?.postalCode, node.address?.addressLocality]
          .filter(Boolean).join(' ');
        nap.push({
          source: 'jsonld',
          adresse: raw ? { raw } : null,
          adresse_norm: raw ? normalizeAddress(raw) : null,
          telefon: node.telephone ?? null,
          telefon_norm: node.telephone ? normalizePhone(node.telephone) : null,
        });
      }
    }
  }

  // --- facts.json zusammensetzen ------------------------------------------
  const facts = baseFacts(startUrl, auditDir, options);
  facts.meta.pages_checked = pages.map((p) => ({ url: p.url, rolle: p.rolle, status: p.status }));
  facts.meta.candidates_total = selection.candidates_total;
  facts.meta.skipped_by_robots = selection.skipped_by_robots;
  facts.meta.errors = errors;

  facts.http = {
    reachable: true,
    requested_url: startUrl.href,
    final_url: finalUrl.href,
    status: home.status,
    redirect_chain: home.redirect_chain,
    https: finalUrl.protocol === 'https:',
    hsts: home.hsts,
    http_protocol: browserData.desktop.protocol,
    ttfb_ms: ttfb,
    http_variant: {
      status: httpVariant.ok ? httpVariant.status : null,
      redirect_chain: httpVariant.ok ? httpVariant.redirect_chain : [],
      lands_on_https: httpVariant.ok ? httpVariant.final_url.startsWith('https://') : false,
    },
    other_host: {
      host: otherHost,
      status: otherHostRes.ok ? otherHostRes.status : null,
      final_url: otherHostRes.ok ? otherHostRes.final_url : null,
      redirects_to_primary: otherHostRes.ok
        ? new URL(otherHostRes.final_url).host === finalUrl.host : null,
    },
  };

  facts.tech = detectTech(home.body, home.headers);
  facts.pages = pages;
  facts.resources = {
    total: resources.length,
    errors: resourceErrors,
    hosts: unique(resources.map((r) => { try { return new URL(r.url).host; } catch { return null; } })),
  };
  facts.links = { checked: linkCheck.length, broken: brokenLinks };
  facts.mobile = {
    ...(browserData.mobile.measurements ?? {}),
    overflow_pages: overflowResults.filter((r) => r.overflow_px > 2),
    overflow_checked: overflowResults.length,
  };
  facts.consent = {
    clean: stripRun(browserData.consent.clean),
    reject: stripRun(browserData.consent.reject),
    accept: stripRun(browserData.consent.accept),
    own_host: finalUrl.host,
  };
  facts.impressum = impressum;
  facts.datenschutz = datenschutz;
  facts.company_names = companyNames;
  facts.nap = nap;
  facts.robots_txt = {
    found: robots.found, sitemaps: robots.sitemaps,
    disallow: robots.disallow, ai_crawlers: robots.ai_crawlers,
  };
  facts.sitemap = { found: sitemapUrls.length > 0, source: sitemapSource, entries: sitemapUrls.length };
  facts.llms_txt = { found: llmsTxt.ok && llmsTxt.status === 200 && llmsTxt.body.trim().length > 0 };
  facts.psi = { mobile: psiMobile, desktop: psiDesktop };
  facts.content = {
    concrete_facts: countConcreteFacts(pages.map((p) => p.text ?? '').join(' ')),
    faq: pages.map((p) => ({ url: p.url, ...detectFaq(p) })).filter((f) => f.visible_questions > 0 || f.has_schema),
    jsonld_types: unique(pages.flatMap((p) => p.jsonld_types ?? [])),
  };
  facts.screenshots = {
    desktop_fold: 'screenshots/desktop-fold.png',
    desktop_full: 'screenshots/desktop-full.png',
    mobile_fold: 'screenshots/mobile-fold.png',
    mobile_full: 'screenshots/mobile-full.png',
  };

  await writeFile(path.join(auditDir, 'facts.json'), JSON.stringify(facts, null, 2), 'utf8');
  log(`Fertig. facts.json geschrieben (${pages.length} Seiten, ${errors.length} Hinweise).`);
  return { facts, auditDir };
}

// ---------------------------------------------------------------- Helfer

function baseFacts(startUrl, auditDir, options) {
  return {
    meta: {
      collector_version: COLLECTOR_VERSION,
      scanned_at: new Date().toISOString(),
      user_agent: USER_AGENT,
      lead_id: options.leadId ?? null,
      branche: options.branche ?? null,
      keyword: options.keyword ?? null,
      input_url: startUrl.href,
      audit_dir: auditDir,
      pages_checked: [],
      errors: [],
    },
  };
}

function pickHeaders(headers = {}) {
  const keep = ['server', 'x-powered-by', 'content-type', 'strict-transport-security',
    'x-robots-tag', 'last-modified', 'cache-control'];
  return Object.fromEntries(keep.filter((k) => headers[k]).map((k) => [k, headers[k]]));
}

function stripRun(run = {}) {
  const { mode, reachable, hosts = [], cookies = [], storage = { local: [], session: [] },
    consent_click, banner_detected, error } = run;
  return { mode, reachable, hosts, cookies, storage, consent_click, banner_detected, error: error ?? null };
}

function formatFromUrl(src, mime) {
  if (mime && mime.startsWith('image/')) return mime.replace('image/', '').replace('jpeg', 'jpg');
  const ext = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(src)?.[1]?.toLowerCase();
  return ext === 'jpeg' ? 'jpg' : (ext ?? null);
}

// ---------------------------------------------------------------- Einstieg

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('Aufruf: node collector/scan.mjs <url> [--lead-id L-0001] [--branche dachdecker] [--keyword "..."] [--limit 15]');
    process.exit(1);
  }
  scan(args)
    .then(({ auditDir }) => { console.log(auditDir); })
    .catch((err) => { console.error('Abbruch:', err.stack ?? err.message); process.exit(1); });
}
