// Tests der Extraktionsschicht. Jeder Fall stammt aus einem echten Audit
// oder deckt einen Fehler ab, der beim Bau aufgetreten ist.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractPage, extractImpressum, extractAddress, extractPhones,
  extractCompanyLine, normalizeCompanyName, normalizePhone, normalizeAddress,
  countConcreteFacts, collectCompanyNames, detectTech,
} from '../collector/lib/extract.mjs';

const page = (html, url = 'https://beispiel.de/') => extractPage(html, url);

// --- Textextraktion -------------------------------------------------------

test('Blockelemente werden im Text getrennt (sonst "mbHSiegener Strasse")', () => {
  const p = page('<body><div><p>Helfri Baugesellschaft mbH</p><p>Siegener Strasse 53</p></div></body>');
  assert.match(p.text, /mbH\s+Siegener/);
});

test('Consent-Banner wird entfernt, Seiteninhalt bleibt', () => {
  const p = page(`<body class="cmplz-optin">
    <div id="cmplz-cookiebanner-container"><p>Wir verwenden Cookies um unsere Website zu optimieren</p></div>
    <main><h1>Bauunternehmen Frankenberg</h1><p>Wir bauen seit 1978.</p></main></body>`);
  assert.doesNotMatch(p.text, /Cookies/);
  assert.match(p.text, /Bauunternehmen Frankenberg/);
  assert.ok(p.word_count > 3, `Wortzahl war ${p.word_count}`);
});

test('Consent-Klasse am body loescht die Seite nicht', () => {
  const p = page('<body class="cmplz-optin"><main><h1>Titel</h1><p>Inhalt der Seite</p></main></body>');
  assert.ok(p.word_count >= 4, `Wortzahl war ${p.word_count}`);
});

test('Container mit H1 wird nie als Banner entfernt', () => {
  const p = page('<body><div class="cookie-wrap"><h1>Echte Ueberschrift</h1><p>Text</p></div></body>');
  assert.match(p.text, /Echte Ueberschrift/);
});

// --- Anschrift ------------------------------------------------------------

test('Anschrift: Firmierung davor und Folgeabschnitt dahinter werden nicht verschluckt', () => {
  const a = extractAddress('Helfri Baugesellschaft mbH Siegener Strasse 53 35066 Frankenberg (Eder) Vertreten durch Markus Hoffmann');
  assert.equal(a.strasse, 'Siegener Strasse 53');
  assert.equal(a.plz, '35066');
  assert.equal(a.ort, 'Frankenberg (Eder)');
});

test('Anschrift mit Komma und Hausnummernzusatz', () => {
  const a = extractAddress('Bahnhofstrasse 4a, 35066 Frankenberg');
  assert.equal(a.strasse, 'Bahnhofstrasse 4a');
  assert.equal(a.ort, 'Frankenberg');
});

test('Anschrift: vorangestellte Ueberschrift gehoert nicht zum Strassennamen', () => {
  // Sonst meldet der Adressvergleich Abweichungen, wo keine sind (Fall Helfri:
  // "Kontakt Siegener Str. 53" gegen "Adresse Siegener Str. 53").
  const a = extractAddress('Kontakt Siegener Strasse 53 35066 Frankenberg');
  const b = extractAddress('Adresse Siegener Strasse 53 35066 Frankenberg');
  const c = extractAddress('Siegener Strasse 53, 35066 Frankenberg');
  assert.equal(a.strasse, 'Siegener Strasse 53');
  assert.equal(normalizeAddress(a.raw), normalizeAddress(b.raw));
  assert.equal(normalizeAddress(a.raw), normalizeAddress(c.raw));
});

test('Anschrift: Strassennamen mit Artikel bleiben vollstaendig', () => {
  assert.equal(extractAddress('An der Muehle 7, 35066 Frankenberg').strasse, 'An der Muehle 7');
  assert.equal(extractAddress('Am Markt 3, 35066 Frankenberg').strasse, 'Am Markt 3');
  // Auch dann, wenn eine Firmierung ohne Trennzeichen davorsteht.
  assert.equal(extractAddress('Zahnarztpraxis Dr. Weber An der Muehle 7 35066 Frankenberg').strasse, 'An der Muehle 7');
});

