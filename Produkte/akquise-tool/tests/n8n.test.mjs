// Tests der n8n-Workflows.
//
// Zwei Ebenen:
//   1. Struktur - laesst sich der Workflow importieren, zeigen alle Verbindungen
//      auf vorhandene Knoten, sind Platzhalter vollstaendig erfasst
//   2. Logik - der JavaScript-Code der kritischen Knoten wird aus dem JSON
//      herausgeloest und gegen nachgebaute Gmail-Antworten laufen gelassen.
//      Damit wird der Code getestet, der spaeter wirklich laeuft.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const n8nDir = path.join(wurzel, 'n8n');
const dateien = readdirSync(n8nDir).filter((f) => f.endsWith('.json'));
const workflows = Object.fromEntries(
  dateien.map((f) => [f, JSON.parse(readFileSync(path.join(n8nDir, f), 'utf8'))])
);
const erwarteteWorkflows = [
  'akquise-wf1-lead-quickcheck.json',
  'akquise-wf2-kommunikation.json',
  'akquise-wf3-watcher.json',
  'wf4-crm-write.json',
  'wf5-crm-read.json',
  'wf6-bcc-mail-import.json',
];

const csvSpalten = (blatt) => readFileSync(
  path.join(wurzel, 'sheet-vorlagen', `${blatt}.csv`),
  'utf8',
).split(/\r?\n/, 1)[0].split(',');

// --- Struktur -------------------------------------------------------------

test('Alle sechs Workflows sind vorhanden und gueltiges JSON', () => {
  assert.deepEqual([...dateien].sort(), [...erwarteteWorkflows].sort());
  for (const [name, w] of Object.entries(workflows)) {
    assert.ok(Array.isArray(w.nodes) && w.nodes.length, `${name} ohne Knoten`);
    assert.ok(w.connections, `${name} ohne Verbindungen`);
    assert.equal(w.settings?.executionOrder, 'v1', `${name} mit falscher Ausfuehrungsreihenfolge`);
  }
});

test('Jede Verbindung zeigt auf einen vorhandenen Knoten', () => {
  for (const [name, w] of Object.entries(workflows)) {
    const namen = new Set(w.nodes.map((n) => n.name));
    for (const [von, ziele] of Object.entries(w.connections)) {
      assert.ok(namen.has(von), `${name}: Quelle "${von}" existiert nicht`);
      for (const zweig of ziele.main ?? []) {
        for (const z of zweig ?? []) {
          assert.ok(namen.has(z.node), `${name}: Ziel "${z.node}" existiert nicht`);
        }
      }
    }
  }
});

test('Knotennamen sind eindeutig und Knoten-IDs auch', () => {
  for (const [name, w] of Object.entries(workflows)) {
    const namen = w.nodes.map((n) => n.name);
    const ids = w.nodes.map((n) => n.id);
    assert.equal(new Set(namen).size, namen.length, `${name}: doppelter Knotenname`);
    assert.equal(new Set(ids).size, ids.length, `${name}: doppelte Knoten-ID`);
  }
});

test('Jeder Workflow hat mindestens einen Ausloeser', () => {
  for (const [name, w] of Object.entries(workflows)) {
    const trigger = w.nodes.filter((n) => /Trigger|webhook/i.test(n.type));
    assert.ok(trigger.length >= 1, `${name} ohne Ausloeser`);
  }
});

test('Kein Workflow ist versehentlich aktiv', () => {
  for (const [name, w] of Object.entries(workflows)) {
    assert.equal(w.active, false, `${name} wuerde beim Import sofort laufen`);
  }
});

test('Alle Platzhalter sind auffindbar und dokumentiert', () => {
  const erwartet = [
    'SHEET_ID_HIER', 'TOKEN_HIER', 'DRIVE_FOLDER_ID_HIER', 'CRM_READ_TOKEN_HIER',
  ];
  const gefunden = new Set();
  for (const [name, w] of Object.entries(workflows)) {
    const text = JSON.stringify(w);
    for (const p of text.match(/[A-Z_]{4,}_HIER/g) ?? []) gefunden.add(p);
    assert.ok(text.includes('SHEET_ID_HIER'), `${name} ohne Sheet-Platzhalter`);
  }
  for (const p of gefunden) {
    assert.ok(erwartet.includes(p), `unbekannter Platzhalter: ${p}`);
  }
});

test('Alle Code-Knoten sind syntaktisch ausfuehrbar', () => {
  for (const [name, w] of Object.entries(workflows)) {
    for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
      assert.doesNotThrow(
        () => new Function('$input', '$', 'Buffer', n.parameters.jsCode),
        `${name}/${n.name}`,
      );
    }
  }
});

test('Schemas der CRM-Schreibknoten entsprechen exakt den Sheet-Vorlagen', () => {
  const erwartet = {
    Leads: csvSpalten('Leads'),
    Activities: csvSpalten('Activities'),
    Audits: csvSpalten('Audits'),
  };
  const pruefen = [
    ['akquise-wf1-lead-quickcheck.json', 'Lead aktualisieren'],
    ['akquise-wf1-lead-quickcheck.json', 'Audit anlegen'],
    ['akquise-wf1-lead-quickcheck.json', 'Drive-Link speichern'],
    ['akquise-wf2-kommunikation.json', 'Lead fortschreiben'],
    ['akquise-wf2-kommunikation.json', 'Aktivitaet anlegen'],
    ['akquise-wf3-watcher.json', 'Leads fortschreiben'],
    ['akquise-wf3-watcher.json', 'Drive-Link aus Sheet entfernen'],
    ['wf4-crm-write.json', 'Lead schreiben'],
    ['wf4-crm-write.json', 'Statusaktivitaet anlegen'],
    ['wf6-bcc-mail-import.json', 'Leads schreiben'],
    ['wf6-bcc-mail-import.json', 'Activities schreiben'],
  ];
  for (const [datei, name] of pruefen) {
    const node = workflows[datei].nodes.find((n) => n.name === name);
    assert.ok(node, `${datei}/${name} fehlt`);
    const blatt = node.parameters.sheetName.value;
    assert.deepEqual(
      node.parameters.columns?.schema?.map((spalte) => spalte.id),
      erwartet[blatt],
      `${datei}/${name}: Schema weicht von ${blatt}.csv ab`,
    );
  }
});

test('Google-Sheets-Knoten schreiben nur in die drei vorgesehenen Blaetter', () => {
  const erlaubt = new Set(['Leads', 'Activities', 'Audits']);
  for (const [name, w] of Object.entries(workflows)) {
    for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.googleSheets')) {
      const blatt = n.parameters?.sheetName?.value;
      assert.ok(erlaubt.has(blatt), `${name}/${n.name}: unbekanntes Blatt "${blatt}"`);
    }
  }
});

