// Browser-Schicht: gerenderte Sicht, Netzwerkmitschnitt, Consent-Laeufe, Mobilmessung, Screenshots.
// Misst nur. Urteile ueber "guter CTA" o. ae. faellt spaeter die Bewertungsstufe.

import { chromium } from 'playwright';
import { USER_AGENT, sleep } from './net.mjs';

const NAV_TIMEOUT = 30000;
const SETTLE_MS = 2500;

const ACCEPT_PATTERNS = [
  /alle akzeptieren/i, /alle cookies akzeptieren/i, /akzeptieren/i, /zustimmen/i,
  /einverstanden/i, /alle erlauben/i, /accept all/i, /^ok$/i, /verstanden/i,
];
const REJECT_PATTERNS = [
  /alle ablehnen/i, /ablehnen/i, /nur notwendige/i, /nur essenzielle/i, /nur essentielle/i,
  /nur erforderliche/i, /nur technisch notwendige/i, /reject all/i, /decline/i, /weiter ohne/i,
];

export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function newContext(browser, { mobile = false } = {}) {
  return browser.newContext({
    userAgent: USER_AGENT,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    ignoreHTTPSErrors: false,
  });
}

/**
 * Haengt einen CDP-Mitschnitt an die Seite. Liefert Protokollversion, Transfergroessen
 * und Ressourcenfehler - Angaben, die ueber die Playwright-API nicht sauber erreichbar sind.
 */
async function attachNetworkRecorder(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  const byRequestId = new Map();
  const resources = [];
  const hosts = new Set();

  cdp.on('Network.requestWillBeSent', (e) => {
    byRequestId.set(e.requestId, { url: e.request.url, type: e.type ?? null });
    try { hosts.add(new URL(e.request.url).host); } catch { /* data:/blob: ignorieren */ }
  });

  cdp.on('Network.responseReceived', (e) => {
    const entry = byRequestId.get(e.requestId) ?? { url: e.response.url };
    entry.status = e.response.status;
    entry.protocol = e.response.protocol ?? null;
    entry.mime = e.response.mimeType ?? null;
    entry.from_cache = Boolean(e.response.fromDiskCache);
    entry.type = e.type ?? entry.type;
    byRequestId.set(e.requestId, entry);
  });

  cdp.on('Network.loadingFinished', (e) => {
    const entry = byRequestId.get(e.requestId);
    if (!entry) return;
    entry.bytes = e.encodedDataLength ?? null;
    resources.push(entry);
    byRequestId.delete(e.requestId);
  });

  cdp.on('Network.loadingFailed', (e) => {
    const entry = byRequestId.get(e.requestId);
    if (!entry) return;
    entry.failed = e.errorText ?? 'failed';
    resources.push(entry);
    byRequestId.delete(e.requestId);
  });

  return {
    result() {
      // Noch offene Anfragen mitnehmen, sonst fehlen langsame Ressourcen.
      for (const entry of byRequestId.values()) resources.push(entry);
      return { resources, hosts: [...hosts] };
    },
  };
}

async function gotoSettled(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    // Seiten mit Dauerverbindungen erreichen networkidle nie - das ist kein Fehler.
  }
  await sleep(SETTLE_MS);
  return response;
}

/** Sucht einen Consent-Knopf per Textmuster, auch in iframes. */
async function clickConsent(page, patterns) {
  const frames = [page.mainFrame(), ...page.frames()];
  for (const frame of frames) {
    for (const pattern of patterns) {
      const candidates = frame.locator('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], a');
      const count = Math.min(await candidates.count().catch(() => 0), 60);
      for (let i = 0; i < count; i++) {
        const el = candidates.nth(i);
        let text = '';
        try {
          if (!(await el.isVisible({ timeout: 300 }))) continue;
          text = ((await el.textContent({ timeout: 300 })) ?? (await el.getAttribute('value')) ?? '').trim();
        } catch { continue; }
        if (!text || text.length > 60 || !pattern.test(text)) continue;
        try {
          await el.click({ timeout: 3000, noWaitAfter: true });
          await sleep(SETTLE_MS);
          return { clicked: true, label: text, pattern: String(pattern) };
        } catch { /* naechster Kandidat */ }
      }
    }
  }
  return { clicked: false, label: null, pattern: null };
}