test('Anschrift: nachfolgende Ueberschrift gehoert nicht zum Ortsnamen', () => {
  // Fall Schreck: dieselbe Adresse wurde als drei Fassungen gezaehlt, weil
  // "Kontakt" und "Anfahrt" als Teil des Ortsnamens gelesen wurden.
  const a = extractAddress('Wolkersdorfer Strasse 28, 35099 Burgwald-Bottendorf Kontakt');
  const b = extractAddress('Wolkersdorfer Strasse 28, 35099 Burgwald-Bottendorf Anfahrt');
  const c = extractAddress('Wolkersdorfer Strasse 28 35099 Burgwald-Bottendorf');
  assert.equal(a.ort, 'Burgwald-Bottendorf');
  assert.equal(normalizeAddress(a.raw), normalizeAddress(b.raw));
  assert.equal(normalizeAddress(a.raw), normalizeAddress(c.raw));
});

test('Anschrift: mehrteilige Ortsnamen bleiben vollstaendig', () => {
  assert.equal(extractAddress('Zeil 5, 60313 Frankfurt am Main').ort, 'Frankfurt am Main');
  assert.equal(extractAddress('Kurhausstr. 1, 61348 Bad Homburg Impressum').ort, 'Bad Homburg');
  assert.equal(extractAddress('Bahnhofstr. 4, 35066 Frankenberg (Eder) Telefon').ort, 'Frankenberg (Eder)');
});

test('Anschrift: der Firmenname wandert nicht in die Strasse', () => {
  // Ohne Zeilenumbrueche sieht "Schmidt Hauptstr. 12" wie ein zweiteiliger
  // Strassenname aus. Die Strassenendung entscheidet.
  assert.equal(extractAddress('Malerbetrieb Schmidt Hauptstr. 12 35066 Frankenberg').strasse, 'Hauptstr. 12');
  assert.equal(extractAddress('Helfri Baugesellschaft mbH Siegener Strasse 53 35066 Frankenberg').strasse, 'Siegener Strasse 53');
  assert.equal(extractAddress('Schreck Kunststofftechnik GmbH Wolkersdorfer Str. 28 35099 Burgwald').strasse, 'Wolkersdorfer Str. 28');
});

test('Anschrift: Text ohne Adresse liefert null statt Unsinn', () => {
  assert.equal(extractAddress('Wir sind seit 1978 fuer Sie da und beschaeftigen 25 Mitarbeiter.'), null);
});

// --- Telefon --------------------------------------------------------------

test('Telefon mit Leerzeichen- und Bindestrichgruppen', () => {
  const p = extractPhones('Telefon: 06451 - 69 46 Fax: 06451 6949');
  assert.ok(p.length >= 1, 'keine Nummer erkannt');
  assert.equal(normalizePhone(p[0]), '064516946');
});

test('Telefon: Postleitzahl wird nicht als Nummer gewertet', () => {
  assert.deepEqual(extractPhones('35066 Frankenberg'), []);
});

test('Telefon: +49 wird auf 0 normalisiert', () => {
  assert.equal(normalizePhone('+49 6451 6946'), '064516946');
  assert.equal(normalizePhone('06451/6946'), '064516946');
});

// --- Impressum ------------------------------------------------------------

const IMPRESSUM_HELFRI = `<body><main><h1>Impressum</h1>
  <p>Angaben gem&auml;&szlig; &sect; 5 TMG:</p>
  <p>Helfri Baugesellschaft mbH</p><p>Siegener Strasse 53</p><p>35066 Frankenberg (Eder)</p>
  <p>Vertreten durch: Markus Hoffmann</p>
  <p>Telefon: 06451 - 69 46</p><p>E-Mail: info@helfri-bau.de</p>
  <p>Registergericht: Amtsgericht Marburg (Lahn) HRB 3881</p>
  <p>Umsatzsteuer-ID: DE 113073661</p>
  <h2>Haftung f&uuml;r Inhalte</h2>
  <p>Bei Bekanntwerden von Rechtsverletzungen werden wir Inhalte umgehend entfernen.
     Die Helfri-Bau GmbH ist ein Bauunternehmen aus Frankenberg.</p></main></body>`;

