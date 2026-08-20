// Tests des Validators. Jeder Test ist ein Angriff auf die Halluzinationssperre.
// Wenn einer davon durchgeht, kann eine erfundene Behauptung in einer Kundenmail landen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pruefe, zahlenAus } from '../validator/pruefe.mjs';

const findings = {
  meta: { lead_id: 'T-1', url: 'https://beispiel.de/' },
  findings: [
    {
      rule_id: 'LOC-01', name: 'TEL_LINKS_PRESENT', gruppe: 'local', ergebnis: 'FAIL',
      kundentext_erlaubt: true, messung: 'DOM-Query a[href^=tel:]',
      befund: 'Auf keiner der 12 geprueften Seiten laesst sich die Telefonnummer direkt anwaehlen.',
      wert: { count: 0, pages_checked: 12 }, belege: ['/', '/kontakt'],
    },
    {
      rule_id: 'SEO-04', name: 'H1_PRESENT', gruppe: 'seo', ergebnis: 'PASS',
      kundentext_erlaubt: true, messung: 'genau eine h1 je Seite',
      befund: 'Jede gepruefte Seite hat genau eine Hauptueberschrift.',
      wert: { ohne_h1: 0, geprueft: 12 }, belege: [],
    },
    {
      rule_id: 'TEC-05', name: 'TTFB', gruppe: 'technik', ergebnis: 'FAIL',
      kundentext_erlaubt: true, messung: 'Median aus drei Messungen',
      befund: 'Der Server antwortet erst nach 1.66 Sekunden.',
      wert: { median_ms: 1660, spanne_ms: [1490, 1790] }, belege: [],
    },
    {
      rule_id: 'TEC-15', name: 'CMS_VERSION_CURRENT', gruppe: 'technik', ergebnis: 'FAIL',
      kundentext_erlaubt: false, messung: 'Versionsangabe',
      befund: 'Im Einsatz ist Divi 4.20.4 aus dem Jahr 2023.',
      wert: { version: '4.20.4', veroeffentlicht: 2023 }, belege: [],
    },
    {
      rule_id: 'CMP-02', name: 'LEGAL_REFERENCE_CURRENT', gruppe: 'compliance', ergebnis: 'FAIL',
      kundentext_erlaubt: true, compliance_signal: 'outdated_legal_reference', review_required: true,
      messung: 'Impressumstext auf TMG',
      // Wortlaut wie in rules/regeln/compliance.mjs - die Jahresangabe stammt aus
      // der Regel selbst, nicht aus dem Modell.
      befund: 'Das Impressum verweist auf das Telemediengesetz. Dieses wurde im Mai 2024 durch das Digitale-Dienste-Gesetz abgeloest.',
      wert: { nennt_tmg: true, nennt_ddg: false }, belege: ['/impressum/'],
    },
    {
      rule_id: 'TEC-09', name: 'IMG_OVERSIZED', gruppe: 'technik', ergebnis: 'FAIL',
      kundentext_erlaubt: true, messung: 'Bilder ueber 300 KB',
      befund: '4 Bilder sind ueberdimensioniert; das groesste ist 870 KB gross.',
      wert: { anzahl: 4, groesste: [{ datei: 'autos.jpg', kb: 870 }] }, belege: [],
    },
  ],
};

const feststellung = (over = {}) => ({
  id: 'F1', kategorie: 'local',
  feststellung: 'Die Telefonnummer ist auf dem Smartphone nicht direkt anwaehlbar.',
  beleg: 'Auf keiner der 12 geprueften Seiten existiert ein anwaehlbarer Telefonverweis.',
  rule_ids: ['LOC-01'], sicherheit: 'hoch', aufwand: 'gering', wirkung: 'hoch', mail_tauglich: true,
  ...over,
});

const assessment = (feststellungen, over = {}) => ({
  meta: { lead_id: 'T-1', url: 'https://beispiel.de/' },
  vision: { design: 40, conversion: 45, vertrauen: 50, sicherheit: 'mittel', begruendung: 'Starres Layout, schwache visuelle Hierarchie, kaum Fuehrung zum Kontakt.' },
  feststellungen,
  staerken: [{ text: 'Die Seite ist durchgehend verschluesselt erreichbar.', rule_ids: ['TEC-01'] }],
  nicht_sagen: ['Nicht mit "veraltet" argumentieren, der Inhalt ist inhaltlich stark.'],
  akquise: { ansatz: 'teilsanierung', begruendung: 'Der Auftritt ist inhaltlich brauchbar, verliert aber Anfragen an der Kontaktaufnahme.', reihenfolge: ['F1'] },
  ...over,
});

// --- Der Normalfall -------------------------------------------------------

test('Eine sauber belegte Feststellung geht durch', () => {
  const r = pruefe(assessment([feststellung()]), findings);
  assert.equal(r.ok, true, r.abbruchgrund);
  assert.equal(r.statistik.behalten, 1);
  assert.equal(r.assessment.feststellungen[0].mail_tauglich, true);
});

