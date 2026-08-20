// TRU - Vertrauenssignale. Bestimmt 5 der 10 Punkte der Achse "vertrauen";
// die andere Haelfte liefert die Vision-Bewertung.

import { pass, warn, fail, na, unknown, alleSeiten, pfad } from './_helfer.mjs';

const BESTANDSFOTO = /(shutterstock|istock|adobestock|adobe-stock|pexels|unsplash|gettyimages|depositphotos|fotolia|pixabay|freepik)/i;
const FUNKTIONSWORT = /\b(Geschäftsführer|Inhaber|Meister|Leitung|Leiter|Bauleitung|Prokurist|Kaufm|Techniker|Berater|Verkauf|Werkstattleiter|Ausbilder|Mitarbeiter|Praxis|Arzt|Aerztin|Ärztin|Therapeut|Küchenchef|Koch)\w*/i;

export default [
  {
    id: 'TRU-01',
    name: 'NAMED_CONTACT_PERSON',
    gruppe: 'trust', achse: 'vertrauen', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Personenname mit Funktion auf Kontakt- oder Ueber-uns-Seite; das Impressum allein zaehlt nicht',
    pruefe(facts, ctx) {
      const seiten = [ctx.seite('kontakt'), ctx.seite('ueber_uns')].filter(Boolean);
      const text = seiten.map((p) => p.text ?? '').join(' ');
      const mitFunktion = FUNKTIONSWORT.test(text) && /\b[A-ZÄÖÜ][a-zäöüß]{2,}\s+[A-ZÄÖÜ][a-zäöüß]{2,}\b/.test(text);
      const wert = { seiten: seiten.map((p) => pfad(p.url)), im_impressum: Boolean(facts.impressum?.vertretung) };

      if (mitFunktion) return pass('Auf Kontakt- oder Ueber-uns-Seite werden Ansprechpartner namentlich mit Funktion genannt.', wert);
      if (facts.impressum?.vertretung) {
        return warn('Ein Ansprechpartner ist nur im Impressum genannt; das ist eine Pflichtangabe, kein Vertrauenssignal auf der Seite.', { ...wert, name: facts.impressum.vertretung });
      }
      return fail('Es wird kein Ansprechpartner namentlich genannt.', wert);
    },
  },
  {
    id: 'TRU-02',
    name: 'TEAM_PAGE',
    gruppe: 'trust', achse: 'vertrauen', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Teamdarstellung mit Namen und Funktionen',
    pruefe(facts, ctx) {
      const seite = ctx.seite('ueber_uns') ?? ctx.seite('kontakt');
      const text = (seite?.text ?? '') + ' ' + (facts.pages?.[0]?.text ?? '');
      const namen = [...text.matchAll(/\b[A-ZÄÖÜ][a-zäöüß]{2,}\s+[A-ZÄÖÜ][a-zäöüß]{2,}\b/g)].length;
      const funktionen = [...text.matchAll(new RegExp(FUNKTIONSWORT.source, 'gi'))].length;
      const wert = { namen_erkannt: namen, funktionsangaben: funktionen, seite: seite ? pfad(seite.url) : null };

      if (namen >= 3 && funktionen >= 2) return pass('Das Team wird mit Namen und Funktionen vorgestellt.', wert);
      if (namen >= 3) return warn('Es werden Personen genannt, aber ohne erkennbare Funktionsangabe.', wert);
      return fail('Es gibt keine Teamdarstellung; hinter dem Unternehmen bleiben die Menschen unsichtbar.', wert);
    },
  },
  {
    id: 'TRU-03',
    name: 'REFERENCES_NAMED',
    gruppe: 'trust', achse: 'vertrauen', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Referenzseite mit benannten Auftraggebern oder zugeordneten Logos',
    pruefe(facts, ctx) {
      const seiten = ctx.seiten_mit('referenzen').filter((p) => !p.error);
      if (!seiten.length) return fail('Es gibt keine Referenzen oder Projektbeispiele.', { referenzseiten: 0 });

      const bilder = seiten.flatMap((p) => p.images ?? []);
      const mitAlt = bilder.filter((b) => b.alt_meaningful);
      const woerter = seiten.reduce((a, p) => a + (p.word_count ?? 0), 0);
      const wert = { referenzseiten: seiten.length, logos: bilder.length, logos_beschriftet: mitAlt.length, woerter };

      if (mitAlt.length >= 3 || woerter >= 150) return pass('Referenzen sind mit benannten Auftraggebern belegt.', wert, seiten.map((p) => pfad(p.url)));
      if (bilder.length >= 3) return warn('Es werden Referenzlogos gezeigt, aber ohne erkennbare Zuordnung.', wert, seiten.map((p) => pfad(p.url)));
      return warn('Die Referenzseite enthaelt kaum belastbare Angaben.', wert, seiten.map((p) => pfad(p.url)));
    },
  },
  {
    id: 'TRU-04',
    name: 'TESTIMONIALS',
    gruppe: 'trust', achse: 'vertrauen', gewicht: 1, kundentext_erlaubt: true,
    messung: 'Kundenstimmen mit Name oder Ort, ergaenzend Review-Schema',
    pruefe(facts, ctx) {
      if (ctx.branche?.testimonials_unueblich) return na('Kundenstimmen sind in dieser Branche unueblich oder berufsrechtlich heikel');

      const text = alleSeiten(facts).map((p) => p.text ?? '').join(' ');
      const schema = alleSeiten(facts).some((p) => (p.jsonld ?? []).some((n) => /Review|AggregateRating|Rating/i.test(String(n?.['@type'] ?? '')) || n?.aggregateRating));
      const zitate = [...text.matchAll(/[„"»][^"“«]{40,400}[“"«]/g)].length;
      const wert = { zitate, schema };

      if (zitate >= 2 || schema) return pass('Es werden Kundenstimmen oder Bewertungen gezeigt.', wert);
      if (zitate === 1) return warn('Es gibt nur eine einzelne Kundenstimme.', wert);
      return fail('Es werden keine Kundenstimmen oder Bewertungen gezeigt.', wert);
    },
  },
  {
    id: 'TRU-05',
    name: 'REAL_PHOTOS',
    gruppe: 'trust', achse: 'vertrauen', gewicht: 1,
    // Verdacht, keine Feststellung - deshalb nie im Kundentext.
    kundentext_erlaubt: false,
    messung: 'Dateinamensmuster und Auslieferung von bekannten Bilddiensten',
    pruefe(facts) {
      const bilder = alleSeiten(facts).flatMap((p) => p.images ?? []);
      if (bilder.length < 3) return na('zu wenige Bilder fuer eine Aussage');
      const verdacht = bilder.filter((b) => BESTANDSFOTO.test(b.src));
      const wert = { verdachtsfaelle: verdacht.length, geprueft: bilder.length, dateien: verdacht.slice(0, 3).map((b) => b.src.split('/').pop()) };
      if (verdacht.length >= 3) return fail('Mehrere Bilder deuten auf zugekaufte Bestandsfotos hin.', wert);
      if (verdacht.length >= 1) return warn('Einzelne Bilder deuten auf zugekaufte Bestandsfotos hin.', wert);
      return pass('Es gibt keine Hinweise auf zugekaufte Bestandsfotos.', wert);
    },
  },
  {
    id: 'TRU-06',
    name: 'ABOUT_PAGE_SUBSTANCE',
    gruppe: 'trust', achse: 'vertrauen', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Vorhandensein und Umfang einer Ueber-uns-Seite',
    pruefe(facts, ctx) {
      const seite = ctx.seite('ueber_uns');
      if (!seite) return fail('Es gibt keine Seite, die das Unternehmen selbst vorstellt.', { vorhanden: false });
      const woerter = seite.rendered_word_count ?? seite.word_count ?? 0;
      const wert = { vorhanden: true, woerter, seite: pfad(seite.url) };
      if (woerter < 150) return warn(`Die Ueber-uns-Seite enthaelt nur ${woerter} Woerter.`, wert, [pfad(seite.url)]);
      return pass(`Die Ueber-uns-Seite enthaelt ${woerter} Woerter.`, wert, [pfad(seite.url)]);
    },
  },
];