test('Impressum: Firmierung stammt aus dem Kopf, nicht aus dem Haftungsabsatz', () => {
  const imp = extractImpressum(page(IMPRESSUM_HELFRI));
  assert.equal(imp.rechtsform, 'mbH');
  assert.equal(imp.firmenname, 'Helfri Baugesellschaft mbH');
});

test('Impressum: Pflichtfelder und Rechtsstand werden erkannt', () => {
  const imp = extractImpressum(page(IMPRESSUM_HELFRI));
  assert.equal(imp.register, 'HRB 3881');
  assert.equal(imp.ustid, 'DE113073661');
  assert.equal(imp.email, 'info@helfri-bau.de');
  assert.equal(imp.adresse.ort, 'Frankenberg (Eder)');
  assert.equal(imp.mentions_tmg, true);
  assert.equal(imp.mentions_ddg, false);
  assert.equal(imp.mentions_kammer, false);
});

test('Impressum: aktueller Rechtsstand loest keinen Falschalarm aus (Negativtest)', () => {
  const imp = extractImpressum(page(`<body><main><h1>Impressum</h1>
    <p>Angaben gem&auml;&szlig; &sect; 5 DDG:</p>
    <p>Muster Dachdecker GmbH</p><p>Hauptstrasse 1</p><p>35066 Frankenberg</p>
    <p>Zust&auml;ndige Handwerkskammer: Handwerkskammer Kassel</p>
    <p>Berufsbezeichnung: Dachdeckermeister, verliehen in Deutschland</p></main></body>`));
  assert.equal(imp.mentions_ddg, true);
  assert.equal(imp.mentions_tmg, false);
  assert.equal(imp.mentions_kammer, true);
  assert.equal(imp.mentions_berufsbezeichnung, true);
  assert.equal(imp.placeholders.length, 0);
  assert.equal(imp.firmenname, 'Muster Dachdecker GmbH');
});

test('Impressum: Einzelunternehmen ohne Rechtsform wird erkannt und als unsicher markiert', () => {
  // Der Normalfall bei Handwerksbetrieben: kein "GmbH" als Anker, dafuer
  // Beschriftungen wie "Verantwortlich fuer den Inhalt" vor dem Namen.
  const imp = extractImpressum(page(`<body><main><h1>Impressum</h1>
    <p>Angaben gem&auml;&szlig; &sect; 5 DDG</p>
    <p>Anbieter / Verantwortlich f&uuml;r den Inhalt</p>
    <p>Denis Schmidt (Einzelunternehmer)</p><p>360ai</p>
    <p>Wangershaeuser Str. 7</p><p>35066 Frankenberg</p>
    <p>Telefon: 0152 29239908</p></main></body>`));
  assert.equal(imp.rechtsform, null);
  assert.equal(imp.firmenname_unsicher, true);
  assert.ok(imp.firmenname && /360ai/i.test(imp.firmenname), `erkannt: ${imp.firmenname}`);
  assert.doesNotMatch(imp.firmenname, /Verantwortlich|Anbieter|Angaben/i);
  assert.equal(imp.adresse.ort, 'Frankenberg');
});

test('Eine unsichere Firmierung erzeugt keinen Schreibweisen-Widerspruch', () => {
  const pages = [page('<body><title>360ai — KI und Web</title><main><h1>x</h1></main></body>')];
  const res = collectCompanyNames(pages, { found: true, firmenname: 'Denis Schmidt 360ai', firmenname_unsicher: true });
  assert.equal(res.unsichere_fundstellen, 1);
  assert.equal(res.variants.length, 1, 'nur der Titel zaehlt');
  assert.equal(res.rechtsform_konflikte.length, 0);
});

