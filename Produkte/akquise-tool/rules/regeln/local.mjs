// LOC - Local SEO. Achse "local", 10 Punkte.
// LOC-01 und LOC-02 werden ueber branchen.json nach Telefonaffinitaet gewichtet.

import { pass, warn, fail, na, unknown, alleSeiten, pfad } from './_helfer.mjs';

export default [
  {
    id: 'LOC-01',
    name: 'TEL_LINKS_PRESENT',
    gruppe: 'local',
    achse: 'local',
    gewicht: 3,
    kundentext_erlaubt: true,
    messung: 'Alle geprueften Seiten, DOM-Query a[href^="tel:"], gerenderte Sicht',
    pruefe(facts) {
      const seiten = alleSeiten(facts);
      if (!seiten.length) return unknown('keine Seite auswertbar');
      const mitTel = seiten.filter((p) => (p.tel_links ?? []).length > 0);
      const gesamt = seiten.reduce((a, p) => a + (p.tel_links ?? []).length, 0);

      if (gesamt === 0) {
        return fail(
          `Auf keiner der ${seiten.length} geprueften Seiten laesst sich die Telefonnummer direkt anwaehlen.`,
          { count: 0, pages_checked: seiten.length },
          seiten.map((p) => pfad(p.url))
        );
      }
      if (mitTel.length === 1 && mitTel[0].rolle === 'kontakt') {
        return warn(
          'Die Telefonnummer ist nur auf der Kontaktseite anwaehlbar, nicht auf den uebrigen Seiten.',
          { count: gesamt, seiten_mit_tel: 1, pages_checked: seiten.length },
          [pfad(mitTel[0].url)]
        );
      }
      return pass(
        `Die Telefonnummer ist auf ${mitTel.length} von ${seiten.length} Seiten direkt anwaehlbar.`,
        { count: gesamt, seiten_mit_tel: mitTel.length, pages_checked: seiten.length }
      );
    },
  },

  {
    id: 'LOC-02',
    name: 'TEL_IN_HEADER',
    gruppe: 'local',
    achse: 'local',
    gewicht: 2,
    kundentext_erlaubt: true,
    messung: 'Mobilansicht 375 px, anwaehlbares Element in den ersten 800 px',
    pruefe(facts) {
      const ersteElemente = facts.mobile?.first_screen_elements;
      if (!Array.isArray(ersteElemente)) return unknown('Mobilmessung fehlt');

      const telOben = ersteElemente.some((e) => e.is_tel);
      if (telOben) {
        return pass('Im ersten Bildschirm der Mobilansicht steht eine direkt anwaehlbare Telefonnummer.',
          { tel_im_ersten_bildschirm: true });
      }

      const startseite = facts.pages?.[0];
      const nummerImText = /(?:\+49|0)[\d\s/().-]{6,}/.test(startseite?.text?.slice(0, 800) ?? '');
      if (nummerImText) {
        return warn('Die Telefonnummer steht im oberen Bereich als Text, ist aber nicht anwaehlbar.',
          { tel_im_ersten_bildschirm: false, nummer_als_text: true });
      }
      return fail('Im ersten Bildschirm der Mobilansicht ist keine Telefonnummer erreichbar.',
        { tel_im_ersten_bildschirm: false, nummer_als_text: false });
    },
  },

  {
    id: 'LOC-03',
    name: 'NAP_CONSISTENT',
    gruppe: 'local',
    achse: 'local',
    gewicht: 3,
    kundentext_erlaubt: true,
    messung: 'Adresse und Telefon aller Fundstellen inkl. Impressum und strukturierter Daten, normalisiert verglichen',
    pruefe(facts) {
      const eintraege = facts.nap ?? [];
      const adressen = [...new Set(eintraege.map((e) => e.adresse_norm).filter(Boolean))];
      const telefone = [...new Set(eintraege.map((e) => e.telefon_norm).filter(Boolean))];
      if (!adressen.length && !telefone.length) return unknown('keine Adress- oder Telefonangaben gefunden');

      const abweichungen = Math.max(0, adressen.length - 1) + Math.max(0, telefone.length - 1);
      const wert = { adress_varianten: adressen.length, telefon_varianten: telefone.length, fundstellen: eintraege.length };

      if (abweichungen === 0) {
        return pass('Adresse und Telefonnummer sind ueber alle Fundstellen hinweg identisch.', wert);
      }
      if (abweichungen === 1) {
        return warn('Adresse oder Telefonnummer weichen an einer Stelle voneinander ab.', wert);
      }
      return fail(
        `Adresse und Telefonnummer werden in ${adressen.length} bzw. ${telefone.length} unterschiedlichen Fassungen angegeben.`,
        wert
      );
    },
  },

  {
    id: 'LOC-04',
    name: 'LOCATION_IN_TITLE_H1',
    gruppe: 'local',
    achse: 'local',
    gewicht: 3,
    kundentext_erlaubt: true,
    messung: 'Ortsname aus Lead oder Impressum in Title und H1 der Startseite',
    pruefe(facts) {
      const ort = facts.impressum?.adresse?.ort?.replace(/\s*\(.*\)$/, '')
        ?? facts.meta?.keyword?.split(/\s+/).pop() ?? null;
      if (!ort || ort.length < 3) return unknown('kein Ortsname bekannt');

      const startseite = facts.pages?.[0];
      if (!startseite) return unknown('Startseite fehlt');

      const re = new RegExp(ort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const imTitle = re.test(startseite.title ?? '');
      const inH1 = (startseite.h1 ?? []).some((h) => re.test(h));
      const wert = { ort, im_title: imTitle, in_h1: inH1 };

      if (imTitle && inH1) return pass(`Der Ort "${ort}" steht in Seitentitel und Ueberschrift der Startseite.`, wert);
      if (imTitle || inH1) return warn(`Der Ort "${ort}" steht nur ${imTitle ? 'im Seitentitel' : 'in der Ueberschrift'}, nicht in beidem.`, wert);
      return fail(`Weder Seitentitel noch Hauptueberschrift der Startseite nennen den Ort "${ort}".`, wert);
    },
  },

  {
    id: 'LOC-05',
    name: 'ADDRESS_ON_CONTACT',
    gruppe: 'local',
    achse: 'local',
    gewicht: 2,
    kundentext_erlaubt: true,
    messung: 'Vollstaendige Anschrift auf der Kontaktseite, ersatzweise Startseite',
    pruefe(facts, ctx) {
      const seite = ctx.seite('kontakt') ?? facts.pages?.[0];
      if (!seite) return unknown('keine Kontakt- oder Startseite');
      const treffer = (facts.nap ?? []).find((n) => n.source === seite.url || n.source === 'startseite');
      const adresse = treffer?.adresse;
      if (adresse?.strasse && adresse?.plz && adresse?.ort) {
        return pass('Die vollstaendige Anschrift steht auf der Kontaktseite.', { adresse: adresse.raw }, [pfad(seite.url)]);
      }
      if (adresse) return warn('Die Anschrift auf der Kontaktseite ist unvollstaendig.', { adresse: adresse.raw }, [pfad(seite.url)]);
      return fail('Auf der Kontaktseite ist keine vollstaendige Anschrift auffindbar.', { adresse: null }, [pfad(seite.url)]);
    },
  },

  {
    id: 'LOC-06',
    name: 'OPENING_HOURS',
    gruppe: 'local',
    achse: 'local',
    gewicht: 1,
    kundentext_erlaubt: true,
    messung: 'Oeffnungszeiten im Text oder als openingHours in strukturierten Daten',
    pruefe(facts, ctx) {
      if (ctx.branche && ctx.branche.oeffnungszeiten_relevant === false) {
        return na('Oeffnungszeiten sind in dieser Branche unueblich');
      }
      const text = (facts.pages ?? []).map((p) => p.text ?? '').join(' ');
      // Absichtlich eng gefasst: "Mo-Fr" als Spanne oder eine echte Uhrzeitspanne.
      // Eine blosse Zahl im Text soll keine Oeffnungszeit vortaeuschen.
      const imText = /(Mo(ntag)?\s*[-–]\s*(Fr|Freitag|Sa|Samstag))|(\b\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2})/i.test(text);
      const imSchema = (facts.pages ?? []).some((p) => (p.jsonld ?? []).some((n) => n?.openingHours || n?.openingHoursSpecification));

      if (imSchema && imText) return pass('Oeffnungszeiten stehen im Text und in den strukturierten Daten.', { text: true, schema: true });
      if (imText) return warn('Oeffnungszeiten stehen im Text, aber nicht in den strukturierten Daten.', { text: true, schema: false });
      if (imSchema) return warn('Oeffnungszeiten stehen nur in den strukturierten Daten, nicht sichtbar im Text.', { text: false, schema: true });
      return fail('Es sind keine Oeffnungszeiten auffindbar.', { text: false, schema: false });
    },
  },

  {
    id: 'LOC-07',
    name: 'SERVICE_AREA_NAMED',
    gruppe: 'local',
    achse: 'local',
    gewicht: 2,
    kundentext_erlaubt: true,
    messung: 'Nennung von Einzugsgebiet, Umkreis, Landkreis oder mehreren Orten im Text',
    pruefe(facts) {
      const text = (facts.pages ?? []).map((p) => p.text ?? '').join(' ');
      const muster = [
        /\bim Umkreis von\b/i, /\bEinzugsgebiet\b/i, /\bLandkreis\b/i, /\bRegion\b/i,
        /\bund Umgebung\b/i, /\bRaum [A-ZÄÖÜ]/, /\bKreis [A-ZÄÖÜ]/,
      ];
      const treffer = muster.filter((m) => m.test(text)).length;
      const orte = [...new Set([...text.matchAll(/\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]{3,}/g)].map((m) => m[0]))];

      if (treffer >= 1) return pass('Das Einzugsgebiet wird im Text ausdruecklich benannt.', { muster_treffer: treffer });
      if (orte.length >= 2) return warn('Es werden mehrere Orte genannt, aber kein zusammenhaengendes Einzugsgebiet.', { orte: orte.length });
      return fail('Das Einzugsgebiet ist nirgends ausgeschrieben.', { muster_treffer: 0, orte: orte.length });
    },
  },

  {
    id: 'LOC-08',
    name: 'LOCALBUSINESS_SCHEMA',
    gruppe: 'local',
    achse: 'local',
    gewicht: 3,
    kundentext_erlaubt: true,
    messung: 'JSON-LD vom Typ LocalBusiness (oder Untertyp) mit address und telephone',
    pruefe(facts) {
      const knoten = (facts.pages ?? []).flatMap((p) => p.jsonld ?? []);
      const lb = knoten.filter((n) => /LocalBusiness|Restaurant|Store|Dentist|Physician|HomeAndConstructionBusiness|ProfessionalService|AutoRepair|HealthAndBeautyBusiness/i
        .test(String(n?.['@type'] ?? '')));

      if (!lb.length) {
        return fail('Es sind keine strukturierten Daten zum Unternehmen als lokalem Betrieb hinterlegt.', { gefunden: 0 });
      }
      const vollstaendig = lb.find((n) => n.address && n.telephone);
      if (vollstaendig) {
        return pass('Strukturierte Daten als lokaler Betrieb sind mit Anschrift und Telefonnummer hinterlegt.',
          { gefunden: lb.length, vollstaendig: true });
      }
      return warn('Strukturierte Daten als lokaler Betrieb sind vorhanden, aber ohne Anschrift oder Telefonnummer.',
        { gefunden: lb.length, vollstaendig: false, fehlend: [!lb[0].address && 'address', !lb[0].telephone && 'telephone'].filter(Boolean) });
    },
  },
];