async function readStorage(page) {
  return page.evaluate(() => {
    const keys = (s) => { try { return Object.keys(s); } catch { return []; } };
    return { local: keys(localStorage), session: keys(sessionStorage) };
  }).catch(() => ({ local: [], session: [] }));
}

/**
 * Drei getrennte Sitzungen auf derselben URL:
 * clean  = keinerlei Interaktion (Grundlage fuer CMP-06 und CMP-11)
 * reject = Ablehnen geklickt (Grundlage fuer CMP-07)
 * accept = Akzeptieren geklickt (Grundlage fuer CMP-08)
 */
export async function captureConsentRuns(browser, url) {
  const runs = {};

  for (const mode of ['clean', 'reject', 'accept']) {
    const context = await newContext(browser);
    const page = await context.newPage();
    const recorder = await attachNetworkRecorder(context, page);
    const run = { mode, reachable: false, consent_click: { clicked: false, label: null } };

    try {
      await gotoSettled(page, url);
      run.reachable = true;

      if (mode === 'reject') run.consent_click = await clickConsent(page, REJECT_PATTERNS);
      if (mode === 'accept') run.consent_click = await clickConsent(page, ACCEPT_PATTERNS);

      const { hosts, resources } = recorder.result();
      run.hosts = hosts;
      run.cookies = (await context.cookies()).map((c) => ({ name: c.name, domain: c.domain }));
      run.storage = await readStorage(page);
      run.resource_count = resources.length;
      run.banner_detected = await page.evaluate(() => {
        const re = /cookie|consent|datenschutz|privacy/i;
        return [...document.querySelectorAll('div,section,aside,dialog')]
          .some((el) => re.test(el.className + ' ' + el.id) && el.getBoundingClientRect().height > 40);
      }).catch(() => false);
    } catch (err) {
      run.error = err.message.split('\n')[0];
      const { hosts } = recorder.result();
      run.hosts = hosts;
      run.cookies = [];
      run.storage = { local: [], session: [] };
    }

    runs[mode] = run;
    await context.close();
    await sleep(800);
  }

  return runs;
}

/**
 * Hauptlauf Desktop: gerendertes HTML, vollstaendiger Netzwerkmitschnitt, Screenshots.
 * Ohne Consent-Interaktion, damit der Mitschnitt dem clean-Zustand entspricht.
 */
export async function captureDesktop(browser, url, screenshotDir) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const recorder = await attachNetworkRecorder(context, page);
  const out = { url, ok: false };

  try {
    const response = await gotoSettled(page, url);
    out.ok = true;
    out.status = response?.status() ?? null;
    out.rendered_html = await page.content();
    out.title = await page.title();

    const { resources } = recorder.result();
    out.resources = resources;
    out.protocol = resources.find((r) => r.url === url || r.url === url + '/')?.protocol
      ?? resources[0]?.protocol ?? null;

    if (screenshotDir) {
      await page.screenshot({ path: `${screenshotDir}/desktop-fold.png` });
      await page.screenshot({ path: `${screenshotDir}/desktop-full.png`, fullPage: true });
      out.screenshots = { fold: 'desktop-fold.png', full: 'desktop-full.png' };
    }
  } catch (err) {
    out.error = err.message.split('\n')[0];
  }

  await context.close();
  return out;
}

