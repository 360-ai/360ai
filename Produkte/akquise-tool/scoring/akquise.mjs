// Akquise-Score 0-100.
//
// Bewusst eine Formel und kein Modellurteil: nachvollziehbar, justierbar und
// ueber Leads hinweg vergleichbar. Ausdruecklich NICHT "100 minus Website-Score" -
// eine gute Website senkt den Wert nicht, sie verschiebt nur das Argument.

export const BAENDER = [
  { ab: 75, empfehlung: 'zeitnah anrufen' },
  { ab: 55, empfehlung: 'anrufen wenn Zeit ist' },
  { ab: 0, empfehlung: 'nur mit konkretem Anlass' },
];

const WIRKUNG_PUNKTE = { hoch: 6, mittel: 3, niedrig: 1 };
const AUFWAND_FAKTOR = { gering: 1.5, mittel: 1, hoch: 0.6 };

// Ab diesem Rohwert ist der Schmerz-Block ausgereizt.
const SCHMERZ_SAETTIGUNG = 30;

const BRANCHEN_FAKTOR = { hoch: 1.5, normal: 1.0, niedrig: 0.5 };

/**
 * @param {object} eingabe
 * @param {object} eingabe.assessment  geprueftes Assessment (nur ueberlebende Feststellungen)
 * @param {object} eingabe.findings    Ausgabe der Rule Engine
 * @param {object} eingabe.facts       facts.json (fuer Kontaktwege und Ort)
 * @param {object} eingabe.lead        Stammdaten inkl. potenzial_manuell und persoenliche_verbindung
 * @param {object} eingabe.branche     Profil aus branchen.json
 * @param {object} eingabe.blacklist   { domains: [], firmen: [] }
 */
export function akquiseScore({ assessment, findings, facts, lead = {}, branche = null, blacklist = null }) {
  const knockout = pruefeKnockouts({ facts, lead, blacklist });
  if (knockout) {
    return {
      score: 0, empfehlung: 'nicht kontaktieren', knockout,
      bloecke: null, hinweise: [],
    };
  }

  const hinweise = [];
  const schmerz = blockSchmerz(assessment, branche);
  const kontrast = blockKontrast(assessment, findings);
  const potenzial = blockPotenzial(lead, branche, hinweise);
  const zugang = blockZugang(facts, lead, hinweise);

  const summe = schmerz.punkte + kontrast.punkte + potenzial.punkte + zugang.punkte;
  const score = Math.max(0, Math.min(100, Math.round(summe)));

  // Warnhinweise statt Knock-out: nicht zuverlaessig messbar, aber wichtig zu wissen.
  const jung = findings.findings?.find((f) => f.rule_id === 'AIR-08');
  if (jung?.ergebnis === 'PASS') {
    hinweise.push('Inhaltsstand ist aktuell - moeglicherweise war kuerzlich eine Agentur taetig. Vor dem Anruf pruefen.');
  }
  if (facts.impressum?.firmenname && /GmbH & Co\. KG|AG$/i.test(facts.impressum.firmenname)) {
    hinweise.push('Rechtsform deutet auf eine groessere Struktur hin - Entscheidung liegt moeglicherweise nicht vor Ort.');
  }

  return {
    score,
    empfehlung: BAENDER.find((b) => score >= b.ab).empfehlung,
    knockout: null,
    bloecke: { schmerz, kontrast, potenzial, zugang },
    hinweise,
  };
}

/** Nur zwei Knock-outs - beide belastbar messbar. Website-Alter und Filialverdacht sind es nicht. */
function pruefeKnockouts({ facts, lead, blacklist }) {
  const domain = hostVon(facts?.http?.final_url ?? lead.website ?? '');
  if (blacklist && domain) {
    const treffer = (blacklist.domains ?? []).find((d) => domain === d || domain.endsWith('.' + d));
    if (treffer) return { grund: 'blacklist', detail: `Domain ${treffer} steht auf der Ausschlussliste` };
  }
  if (blacklist && lead.firma) {
    const norm = (s) => String(s).toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
    const treffer = (blacklist.firmen ?? []).find((f) => norm(f) === norm(lead.firma));
    if (treffer) return { grund: 'blacklist', detail: `${treffer} steht auf der Ausschlussliste` };
  }

  const hatKontakt = Boolean(
    facts?.impressum?.email || facts?.impressum?.telefon || lead.mail || lead.telefon
    || (facts?.pages ?? []).some((p) => (p.mailto_links ?? []).length || (p.tel_links ?? []).length)
  );
  if (!hatKontakt) return { grund: 'kein_kontaktweg', detail: 'Weder E-Mail noch Telefonnummer auffindbar' };

  return null;
}

/**
 * Block 1 - belegbarer Schmerz (0-40).
 * Zaehlt nur Feststellungen, die auch beim Kunden genannt werden duerfen:
 * Was intern bleibt, taugt nicht als Aufhaenger.
 */