// --- Angriff 1: erfundene Regel-ID ---------------------------------------

test('Erfundene Regel-ID wird verworfen', () => {
  const r = pruefe(assessment([feststellung({ rule_ids: ['LOC-99'] })]), findings);
  assert.equal(r.statistik.behalten, 0);
  assert.match(r.verworfen[0].gruende.join(' '), /unbekannte Regel-ID/);
});

// --- Angriff 2: Zitat einer Regel, die das Gegenteil sagt -----------------

test('Ein Mangel laesst sich nicht auf eine Regel stuetzen, die PASS liefert', () => {
  // Genau der Fall aus der Gegenpruefung: Die ID existiert, die Aussage ist trotzdem falsch.
  const r = pruefe(assessment([feststellung({
    kategorie: 'seo', rule_ids: ['SEO-04'],
    feststellung: 'Die Startseite besitzt keine Hauptueberschrift.',
    beleg: 'Auf der Startseite wurde keine H1 gefunden.',
  })]), findings);
  assert.equal(r.statistik.behalten, 0);
  assert.match(r.verworfen[0].gruende.join(' '), /widerspricht der Aussage.*SEO-04=PASS/);
});

// --- Angriff 3: erfundene Zahlen -----------------------------------------

test('Eine Zahl ohne Deckung in den zitierten Regeln wird verworfen', () => {
  const r = pruefe(assessment([feststellung({
    beleg: 'Auf allen 47 geprueften Seiten fehlt ein anwaehlbarer Telefonverweis.',
  })]), findings);
  assert.equal(r.statistik.behalten, 0);
  assert.match(r.verworfen[0].gruende.join(' '), /Zahl ohne Deckung.*47/);
});

test('Gerundete Werte bleiben zulaessig', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'technik', rule_ids: ['TEC-05'],
    feststellung: 'Der Server braucht rund 1,7 Sekunden bis zur ersten Antwort.',
    beleg: 'Der Median aus drei Messungen liegt bei 1,66 Sekunden.',
  })]), findings);
  assert.equal(r.statistik.behalten, 1, JSON.stringify(r.verworfen));
});

test('Einheitenwechsel bleibt zulaessig', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'technik', rule_ids: ['TEC-05'],
    feststellung: 'Die erste Serverantwort dauert 1660 Millisekunden.',
    beleg: 'Gemessen wurde ein Median von 1660 Millisekunden.',
  })]), findings);
  assert.equal(r.statistik.behalten, 1, JSON.stringify(r.verworfen));
});

test('Kleine Zahlen in normaler Prosa loesen keinen Verwurf aus', () => {
  const r = pruefe(assessment([feststellung({
    feststellung: 'Es gibt 2 Stellen, an denen die Kontaktaufnahme scheitert.',
    beleg: 'Auf keiner Seite ist die Nummer anwaehlbar, im ersten Bildschirm fehlt sie ganz.',
  })]), findings);
  assert.equal(r.statistik.behalten, 1, JSON.stringify(r.verworfen));
});

// --- Angriff 4: visuelle Aussagen ----------------------------------------

test('Visuelle Aussage darf keine Sicherheit "hoch" tragen', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'visuell', rule_ids: [], sicherheit: 'hoch',
    feststellung: 'Die Seite wirkt visuell deutlich aelter als der heutige Standard.',
    beleg: 'Starres Layout, geringe visuelle Hierarchie, schwache Kontaktfuehrung.',
  })]), findings);
  assert.equal(r.statistik.behalten, 0);
  assert.match(r.verworfen[0].gruende.join(' '), /Sicherheit "hoch"/);
});

test('Visuelle Aussage darf keine Messangaben enthalten', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'visuell', rule_ids: [], sicherheit: 'mittel',
    feststellung: 'Das Layout stammt erkennbar aus 2014 und nutzt 12 verschiedene Schriftgroessen.',
    beleg: 'Starres Layout ohne erkennbare Ordnung der Schriftgroessen.',
  })]), findings);
  assert.equal(r.statistik.behalten, 0);
  assert.match(r.verworfen[0].gruende.join(' '), /Messangaben/);
});

test('Nicht-visuelle Feststellung ohne Regelzitat wird verworfen', () => {
  const r = pruefe(assessment([feststellung({ rule_ids: [] })]), findings);
  assert.equal(r.statistik.behalten, 0);
  assert.match(r.verworfen[0].gruende.join(' '), /keine Regel zitiert/);
});

test('Saubere visuelle Aussage geht durch', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'visuell', rule_ids: [], sicherheit: 'mittel', mail_tauglich: false,
    feststellung: 'Der Auftritt wirkt visuell aelter als die Wettbewerber in der Region.',
    beleg: 'Starres Layout, geringe visuelle Hierarchie, schwache Fuehrung zur Kontaktaufnahme.',
  })]), findings);
  assert.equal(r.statistik.behalten, 1, JSON.stringify(r.verworfen));
});