/** Mobillauf bei 375 px: Messwerte fuer die MOB-Regeln plus Screenshots. */
export async function captureMobile(browser, url, screenshotDir) {
  const context = await newContext(browser, { mobile: true });
  const page = await context.newPage();
  const out = { url, ok: false };

  try {
    await gotoSettled(page, url);
    out.ok = true;

    out.measurements = await page.evaluate(() => {
      const vp = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null;

      const doc = document.documentElement;
      const overflow = doc.scrollWidth - doc.clientWidth;

      // Groesster zusammenhaengender Textblock als Referenz fuer die Fliesstextgroesse.
      let biggest = null;
      let biggestLen = 0;
      for (const el of document.querySelectorAll('p, li, div, span')) {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
        if (own.length > biggestLen) { biggestLen = own.length; biggest = el; }
      }
      const bodyStyle = biggest ? getComputedStyle(biggest) : getComputedStyle(document.body);
      const baseFontPx = parseFloat(bodyStyle.fontSize) || null;

      // Kontrast Fliesstext gegen den ersten nicht transparenten Hintergrund darueber.
      const parseRgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      let bg = [255, 255, 255];
      for (let el = biggest; el; el = el.parentElement) {
        const c = parseRgb(getComputedStyle(el).backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) { bg = c; break; }
      }
      const fg = parseRgb(bodyStyle.color);
      const l1 = lum(fg.length >= 3 ? fg : [0, 0, 0]);
      const l2 = lum(bg);
      const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      // Tap-Targets und Handlungsknoepfe im ersten Bildschirm.
      const interactive = [...document.querySelectorAll('a[href], button, input[type="submit"], input[type="button"], [role="button"]')];
      const visible = interactive.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      });
      // Fliesstext-Links sind naturgemaess klein und zaehlen nicht als Schaltflaeche.
      // Ohne diese Ausnahme meldet die Regel auf jeder gut gebauten Seite Fehlalarm.
      const istFliesstextLink = (el) =>
        el.tagName === 'A'
        && getComputedStyle(el).display === 'inline'
        && el.closest('p, li, td, blockquote, figcaption') !== null;
      const schaltflaechen = visible.filter((el) => !istFliesstextLink(el));
      const small = schaltflaechen.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      });
      const firstScreen = visible
        .filter((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= 800; })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().slice(0, 60),
          href: el.getAttribute('href') ?? null,
          is_tel: (el.getAttribute('href') ?? '').startsWith('tel:'),
          is_mail: (el.getAttribute('href') ?? '').startsWith('mailto:'),
        }));

      return {
        viewport_meta: vp,
        user_scalable: vp ? /user-scalable\s*=\s*(no|0)/i.test(vp) === false : null,
        maximum_scale: vp ? (/maximum-scale\s*=\s*([\d.]+)/i.exec(vp)?.[1] ?? null) : null,
        has_width_device_width: vp ? /width\s*=\s*device-width/i.test(vp) : false,
        horizontal_overflow_px: overflow > 2 ? overflow : 0,
        base_font_px: baseFontPx,
        contrast_ratio: Number.isFinite(contrast) ? +contrast.toFixed(2) : null,
        interactive_total: schaltflaechen.length,
        interactive_small: small.length,
        interactive_inline_links: visible.length - schaltflaechen.length,
        first_screen_elements: firstScreen,
      };
    });

    if (screenshotDir) {
      await page.screenshot({ path: `${screenshotDir}/mobile-fold.png` });
      await page.screenshot({ path: `${screenshotDir}/mobile-full.png`, fullPage: true });
      out.screenshots = { fold: 'mobile-fold.png', full: 'mobile-full.png' };
    }
  } catch (err) {
    out.error = err.message.split('\n')[0];
  }

  await context.close();
  return out;
}

/**
 * Gerendertes HTML einer Unterseite samt Netzwerkmitschnitt.
 * Der Mitschnitt ist hier nicht optional: Bildgroessen und Ressourcenfehler
 * (etwa 503 unter Parallellast) treten oft erst auf Unterseiten auf.
 */
export async function renderPage(browser, url) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const recorder = await attachNetworkRecorder(context, page);
  try {
    const response = await gotoSettled(page, url);
    const html = await page.content();
    const { resources } = recorder.result();
    await context.close();
    return { ok: true, url, status: response?.status() ?? null, html, resources };
  } catch (err) {
    const { resources } = recorder.result();
    await context.close();
    return { ok: false, url, error: err.message.split('\n')[0], resources };
  }
}

/** Prueft bei 375 px, ob eine bereits geladene Unterseite horizontal ueberlaeuft (MOB-03). */
export async function checkOverflow(browser, urls) {
  const context = await newContext(browser, { mobile: true });
  const page = await context.newPage();
  const results = [];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await sleep(1200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ url, overflow_px: overflow > 2 ? overflow : 0 });
    } catch (err) {
      results.push({ url, overflow_px: null, error: err.message.split('\n')[0] });
    }
    await sleep(600);
  }
  await context.close();
  return results;
}
