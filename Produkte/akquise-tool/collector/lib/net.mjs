// Netzwerk-Schicht des Collectors: HTTP-Abrufe, robots.txt, PageSpeed Insights.
// Alles hier misst nur. Keine Bewertung, keine Schwellwerte.

export const USER_AGENT =
  'Mozilla/5.0 (compatible; 360ai-Akquise-Check/1.0; +https://www.360-ai.org/bot)';

const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Ruft eine URL ab und gibt Statuskette, Header, Body und Zeitmessung zurueck.
 * Weiterleitungen werden bewusst manuell verfolgt, damit die Kette messbar bleibt.
 */
export async function fetchWithMeta(url, { method = 'GET', timeoutMs = DEFAULT_TIMEOUT_MS, maxRedirects = 10 } = {}) {
  const chain = [];
  let current = url;
  let response = null;
  let ttfbMs = null;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();

    try {
      response = await fetch(current, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de-DE,de;q=0.9' },
      });
    } catch (err) {
      clearTimeout(timer);
      return {
        ok: false,
        error: err.name === 'AbortError' ? 'timeout' : err.message,
        requested_url: url,
        final_url: current,
        redirect_chain: chain,
      };
    }
    clearTimeout(timer);

    // fetch loest auf, sobald die Header da sind - das ist unsere TTFB-Naeherung.
    if (hop === 0) ttfbMs = Math.round(performance.now() - started);

    const location = response.headers.get('location');
    const isRedirect = response.status >= 300 && response.status < 400 && location;
    chain.push({ url: current, status: response.status, location: location ?? null });

    if (!isRedirect) break;
    current = new URL(location, current).href;
  }

  const headers = Object.fromEntries(response.headers.entries());
  let body = '';
  let bytes = 0;
  if (method !== 'HEAD') {
    const buf = Buffer.from(await response.arrayBuffer());
    bytes = buf.length;
    body = buf.toString('utf8');
  }

  return {
    ok: true,
    requested_url: url,
    final_url: current,
    status: response.status,
    redirect_chain: chain,
    headers,
    body,
    bytes,
    ttfb_ms: ttfbMs,
    https: current.startsWith('https://'),
    hsts: Boolean(headers['strict-transport-security']),
  };
}

/** TTFB dreimal messen und Median plus Spanne zurueckgeben (TEC-05). */
export async function measureTtfb(url, runs = 3) {
  const values = [];
  for (let i = 0; i < runs; i++) {
    const res = await fetchWithMeta(url, { method: 'GET' });
    if (res.ok && typeof res.ttfb_ms === 'number') values.push(res.ttfb_ms);
    await sleep(400);
  }
  if (values.length === 0) return { median: null, min: null, max: null, runs: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    runs: values.length,
  };
}

/** Prueft eine Liste von URLs per HEAD, bei 405 mit GET nach (TEC-06). */
export async function checkLinks(urls, { concurrency = 2, pauseMs = 500 } = {}) {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const settled = await Promise.all(
      batch.map(async (u) => {
        let res = await fetchWithMeta(u, { method: 'HEAD', timeoutMs: 10000 });
        if (res.ok && res.status === 405) res = await fetchWithMeta(u, { method: 'GET', timeoutMs: 10000 });
        return { url: u, status: res.ok ? res.status : null, error: res.ok ? null : res.error };
      })
    );
    results.push(...settled);
    await sleep(pauseMs);
  }
  return results;
}