test('Gmail-Zugriffe laufen ueber die hinterlegten Zugangsdaten', () => {
  for (const [name, w] of Object.entries(workflows)) {
    for (const n of w.nodes.filter((x) => JSON.stringify(x.parameters ?? {}).includes('gmail.googleapis.com'))) {
      assert.equal(n.parameters.nodeCredentialType, 'gmailOAuth2', `${name}/${n.name} ohne Gmail-Zugangsdaten`);
    }
  }
});

test('Es wird nirgends eine Mail automatisch versendet', () => {
  // Entwuerfe ja, Versand nein. Der Versand bleibt immer manuell.
  for (const [name, w] of Object.entries(workflows)) {
    const text = JSON.stringify(w);
    assert.ok(!/messages\/send/.test(text),
      `${name} koennte eine Mail versenden`);
    assert.ok(!/"operation"\s*:\s*"send"/.test(text), `${name} enthaelt eine Sendeoperation`);
  }
});

// --- Logik der Versand- und Antworterkennung ------------------------------

/** Loest den JavaScript-Code eines Code-Knotens heraus und macht ihn ausfuehrbar. */
function codeAus(workflowDatei, knotenName, {
  token = null, tokenPlaceholder = 'TOKEN_HIER',
} = {}) {
  const w = workflows[workflowDatei];
  const knoten = w.nodes.find((n) => n.name === knotenName);
  assert.ok(knoten, `Knoten "${knotenName}" fehlt in ${workflowDatei}`);
  let quelltext = knoten.parameters.jsCode;
  if (token !== null) {
    quelltext = quelltext.replace(
      `const ERWARTETES_TOKEN = '${tokenPlaceholder}';`,
      `const ERWARTETES_TOKEN = ${JSON.stringify(token)};`,
    );
  }
  return (kontext) => {
    const fn = new Function('$input', '$', 'Buffer', quelltext);
    return fn(kontext.$input, kontext.$, Buffer);
  };
}

/** Simuliert die bei der Einrichtung verwendete globale Platzhalter-Ersetzung im Workflow-JSON. */
function codeAusNachGlobalerTokenErsetzung(workflowDatei, knotenName, token) {
  const workflowText = JSON.stringify(workflows[workflowDatei]).replaceAll('TOKEN_HIER', token);
  const workflow = JSON.parse(workflowText);
  const knoten = workflow.nodes.find((n) => n.name === knotenName);
  assert.ok(knoten, `Knoten "${knotenName}" fehlt in ${workflowDatei}`);
  return (kontext) => {
    const fn = new Function('$input', '$', 'Buffer', knoten.parameters.jsCode);
    return fn(kontext.$input, kontext.$, Buffer);
  };
}

const inputVon = (zeilen) => ({
  all: () => zeilen.map((json) => ({ json })),
  first: () => ({ json: zeilen[0] ?? {} }),
});

// --- CRM-Lesepfad (WF-5) -------------------------------------------------

const wf5Auth = (authorization, { konfiguriert = true } = {}) => codeAus(
  'wf5-crm-read.json',
  'Lesetoken pruefen',
  konfiguriert ? { token: 'crm-read-test-token', tokenPlaceholder: 'CRM_READ_TOKEN_HIER' } : {},
)({
  $input: inputVon([{ headers: authorization === undefined ? {} : { authorization } }]),
  $: () => {},
})[0].json;

test('WF-5 akzeptiert nur den korrekten Authorization-Bearer-Token', () => {
  assert.deepEqual(wf5Auth('Bearer crm-read-test-token'), { ok: true, statusCode: 200 });
  for (const authorization of [
    undefined, '', 'crm-read-test-token', 'Basic crm-read-test-token',
    'Bearer falsch', 'Bearer crm-read-test-token extra',
  ]) {
    const antwort = wf5Auth(authorization);
    assert.equal(antwort.ok, false);
    assert.equal(antwort.statusCode, 401);
    assert.equal(antwort.error, 'unauthorized');
    assert.ok(!JSON.stringify(antwort).includes('crm-read-test-token'));
  }
});

test('WF-5 laesst den Token-Platzhalter fail closed', () => {
  const antwort = wf5Auth('Bearer CRM_READ_TOKEN_HIER', { konfiguriert: false });
  assert.equal(antwort.ok, false);
  assert.equal(antwort.statusCode, 500);
  assert.equal(antwort.error, 'not_configured');
});

test('WF-5 liest genau die drei dokumentierten Sheet-Bereiche und schreibt nie', () => {
  const workflow = workflows['wf5-crm-read.json'];
  const sheets = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.googleSheets');
  assert.equal(sheets.length, 3);
  assert.deepEqual(sheets.map((node) => ({
    name: node.name,
    sheet: node.parameters.sheetName.value,
    range: node.parameters.options.dataLocationOnSheet.values.range,
  })), [
    { name: 'Leads lesen', sheet: 'Leads', range: 'A:AF' },
    { name: 'Activities lesen', sheet: 'Activities', range: 'A:I' },
    { name: 'Audits lesen', sheet: 'Audits', range: 'A:Q' },
  ]);
  for (const node of sheets) {
    assert.equal(node.parameters.operation, 'read', node.name);
    assert.equal(node.parameters.documentId.value, 'SHEET_ID_HIER', node.name);
    assert.equal(node.alwaysOutputData, true, node.name);
    assert.equal(node.onError, 'continueErrorOutput', node.name);
    assert.equal(workflow.connections[node.name].main[1][0].node, 'Lesefehler maskieren');
  }
  assert.equal(workflow.connections['Leads lesen'].main[0][0].node, 'Leads gesammelt');
  assert.equal(workflow.connections['Leads gesammelt'].main[0][0].node, 'Activities lesen');
  assert.equal(workflow.connections['Activities lesen'].main[0][0].node, 'Activities gesammelt');
  assert.equal(workflow.connections['Activities gesammelt'].main[0][0].node, 'Audits lesen');
  for (const name of ['Leads gesammelt', 'Activities gesammelt']) {
    const weiter = codeAus('wf5-crm-read.json', name)({
      $input: inputVon([{ id: 1 }, { id: 2 }, { id: 3 }]),
      $: () => {},
    });
    assert.deepEqual(weiter, [{ json: { weiter: true } }], `${name} muss auf ein Item reduzieren`);
  }
  assert.equal(JSON.stringify(workflow).includes('appendOrUpdate'), false);
  assert.equal(JSON.stringify(workflow).includes('"operation":"append"'), false);
});