function blockSchmerz(assessment, branche) {
  const telFaktor = BRANCHEN_FAKTOR[branche?.telefon_affin ?? 'normal'] ?? 1;
  const relevant = (assessment.feststellungen ?? []).filter((f) => f.mail_tauglich);

  let roh = 0;
  const beitraege = [];
  for (const f of relevant) {
    const basis = WIRKUNG_PUNKTE[f.wirkung] ?? 1;
    const aufwand = AUFWAND_FAKTOR[f.aufwand] ?? 1;
    // Telefonaffine Branchen: Kontaktwege wiegen schwerer.
    const branchenBonus = f.kategorie === 'local' ? telFaktor : 1;
    const wert = basis * aufwand * branchenBonus;
    roh += wert;
    beitraege.push({ id: f.id, punkte: Math.round(wert * 10) / 10 });
  }

  const punkte = Math.min(40, (roh / SCHMERZ_SAETTIGUNG) * 40);
  return {
    punkte: Math.round(punkte * 10) / 10,
    max: 40,
    roh: Math.round(roh * 10) / 10,
    beitraege: beitraege.sort((a, b) => b.punkte - a.punkte).slice(0, 6),
    begruendung: `${relevant.length} belegbare, dem Kunden erklaerbare Punkte`,
  };
}

/**
 * Block 2 - sichtbarer Kontrast zu einer neuen Seite (0-20).
 * Was verkauft, ist der Unterschied, den der Kunde sehen wuerde.
 */
function blockKontrast(assessment, findings) {
  const design = assessment.vision?.design ?? 50;
  const conversion = assessment.vision?.conversion ?? 50;
  const optisch = 14 * (1 - (design + conversion) / 200);

  const alter = findings.findings?.find((f) => f.rule_id === 'AIR-08');
  const alterPunkte = alter?.ergebnis === 'FAIL' ? 4 : alter?.ergebnis === 'WARN' ? 2 : 0;

  const psi = findings.findings?.find((f) => f.rule_id === 'TEC-12');
  const psiPunkte = psi?.ergebnis === 'FAIL' ? 2 : psi?.ergebnis === 'WARN' ? 1 : 0;

  const punkte = Math.min(20, optisch + alterPunkte + psiPunkte);
  return {
    punkte: Math.round(punkte * 10) / 10,
    max: 20,
    teile: { optisch: Math.round(optisch * 10) / 10, inhaltsstand: alterPunkte, ladezeit: psiPunkte },
    begruendung: `Design ${design}, Conversion ${conversion}${alterPunkte ? ', Inhaltsstand veraltet' : ''}`,
  };
}

/**
 * Block 3 - wirtschaftliches Potenzial (0-20).
 * Bei zehn Leads pro Woche schlaegt das menschliche Urteil jede Schaetzung aus
 * Website-Indizien. Ohne manuelle Angabe wird konservativ aus der Branche
 * abgeleitet und als Schaetzung gekennzeichnet.
 */
function blockPotenzial(lead, branche, hinweise) {
  if (Number.isFinite(lead.potenzial_manuell)) {
    const n = Math.max(1, Math.min(5, lead.potenzial_manuell));
    return { punkte: (n / 5) * 20, max: 20, quelle: 'manuell', stufe: n, begruendung: `manuell eingeschaetzt: ${n} von 5` };
  }
  const ticket = branche?.ticket ?? 3;
  // Deckel bei 80 Prozent, solange die Einschaetzung nicht bestaetigt ist.
  const punkte = (ticket / 5) * 20 * 0.8;
  hinweise.push(`Wirtschaftliches Potenzial aus der Branche geschaetzt (${branche?.label ?? 'unbekannt'}). Eigene Einschaetzung 1-5 im Lead nachtragen.`);
  return { punkte: Math.round(punkte * 10) / 10, max: 20, quelle: 'geschaetzt', stufe: ticket, begruendung: `aus Branchenprofil abgeleitet` };
}

/** Block 4 - Zugang zum Entscheider (0-20). */
function blockZugang(facts, lead, hinweise) {
  const teile = {};
  let punkte = 0;

  const name = lead.ansprechpartner ?? facts?.impressum?.vertretung ?? null;
  if (name) { punkte += 6; teile.ansprechpartner = name; }
  else hinweise.push('Kein Ansprechpartner bekannt - vor dem Anruf Namen recherchieren.');

  const telefon = lead.telefon ?? facts?.impressum?.telefon ?? null;
  if (telefon) { punkte += 4; teile.telefon = telefon; }

  const mail = lead.mail ?? facts?.impressum?.email ?? null;
  if (mail) {
    punkte += mail.startsWith('info@') || mail.startsWith('kontakt@') ? 2 : 3;
    teile.mail = mail;
  }

  // Umkreis: gleiche zweistellige Postleitzahlregion wie 360ai (35xxx).
  const plz = facts?.impressum?.adresse?.plz ?? lead.plz ?? null;
  if (plz && String(plz).startsWith('35')) { punkte += 4; teile.umkreis = true; }
  else if (plz) { punkte += 1; teile.umkreis = false; }

  if (lead.persoenliche_verbindung) { punkte += 3; teile.persoenliche_verbindung = true; }

  return { punkte: Math.min(20, punkte), max: 20, teile, begruendung: name ? `Ansprechpartner bekannt: ${name}` : 'kein Ansprechpartner bekannt' };
}

function hostVon(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
}