test('Impressum: unausgefuellte Vorlagen-Platzhalter werden gefunden', () => {
  const imp = extractImpressum(page(`<body><main><p>Angaben gem&auml;&szlig; &sect; 5 TMG:</p>
    <p>BRA-VO GmbH</p><p>Bahnhofstrasse 4</p><p>35066 Frankenberg</p>
    <p>Amtsgericht {Stadt}</p><p>Registernummer:</p></main></body>`));
  assert.ok(imp.placeholders.some((x) => /\{Stadt\}/i.test(x)), JSON.stringify(imp.placeholders));
});

test('Impressum: ODR-Link wird als vorhanden erkannt', () => {
  const imp = extractImpressum(page(`<body><main><p>Angaben gem&auml;&szlig; &sect; 5 TMG:</p><p>Test GmbH</p>
    <p><a href="https://ec.europa.eu/consumers/odr">Streitschlichtung</a></p></main></body>`));
  assert.equal(imp.odr_link, true);
});

// --- Firmierungsvergleich -------------------------------------------------

test('Firmierung: Rechtsformkuerzel und Bindestriche werden neutralisiert', () => {
  assert.equal(normalizeCompanyName('Helfri Bau GmbH'), normalizeCompanyName('Helfri-Bau GmbH'));
  assert.notEqual(normalizeCompanyName('Helfri Bau GmbH'), normalizeCompanyName('Helfri Baugesellschaft'));
});

test('Firmierung: aus dem Titel wird der Name gewaehlt, nicht der Werbeclaim', () => {
  const pages = [page('<body><title>Helfri Bau GmbH | Familiengefuehrtes Traditionsunternehmen aus Frankenberg</title><main><h1>x</h1></main></body>')];
  const res = collectCompanyNames(pages, { found: false });
  assert.equal(res.raw.find((r) => r.source === 'title').value, 'Helfri Bau GmbH');
});

test('Firmierung: Footer-Widgettext wird abgeschnitten', () => {
  const pages = [page('<body><main><h1>x</h1></main><footer><p>&copy; 2020 Helfri Baugesellschaft GmbH</p><p>Zustimmung verwalten</p></footer></body>')];
  const res = collectCompanyNames(pages, { found: false });
  assert.equal(res.raw.find((r) => r.source === 'footer').value, 'Helfri Baugesellschaft GmbH');
});

test('Vertretung endet vor der naechsten Beschriftung', () => {
  const imp = extractImpressum(page(`<body><main><p>Angaben gem&auml;&szlig; &sect; 5 TMG:</p>
    <p>Helfri Baugesellschaft mbH</p><p>Siegener Strasse 53</p><p>35066 Frankenberg (Eder)</p>
    <p>Vertretungsberechtigter Gesch&auml;ftsf&uuml;hrer: Markus Hoffmann</p>
    <p>Kontakt: Telefon: +49 6451 6946</p></main></body>`));
  assert.equal(imp.vertretung, 'Markus Hoffmann');
});

test('Vertretung: verschachtelte Rollenbezeichnungen werden entfernt', () => {
  const imp = extractImpressum(page(`<body><main><p>Angaben gem&auml;&szlig; &sect; 5 TMG:</p>
    <p>Helfri Baugesellschaft mbH</p><p>Siegener Strasse 53</p><p>35066 Frankenberg (Eder)</p>
    <p>Vertreten durch: Vertretungsberechtigter Gesch&auml;ftsf&uuml;hrer: Markus Hoffmann</p>
    <p>Kontakt: Telefon: +49 6451 6946</p></main></body>`));
  assert.equal(imp.vertretung, 'Markus Hoffmann');
});

test('Abweichende Rechtsform bei gleichem Namenskern wird als Konflikt gemeldet', () => {
  const pages = [page(`<body><title>Helfri Baugesellschaft mbH</title>
    <main><h1>x</h1></main><footer><p>&copy; 2020 Helfri Baugesellschaft GmbH</p></footer></body>`)];
  const res = collectCompanyNames(pages, { found: false });
  assert.equal(res.variants.length, 1, 'Namenskern ist derselbe');
  assert.equal(res.rechtsform_konflikte.length, 1, JSON.stringify(res.rechtsform_konflikte));
  assert.deepEqual(res.rechtsform_konflikte[0].formen.sort(), ['GmbH', 'mbH']);
  assert.equal(res.schreibweisen.length, 2);
});