test('WF-5 antwortet strikt mit Leads, Activities und Audits im dokumentierten Schema', () => {
  const daten = {
    'Leads lesen': [{ lead_id: 'L-1', firma: 'Beispiel', intern: 'nicht ausgeben' }, {}],
    'Activities lesen': [{ activity_id: 'A-1', lead_id: 'L-1', typ: 'anruf' }],
    'Audits lesen': [{ audit_id: 'AU-1', lead_id: 'L-1', seo: 91 }],
  };
  const antwort = codeAus('wf5-crm-read.json', 'Antwort bauen')({
    $input: inputVon(daten['Audits lesen']),
    $: (name) => ({ all: () => daten[name].map((json) => ({ json })) }),
  })[0].json;
  assert.deepEqual(Object.keys(antwort), ['ok', 'leads', 'activities', 'audits']);
  assert.equal(antwort.ok, true);
  assert.equal(antwort.leads.length, 1);
  assert.equal(antwort.leads[0].lead_id, 'L-1');
  assert.equal(antwort.leads[0].firma, 'Beispiel');
  assert.equal(Object.hasOwn(antwort.leads[0], 'intern'), false);
  assert.deepEqual(Object.keys(antwort.leads[0]), csvSpalten('Leads'));
  assert.deepEqual(Object.keys(antwort.activities[0]), csvSpalten('Activities'));
  assert.deepEqual(Object.keys(antwort.audits[0]), csvSpalten('Audits'));
});

test('WF-5 maskiert Lesefehler als 500 und speichert oder protokolliert keine Tokens', () => {
  const workflow = workflows['wf5-crm-read.json'];
  const fehler = codeAus('wf5-crm-read.json', 'Lesefehler maskieren')({
    $input: inputVon([{ error: 'sensitive provider detail' }]),
    $: () => {},
  })[0].json;
  assert.deepEqual(fehler, {
    ok: false,
    statusCode: 500,
    error: 'read_failed',
    message: 'CRM-Daten konnten nicht geladen werden',
  });
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveExecutionProgress, false);
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.doesNotMatch(JSON.stringify(workflow), /console\.(?:log|info|warn|error)/);
  assert.equal(workflow.connections['Anfrage autorisiert?'].main[1][0].node, 'Fehler antworten');
  for (const name of [
    'Lesetoken pruefen', 'Leads gesammelt', 'Activities gesammelt', 'Antwort bauen',
  ]) {
    assert.equal(workflow.nodes.find((node) => node.name === name).onError, 'continueErrorOutput');
    assert.equal(workflow.connections[name].main[1][0].node, 'Lesefehler maskieren');
  }
});

// --- BCC-Mail-Import (WF-6) ----------------------------------------------

const wf6Mail = ({
  id = '18fabc123', threadId = 'thread-1',
  from = 'Denis Schmidt <info@360-ai.org>',
  to = 'Frau Beispiel <kontakt@beispiel.de>',
  bcc = 'info@360-ai.org', subject = 'Kurze Frage #Anfrage',
  labels = ['SENT'], internalDate = String(Date.parse('2026-08-18T08:30:00Z')),
} = {}) => ({
  id, threadId, labelIds: labels, internalDate,
  payload: { headers: [
    { name: 'From', value: from },
    { name: 'To', value: to },
    { name: 'Bcc', value: bcc },
    { name: 'Subject', value: subject },
  ] },
});

const wf6Normalisieren = (messages) => codeAus(
  'wf6-bcc-mail-import.json', 'Nachrichten normalisieren',
)({ $input: inputVon(messages), $: () => {} }).map((item) => item.json);

const wf6Vorbereiten = (nachrichten, { leads = [], activities = [] } = {}) => codeAus(
  'wf6-bcc-mail-import.json', 'BCC-Import vorbereiten',
)({
  $input: inputVon([{}]),
  $: (name) => {
    const daten = {
      'Nachrichten normalisieren': nachrichten,
      'Leads lesen': leads,
      'Activities lesen': activities,
    }[name];
    if (!daten) throw new Error('unerwarteter Knotenzugriff: ' + name);
    return { all: () => daten.map((json) => ({ json })) };
  },
})[0].json;

test('WF-6 sucht nur gesendete Mails mit eigener BCC-Adresse und #Anfrage', () => {
  const workflow = workflows['wf6-bcc-mail-import.json'];
  const node = workflow.nodes.find((candidate) => candidate.name === 'Gmail BCC-Mails suchen');
  const query = decodeURIComponent(node.parameters.url.split('&q=')[1]);
  assert.match(query, /in:sent/);
  assert.match(query, /bcc:info@360-ai\.org/);
  assert.match(query, /subject:"#Anfrage"/);
  assert.equal(node.parameters.nodeCredentialType, 'gmailOAuth2');
});

test('WF-6 akzeptiert nur eigene, gesendete Einzelmails mit beiden Markierungen', () => {
  const [r] = wf6Normalisieren([wf6Mail()]);
  assert.equal(r.ok, true);
  assert.equal(r.empfaenger, 'kontakt@beispiel.de');
  assert.equal(r.ansprechpartner, 'Frau Beispiel');
  assert.equal(r.gmail_thread_id, 'thread-1');

  for (const mail of [
    wf6Mail({ bcc: 'archiv@360-ai.org' }),
    wf6Mail({ subject: 'Kurze Frage ohne Marker' }),
    wf6Mail({ from: 'fremd@example.org' }),
    wf6Mail({ labels: ['INBOX'] }),
    wf6Mail({ to: 'a@example.org, b@example.org' }),
  ]) {
    assert.equal(wf6Normalisieren([mail])[0].ok, false);
  }
});

test('WF-6 legt aus einer unbekannten Mailadresse Lead und Activity ohne Website an', () => {
  const nachricht = wf6Normalisieren([wf6Mail()]);
  const r = wf6Vorbereiten(nachricht);
  assert.equal(r.neu, 1);
  assert.equal(r.ergaenzt, 0);
  assert.equal(r.leadZeilen.length, 1);
  assert.equal(r.activityZeilen.length, 1);
  assert.equal(r.leadZeilen[0].firma, '');
  assert.equal(r.leadZeilen[0].website, '');
  assert.equal(r.leadZeilen[0].mail, 'kontakt@beispiel.de');
  assert.equal(r.leadZeilen[0].status, 'kontaktiert');
  assert.equal(r.leadZeilen[0].kontaktquelle, 'direkt_mail');
  assert.match(r.leadZeilen[0].lead_id, /^L-20260818-mail-/);
  assert.equal(r.activityZeilen[0].lead_id, r.leadZeilen[0].lead_id);
  assert.equal(r.activityZeilen[0].external_id, 'gmail:18fabc123');
  assert.equal(r.activityZeilen[0].typ, 'mail');
  assert.equal(r.activityZeilen[0].richtung, 'raus');
});

