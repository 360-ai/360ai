// SEO. Achse "seo", 20 Punkte.

import { pass, warn, fail, na, unknown, alleSeiten, pfad, prozent } from './_helfer.mjs';

const GENERISCHE_URL = /\/\d+-\d+\/?$|[?&](p|page_id|id)=\d+|\/index\.php/i;

export default [
  {
    id: 'SEO-01',
    name: 'TITLE_PRESENT',
    gruppe: 'seo', achse: 'seo', gewicht: 3, kundentext_erlaubt: true,
    messung: 'title-Element je gepruefter Seite, Laenge 30 bis 65 Zeichen',
    pruefe(facts) {
      const seiten = alleSeiten(facts);
      if (!seiten.length) return unknown('keine Seiten auswertbar');
      const ohne = seiten.filter((p) => !p.title);
      const schlecht = seiten.filter((p) => p.title && (p.title.length < 30 || p.title.length > 65));
      const wert = { ohne_titel: ohne.length, ausserhalb_laenge: schlecht.length, geprueft: seiten.length };
      if (ohne.length) return fail(`${ohne.length} von ${seiten.length} Seiten haben keinen Seitentitel.`, wert, ohne.map((p) => pfad(p.url)));
      if (schlecht.length > seiten.length / 2) return warn(`Die Seitentitel liegen ueberwiegend ausserhalb der empfohlenen Laenge.`, wert);
      return pass('Alle geprueften Seiten haben einen Seitentitel in sinnvoller Laenge.', wert);
    },
  },
  {
    id: 'SEO-02',
    name: 'TITLE_UNIQUE',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Vergleich aller Seitentitel auf Dubletten',
    pruefe(facts) {
      const titel = alleSeiten(facts).map((p) => p.title).filter(Boolean);
      if (titel.length < 2) return na('zu wenige Seiten fuer einen Vergleich');
      const zaehler = new Map();
      for (const t of titel) zaehler.set(t, (zaehler.get(t) ?? 0) + 1);
      const dubletten = [...zaehler.values()].filter((n) => n > 1).reduce((a, n) => a + n - 1, 0);
      const wert = { dubletten, geprueft: titel.length };
      if (dubletten >= 3) return fail(`${dubletten} Seiten teilen sich einen Titel mit einer anderen Seite.`, wert);
      if (dubletten >= 1) return warn(`${dubletten} Seitentitel kommen mehrfach vor.`, wert);
      return pass('Jede Seite hat einen eigenen Titel.', wert);
    },
  },
  {
    id: 'SEO-03',
    name: 'META_DESCRIPTION_PRESENT',
    gruppe: 'seo', achse: 'seo', gewicht: 3, kundentext_erlaubt: true,
    messung: 'meta[name=description] je Seite, Laenge 70 bis 160 Zeichen',
    pruefe(facts) {
      const seiten = alleSeiten(facts);
      if (!seiten.length) return unknown('keine Seiten auswertbar');
      const ohne = seiten.filter((p) => !p.meta_description);
      const anteil = prozent(ohne.length, seiten.length);
      const wert = { ohne_beschreibung: ohne.length, geprueft: seiten.length, anteil_prozent: anteil };
      if (anteil >= 50) {
        return fail(`Auf ${ohne.length} von ${seiten.length} Seiten fehlt der Vorschautext fuer Suchergebnisse; Google setzt den Text dann selbst zusammen.`,
          wert, ohne.slice(0, 6).map((p) => pfad(p.url)));
      }
      if (ohne.length) return warn(`Auf ${ohne.length} von ${seiten.length} Seiten fehlt der Vorschautext.`, wert, ohne.map((p) => pfad(p.url)));
      const schlecht = seiten.filter((p) => p.meta_description.length < 70 || p.meta_description.length > 160);
      if (schlecht.length > seiten.length / 2) return warn('Die Vorschautexte liegen ueberwiegend ausserhalb der empfohlenen Laenge.', wert);
      return pass('Alle geprueften Seiten haben einen Vorschautext.', wert);
    },
  },
  {
    id: 'SEO-04',
    name: 'H1_PRESENT',
    gruppe: 'seo', achse: 'seo', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Genau eine Hauptueberschrift je Seite',
    pruefe(facts) {
      const seiten = alleSeiten(facts);
      if (!seiten.length) return unknown('keine Seiten auswertbar');
      const ohne = seiten.filter((p) => (p.h1 ?? []).length === 0);
      const mehrere = seiten.filter((p) => (p.h1 ?? []).length > 1);
      const wert = { ohne_h1: ohne.length, mehrere_h1: mehrere.length, geprueft: seiten.length };
      if (ohne.length) return fail(`${ohne.length} von ${seiten.length} Seiten haben keine Hauptueberschrift.`, wert, ohne.map((p) => pfad(p.url)));
      if (mehrere.length) return warn(`${mehrere.length} Seiten haben mehr als eine Hauptueberschrift.`, wert, mehrere.map((p) => pfad(p.url)));
      return pass('Jede gepruefte Seite hat genau eine Hauptueberschrift.', wert);
    },
  },
  {
    id: 'SEO-05',
    name: 'HEADING_HIERARCHY',
    gruppe: 'seo', achse: 'seo', gewicht: 1, kundentext_erlaubt: false,
    messung: 'Ebenenspruenge in der Ueberschriftenfolge je Seite',
    pruefe(facts) {
      const seiten = alleSeiten(facts);
      if (!seiten.length) return unknown('keine Seiten auswertbar');
      let spruenge = 0;
      for (const p of seiten) {
        const ebenen = (p.headings ?? []).map((h) => h.level);
        for (let i = 1; i < ebenen.length; i++) if (ebenen[i] - ebenen[i - 1] > 1) spruenge++;
      }
      const wert = { spruenge, geprueft: seiten.length };
      if (spruenge >= 3) return fail(`Die Ueberschriftenfolge springt an ${spruenge} Stellen ueber eine Ebene.`, wert);
      if (spruenge >= 1) return warn(`Die Ueberschriftenfolge springt an ${spruenge} Stelle(n) ueber eine Ebene.`, wert);
      return pass('Die Ueberschriftenfolge ist durchgehend logisch aufgebaut.', wert);
    },
  },
  {
    id: 'SEO-06',
    name: 'CANONICAL_PRESENT',
    gruppe: 'seo', achse: 'seo', gewicht: 1, kundentext_erlaubt: false,
    messung: 'Selbstreferenzierender Canonical je Seite',
    pruefe(facts) {
      const seiten = alleSeiten(facts).filter((p) => !p.hash_route);
      if (!seiten.length) return unknown('keine Seiten auswertbar');
      const ohne = seiten.filter((p) => !p.canonical);
      const wert = { ohne_canonical: ohne.length, geprueft: seiten.length };
      if (ohne.length === seiten.length) return fail('Auf keiner Seite ist eine bevorzugte Adresse hinterlegt.', wert);
      if (ohne.length) return warn(`Auf ${ohne.length} Seiten fehlt die Angabe der bevorzugten Adresse.`, wert);
      return pass('Alle Seiten benennen ihre bevorzugte Adresse.', wert);
    },
  },
  {
    id: 'SEO-07',
    name: 'INDEXABLE',
    gruppe: 'seo', achse: 'seo', gewicht: 3, kundentext_erlaubt: true,
    messung: 'meta robots, X-Robots-Tag und robots.txt der Hauptseiten',
    pruefe(facts) {
      const seiten = alleSeiten(facts);
      if (!seiten.length) return unknown('keine Seiten auswertbar');
      const gesperrt = seiten.filter((p) =>
        /noindex/i.test(p.meta_robots ?? '') || /noindex/i.test(p.x_robots_tag ?? ''));
      const alleGesperrt = (facts.robots_txt?.disallow ?? []).includes('/');
      const wert = { gesperrte_seiten: gesperrt.length, geprueft: seiten.length, robots_txt_sperrt_alles: alleGesperrt };

      if (alleGesperrt) return fail('Die robots.txt sperrt die gesamte Website fuer Suchmaschinen.', wert);
      const hauptGesperrt = gesperrt.some((p) => ['startseite', 'leistungen', 'kontakt'].includes(p.rolle));
      if (hauptGesperrt) return fail('Zentrale Seiten sind fuer Suchmaschinen gesperrt.', wert, gesperrt.map((p) => pfad(p.url)));
      if (gesperrt.length) return warn(`${gesperrt.length} Unterseiten sind fuer Suchmaschinen gesperrt.`, wert, gesperrt.map((p) => pfad(p.url)));
      return pass('Alle geprueften Seiten sind fuer Suchmaschinen zugaenglich.', wert);
    },
  },
  {
    id: 'SEO-08',
    name: 'SITEMAP_PRESENT',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'sitemap.xml, wp-sitemap.xml oder Verweis in der robots.txt',
    pruefe(facts) {
      const s = facts.sitemap;
      if (!s) return unknown('Sitemap nicht geprueft');
      const wert = { gefunden: s.found, quelle: s.source, eintraege: s.entries };
      if (!s.found) return fail('Es ist keine Sitemap hinterlegt, ueber die Suchmaschinen alle Seiten finden koennen.', wert);
      if (s.entries < 3) return warn(`Die Sitemap enthaelt nur ${s.entries} Eintraege.`, wert);
      return pass(`Eine Sitemap mit ${s.entries} Eintraegen ist hinterlegt.`, wert);
    },
  },
  {
    id: 'SEO-09',
    name: 'ROBOTS_TXT_PRESENT',
    gruppe: 'seo', achse: 'seo', gewicht: 1, kundentext_erlaubt: false,
    messung: 'Abruf von /robots.txt',
    pruefe(facts) {
      const r = facts.robots_txt;
      if (!r) return unknown('robots.txt nicht geprueft');
      if (!r.found) return fail('Es ist keine robots.txt vorhanden.', { gefunden: false });
      if (!r.content?.trim()) return warn('Die robots.txt ist vorhanden, aber leer.', { gefunden: true, leer: true });
      return pass('Eine robots.txt ist vorhanden.', { gefunden: true, sitemaps: r.sitemaps?.length ?? 0 });
    },
  },
  {
    id: 'SEO-10',
    name: 'URL_SPEAKING',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Pfadmuster wie /324-2/, ?p=12 oder /index.php?id=',
    pruefe(facts) {
      const seiten = alleSeiten(facts).filter((p) => p.rolle !== 'startseite' && !p.hash_route);
      if (!seiten.length) return na('keine Unterseiten zur Pruefung');
      const generisch = seiten.filter((p) => GENERISCHE_URL.test(p.url));
      const wert = { generisch: generisch.length, geprueft: seiten.length, beispiele: generisch.slice(0, 5).map((p) => pfad(p.url)) };
      if (generisch.length >= 3) return fail(`${generisch.length} Seiten haben automatisch vergebene Adressen wie ${pfad(generisch[0].url)} statt sprechender Namen.`, wert, wert.beispiele);
      if (generisch.length >= 1) return warn(`${generisch.length} Seite(n) haben automatisch vergebene Adressen.`, wert, wert.beispiele);
      return pass('Alle Unterseiten haben sprechende Adressen.', wert);
    },
  },
  {
    id: 'SEO-11',
    name: 'ALT_TEXT_COVERAGE',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Anteil der Inhaltsbilder mit aussagekraeftigem Alternativtext (Dateinamen und Platzhalter zaehlen als fehlend)',
    pruefe(facts) {
      const bilder = alleSeiten(facts).flatMap((p) => p.images ?? []).filter((i) => !i.decorative);
      if (bilder.length < 3) return na('zu wenige Bilder fuer eine Aussage');
      const mit = bilder.filter((i) => i.alt_meaningful);
      const anteil = prozent(mit.length, bilder.length);
      const wert = { anteil_prozent: anteil, mit_alt: mit.length, gesamt: bilder.length };
      if (anteil < 50) return fail(`${bilder.length - mit.length} von ${bilder.length} Bildern haben keinen aussagekraeftigen Alternativtext.`, wert);
      if (anteil < 80) return warn(`${bilder.length - mit.length} von ${bilder.length} Bildern haben keinen aussagekraeftigen Alternativtext.`, wert);
      return pass(`${anteil} Prozent der Bilder haben einen aussagekraeftigen Alternativtext.`, wert);
    },
  },
  {
    id: 'SEO-12',
    name: 'OG_TAGS',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'og:title, og:description und og:image der Startseite',
    pruefe(facts) {
      const og = facts.pages?.[0]?.og;
      if (!og) return unknown('Startseite nicht auswertbar');
      const noetig = ['og:title', 'og:description', 'og:image'];
      const fehlend = noetig.filter((k) => !og[k]);
      const wert = { fehlend, vorhanden: noetig.filter((k) => og[k]) };
      if (fehlend.length === noetig.length) {
        return fail('Beim Teilen ueber WhatsApp oder soziale Netzwerke erscheinen weder Vorschaubild noch Titel, weil die entsprechenden Angaben fehlen.', wert);
      }
      if (fehlend.length) return warn(`Fuer die Vorschau beim Teilen fehlen: ${fehlend.join(', ')}.`, wert);
      return pass('Die Angaben fuer die Vorschau beim Teilen sind vollstaendig.', wert);
    },
  },
  {
    id: 'SEO-13',
    name: 'CONTENT_DEPTH',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Median der Wortzahl auf Leistungsseiten',
    pruefe(facts, ctx) {
      const seiten = ctx.seiten_mit('leistungen').filter((p) => !p.error);
      if (!seiten.length) return na('keine Leistungsseite erkannt');
      const zahlen = seiten.map((p) => p.rendered_word_count ?? p.word_count ?? 0).sort((a, b) => a - b);
      const median = zahlen[Math.floor(zahlen.length / 2)];
      const wert = { median_woerter: median, seiten: seiten.length };
      if (median < 150) return fail(`Die Leistungsseiten enthalten im Mittel nur ${median} Woerter.`, wert, seiten.map((p) => pfad(p.url)));
      if (median < 300) return warn(`Die Leistungsseiten enthalten im Mittel ${median} Woerter.`, wert);
      return pass(`Die Leistungsseiten enthalten im Mittel ${median} Woerter.`, wert);
    },
  },
  {
    id: 'SEO-14',
    name: 'SERVICE_PAGES_SPLIT',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Anzahl eigenstaendiger Leistungsseiten gegenueber einer Sammelseite',
    pruefe(facts, ctx) {
      const seiten = ctx.seiten_mit('leistungen').filter((p) => !p.error);
      const wert = { leistungsseiten: seiten.length };
      if (seiten.length === 0) return fail('Es gibt keine eigene Seite fuer die angebotenen Leistungen.', wert);
      if (seiten.length === 1) return fail('Alle Leistungen stehen auf einer einzigen Sammelseite; einzelne Leistungen haben keine eigene Seite.', wert, [pfad(seiten[0].url)]);
      if (seiten.length === 2) return warn('Es gibt erst zwei Leistungsseiten.', wert);
      return pass(`Die Leistungen sind auf ${seiten.length} eigene Seiten verteilt.`, wert);
    },
  },
  {
    id: 'SEO-15',
    name: 'INTERNAL_LINKING',
    gruppe: 'seo', achse: 'seo', gewicht: 1, kundentext_erlaubt: false,
    messung: 'Verweise von der Startseite auf die erkannten Leistungsseiten',
    pruefe(facts, ctx) {
      const leistungen = ctx.seiten_mit('leistungen').map((p) => p.url);
      if (!leistungen.length) return na('keine Leistungsseite erkannt');
      const startLinks = new Set((facts.pages?.[0]?.links?.internal ?? []).map((l) => l.url.replace(/\/$/, '')));
      const verlinkt = leistungen.filter((u) => startLinks.has(u.replace(/\/$/, '')));
      const wert = { verlinkt: verlinkt.length, gesamt: leistungen.length };
      if (!verlinkt.length) return fail('Von der Startseite fuehrt kein Verweis zu den Leistungsseiten.', wert);
      if (verlinkt.length < leistungen.length) return warn(`Nur ${verlinkt.length} von ${leistungen.length} Leistungsseiten sind von der Startseite verlinkt.`, wert);
      return pass('Alle Leistungsseiten sind von der Startseite aus erreichbar.', wert);
    },
  },
  {
    id: 'SEO-16',
    name: 'KEYWORD_IN_TITLE_H1',
    gruppe: 'seo', achse: 'seo', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Im Lead hinterlegtes Suchwort in Seitentitel oder Hauptueberschrift der Startseite',
    pruefe(facts) {
      const keyword = facts.meta?.keyword;
      if (!keyword) return na('kein Suchwort im Lead hinterlegt');
      const start = facts.pages?.[0];
      if (!start) return unknown('Startseite fehlt');

      const woerter = keyword.split(/\s+/).filter((w) => w.length > 3);
      if (!woerter.length) return na('Suchwort zu kurz fuer eine Pruefung');
      const treffer = (text) => woerter.filter((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text ?? '')).length;

      const imTitle = treffer(start.title);
      const inH1 = treffer((start.h1 ?? []).join(' '));
      const imText = treffer(start.text);
      const wert = { keyword, woerter: woerter.length, im_title: imTitle, in_h1: inH1, im_text: imText };

      if (imTitle === woerter.length || inH1 === woerter.length) {
        return pass(`Das Suchwort "${keyword}" steht vollstaendig in Titel oder Hauptueberschrift.`, wert);
      }
      if (imText >= woerter.length) return warn(`Das Suchwort "${keyword}" kommt nur im Fliesstext vor, nicht in Titel oder Ueberschrift.`, wert);
      return fail(`Das Suchwort "${keyword}" kommt weder in Titel noch in Hauptueberschrift der Startseite vor.`, wert);
    },
  },
];