test('Einheitliche Firmierung erzeugt keinen Konflikt (Negativtest)', () => {
  const pages = [page(`<body><title>Muster Dachdecker GmbH</title>
    <main><h1>x</h1></main><footer><p>&copy; 2026 Muster Dachdecker GmbH</p></footer></body>`)];
  const res = collectCompanyNames(pages, { found: false });
  assert.equal(res.variants.length, 1);
  assert.equal(res.rechtsform_konflikte.length, 0);
  assert.equal(res.schreibweisen.length, 1);
});

test('Adressvergleich neutralisiert Strasse und Str.', () => {
  assert.equal(normalizeAddress('Siegener Straße 53'), normalizeAddress('Siegener Str. 53'));
});

// --- Inhalt ---------------------------------------------------------------

test('Konkrete Zahlen: Fachangaben zaehlen, Postleitzahlen nicht', () => {
  const r = countConcreteFacts('Baggerarbeiten von 0,9 bis 25 t, Kran bis 21 Meter, Dichtheitspruefung nach DIN 1610. 35066 Frankenberg.');
  assert.ok(r.count >= 3, `nur ${r.count}: ${r.samples.join(', ')}`);
  assert.ok(!r.samples.some((s) => /35066/.test(s)), 'PLZ faelschlich gezaehlt');
});

test('Alt-Texte: generische Werte gelten als fehlend', () => {
  const p = page('<body><main><h1>x</h1><img src="/a.jpg" alt="IMG_1234"><img src="/b.jpg" alt="Maurerarbeiten an der Baustelle"></main></body>');
  assert.equal(p.images[0].alt_meaningful, false);
  assert.equal(p.images[1].alt_meaningful, true);
});

test('Technikerkennung verwirft Cache-Zeitstempel als Version', () => {
  const t = detectTech('<html><head><link href="/wp-content/themes/Divi/style.css?ver=1786361832"></head><body></body></html>', {});
  assert.equal(t.theme, 'Divi');
  assert.equal(t.theme_version, null);
});

test('Technikerkennung liest eine echte Themeversion', () => {
  const t = detectTech('<html><head><link href="/wp-content/themes/Divi/style.min.css?ver=4.20.4"></head><body></body></html>', {});
  assert.equal(t.theme_version, '4.20.4');
});

test('Hash-Routen einer SPA gelten als eigene Seiten, Sprungmarken nicht', () => {
  const p = page(`<body><main><h1>x</h1>
    <a href="#/impressum">Impressum</a>
    <a href="#/speisekarte">Speisekarte</a>
    <a href="#top">Nach oben</a>
    <a href="/kontakt">Kontakt</a></main></body>`, 'https://bravo-fkb.de/');
  const urls = p.links.internal.map((l) => l.url);
  assert.ok(urls.some((u) => u.endsWith('#/impressum')), JSON.stringify(urls));
  assert.ok(urls.some((u) => u.endsWith('#/speisekarte')));
  assert.ok(!urls.some((u) => u.includes('#top')), 'Sprungmarke faelschlich als Seite');
  assert.equal(p.links.internal.length, 3);
});

test('Navigationslinks verschmelzen nicht zu einem Wort', () => {
  const p = page('<body><main><h1>x</h1><nav><a href="/a">Home</a><a href="/b">Speisekarte</a></nav></main></body>');
  assert.match(p.text, /Home\s+Speisekarte/);
});

test('tel:-Links werden gezaehlt', () => {
  const p = page('<body><main><h1>x</h1><a href="tel:+4964516946">Anrufen</a><a href="/kontakt">Kontakt</a></main></body>');
  assert.equal(p.tel_links.length, 1);
  assert.equal(p.links.internal.length, 1);
});