/** robots.txt laden, Regeln fuer unseren UA auswerten, Sitemaps und KI-Crawler-Eintraege extrahieren. */
export async function loadRobots(origin) {
  const res = await fetchWithMeta(new URL('/robots.txt', origin).href);
  if (!res.ok || res.status !== 200 || !res.body.trim()) {
    return { found: false, content: '', sitemaps: [], disallow: [], ai_crawlers: {}, allows: () => true };
  }

  const lines = res.body.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const sitemaps = [];
  const groups = [];
  let currentAgents = [];
  let currentRules = [];

  const flush = () => {
    if (currentAgents.length) groups.push({ agents: [...currentAgents], rules: [...currentRules] });
    currentAgents = [];
    currentRules = [];
  };

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.toLowerCase().trim();
    const value = rest.join(':').trim();
    if (key === 'sitemap') sitemaps.push(value);
    else if (key === 'user-agent') {
      if (currentRules.length) flush();
      currentAgents.push(value.toLowerCase());
    } else if (key === 'disallow' || key === 'allow') {
      currentRules.push({ type: key, path: value });
    }
  }
  flush();

  // Gilt fuer uns: exakte UA-Nennung schlaegt den Stern.
  const ourName = '360ai-akquise-check';
  const specific = groups.find((g) => g.agents.some((a) => ourName.includes(a) && a !== '*'));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const active = specific ?? wildcard ?? { rules: [] };

  const allows = (pathname) => {
    let verdict = true;
    let bestLen = -1;
    for (const rule of active.rules) {
      if (!rule.path) continue;
      if (!pathname.startsWith(rule.path)) continue;
      if (rule.path.length > bestLen) {
        bestLen = rule.path.length;
        verdict = rule.type === 'allow';
      }
    }
    return verdict;
  };

  const aiAgents = ['gptbot', 'claudebot', 'anthropic-ai', 'perplexitybot', 'google-extended', 'ccbot', 'bytespider'];
  const ai_crawlers = {};
  for (const agent of aiAgents) {
    const g = groups.find((x) => x.agents.includes(agent));
    ai_crawlers[agent] = g ? (g.rules.some((r) => r.type === 'disallow' && r.path === '/') ? 'blocked' : 'ruled') : 'not_mentioned';
  }

  return {
    found: true,
    content: res.body.slice(0, 4000),
    sitemaps,
    disallow: active.rules.filter((r) => r.type === 'disallow').map((r) => r.path),
    ai_crawlers,
    allows,
  };
}

/** Sitemap laden, auch Sitemap-Index aufloesen. Gibt reine URL-Liste zurueck. */
export async function loadSitemapUrls(sitemapUrl, depth = 0) {
  if (depth > 2) return [];
  const res = await fetchWithMeta(sitemapUrl);
  if (!res.ok || res.status !== 200) return [];

  const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  const isIndex = /<sitemapindex/i.test(res.body);
  if (!isIndex) return locs;

  const nested = [];
  for (const loc of locs.slice(0, 5)) {
    nested.push(...(await loadSitemapUrls(loc, depth + 1)));
  }
  return nested;
}

/**
 * PageSpeed Insights. Ohne API-Key liefert die Funktion available:false,
 * damit die zugehoerigen Regeln UNKNOWN werden statt geraten.
 */
export async function loadPageSpeed(url, strategy = 'mobile') {
  const key = process.env.PSI_API_KEY;
  if (!key) return { available: false, reason: 'kein PSI_API_KEY gesetzt', strategy };

  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', strategy);
  api.searchParams.set('key', key);
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) api.searchParams.append('category', c);

  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(90000) });
    if (!res.ok) return { available: false, reason: `HTTP ${res.status}`, strategy };
    const data = await res.json();
    const cat = data.lighthouseResult?.categories ?? {};
    const audits = data.lighthouseResult?.audits ?? {};
    const pct = (c) => (cat[c]?.score == null ? null : Math.round(cat[c].score * 100));
    return {
      available: true,
      strategy,
      performance: pct('performance'),
      seo: pct('seo'),
      accessibility: pct('accessibility'),
      best_practices: pct('best-practices'),
      lcp_s: audits['largest-contentful-paint']?.numericValue != null
        ? +(audits['largest-contentful-paint'].numericValue / 1000).toFixed(2) : null,
      cls: audits['cumulative-layout-shift']?.numericValue ?? null,
      tbt_ms: audits['total-blocking-time']?.numericValue != null
        ? Math.round(audits['total-blocking-time'].numericValue) : null,
      lighthouse_version: data.lighthouseResult?.lighthouseVersion ?? null,
    };
  } catch (err) {
    return { available: false, reason: err.message, strategy };
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
