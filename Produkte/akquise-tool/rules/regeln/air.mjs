// AIR - Content und AI-Readiness. Achse "air", 15 Punkte.
// Bewusst ohne llms.txt: das laeuft unter EXP mit Gewicht 0, weil es dafuer
// keinen belastbaren Wirkungsnachweis gibt.

import { pass, warn, fail, na, unknown, alleSeiten, pfad, prozent } from './_helfer.mjs';

const typenVon = (knoten) => [String(knoten?.['@type'] ?? '')].flat().join(' ');

export default [
  {
    id: 'AIR-01',
    name: 'ORGANIZATION_SCHEMA',
    gruppe: 'air', achse: 'air', gewicht: 3, kundentext_erlaubt: true,
    messung: 'JSON-LD vom Typ Organization oder LocalBusiness mit Name, Anschrift und Kontakt',
    pruefe(facts) {
      const knoten = alleSeiten(facts).flatMap((p) => p.jsonld ?? []);
      const org = knoten.filter((n) => /Organization|LocalBusiness|Corporation|Store/i.test(typenVon(n)));
      const wert = { gefunden: org.length, typen: [...new Set(knoten.map((n) => typenVon(n)).filter(Boolean))] };
      if (!org.length) {
        return fail('Es sind keine strukturierten Unternehmensdaten hinterlegt; fuer Suchmaschinen und KI-Systeme ist die Seite ein Textblock ohne erkennbare Firmenangaben.', wert);
      }
      const vollstaendig = org.find((n) => n.name && n.address && (n.telephone || n.email));
      if (vollstaendig) return pass('Strukturierte Unternehmensdaten sind mit Name, Anschrift und Kontakt hinterlegt.', wert);
      return warn('Strukturierte Unternehmensdaten sind vorhanden, aber unvollstaendig.', wert);
    },
  },
  {
    id: 'AIR-02',
    name: 'SERVICE_SCHEMA',
    gruppe: 'air', achse: 'air', gewicht: 1, kundentext_erlaubt: true,
    messung: 'JSON-LD vom Typ Service oder Offer',
    pruefe(facts) {
      const seitenMit = alleSeiten(facts).filter((p) => (p.jsonld ?? []).some((n) => /Service|Offer|Product/i.test(typenVon(n))));
      const wert = { seiten_mit_leistungsdaten: seitenMit.length };
      if (!seitenMit.length) return fail('Die einzelnen Leistungen sind nicht als strukturierte Daten hinterlegt.', wert);
      if (seitenMit.length === 1) return warn('Nur auf einer Seite sind Leistungen als strukturierte Daten hinterlegt.', wert);
      return pass(`Auf ${seitenMit.length} Seiten sind Leistungen als strukturierte Daten hinterlegt.`, wert);
    },
  },
  {
    id: 'AIR-03',
    name: 'FAQ_SECTION',
    gruppe: 'air', achse: 'air', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Frage-Antwort-Abschnitt im sichtbaren Inhalt, ergaenzend FAQPage-Schema',
    pruefe(facts) {
      const faq = facts.content?.faq ?? [];
      const sichtbar = faq.reduce((a, f) => a + (f.visible_questions ?? 0), 0);
      const schema = faq.some((f) => f.has_schema);
      const wert = { sichtbare_fragen: sichtbar, schema, beispiele: faq.flatMap((f) => f.samples ?? []).slice(0, 3) };
      if (sichtbar >= 3) return pass(`Es gibt einen Frage-Antwort-Bereich mit ${sichtbar} Fragen.`, wert);
      if (sichtbar >= 1) return warn(`Es sind nur ${sichtbar} Frage-Antwort-Abschnitte vorhanden.`, wert);
      if (schema) return warn('Es ist ein Frage-Antwort-Schema hinterlegt, ohne dass die Fragen sichtbar auf der Seite stehen.', wert);
      return fail('Es gibt keinen Bereich, der typische Kundenfragen beantwortet.', wert);
    },
  },
  {
    id: 'AIR-04',
    name: 'ENTITY_CLARITY',
    gruppe: 'air', achse: 'air', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Firmenname, Taetigkeit und Ort in den ersten 200 Woertern der Startseite',
    pruefe(facts) {
      const start = facts.pages?.[0];
      if (!start?.text) return unknown('Startseite ohne auswertbaren Text');
      const anfang = start.text.split(/\s+/).slice(0, 200).join(' ');

      const firma = facts.impressum?.firmenname ?? facts.company_names?.raw?.[0]?.value ?? null;
      const ort = facts.impressum?.adresse?.ort?.replace(/\s*\(.*\)$/, '') ?? null;
      const branche = facts.meta?.branche ?? null;

      const kern = (s) => (s ?? '').split(/\s+/)[0]?.replace(/[^A-Za-zÄÖÜäöüß]/g, '') ?? '';
      const enthaelt = (s) => s && new RegExp(kern(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(anfang);

      const taetigkeitsWorte = /\b(bauen|bau|montage|reparatur|sanierung|beratung|planung|pflege|service|werkstatt|praxis|restaurant|kanzlei|betrieb|meisterbetrieb|handwerk|installation|wartung|herstellung|fertigung)\w*/i;
      const treffer = {
        firma: Boolean(enthaelt(firma)),
        ort: Boolean(enthaelt(ort)),
        taetigkeit: taetigkeitsWorte.test(anfang) || Boolean(branche && new RegExp(branche.split('_')[0], 'i').test(anfang)),
      };
      const anzahl = Object.values(treffer).filter(Boolean).length;
      const wert = { ...treffer, erkannt: anzahl, geprueft_auf: { firma, ort } };

      if (anzahl === 3) return pass('Aus dem Einstieg der Startseite gehen Unternehmen, Taetigkeit und Ort unmittelbar hervor.', wert);
      if (anzahl === 2) return warn('Aus dem Einstieg der Startseite geht nur zweierlei von Unternehmen, Taetigkeit und Ort hervor.', wert);
      return fail('Aus dem Einstieg der Startseite geht nicht eindeutig hervor, welches Unternehmen was und wo anbietet.', wert);
    },
  },
  {
    id: 'AIR-05',
    name: 'CONCRETE_FACTS',
    gruppe: 'air', achse: 'air', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Belegbare Zahlenangaben mit Einheit oder Normbezug im Fliesstext',
    pruefe(facts) {
      const c = facts.content?.concrete_facts;
      if (!c) return unknown('Inhaltsauswertung fehlt');
      const wert = { anzahl: c.count, beispiele: (c.samples ?? []).slice(0, 6) };
      if (c.count < 3) return fail('Im Text stehen kaum konkrete, belegbare Angaben; KI-Systeme zitieren bevorzugt genau solche Werte.', wert);
      if (c.count < 8) return warn(`Im Text stehen ${c.count} konkrete Angaben.`, wert);
      return pass(`Im Text stehen ${c.count} konkrete, belegbare Angaben.`, wert);
    },
  },
  {
    id: 'AIR-06',
    name: 'TEXT_NOT_IN_IMAGES',
    gruppe: 'air', achse: 'air', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Verhaeltnis von Textmenge zu Bildflaeche als Hinweis auf Text, der nur als Bild vorliegt',
    pruefe(facts) {
      const seiten = alleSeiten(facts).filter((p) => !['impressum', 'datenschutz'].includes(p.rolle));
      if (!seiten.length) return unknown('keine Inhaltsseiten');
      // Seiten mit vielen Bildern und sehr wenig Text sind der Verdachtsfall.
      const verdacht = seiten.filter((p) => (p.images ?? []).length >= 4 && (p.word_count ?? 0) < 80);
      const anteil = prozent(verdacht.length, seiten.length);
      const wert = { verdaechtige_seiten: verdacht.length, geprueft: seiten.length, anteil_prozent: anteil, seiten: verdacht.slice(0, 4).map((p) => pfad(p.url)) };
      if (anteil > 25) return fail(`Auf ${verdacht.length} von ${seiten.length} Seiten stehen viele Bilder, aber kaum auslesbarer Text.`, wert);
      if (anteil > 10) return warn(`Auf ${verdacht.length} Seiten steht wenig auslesbarer Text bei vielen Bildern.`, wert);
      return pass('Die Inhalte liegen als auslesbarer Text vor, nicht als Bild.', wert);
    },
  },
  {
    id: 'AIR-07',
    name: 'CONSISTENT_COMPANY_NAME',
    gruppe: 'air', achse: 'air', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Firmierung in Seitentitel, Fusszeile, Impressum, strukturierten Daten und og:site_name',
    pruefe(facts) {
      const c = facts.company_names;
      if (!c || !c.raw?.length) return unknown('keine Firmierung auslesbar');
      const schreibweisen = c.schreibweisen ?? [];
      const kerne = c.variants?.length ?? 0;
      const konflikte = c.rechtsform_konflikte ?? [];
      const wert = {
        schreibweisen: schreibweisen.length, namenskerne: kerne,
        rechtsform_konflikte: konflikte.length, fundstellen: c.raw.map((r) => ({ quelle: r.source, wert: r.value })),
      };

      if (kerne >= 3 || (kerne >= 2 && konflikte.length >= 1)) {
        return fail(`Das Unternehmen wird auf der eigenen Website in ${schreibweisen.length} unterschiedlichen Schreibweisen genannt; das erschwert Google und KI-Systemen die eindeutige Zuordnung.`, wert);
      }
      if (kerne >= 2 || konflikte.length >= 1) {
        return warn(`Die Firmierung wird nicht einheitlich geschrieben (${schreibweisen.length} Fassungen).`, wert);
      }
      return pass('Die Firmierung ist ueber alle Fundstellen hinweg einheitlich.', wert);
    },
  },
  {
    id: 'AIR-08',
    name: 'CONTENT_FRESHNESS',
    gruppe: 'air', achse: 'air', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Jahresangabe in der Fusszeile und juengstes im Text genanntes Jahr',
    pruefe(facts) {
      const jetzt = new Date().getFullYear();
      const text = alleSeiten(facts).map((p) => p.text ?? '').join(' ');
      const copyright = [...text.matchAll(/(?:©|&copy;|Copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)]
        .map((m) => Number(m[1])).filter((j) => j >= 1995 && j <= jetzt + 1);
      if (!copyright.length) return unknown('keine Jahresangabe gefunden');

      const juengstes = Math.max(...copyright);
      const alter = jetzt - juengstes;
      const wert = { juengstes_jahr: juengstes, alter_jahre: alter };
      if (alter > 3) return fail(`Die Fusszeile weist das Jahr ${juengstes} aus; der Inhaltsstand ist seit ${alter} Jahren unveraendert.`, wert);
      if (alter >= 2) return warn(`Die juengste Jahresangabe auf der Seite ist ${juengstes}.`, wert);
      return pass(`Die Jahresangabe auf der Seite ist mit ${juengstes} aktuell.`, wert);
    },
  },
  {
    id: 'AIR-09',
    name: 'CRAWLABLE_WITHOUT_JS',
    gruppe: 'air', achse: 'air', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Textmenge im ausgelieferten HTML gegenueber der im Browser gerenderten Sicht',
    pruefe(facts) {
      const start = facts.pages?.[0];
      if (!start || start.raw_word_count == null || start.rendered_word_count == null) {
        return unknown('Roh- und gerenderte Sicht nicht vergleichbar');
      }
      if (start.rendered_word_count < 10) return unknown('zu wenig Text fuer einen Vergleich');
      const anteil = prozent(start.raw_word_count, start.rendered_word_count);
      const wert = { roh_woerter: start.raw_word_count, gerendert_woerter: start.rendered_word_count, anteil_prozent: anteil };

      if (anteil < 40) {
        return fail(`Im ausgelieferten Quelltext stehen nur ${anteil} Prozent des sichtbaren Textes; der Inhalt entsteht erst im Browser und ist fuer einfache Auslesevorgaenge unsichtbar.`, wert);
      }
      if (anteil < 70) return warn(`Nur ${anteil} Prozent des sichtbaren Textes stehen bereits im ausgelieferten Quelltext.`, wert);
      return pass(`${anteil} Prozent des sichtbaren Textes stehen bereits im ausgelieferten Quelltext.`, wert);
    },
  },
];
