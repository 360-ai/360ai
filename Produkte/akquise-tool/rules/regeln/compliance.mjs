// CMP - Compliance-Signale. Fliessen NICHT in den Website-Score, sondern in eine
// eigene Ampel.
//
// Grundregel dieser Datei: Der Collector stellt fest, dass eine Zeichenfolge
// vorkommt oder ein Request ausgeloest wird. Ob daraus im Einzelfall ein
// Rechtsverstoss folgt, entscheidet dieses System nicht. Jede Formulierung ist
// deshalb eine Beobachtung, kein Urteil - und jede Regel traegt review_required.

import { pass, warn, fail, na, unknown, alleSeiten, pfad } from './_helfer.mjs';

/** Fremdhosts eines Consent-Laufs, ohne eigene Domain und Consent-Werkzeug. */
function fremdhosts(run, eigenerHost) {
  if (!run?.hosts) return [];
  const basis = (eigenerHost ?? '').replace(/^www\./, '');
  return run.hosts.filter((h) => {
    if (!h || h === 'localhost') return false;
    const clean = h.replace(/^www\./, '');
    return !(clean === basis || clean.endsWith('.' + basis));
  });
}

export default [
  {
    id: 'CMP-01',
    name: 'IMPRESSUM_REACHABLE',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'provider_information_possible_gap',
    messung: 'Auffindbarkeit einer Impressumsseite ueber die interne Verlinkung',
    pruefe(facts) {
      if (facts.impressum?.found) return pass('Ein Impressum ist verlinkt und erreichbar.', { gefunden: true, url: pfad(facts.impressum.url) });
      return fail('Ueber die interne Verlinkung ist keine Impressumsseite auffindbar.', { gefunden: false });
    },
  },
  {
    id: 'CMP-02',
    name: 'LEGAL_REFERENCE_CURRENT',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'outdated_legal_reference',
    messung: 'Vorkommen der Zeichenfolge TMG oder Telemediengesetz im Impressumstext, abgeglichen mit DDG',
    pruefe(facts) {
      const i = facts.impressum;
      if (!i?.found) return na('kein Impressum gefunden, siehe CMP-01');
      const wert = { nennt_tmg: i.mentions_tmg, nennt_ddg: i.mentions_ddg };
      if (i.mentions_tmg && !i.mentions_ddg) {
        return fail('Das Impressum verweist auf das Telemediengesetz. Dieses wurde im Mai 2024 durch das Digitale-Dienste-Gesetz abgeloest.', wert, [pfad(i.url)]);
      }
      if (i.mentions_tmg && i.mentions_ddg) {
        return warn('Das Impressum nennt sowohl das Telemediengesetz als auch das Digitale-Dienste-Gesetz.', wert, [pfad(i.url)]);
      }
      if (i.mentions_ddg) return pass('Das Impressum verweist auf das Digitale-Dienste-Gesetz.', wert);
      return warn('Das Impressum nennt keine gesetzliche Grundlage.', wert);
    },
  },
  {
    id: 'CMP-03',
    name: 'PROVIDER_INFO_FIELDS',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'provider_information_possible_gap',
    messung: 'Vorhandensein der ueblichen Pflichtfelder im Impressum, abhaengig von Rechtsform und Branche',
    pruefe(facts, ctx) {
      const i = facts.impressum;
      if (!i?.found) return na('kein Impressum gefunden, siehe CMP-01');

      const felder = {
        firmenname: Boolean(i.firmenname),
        anschrift: Boolean(i.adresse?.strasse && i.adresse?.plz && i.adresse?.ort),
        kontakt: Boolean(i.email || i.telefon),
      };
      // Registerangaben nur bei eingetragenen Rechtsformen erwarten.
      const eingetragen = /GmbH|mbH|UG|AG|OHG|KG|eG|e\.V\.|PartG|eGbR/i.test(i.rechtsform ?? '');
      if (eingetragen) {
        felder.register = Boolean(i.register);
        felder.registergericht = Boolean(i.registergericht);
      }
      // Kammer und Berufsbezeichnung nur bei zulassungspflichtigem Handwerk.
      if (ctx.branche?.handwerk_anlage_a) {
        felder.kammer = i.mentions_kammer;
        felder.berufsbezeichnung = i.mentions_berufsbezeichnung;
      }
      if (i.rechtsform && !i.ustid && eingetragen) felder.ustid = Boolean(i.ustid);

      const fehlend = Object.entries(felder).filter(([, v]) => !v).map(([k]) => k);
      const wert = { rechtsform: i.rechtsform, geprueft: Object.keys(felder), fehlend, handwerk_anlage_a: Boolean(ctx.branche?.handwerk_anlage_a) };

      if (!i.rechtsform && !ctx.branche) return unknown('Rechtsform und Branche unbekannt, Pflichtumfang nicht bestimmbar');
      if (fehlend.length >= 2) {
        return fail(`Im Impressum fehlen mehrere ueblicherweise erwartete Angaben: ${fehlend.join(', ')}.`, wert, [pfad(i.url)]);
      }
      if (fehlend.length === 1) {
        return warn(`Im Impressum fehlt eine ueblicherweise erwartete Angabe: ${fehlend[0]}.`, wert, [pfad(i.url)]);
      }
      return pass('Die ueblicherweise erwarteten Impressumsangaben sind vorhanden.', wert);
    },
  },
  {
    id: 'CMP-04',
    name: 'ODR_LINK_PRESENT',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'outdated_legal_reference',
    messung: 'Verweis auf ec.europa.eu/consumers/odr in den Rechtstexten',
    pruefe(facts) {
      const i = facts.impressum;
      if (!i?.found) return na('kein Impressum gefunden, siehe CMP-01');
      if (i.odr_link) {
        return fail('Das Impressum verweist auf die europaeische Online-Streitbeilegungsplattform. Diese wurde im Juli 2025 abgeschaltet, der Verweis fuehrt ins Leere.', { odr_link: true }, [pfad(i.url)]);
      }
      return pass('Es wird nicht auf die abgeschaltete Streitbeilegungsplattform verwiesen.', { odr_link: false });
    },
  },
  {
    id: 'CMP-05',
    name: 'PRIVACY_POLICY_PRESENT',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'privacy_policy_missing',
    messung: 'Auffindbare Datenschutzerklaerung mit mehr als 1500 Zeichen',
    pruefe(facts) {
      const d = facts.datenschutz;
      if (!d?.found) return fail('Es ist keine Datenschutzerklaerung auffindbar.', { gefunden: false });
      if ((d.chars ?? 0) < 1500) return warn(`Die Datenschutzerklaerung umfasst nur ${d.chars} Zeichen.`, { gefunden: true, zeichen: d.chars }, [pfad(d.url)]);
      return pass(`Eine Datenschutzerklaerung mit ${d.chars} Zeichen ist vorhanden.`, { gefunden: true, zeichen: d.chars }, [pfad(d.url)]);
    },
  },
  {
    id: 'CMP-06',
    name: 'THIRD_PARTY_PRE_CONSENT',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'third_party_request_pre_consent',
    messung: 'Aufrufe an fremde Server im Lauf ohne jede Interaktion (clean)',
    pruefe(facts) {
      const c = facts.consent;
      if (!c?.clean?.reachable) return unknown('Consent-Lauf nicht auswertbar');
      const hosts = fremdhosts(c.clean, c.own_host);
      const wert = { fremdhosts: hosts, anzahl: hosts.length };
      if (hosts.length) {
        return fail(`Schon vor jeder Zustimmung werden Daten an ${hosts.length} fremde Server uebertragen: ${hosts.slice(0, 4).join(', ')}.`, wert);
      }
      return pass('Vor einer Zustimmung werden keine Daten an fremde Server uebertragen.', wert);
    },
  },
  {
    id: 'CMP-07',
    name: 'CONSENT_BANNER_BLOCKS',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'consent_not_respected',
    messung: 'Fremdhosts im Ablehnen-Lauf gegenueber dem Lauf ohne Interaktion',
    pruefe(facts) {
      const c = facts.consent;
      if (!c?.reject?.reachable) return unknown('Ablehnen-Lauf nicht auswertbar');
      if (!c.clean?.banner_detected && !c.reject.consent_click?.clicked) {
        return na('kein Einwilligungsbanner vorhanden, das etwas blockieren koennte');
      }
      if (!c.reject.consent_click?.clicked) return unknown('Ablehnen-Schaltflaeche nicht gefunden');

      const vorher = new Set(fremdhosts(c.clean, c.own_host));
      const nachher = fremdhosts(c.reject, c.own_host);
      const neu = nachher.filter((h) => !vorher.has(h));
      const wert = { neue_hosts_nach_ablehnung: neu, geklickt: c.reject.consent_click.label };
      if (neu.length) return fail(`Nach dem Ablehnen werden weiterhin Daten an fremde Server uebertragen: ${neu.slice(0, 4).join(', ')}.`, wert);
      return pass('Nach dem Ablehnen werden keine zusaetzlichen fremden Server aufgerufen.', wert);
    },
  },
  {
    id: 'CMP-08',
    name: 'PRIVACY_COVERS_SERVICES',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'privacy_policy_possible_mismatch',
    messung: 'Abgleich der im Accept-Lauf geladenen Fremdhosts mit den in der Datenschutzerklaerung genannten Diensten',
    pruefe(facts) {
      const d = facts.datenschutz;
      const c = facts.consent;
      if (!d?.found) return na('keine Datenschutzerklaerung, siehe CMP-05');
      if (!c?.accept?.reachable) return unknown('Zustimmen-Lauf nicht auswertbar');

      const hosts = fremdhosts(c.accept, c.own_host);
      const zuordnung = {
        'maps.googleapis.com': 'google_maps', 'maps.gstatic.com': 'google_maps', 'maps.google.com': 'google_maps',
        'fonts.googleapis.com': 'google_fonts', 'fonts.gstatic.com': 'google_fonts',
        'www.google-analytics.com': 'google_analytics', 'analytics.google.com': 'google_analytics',
        'www.googletagmanager.com': 'google_tag_manager',
        'www.youtube.com': 'youtube', 'www.youtube-nocookie.com': 'youtube', 'i.ytimg.com': 'youtube',
        'player.vimeo.com': 'vimeo', 'connect.facebook.net': 'facebook', 'www.facebook.com': 'facebook',
        'www.google.com': 'recaptcha', 'www.gstatic.com': 'recaptcha',
      };
      const nichtGenannt = [];
      for (const h of hosts) {
        const dienst = zuordnung[h];
        if (dienst && d.services?.[dienst] === false) nichtGenannt.push({ host: h, dienst });
      }
      const wert = { geladene_fremdhosts: hosts, nicht_genannt: nichtGenannt };
      if (nichtGenannt.length) {
        return fail(`Es werden Dienste eingebunden, die in der Datenschutzerklaerung nicht vorkommen: ${nichtGenannt.map((x) => x.dienst).join(', ')}.`, wert, [pfad(d.url)]);
      }
      if (!hosts.length) return pass('Es werden keine fremden Dienste geladen, die in der Erklaerung fehlen koennten.', wert);
      return pass('Die geladenen fremden Dienste werden in der Datenschutzerklaerung genannt.', wert);
    },
  },
  {
    id: 'CMP-09',
    name: 'FONTS_LOCAL',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'third_party_request_pre_consent',
    messung: 'Aufrufe an fonts.googleapis.com oder fonts.gstatic.com in allen Consent-Laeufen',
    pruefe(facts) {
      const c = facts.consent;
      if (!c?.clean?.reachable) return unknown('Consent-Lauf nicht auswertbar');
      const alle = [...(c.clean.hosts ?? []), ...(c.reject?.hosts ?? []), ...(c.accept?.hosts ?? [])];
      const treffer = [...new Set(alle.filter((h) => /fonts\.(googleapis|gstatic)\.com/i.test(h)))];
      if (treffer.length) {
        return fail('Die Schriften werden von Google-Servern nachgeladen; dabei wird die Adresse des Besuchers uebertragen.', { hosts: treffer });
      }
      return pass('Die Schriften werden von der eigenen Domain ausgeliefert.', { hosts: [] });
    },
  },
  {
    id: 'CMP-10',
    name: 'PLACEHOLDER_TEXT',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'provider_information_possible_gap',
    messung: 'Unausgefuellte Vorlagen-Platzhalter in Impressum und Datenschutzerklaerung',
    pruefe(facts) {
      const treffer = [
        ...(facts.impressum?.placeholders ?? []).map((p) => ({ text: p, seite: 'Impressum' })),
        ...(facts.datenschutz?.placeholders ?? []).map((p) => ({ text: p, seite: 'Datenschutzerklaerung' })),
      ];
      if (!facts.impressum?.found && !facts.datenschutz?.found) return na('keine Rechtstexte zur Pruefung');
      const wert = { anzahl: treffer.length, fundstellen: treffer.slice(0, 5) };
      if (treffer.length) {
        return fail(`In den Rechtstexten stehen unausgefuellte Platzhalter der verwendeten Vorlage: ${treffer.slice(0, 3).map((t) => t.text).join(', ')}.`, wert);
      }
      return pass('In den Rechtstexten stehen keine unausgefuellten Platzhalter.', wert);
    },
  },
  {
    id: 'CMP-11',
    name: 'STORAGE_PRE_CONSENT',
    gruppe: 'compliance', gewicht: 1, kundentext_erlaubt: true,
    compliance_signal: 'storage_pre_consent',
    messung: 'Cookies und Browserspeicher im Lauf ohne jede Interaktion, ohne die Eintraege des Einwilligungswerkzeugs selbst',
    pruefe(facts) {
      const clean = facts.consent?.clean;
      if (!clean?.reachable) return unknown('Consent-Lauf nicht auswertbar');

      const eigen = /^(cmplz|borlabs|complianz|cookielawinfo|CookieConsent|usercentrics|klaro|real_cookie|moove_gdpr|PHPSESSID|wordpress_test_cookie)/i;
      const cookies = (clean.cookies ?? []).filter((c) => !eigen.test(c.name));
      const speicher = [...(clean.storage?.local ?? []), ...(clean.storage?.session ?? [])].filter((k) => !eigen.test(k));
      const wert = { cookies: cookies.map((c) => c.name), speicher, anzahl: cookies.length + speicher.length };

      if (wert.anzahl > 0) {
        return fail(`Vor jeder Zustimmung werden ${wert.anzahl} Eintraege im Browser gesetzt, die nicht zum Einwilligungswerkzeug gehoeren.`, wert);
      }
      return pass('Vor einer Zustimmung werden keine nicht notwendigen Eintraege im Browser gesetzt.', wert);
    },
  },
];