test('WF-6 ordnet vorhandene Leads per Mail zu und setzt fortgeschrittene Status nie zurueck', () => {
  const nachricht = wf6Normalisieren([wf6Mail()]);
  const r = wf6Vorbereiten(nachricht, { leads: [{
    lead_id: 'L-alt', mail: 'KONTAKT@BEISPIEL.DE', status: 'angebot',
    next_action: 'termin', next_action_at: '2026-08-22',
  }] });
  assert.equal(r.neu, 0);
  assert.equal(r.ergaenzt, 1);
  assert.equal(r.leadZeilen[0].lead_id, 'L-alt');
  assert.equal(r.leadZeilen[0].status, undefined);
  assert.equal(r.leadZeilen[0].next_action, undefined);
  assert.equal(r.leadZeilen[0].gmail_thread_id, 'thread-1');
  assert.equal(r.activityZeilen[0].lead_id, 'L-alt');
});

test('WF-6 ist ueber Gmail-ID idempotent und verweigert mehrdeutige Lead-Zuordnung', () => {
  const nachricht = wf6Normalisieren([wf6Mail()]);
  const duplikat = wf6Vorbereiten(nachricht, { activities: [{
    activity_id: 'A-alt', external_id: 'gmail:18fabc123',
  }] });
  assert.equal(duplikat.duplikate, 1);
  assert.equal(duplikat.leadZeilen.length, 0);
  assert.equal(duplikat.activityZeilen.length, 0);

  const mehrdeutig = wf6Vorbereiten(nachricht, { leads: [
    { lead_id: 'L-1', mail: 'kontakt@beispiel.de' },
    { lead_id: 'L-2', gmail_empfaenger: 'kontakt@beispiel.de' },
  ] });
  assert.equal(mehrdeutig.leadZeilen.length, 0);
  assert.equal(mehrdeutig.activityZeilen.length, 0);
  assert.match(mehrdeutig.fehler[0], /Mehrere Leads/);
});

// --- CRM-Schreibpfad (WF-4) ----------------------------------------------

const wf4Anfrage = (body, token = 'crm-test-token') => codeAus(
  'wf4-crm-write.json',
  'Anfrage pruefen',
  { token: 'crm-test-token' },
)({
  $input: inputVon([{ headers: { 'x-crm-token': token }, body }]),
  $: () => {},
})[0].json;

const wf4Pruefen = (anfrage, zeilen) => codeAus(
  'wf4-crm-write.json',
  'Aenderung pruefen',
)({
  $input: inputVon(zeilen),
  $: (name) => {
    if (name === 'Anfrage pruefen') return { first: () => ({ json: anfrage }) };
    throw new Error('unerwarteter Knotenzugriff: ' + name);
  },
})[0].json;

test('WF-4 akzeptiert nur die sechs freigegebenen Schreibfelder', () => {
  for (const feld of ['status', 'notiz', 'ende_grund', 'wiedervorlage_am', 'next_action', 'next_action_at']) {
    const wert = feld === 'status' ? 'angebot' : '';
    const r = wf4Anfrage({
      lead_id: 'L-1', feld, wert,
      ...(feld === 'status' ? { erwarteter_status: 'qualifiziert' } : {}),
    });
    assert.equal(r.ok, true, feld);
  }
  const gesperrt = wf4Anfrage({ lead_id: 'L-1', feld: 'website_score', wert: 99 });
  assert.equal(gesperrt.statusCode, 400);
  assert.equal(gesperrt.error, 'field_not_allowed');
});

test('WF-4 lehnt falsches Token, ungueltige Werte und fehlenden Erwartungsstatus ab', () => {
  assert.equal(wf4Anfrage({ lead_id: 'L-1', feld: 'notiz', wert: 'x' }, 'falsch').statusCode, 401);
  assert.equal(wf4Anfrage({ lead_id: 'L-1', feld: 'next_action_at', wert: '2026-02-30' }).error, 'invalid_date');
  assert.equal(wf4Anfrage({ lead_id: 'L-1', feld: 'status', wert: 'angebot' }).error, 'expected_status_required');
});

test('WF-4 erkennt einen veralteten Status als 409-Konflikt', () => {
  const anfrage = wf4Anfrage({
    lead_id: 'L-1', feld: 'status', wert: 'angebot', erwarteter_status: 'qualifiziert',
  });
  const r = wf4Pruefen(anfrage, [{ lead_id: 'L-1', status: 'beendet' }]);
  assert.equal(r.ok, false);
  assert.equal(r.statusCode, 409);
  assert.equal(r.error, 'status_conflict');
  assert.equal(r.current_status, 'beendet');
});

test('WF-4 verweigert fehlende und doppelte lead_id eindeutig', () => {
  const anfrage = wf4Anfrage({ lead_id: 'L-1', feld: 'notiz', wert: 'Neu' });
  assert.equal(wf4Pruefen(anfrage, []).statusCode, 404);
  const doppelt = wf4Pruefen(anfrage, [
    { lead_id: 'L-1', status: 'neu' },
    { lead_id: 'L-1', status: 'neu' },
  ]);
  assert.equal(doppelt.statusCode, 409);
  assert.equal(doppelt.error, 'duplicate_lead');
});

test('WF-4 verlangt fuer Rueckspruenge eine ausdrueckliche Bestaetigung', () => {
  const basis = {
    lead_id: 'L-1', feld: 'status', wert: 'qualifiziert', erwarteter_status: 'angebot',
  };
  const blockiert = wf4Pruefen(wf4Anfrage(basis), [{ lead_id: 'L-1', status: 'angebot' }]);
  assert.equal(blockiert.statusCode, 422);
  assert.equal(blockiert.error, 'backward_transition_requires_confirmation');

  const bestaetigt = wf4Pruefen(
    wf4Anfrage({ ...basis, ruecksprung_bestaetigt: true }),
    [{ lead_id: 'L-1', status: 'angebot' }],
  );
  assert.equal(bestaetigt.ok, true);
  assert.deepEqual(bestaetigt.row, { lead_id: 'L-1', status: 'qualifiziert' });
});

