// TEC - Technik. Achse "technik" (zusammen mit MOB), 15 Punkte.

import { pass, warn, fail, na, unknown, inhaltsbilder, pfad, prozent } from './_helfer.mjs';

const kb = (b) => Math.round(b / 1024);

export default [
  {
    id: 'TEC-01',
    name: 'HTTPS_ACTIVE',
    gruppe: 'technik', achse: 'technik', gewicht: 3, kundentext_erlaubt: true,
    messung: 'HTTPS-Aufruf der Startseite, Mixed-Content im Netzwerkmitschnitt',
    pruefe(facts) {
      if (facts.http?.reachable === false) return unknown('Seite nicht erreichbar');
      if (!facts.http?.https) return fail('Die Website wird nicht ueber eine verschluesselte Verbindung ausgeliefert.', { https: false });
      const unsicher = (facts.resources?.hosts ?? []).length && (facts.pages ?? [])
        .some((p) => /(?:src|href)="http:\/\//i.test(p.text ?? ''));
      if (unsicher) return warn('HTTPS ist aktiv, es werden aber einzelne Inhalte unverschluesselt geladen.', { https: true, mixed_content: true });
      return pass('Die Website wird durchgehend verschluesselt ausgeliefert.', { https: true });
    },
  },
  {
    id: 'TEC-02',
    name: 'HTTP_TO_HTTPS_REDIRECT',
    gruppe: 'technik', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Aufruf ueber http:// und Auswertung der Statuskette',
    pruefe(facts) {
      const v = facts.http?.http_variant;
      if (!v) return unknown('Variante ohne Verschluesselung nicht geprueft');
      if (!v.lands_on_https) return fail('Der Aufruf ohne Verschluesselung wird nicht auf die gesicherte Adresse weitergeleitet.', v);
      const ersterStatus = v.redirect_chain?.[0]?.status;
      if (ersterStatus && ersterStatus !== 301) {
        return warn(`Die Weiterleitung auf HTTPS erfolgt mit Status ${ersterStatus} statt mit einer dauerhaften Weiterleitung.`, v);
      }
      return pass('Aufrufe ohne Verschluesselung werden dauerhaft auf HTTPS weitergeleitet.', v);
    },
  },
  {
    id: 'TEC-03',
    name: 'CANONICAL_HOST',
    gruppe: 'technik', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Vergleich von www-Variante und nackter Domain',
    pruefe(facts) {
      const o = facts.http?.other_host;
      if (!o) return unknown('zweite Hostvariante nicht geprueft');
      if (o.status == null) {
        // Antwortet gar nicht: wer die Adresse ohne www eintippt, landet im Nichts.
        // Das ist ein Befund, keine Messluecke.
        return warn(`Die Adressvariante ${o.host} antwortet nicht; wer sie eintippt, erreicht die Website nicht.`, o);
      }
      if (o.redirects_to_primary) return pass('Beide Adressvarianten fuehren auf dieselbe Hauptadresse.', o);
      if (o.status === 200) return fail('Die Website ist unter zwei Adressen gleichzeitig erreichbar, ohne dass eine auf die andere weiterleitet.', o);
      return warn('Die zweite Adressvariante antwortet, leitet aber nicht sauber weiter.', o);
    },
  },
  {
    id: 'TEC-04',
    name: 'HTTP_VERSION',
    gruppe: 'technik', achse: 'technik', gewicht: 1, kundentext_erlaubt: true,
    messung: 'Ausgehandeltes Protokoll der Hauptverbindung',
    pruefe(facts) {
      const proto = facts.http?.http_protocol;
      if (!proto) return unknown('Protokollversion nicht ermittelbar');
      if (/^h2|h3|http\/2|http\/3/i.test(proto)) return pass(`Die Seite wird ueber ${proto} ausgeliefert.`, { protokoll: proto });
      return warn(`Die Seite wird noch ueber ${proto} ausgeliefert; alle Dateien teilen sich wenige parallele Verbindungen.`, { protokoll: proto });
    },
  },
  {
    id: 'TEC-05',
    name: 'TTFB',
    gruppe: 'technik', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Zeit bis zum ersten Byte, Median aus drei Messungen',
    pruefe(facts) {
      const t = facts.http?.ttfb_ms;
      if (!t || t.median == null) return unknown('keine Zeitmessung vorhanden');
      const wert = { median_ms: t.median, spanne_ms: [t.min, t.max], messungen: t.runs };
      if (t.median > 1000) return fail(`Der Server antwortet erst nach ${(t.median / 1000).toFixed(2)} Sekunden.`, wert);
      if (t.median > 500) return warn(`Die erste Serverantwort dauert ${t.median} Millisekunden.`, wert);
      return pass(`Der Server antwortet nach ${t.median} Millisekunden.`, wert);
    },
  },
  {
    id: 'TEC-06',
    name: 'BROKEN_INTERNAL_LINKS',
    gruppe: 'technik', achse: 'technik', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Alle internen Verweise per HEAD geprueft, bei Status 405 mit GET wiederholt',
    pruefe(facts) {
      const l = facts.links;
      if (!l || !l.checked) return unknown('keine Verweise geprueft');
      const kaputt = l.broken ?? [];
      const wert = { geprueft: l.checked, defekt: kaputt.length, ziele: kaputt.slice(0, 5).map((b) => ({ pfad: pfad(b.url), status: b.status })) };
      if (kaputt.length >= 3) return fail(`${kaputt.length} interne Verweise fuehren ins Leere.`, wert, kaputt.slice(0, 5).map((b) => pfad(b.url)));
      if (kaputt.length >= 1) return warn(`${kaputt.length} interner Verweis fuehrt ins Leere.`, wert, kaputt.map((b) => pfad(b.url)));
      return pass(`Alle ${l.checked} geprueften internen Verweise funktionieren.`, wert);
    },
  },
  {
    id: 'TEC-07',
    name: 'RESOURCE_ERRORS_ON_LOAD',
    gruppe: 'technik', achse: 'technik', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Serverfehler auf Unterressourcen waehrend des normalen Seitenaufbaus im Browser',
    pruefe(facts) {
      const fehler = facts.resources?.errors ?? [];
      if (!facts.resources) return unknown('kein Netzwerkmitschnitt vorhanden');
      const wert = {
        anzahl: fehler.length,
        beispiele: fehler.slice(0, 5).map((e) => ({ datei: e.url.split('/').pop(), status: e.status ?? e.failed, seite: pfad(e.seite ?? '') })),
      };
      if (fehler.length >= 2) return fail(`Beim normalen Seitenaufbau liefert der Server ${fehler.length} Dateien fehlerhaft aus.`, wert);
      if (fehler.length === 1) return warn('Beim Seitenaufbau wird eine Datei fehlerhaft ausgeliefert.', wert);
      return pass('Beim Seitenaufbau werden alle Dateien fehlerfrei ausgeliefert.', wert);
    },
  },
  {
    id: 'TEC-08',
    name: 'IMG_MODERN_FORMAT',
    gruppe: 'technik', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Anteil von WebP oder AVIF an allen Inhaltsbildern',
    pruefe(facts) {
      const bilder = inhaltsbilder(facts).filter((b) => b.format);
      if (bilder.length < 3) return na('zu wenige Inhaltsbilder fuer eine Aussage');
      const modern = bilder.filter((b) => ['webp', 'avif'].includes(b.format));
      const anteil = prozent(modern.length, bilder.length);
      const wert = { anteil_prozent: anteil, modern: modern.length, gesamt: bilder.length };
      if (anteil < 30) return fail(`Nur ${anteil} Prozent der Bilder nutzen ein modernes Format; ${bilder.length - modern.length} Bilder liegen in aelteren Formaten vor.`, wert);
      if (anteil < 70) return warn(`${anteil} Prozent der Bilder nutzen ein modernes Format.`, wert);
      return pass(`${anteil} Prozent der Bilder nutzen ein modernes Format.`, wert);
    },
  },
  {
    id: 'TEC-09',
    name: 'IMG_OVERSIZED',
    gruppe: 'technik', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Inhaltsbilder mit einer Uebertragungsgroesse ueber 300 KB',
    pruefe(facts) {
      const bilder = inhaltsbilder(facts).filter((b) => typeof b.bytes === 'number' && b.bytes > 0);
      if (!bilder.length) return unknown('keine Bildgroessen gemessen');
      const gross = bilder.filter((b) => b.bytes > 300 * 1024).sort((a, b) => b.bytes - a.bytes);
      const wert = {
        anzahl: gross.length, geprueft: bilder.length,
        groesste: gross.slice(0, 4).map((b) => ({ datei: b.src.split('/').pop(), kb: kb(b.bytes), format: b.format })),
      };
      if (gross.length >= 4) return fail(`${gross.length} Bilder sind ueberdimensioniert; das groesste ist ${kb(gross[0].bytes)} KB gross.`, wert, gross.slice(0, 4).map((b) => b.src));
      if (gross.length >= 1) return warn(`${gross.length} Bild(er) sind groesser als noetig, das groesste ${kb(gross[0].bytes)} KB.`, wert, gross.map((b) => b.src));
      return pass('Kein Bild ueberschreitet 300 KB.', wert);
    },
  },
  {
    id: 'TEC-10',
    name: 'IMG_PHOTO_AS_PNG',
    gruppe: 'technik', achse: 'technik', gewicht: 1, kundentext_erlaubt: true,
    messung: 'Fotos im PNG-Format ueber 200 KB (Logos und Grafiken ausgenommen)',
    pruefe(facts) {
      const bilder = inhaltsbilder(facts).filter((b) => typeof b.bytes === 'number' && b.bytes > 0);
      if (!bilder.length) return unknown('keine Bildgroessen gemessen');
      const pngFotos = bilder.filter((b) => b.format === 'png' && b.bytes > 200 * 1024);
      const wert = { anzahl: pngFotos.length, dateien: pngFotos.slice(0, 3).map((b) => ({ datei: b.src.split('/').pop(), kb: kb(b.bytes) })) };
      if (pngFotos.length >= 2) return fail(`${pngFotos.length} Fotos liegen im PNG-Format vor und sind dadurch um ein Vielfaches groesser als noetig.`, wert);
      if (pngFotos.length === 1) return warn(`Ein Foto liegt als PNG mit ${kb(pngFotos[0].bytes)} KB vor.`, wert);
      return pass('Es werden keine Fotos im PNG-Format ausgeliefert.', wert);
    },
  },
  {
    id: 'TEC-11',
    name: 'HTML_SIZE',
    gruppe: 'technik', achse: 'technik', gewicht: 1, kundentext_erlaubt: false,
    messung: 'Groesse des HTML-Dokuments der Startseite',
    pruefe(facts) {
      const bytes = facts.pages?.[0]?.raw_html_bytes;
      if (!bytes) return unknown('HTML-Groesse nicht gemessen');
      const wert = { kb: kb(bytes) };
      if (bytes > 250 * 1024) return fail(`Das HTML-Dokument der Startseite ist ${kb(bytes)} KB gross.`, wert);
      if (bytes > 150 * 1024) return warn(`Das HTML-Dokument der Startseite ist ${kb(bytes)} KB gross.`, wert);
      return pass(`Das HTML-Dokument der Startseite ist ${kb(bytes)} KB gross.`, wert);
    },
  },
  {
    id: 'TEC-12',
    name: 'PSI_PERFORMANCE_MOBILE',
    gruppe: 'technik', achse: 'technik', gewicht: 3, kundentext_erlaubt: true,
    messung: 'PageSpeed Insights, Strategie mobil, Kategorie Performance',
    pruefe(facts) {
      const psi = facts.psi?.mobile;
      if (!psi?.available) return unknown(`PageSpeed nicht verfuegbar: ${psi?.reason ?? 'unbekannt'}`);
      const v = psi.performance;
      if (v == null) return unknown('kein Performance-Wert geliefert');
      const wert = { wert: v, hinweis: 'Messwert schwankt zwischen Laeufen, als Naeherung lesen' };
      if (v < 50) return fail(`Der Geschwindigkeitswert der Mobilansicht liegt bei ${v} von 100.`, wert);
      if (v < 70) return warn(`Der Geschwindigkeitswert der Mobilansicht liegt bei ${v} von 100.`, wert);
      return pass(`Der Geschwindigkeitswert der Mobilansicht liegt bei ${v} von 100.`, wert);
    },
  },
  {
    id: 'TEC-13',
    name: 'LCP_MOBILE',
    gruppe: 'technik', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Groesstes Inhaltselement bis zur Anzeige, PageSpeed mobil',
    pruefe(facts) {
      const s = facts.psi?.mobile;
      if (!s?.available || s.lcp_s == null) return unknown('kein Messwert vorhanden');
      const wert = { sekunden: s.lcp_s };
      if (s.lcp_s > 4) return fail(`Der Hauptinhalt erscheint auf dem Handy erst nach ${s.lcp_s} Sekunden.`, wert);
      if (s.lcp_s > 2.5) return warn(`Der Hauptinhalt erscheint auf dem Handy nach ${s.lcp_s} Sekunden.`, wert);
      return pass(`Der Hauptinhalt erscheint auf dem Handy nach ${s.lcp_s} Sekunden.`, wert);
    },
  },
  {
    id: 'TEC-14',
    name: 'CLS',
    gruppe: 'technik', achse: 'technik', gewicht: 1, kundentext_erlaubt: true,
    messung: 'Verschiebung des Layouts waehrend des Ladens, PageSpeed mobil',
    pruefe(facts) {
      const s = facts.psi?.mobile;
      if (!s?.available || s.cls == null) return unknown('kein Messwert vorhanden');
      const v = Number(s.cls.toFixed(3));
      const wert = { cls: v };
      if (v > 0.25) return fail(`Das Layout verschiebt sich waehrend des Ladens deutlich (Wert ${v}).`, wert);
      if (v > 0.1) return warn(`Das Layout verschiebt sich waehrend des Ladens spuerbar (Wert ${v}).`, wert);
      return pass(`Das Layout bleibt beim Laden stabil (Wert ${v}).`, wert);
    },
  },
  {
    id: 'TEC-15',
    name: 'CMS_VERSION_CURRENT',
    gruppe: 'technik', achse: 'technik', gewicht: 1,
    // Bewusst nicht fuer den Kundentext: In einer Erstansprache ist der Hinweis auf
    // eine veraltete Softwareversion ein Sicherheitshinweis an einen Fremden.
    kundentext_erlaubt: false,
    messung: 'Versionsangabe aus generator-Meta, Theme-Pfaden und Versionsparametern',
    pruefe(facts) {
      const t = facts.tech ?? {};
      // Statisch erzeugte Seiten haben kein Redaktionssystem, das veralten koennte.
      if (!t.cms && !t.generator) return na('kein Redaktionssystem im Einsatz');
      const version = t.theme_version ?? t.cms_version;
      if (!version) return unknown('keine belastbare Versionsangabe gefunden');
      const jahr = VERSIONS_JAHR[`${t.theme ?? t.cms}-${version.split('.').slice(0, 2).join('.')}`];
      const wert = { cms: t.cms, theme: t.theme, version, veroeffentlicht: jahr ?? null };
      if (!jahr) return warn(`Im Einsatz ist ${t.theme ?? t.cms} ${version}; das Erscheinungsjahr ist nicht hinterlegt.`, wert);
      const alter = new Date().getFullYear() - jahr;
      if (alter >= 2) return fail(`Im Einsatz ist ${t.theme ?? t.cms} ${version} aus dem Jahr ${jahr}.`, wert);
      if (alter >= 1) return warn(`Im Einsatz ist ${t.theme ?? t.cms} ${version} aus dem Jahr ${jahr}.`, wert);
      return pass(`Im Einsatz ist eine aktuelle Fassung von ${t.theme ?? t.cms} (${version}).`, wert);
    },
  },
];

// Erscheinungsjahre gaengiger Versionen. Bewusst klein gehalten und erweiterbar -
// eine unbekannte Version fuehrt zu WARN, nie zu einer erfundenen Altersangabe.
const VERSIONS_JAHR = {
  'Divi-4.9': 2021, 'Divi-4.14': 2022, 'Divi-4.17': 2022, 'Divi-4.20': 2023,
  'Divi-4.23': 2023, 'Divi-4.27': 2024, 'Divi-5.0': 2025,
  'WordPress-5.8': 2021, 'WordPress-6.0': 2022, 'WordPress-6.4': 2023,
  'WordPress-6.6': 2024, 'WordPress-6.8': 2025,
};