// --- Angriff 5: Interna in die Kundenmail --------------------------------

test('Interne Regeln sperren die Feststellung fuer die Mail, verwerfen sie aber nicht', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'technik', rule_ids: ['TEC-15'], mail_tauglich: true,
    feststellung: 'Das eingesetzte Theme stammt aus dem Jahr 2023.',
    beleg: 'Im Einsatz ist Divi 4.20.4, veroeffentlicht 2023.',
  })]), findings);
  assert.equal(r.statistik.behalten, 1);
  assert.equal(r.assessment.feststellungen[0].mail_tauglich, false, 'Interna waeren in der Mail gelandet');
  assert.deepEqual(r.assessment.feststellungen[0].mail_gesperrt_durch, ['TEC-15']);
});

test('Eine Feststellung aus gemischten Regeln wird ebenfalls gesperrt', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'technik', rule_ids: ['TEC-09', 'TEC-15'],
    feststellung: 'Bilder und Theme sind nicht auf dem heutigen Stand.',
    beleg: '4 Bilder sind ueberdimensioniert, das groesste mit 870 KB.',
  })]), findings);
  assert.equal(r.assessment.feststellungen[0].mail_tauglich, false);
});

test('Compliance-Feststellungen werden als solche gekennzeichnet', () => {
  const r = pruefe(assessment([feststellung({
    kategorie: 'compliance', rule_ids: ['CMP-02'],
    feststellung: 'Das Impressum nennt eine Rechtsgrundlage, die es nicht mehr gibt.',
    beleg: 'Es wird auf das Telemediengesetz verwiesen, das im Mai 2024 abgeloest wurde.',
  })]), findings);
  assert.equal(r.assessment.feststellungen[0].compliance, true);
});

// --- Abbruchverhalten -----------------------------------------------------

test('Zu viele Verwuerfe brechen den Lauf ab, statt einen duennen Bericht zu liefern', () => {
  const r = pruefe(assessment([
    feststellung({ id: 'F1' }),
    feststellung({ id: 'F2', rule_ids: ['XXX-01'] }),
    feststellung({ id: 'F3', rule_ids: ['YYY-02'] }),
  ]), findings);
  assert.equal(r.ok, false);
  assert.match(r.abbruchgrund, /Verwurfsquote/);
});

test('Ein einzelner Verwurf unter der Schwelle bricht nicht ab', () => {
  const gute = Array.from({ length: 9 }, (_, i) => feststellung({ id: `F${i + 1}` }));
  const r = pruefe(assessment([...gute, feststellung({ id: 'F10', rule_ids: ['XXX-01'] })]), findings);
  assert.equal(r.ok, true, r.abbruchgrund);
  assert.equal(r.statistik.verwurfsquote_prozent, 10);
});

test('Fehlendes nicht_sagen bricht ab', () => {
  const r = pruefe(assessment([feststellung()], { nicht_sagen: [] }), findings);
  assert.equal(r.ok, false);
  assert.match(r.abbruchgrund, /nicht_sagen/);
});

test('Vision-Wert ausserhalb des Bereichs bricht ab', () => {
  const r = pruefe(assessment([feststellung()], {
    vision: { design: 140, conversion: 45, vertrauen: 50, begruendung: 'x'.repeat(50) },
  }), findings);
  assert.equal(r.ok, false);
  assert.match(r.abbruchgrund, /vision.design/);
});

test('Doppelte Feststellungs-IDs werden erkannt', () => {
  const r = pruefe(assessment([feststellung({ id: 'F1' }), feststellung({ id: 'F1' })]), findings);
  assert.ok(r.verworfen.some((v) => v.gruende.join(' ').includes('doppelte')));
});

test('Die Argumentreihenfolge enthaelt nur ueberlebende Feststellungen', () => {
  const r = pruefe(assessment(
    [feststellung({ id: 'F1' }), feststellung({ id: 'F2', rule_ids: ['XXX-01'] })],
    { akquise: { ansatz: 'teilsanierung', begruendung: 'x'.repeat(50), reihenfolge: ['F1', 'F2'] } }
  ), findings);
  assert.deepEqual(r.assessment.akquise.reihenfolge, ['F1']);
});

// --- Zahlenerkennung ------------------------------------------------------

test('Zahlenerkennung ignoriert kleine Ganzzahlen und erfasst Messwerte', () => {
  assert.deepEqual(zahlenAus('2 Punkte').map((z) => z.zahl), []);
  assert.deepEqual(zahlenAus('12 Seiten und 870 KB').map((z) => z.zahl), [12, 870]);
  assert.deepEqual(zahlenAus('1,66 Sekunden').map((z) => z.zahl), [1.66]);
});