test('WF-4 schreibt bei Statuswechsel eine nachvollziehbare Activity', () => {
  const geprueft = wf4Pruefen(wf4Anfrage({
    lead_id: 'L-7', feld: 'status', wert: 'angebot', erwarteter_status: 'qualifiziert',
  }), [{ lead_id: 'L-7', status: 'qualifiziert' }]);
  assert.equal(geprueft.statuswechsel, true);

  const r = codeAus('wf4-crm-write.json', 'Statusaktivitaet bauen')({
    $input: inputVon([{}]),
    $: (name) => {
      if (name === 'Aenderung pruefen') return { first: () => ({ json: geprueft }) };
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  })[0].json;
  assert.match(r.activity_id, /^A-\d+$/);
  assert.equal(r.lead_id, 'L-7');
  assert.equal(r.typ, 'status_wechsel');
  assert.equal(r.notiz, 'qualifiziert -> angebot');
});

// --- Assessment-Webhook und Drive-Berichte (WF-1) ------------------------

const vierBerichte = (datum = '2026-08-16') => [
  ['intern', 'md'], ['telefon', 'md'], ['mail', 'md'], ['kunde', 'html'],
].map(([typ, endung]) => ({
  dateiname: `${datum}_${typ}.${endung}`,
  mime_type: endung === 'html' ? 'text/html' : 'text/markdown',
  inhalt_base64: Buffer.from(`${typ}-Inhalt`).toString('base64'),
}));

const wf1Nutzlast = (berichte = vierBerichte()) => codeAus(
  'akquise-wf1-lead-quickcheck.json',
  'Nutzlast pruefen',
  { token: 'wf1-test-token' },
)({
  $input: inputVon([{
    headers: { 'x-akquise-token': 'wf1-test-token' },
    body: {
      lead_id: 'L-1', audit_id: '2026-08-16', website: 'https://example.test',
      firma: 'Beispiel GmbH', argumente: [{ kurz: 'Mobilansicht' }], berichte,
    },
  }]),
  $: () => {},
});

test('Globale TOKEN_HIER-Ersetzung aktiviert WF-1 und WF-4 ohne falschen Konfigurationsfehler', () => {
  const token = 'global-ersetztes-test-token';
  const wf1 = codeAusNachGlobalerTokenErsetzung(
    'akquise-wf1-lead-quickcheck.json',
    'Nutzlast pruefen',
    token,
  )({
    $input: inputVon([{
      headers: { 'x-akquise-token': token },
      body: {
        lead_id: 'L-global-1', audit_id: '2026-08-16', website: 'https://example.test',
        berichte: vierBerichte(),
      },
    }]),
    $: () => {},
  })[0].json;
  assert.equal(wf1.leadZeile.lead_id, 'L-global-1');

  const wf4 = codeAusNachGlobalerTokenErsetzung(
    'wf4-crm-write.json',
    'Anfrage pruefen',
    token,
  )({
    $input: inputVon([{
      headers: { 'x-crm-token': token },
      body: { lead_id: 'L-global-1', feld: 'notiz', wert: 'Ersetzt' },
    }]),
    $: () => {},
  })[0].json;
  assert.equal(wf4.ok, true);
  assert.notEqual(wf4.error, 'not_configured');
});

test('WF-1 akzeptiert ausschliesslich einen vollstaendigen, fest benannten Berichtssatz', () => {
  const r = wf1Nutzlast()[0].json;
  assert.equal(r.berichte.length, 4);
  assert.equal(r.leadZeile.status, 'analysiert');
  assert.throws(() => wf1Nutzlast(vierBerichte().slice(0, 3)), /Genau vier Berichte/);
  const falsch = vierBerichte();
  falsch[0] = { ...falsch[0], dateiname: '../2026-08-16_intern.md' };
  assert.throws(() => wf1Nutzlast(falsch), /Ungueltiger Berichtsname/);
});

test('WF-1-Reanalyse bewahrt manuellen Pipeline-Stand, Notiz und Drive-Link', () => {
  const eingang = wf1Nutzlast()[0].json.leadZeile;
  const zusammenfuehren = (aktuell) => codeAus(
    'akquise-wf1-lead-quickcheck.json',
    'Leadzeile isolieren',
  )({
    $input: inputVon([aktuell]),
    $: (name) => {
      if (name === 'Nutzlast pruefen') return { first: () => ({ json: { leadZeile: eingang } }) };
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  })[0].json;
  const aktuell = {
    lead_id: 'L-1', status: 'angebot', next_action: 'termin',
    next_action_at: '2026-08-20', notiz: 'Persoenliche Notiz',
    berichte_drive_url: 'https://drive.google.com/drive/folders/ordner123',
  };
  const r = zusammenfuehren(aktuell);
  assert.equal(r.status, 'angebot');
  assert.equal(r.next_action, 'termin');
  assert.equal(r.next_action_at, '2026-08-20');
  assert.equal(r.notiz, 'Persoenliche Notiz');
  assert.equal(r.berichte_drive_url, aktuell.berichte_drive_url);

  const bewusstLeer = zusammenfuehren({ ...aktuell, notiz: '' });
  assert.equal(bewusstLeer.notiz, '', 'eine bewusst geleerte CRM-Notiz darf nicht wiederbefuellt werden');
});

test('WF-1 speichert den Drive-Link erst nach vier bestaetigten Uploads', () => {
  const bauen = codeAus('akquise-wf1-lead-quickcheck.json', 'Drive-Link bauen');
  const kontext = (anzahl) => ({
    $input: inputVon(Array.from({ length: anzahl }, (_, index) => ({ id: `file-${index}` }))),
    $: (name) => {
      if (name === 'Berichte vorbereiten') return { first: () => ({ json: { folder_id: 'folder-1' } }) };
      if (name === 'Nutzlast pruefen') return { first: () => ({ json: { leadZeile: { lead_id: 'L-1' } } }) };
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  });
  assert.throws(() => bauen(kontext(3)), /Nicht alle vier/);
  assert.deepEqual(bauen(kontext(4))[0].json, {
    lead_id: 'L-1',
    berichte_drive_url: 'https://drive.google.com/drive/folders/folder-1',
  });

  const verbindungen = workflows['akquise-wf1-lead-quickcheck.json'].connections;
  assert.equal(verbindungen['Berichte hochladen'].main[0][0].node, 'Drive-Link bauen');
  assert.equal(verbindungen['Drive-Link bauen'].main[0][0].node, 'Drive-Link speichern');
});

test('WF-1 ordnet alle vier Berichtsoutputs dem einen Folder-Input zu', () => {
  const reports = vierBerichte();
  const r = codeAus('akquise-wf1-lead-quickcheck.json', 'Berichte vorbereiten')({
    $input: inputVon([{ folder_id: 'folder-1' }]),
    $: (name) => {
      if (name === 'Nutzlast pruefen') return { first: () => ({ json: { berichte: reports } }) };
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  });
  assert.equal(r.length, 4);
  assert.deepEqual(r.map((item) => item.pairedItem), [
    { item: 0 }, { item: 0 }, { item: 0 }, { item: 0 },
  ]);
  assert.deepEqual(r.map((item) => item.json.folder_id), Array(4).fill('folder-1'));
});

const nachricht = ({ labels = [], from = '', subject = '', autoSubmitted = '', internalDate = null }) => ({
  labelIds: labels,
  internalDate,
  payload: {
    headers: [
      { name: 'From', value: from },
      { name: 'Subject', value: subject },
      ...(autoSubmitted ? [{ name: 'Auto-Submitted', value: autoSubmitted }] : []),
    ],
  },
});

const lauf = (lead, messages) => {
  const auswerten = codeAus('akquise-wf3-watcher.json', 'Thread auswerten');
  return auswerten({
    $input: { all: () => [{ json: messages === null ? {} : { messages } }] },
    $: (name) => {
      if (name === 'Kandidaten filtern') return { all: () => [{ json: lead }] };
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  })[0].json;
};

const basisLead = {
  lead_id: 'L-1', firma: 'Mueller Dachdecker', status: 'qualifiziert',
  gmail_thread_id: 'T1', gmail_draft_id: 'D1', gmail_empfaenger: 'info@mueller.de',
  unterlagen_gesendet_am: '', email_freigabe_am: new Date().toISOString().slice(0, 10),
};

test('Versand wird erkannt, sobald der Thread eine gesendete Nachricht enthaelt', () => {
  const r = lauf(basisLead, [
    nachricht({ labels: ['SENT'], from: 'info@360-ai.org', internalDate: String(Date.parse('2026-08-10T09:00:00Z')) }),
  ]);
  assert.equal(r._aenderung, true);
  assert.equal(r.status, 'kontaktiert');
  assert.equal(r.unterlagen_gesendet_am, '2026-08-10');
  assert.equal(r.next_action, 'followup_call');
  assert.equal(r.next_action_at, '2026-08-24', 'vierzehn Tage spaeter');
});

test('Ein bearbeiteter, noch nicht gesendeter Entwurf gilt nicht als Versand', () => {
  // Genau der Fall, an dem die alte Logik ueber die Message-ID gescheitert waere.
  const r = lauf(basisLead, [nachricht({ labels: ['DRAFT'], from: 'info@360-ai.org' })]);
  assert.equal(r._aenderung, false);
  assert.equal(r.status, undefined);
});

test('Eine echte Antwort setzt den Lead auf qualifiziert', () => {
  const r = lauf({ ...basisLead, unterlagen_gesendet_am: '2026-08-10' }, [
    nachricht({ labels: ['SENT'], from: 'info@360-ai.org' }),
    nachricht({ labels: ['INBOX'], from: 'Herr Mueller <mueller@mueller.de>', subject: 'Re: Ihr Hinweis' }),
  ]);
  assert.equal(r._aenderung, true);
  assert.equal(r.status, 'qualifiziert');
  assert.equal(r.next_action, 'antwort_bearbeiten');
  assert.match(r._meldung, /Antwort von Mueller Dachdecker/);
});

test('Eine Abwesenheitsnotiz zaehlt nicht als Antwort', () => {
  const r = lauf({ ...basisLead, unterlagen_gesendet_am: '2026-08-10' }, [
    nachricht({ labels: ['SENT'], from: 'info@360-ai.org' }),
    nachricht({ labels: ['INBOX'], from: 'mueller@mueller.de', subject: 'Automatische Antwort: Abwesenheit' }),
  ]);
  assert.notEqual(r.status, 'qualifiziert');
  assert.match(r._meldung ?? '', /Abwesenheitsnotiz/);
  assert.match(r._meldung ?? '', /zaehlt nicht als Antwort/);
});

test('Auch der Auto-Submitted-Kopf wird als Automatik erkannt', () => {
  const r = lauf({ ...basisLead, unterlagen_gesendet_am: '2026-08-10' }, [
    nachricht({ labels: ['SENT'], from: 'info@360-ai.org' }),
    nachricht({ labels: ['INBOX'], from: 'mueller@mueller.de', subject: 'Ihre Nachricht', autoSubmitted: 'auto-replied' }),
  ]);
  assert.notEqual(r.status, 'qualifiziert');
});

test('Unzustellbarkeit beendet den Lead mit eigenem Grund', () => {
  const r = lauf({ ...basisLead, unterlagen_gesendet_am: '2026-08-10' }, [
    nachricht({ labels: ['SENT'], from: 'info@360-ai.org' }),
    nachricht({ labels: ['INBOX'], from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)' }),
  ]);
  assert.equal(r.status, 'beendet');
  assert.equal(r.ende_grund, 'mail_unzustellbar');
  assert.equal(r.next_action, '');
});

test('Unzustellbarkeit hat Vorrang vor einer gleichzeitigen Antwort', () => {
  const r = lauf({ ...basisLead, unterlagen_gesendet_am: '2026-08-10' }, [
    nachricht({ labels: ['SENT'], from: 'info@360-ai.org' }),
    nachricht({ labels: ['INBOX'], from: 'postmaster@mueller.de', subject: 'Undelivered Mail Returned to Sender' }),
    nachricht({ labels: ['INBOX'], from: 'chef@mueller.de', subject: 'Re: Ihr Hinweis' }),
  ]);
  assert.equal(r.ende_grund, 'mail_unzustellbar');
});

test('Ein lange liegender Entwurf wird gemeldet, aber nichts veraendert', () => {
  const alt = new Date(); alt.setDate(alt.getDate() - 9);
  const r = lauf(
    { ...basisLead, email_freigabe_am: alt.toISOString().slice(0, 10) },
    [nachricht({ labels: ['DRAFT'], from: 'info@360-ai.org' })]
  );
  assert.equal(r._aenderung, false);
  assert.equal(r._melden, true);
  assert.match(r._meldung, /liegt seit 9 Tagen unversendet/);
});

test('Ein nicht lesbarer Thread aendert nichts und meldet sich', () => {
  const r = lauf(basisLead, null);
  assert.equal(r._aenderung, false);
  assert.equal(r._melden, true);
  assert.match(r._meldung, /nicht lesbar/);
});

test('Eigene Nachrichten im Thread werden nie als Antwort gewertet', () => {
  const r = lauf({ ...basisLead, unterlagen_gesendet_am: '2026-08-10' }, [
    nachricht({ labels: ['SENT'], from: 'Denis Schmidt <info@360-ai.org>' }),
    nachricht({ labels: ['SENT'], from: 'INFO@360-AI.ORG', subject: 'Nachtrag' }),
  ]);
  assert.notEqual(r.status, 'qualifiziert');
});

// --- Logik der Gespraechsauswertung ---------------------------------------

const gespraech = (felder) => {
  const auswerten = codeAus('akquise-wf2-kommunikation.json', 'Gespraech auswerten');
  return auswerten({ $input: { all: () => [{ json: felder }], first: () => ({ json: felder }) }, $: () => {} })[0].json;
};

test('Ohne ausdrueckliche Zusage entsteht keine Mail-Freigabe', () => {
  const r = gespraech({ 'Lead-ID': 'L-1', Erreicht: 'ja', 'Mail-Freigabe': 'nein', Ergebnis: 'offen' });
  assert.equal(r.freigabe, false);
  assert.equal(r.status, 'kontaktiert');
});

test('Mit Zusage wird der Lead qualifiziert und in vierzehn Tagen nachgefasst', () => {
  const r = gespraech({ 'Lead-ID': 'L-1', Erreicht: 'ja', 'Mail-Freigabe': 'ja, ausdruecklich zugesagt', Ergebnis: 'zusage' });
  assert.equal(r.freigabe, true);
  assert.equal(r.status, 'qualifiziert');
  assert.equal(r.next_action, 'followup_call');
  const tage = Math.round((new Date(r.next_action_at) - new Date(r.heute)) / 86400000);
  assert.equal(tage, 14);
});

test('Eine Absage beendet den Lead mit Grund', () => {
  const r = gespraech({ 'Lead-ID': 'L-1', Erreicht: 'ja', 'Mail-Freigabe': 'nein', Ergebnis: 'absage' });
  assert.equal(r.status, 'beendet');
  assert.equal(r.ende_grund, 'kein_bedarf');
  assert.equal(r.next_action, '');
});

test('"Spaeter wieder" setzt eine Wiedervorlage in sechs Monaten', () => {
  const r = gespraech({ 'Lead-ID': 'L-1', Erreicht: 'ja', 'Mail-Freigabe': 'nein', Ergebnis: 'spaeter_wieder' });
  assert.equal(r.next_action, 'wiedervorlage');
  const monate = (new Date(r.wiedervorlage_am).getFullYear() - new Date(r.heute).getFullYear()) * 12
    + (new Date(r.wiedervorlage_am).getMonth() - new Date(r.heute).getMonth());
  assert.equal(monate, 6);
});

test('Ein unplausibler Potenzialwert wird verworfen', () => {
  assert.equal(gespraech({ 'Lead-ID': 'L-1', Erreicht: 'ja', 'Mail-Freigabe': 'nein', Ergebnis: 'offen', 'Potenzial 1-5': '9' }).potenzial, '');
  assert.equal(gespraech({ 'Lead-ID': 'L-1', Erreicht: 'ja', 'Mail-Freigabe': 'nein', Ergebnis: 'offen', 'Potenzial 1-5': '4' }).potenzial, 4);
});

// --- Schutz vor automatischen Status-Rueckspruengen (WF-2/WF-3) ---------

const wf2Absichern = (vorschlag, lead) => codeAus(
  'akquise-wf2-kommunikation.json',
  'Freigabe pruefen',
)({
  $input: inputVon([lead]),
  $: (name) => {
    if (name === 'Gespraech auswerten') return { first: () => ({ json: vorschlag }) };
    throw new Error('unerwarteter Knotenzugriff: ' + name);
  },
})[0].json;

test('WF-2 setzt Angebot oder Gewinn nie automatisch auf einen frueheren Status zurueck', () => {
  const angebot = wf2Absichern(
    { lead_id: 'L-1', status: 'qualifiziert', next_action: 'followup_call', freigabe: false },
    { lead_id: 'L-1', status: 'angebot', mail: '', mail_entwurf: '' },
  );
  assert.equal(angebot.status, 'angebot');
  assert.match(angebot._status_hinweis, /kein automatischer Ruecksprung/);

  const gewonnen = wf2Absichern(
    { lead_id: 'L-1', status: 'beendet', next_action: '', ende_grund: 'kein_bedarf', freigabe: false },
    {
      lead_id: 'L-1', status: 'gewonnen', next_action: 'termin',
      next_action_at: '2026-09-01', ende_grund: '', mail: '', mail_entwurf: '',
    },
  );
  assert.equal(gewonnen.status, 'gewonnen');
  assert.equal(gewonnen.next_action, 'termin');
  assert.equal(gewonnen.next_action_at, '2026-09-01');
});

test('WF-2 liest nach dem Gmail-Zweig unmittelbar vor dem Sheet-Schreiben erneut', () => {
  const vorschlag = {
    lead_id: 'L-1', status: 'qualifiziert', next_action: 'followup_call',
    next_action_at: '2026-09-10', ende_grund: '', wiedervorlage_am: '',
    email_freigabe: 'ja', gmail_draft_id: 'D-neu',
  };
  const aktuell = {
    lead_id: 'L-1', status: 'angebot', next_action: 'termin',
    next_action_at: '2026-09-01', ende_grund: '', wiedervorlage_am: '',
  };
  const r = codeAus('akquise-wf2-kommunikation.json', 'Status vor Schreiben absichern')({
    $input: inputVon([aktuell]),
    $: (name) => {
      if (name === 'Sheetzeile bauen') return { first: () => ({ json: vorschlag }) };
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  })[0].json;
  assert.equal(r.status, 'angebot');
  assert.equal(r.next_action, 'termin');
  assert.equal(r.next_action_at, '2026-09-01');
  assert.equal(r.gmail_draft_id, 'D-neu', 'nicht konkurrierende Felder werden weitergeschrieben');

  const verbindungen = workflows['akquise-wf2-kommunikation.json'].connections;
  assert.equal(verbindungen['Sheetzeile bauen'].main[0][0].node, 'Lead vor Schreiben erneut lesen');
  assert.equal(verbindungen['Lead vor Schreiben erneut lesen'].main[0][0].node, 'Status vor Schreiben absichern');
  assert.equal(verbindungen['Status vor Schreiben absichern'].main[0][0].node, 'Lead fortschreiben');
});

test('WF-2 bewahrt Lifecycle-Felder auch bei beendet auf beendet', () => {
  const vorschlag = {
    lead_id: 'L-1', status: 'beendet', next_action: '', next_action_at: '',
    ende_grund: 'mail_unzustellbar', wiedervorlage_am: '', email_freigabe: 'nein',
  };
  const aktuell = {
    lead_id: 'L-1', status: 'beendet', next_action: 'wiedervorlage',
    next_action_at: '2027-01-01', ende_grund: 'kein_bedarf', wiedervorlage_am: '2027-01-01',
  };
  const r = codeAus('akquise-wf2-kommunikation.json', 'Status vor Schreiben absichern')({
    $input: inputVon([aktuell]),
    $: (name) => {
      if (name === 'Sheetzeile bauen') return { first: () => ({ json: vorschlag }) };
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  })[0].json;
  assert.equal(r.status, 'beendet');
  assert.equal(r.ende_grund, 'kein_bedarf');
  assert.equal(r.next_action, 'wiedervorlage');
  assert.equal(r.next_action_at, '2027-01-01');
  assert.equal(r.wiedervorlage_am, '2027-01-01');
});

const wf3Absichern = (vorschlaege, aktuelle) => codeAus(
  'akquise-wf3-watcher.json',
  'Aenderungen absichern',
)({
  $input: inputVon(aktuelle),
  $: (name) => {
    if (name === 'Aenderungen isolieren') return { all: () => vorschlaege.map((json) => ({ json })) };
    throw new Error('unerwarteter Knotenzugriff: ' + name);
  },
}).map((item) => item.json);

test('WF-3 prueft unmittelbar vor dem Schreiben erneut und schuetzt hoehere Status', () => {
  const [angebot] = wf3Absichern(
    [{ lead_id: 'L-1', status: 'qualifiziert', next_action: 'antwort_bearbeiten' }],
    [{ lead_id: 'L-1', status: 'angebot', next_action: 'termin' }],
  );
  assert.equal(angebot.status, 'angebot');

  const [gewonnen] = wf3Absichern(
    [{ lead_id: 'L-2', status: 'beendet', next_action: '', ende_grund: 'mail_unzustellbar' }],
    [{ lead_id: 'L-2', status: 'gewonnen', next_action: 'termin', next_action_at: '2026-09-01' }],
  );
  assert.equal(gewonnen.status, 'gewonnen');
  assert.equal(gewonnen.next_action, 'termin');
  assert.equal(gewonnen.next_action_at, '2026-09-01');

  const verbindungen = workflows['akquise-wf3-watcher.json'].connections;
  assert.equal(verbindungen['Aenderungen isolieren'].main[0][0].node, 'Leadstatus erneut lesen');
  assert.equal(verbindungen['Leadstatus erneut lesen'].main[0][0].node, 'Aenderungen absichern');
  assert.equal(verbindungen['Aenderungen absichern'].main[0][0].node, 'Leads fortschreiben');
});

test('WF-3 bewahrt Lifecycle-Felder auch bei beendet auf beendet', () => {
  const [r] = wf3Absichern(
    [{
      lead_id: 'L-3', status: 'beendet', next_action: '', next_action_at: '',
      ende_grund: 'mail_unzustellbar', wiedervorlage_am: '',
    }],
    [{
      lead_id: 'L-3', status: 'beendet', next_action: 'wiedervorlage',
      next_action_at: '2027-02-01', ende_grund: 'kein_bedarf', wiedervorlage_am: '2027-02-01',
    }],
  );
  assert.equal(r.status, 'beendet');
  assert.equal(r.ende_grund, 'kein_bedarf');
  assert.equal(r.next_action, 'wiedervorlage');
  assert.equal(r.next_action_at, '2027-02-01');
  assert.equal(r.wiedervorlage_am, '2027-02-01');
});

// --- DSGVO-Kopplung der Drive-Berichte (WF-3) ----------------------------

test('WF-3 waehlt nur alte beendete Leads mit passendem Grund und sicherem Drive-Link', () => {
  const alt = new Date();
  alt.setMonth(alt.getMonth() - 25);
  const neu = new Date();
  neu.setMonth(neu.getMonth() - 23);
  const leads = [
    {
      lead_id: 'L-alt', status: 'beendet', ende_grund: 'kein_bedarf',
      unterlagen_gesendet_am: alt.toISOString().slice(0, 10),
      berichte_drive_url: 'https://drive.google.com/drive/folders/folder-alt',
    },
    {
      lead_id: 'L-neu', status: 'beendet', ende_grund: 'ungeeignet',
      unterlagen_gesendet_am: neu.toISOString().slice(0, 10),
      berichte_drive_url: 'https://drive.google.com/drive/folders/folder-neu',
    },
    {
      lead_id: 'L-falsch', status: 'beendet', ende_grund: 'zu_teuer',
      unterlagen_gesendet_am: alt.toISOString().slice(0, 10),
      berichte_drive_url: 'https://drive.google.com/drive/folders/folder-falsch',
    },
    {
      lead_id: 'L-url', status: 'beendet', ende_grund: 'kein_bedarf',
      unterlagen_gesendet_am: alt.toISOString().slice(0, 10),
      berichte_drive_url: 'https://evil.example/folder-alt',
    },
    {
      lead_id: 'L-datum', status: 'beendet', ende_grund: 'kein_bedarf',
      unterlagen_gesendet_am: '2024-02-30',
      berichte_drive_url: 'https://drive.google.com/drive/folders/folder-datum',
    },
    {
      lead_id: 'L-zukunft', status: 'beendet', ende_grund: 'ungeeignet',
      unterlagen_gesendet_am: '2999-01-01',
      berichte_drive_url: 'https://drive.google.com/drive/folders/folder-zukunft',
    },
    {
      lead_id: '../L-pfad', status: 'beendet', ende_grund: 'kein_bedarf',
      unterlagen_gesendet_am: alt.toISOString().slice(0, 10),
      berichte_drive_url: 'https://drive.google.com/drive/folders/folder-pfad',
    },
    {
      lead_id: 'L-wieder-offen', status: 'qualifiziert', ende_grund: 'kein_bedarf',
      unterlagen_gesendet_am: alt.toISOString().slice(0, 10),
      berichte_drive_url: 'https://drive.google.com/drive/folders/folder-wieder-offen',
    },
  ];
  const r = codeAus('akquise-wf3-watcher.json', 'Drive-Loeschfristen filtern')({
    $input: inputVon(leads), $: () => {},
  }).map((item) => item.json);
  assert.deepEqual(r, [{ lead_id: 'L-alt', folder_id: 'folder-alt' }]);
});

test('WF-3 loescht nur den exakt bestaetigten Lead-Ordner im konfigurierten Root', () => {
  const kandidaten = [{ lead_id: 'L-alt', folder_id: 'folder-alt' }];
  const pruefen = codeAus('akquise-wf3-watcher.json', 'Drive-Loeschziel pruefen');
  const ausfuehren = (ordner) => pruefen({
    $input: inputVon(ordner),
    $: (name) => {
      if (name === 'Drive-Loeschfristen filtern') {
        return { all: () => kandidaten.map((json) => ({ json })) };
      }
      throw new Error('unerwarteter Knotenzugriff: ' + name);
    },
  });
  assert.equal(ausfuehren([{ id: 'folder-alt', name: 'falscher-name' }]).length, 0);
  assert.equal(ausfuehren([{ id: 'folder-alt', name: 'L-alt' }]).length, 1);

  const workflow = workflows['akquise-wf3-watcher.json'];
  const suche = workflow.nodes.find((n) => n.name === 'Drive-Ordner im Root suchen');
  assert.equal(suche.parameters.filter.folderId.value, 'DRIVE_FOLDER_ID_HIER');
  assert.equal(suche.parameters.filter.whatToSearch, 'folders');
  const loeschen = workflow.nodes.find((n) => n.name === 'Drive-Ordner dauerhaft loeschen');
  assert.equal(loeschen.parameters.resource, 'folder');
  assert.equal(loeschen.parameters.operation, 'deleteFolder');
  assert.equal(loeschen.parameters.folderNoRootId.value, '={{ $json.folder_id }}');
  assert.equal(loeschen.parameters.options.deletePermanently, true);

  const morgen = workflow.connections['Leads lesen (Morgen)'].main[0].map((ziel) => ziel.node);
  assert.ok(morgen.includes('Drive-Loeschfristen filtern'));
});
