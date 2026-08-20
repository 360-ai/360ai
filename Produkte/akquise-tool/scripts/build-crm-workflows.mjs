#!/usr/bin/env node
// Erzeugt die CRM-Erweiterungen der importierbaren n8n-Workflows deterministisch.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const N8N = path.join(ROOT, 'n8n');
const LEAD_COLUMNS = [
  'lead_id', 'firma', 'website', 'ort', 'branche', 'ansprechpartner', 'anrede',
  'mail', 'telefon', 'kontaktquelle', 'website_score', 'akquise_score',
  'akquise_ansatz', 'compliance', 'status', 'next_action', 'next_action_at',
  'email_freigabe', 'email_freigabe_am', 'email_freigabe_notiz',
  'gmail_draft_id', 'gmail_thread_id', 'gmail_empfaenger', 'gmail_betreff',
  'unterlagen_gesendet_am', 'ende_grund', 'wiedervorlage_am', 'notiz',
  'berichte_pfad', 'berichte_drive_url', 'mail_betreff', 'mail_entwurf',
];
const ACTIVITY_COLUMNS = [
  'activity_id', 'lead_id', 'datum', 'typ', 'richtung',
  'verwendete_argumente', 'ergebnis', 'notiz', 'external_id',
];
const AUDIT_COLUMNS = [
  'audit_id', 'lead_id', 'datum', 'collector_version', 'regelwerk_version',
  'website_score', 'akquise_score', 'seo', 'technik', 'air', 'design',
  'conversion', 'local', 'vertrauen', 'compliance', 'seiten_geprueft', 'pfad',
];

const schema = (columns, match = null) => columns.map((id) => ({
  id, displayName: id, required: false, defaultMatch: id === match,
  display: true, type: 'string', canBeUsedToMatch: true,
}));
const bodyOf = (fn) => {
  const source = fn.toString();
  return source.slice(source.indexOf('{') + 1, source.lastIndexOf('}')).trim();
};
const edge = (node, index = 0) => ({ node, type: 'main', index });
const upsertNode = (workflow, node) => {
  const index = workflow.nodes.findIndex((candidate) => candidate.name === node.name);
  if (index === -1) workflow.nodes.push(node);
  else workflow.nodes[index] = node;
};
const byName = (workflow, name) => {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error('Knoten fehlt: ' + workflow.name + '/' + name);
  return node;
};
const readWorkflow = async (name) => JSON.parse(await readFile(path.join(N8N, name), 'utf8'));
const writeWorkflow = async (name, workflow) => {
  await writeFile(path.join(N8N, name), JSON.stringify(workflow, null, 2) + '\n', 'utf8');
};
const sheetReadNode = ({
  id, name, sheet, lookup = null, position, options = {},
  explicitRead = false, alwaysOutputData = false,
}) => ({
  parameters: {
    ...(explicitRead ? { operation: 'read' } : {}),
    documentId: { __rl: true, value: 'SHEET_ID_HIER', mode: 'id' },
    sheetName: { __rl: true, value: sheet, mode: 'name' },
    ...(lookup ? { filtersUI: { values: [{
      lookupColumn: lookup.column, lookupValue: lookup.value,
    }] } } : {}),
    options,
  },
  id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position,
  ...(lookup || alwaysOutputData ? { alwaysOutputData: true } : {}),
});
const sheetUpsertNode = ({ id, name, sheet, columns, match, position }) => ({
  parameters: {
    operation: 'appendOrUpdate',
    documentId: { __rl: true, value: 'SHEET_ID_HIER', mode: 'id' },
    sheetName: { __rl: true, value: sheet, mode: 'name' },
    columns: {
      mappingMode: 'autoMapInputData',
      matchingColumns: [match],
      schema: schema(columns, match),
    },
    options: {},
  },
  id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position,
});
const sheetAppendNode = ({ id, name, sheet, columns, position }) => ({
  parameters: {
    operation: 'append',
    documentId: { __rl: true, value: 'SHEET_ID_HIER', mode: 'id' },
    sheetName: { __rl: true, value: sheet, mode: 'name' },
    columns: { mappingMode: 'autoMapInputData', schema: schema(columns) },
    options: {},
  },
  id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position,
});
const codeNode = ({ id, name, fn, position }) => ({
  parameters: { jsCode: bodyOf(fn) },
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position,
});
const ifNode = ({ id, name, value, position }) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, version: 2 },
      conditions: [{
        leftValue: value, rightValue: '',
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position,
});

function wf1PayloadCode() {
  const ERWARTETES_TOKEN = 'TOKEN_HIER';
  const eingang = $input.first().json;
  const kopf = eingang.headers || {};
  const d = eingang.body || eingang;
  if (ERWARTETES_TOKEN === 'TOKEN' + '_HIER') throw new Error('Webhook-Token ist noch nicht konfiguriert');
  if (kopf['x-akquise-token'] !== ERWARTETES_TOKEN) throw new Error('Token stimmt nicht');
  for (const feld of ['lead_id', 'audit_id', 'website']) {
    if (!d[feld]) throw new Error('Pflichtfeld fehlt: ' + feld);
  }
  const zahl = (v) => (Number.isFinite(Number(v)) ? Number(v) : '');
  const a = d.achsen || {};
  const erwarteteTypen = new Map([
    ['intern', 'md'], ['telefon', 'md'], ['mail', 'md'], ['kunde', 'html'],
  ]);
  const berichte = Array.isArray(d.berichte) ? d.berichte : [];
  if (berichte.length !== 4) throw new Error('Genau vier Berichte erwartet');
  const gesehen = new Set();
  const datum = String(d.audit_id).slice(0, 10);
  for (const bericht of berichte) {
    const match = /^(\d{4}-\d{2}-\d{2})_(intern|telefon|mail|kunde)\.(md|html)$/.exec(String(bericht.dateiname || ''));
    if (!match || match[1] !== datum || erwarteteTypen.get(match[2]) !== match[3]) {
      throw new Error('Ungueltiger Berichtsname: ' + String(bericht.dateiname || ''));
    }
    if (gesehen.has(match[2])) throw new Error('Doppelter Berichtstyp: ' + match[2]);
    gesehen.add(match[2]);
    const base64 = String(bericht.inhalt_base64 || '');
    if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error('Bericht ist nicht korrekt Base64-kodiert: ' + bericht.dateiname);
    }
    if (base64.length > 2796212) throw new Error('Bericht ist groesser als 2 MB: ' + bericht.dateiname);
  }
  const leadZeile = {
    lead_id: d.lead_id, firma: d.firma || '', website: d.website,
    ort: d.ort || '', branche: d.branche || '',
    ansprechpartner: d.ansprechpartner || '', anrede: d.anrede || 'sie',
    mail: d.mail || '', telefon: d.telefon || '',
    kontaktquelle: d.kontaktquelle || 'website',
    website_score: zahl(d.website_score), akquise_score: zahl(d.akquise_score),
    akquise_ansatz: d.akquise_ansatz || '', compliance: d.compliance || '',
    status: 'analysiert', next_action: 'anruf',
    next_action_at: new Date().toISOString().slice(0, 10),
    notiz: (d.argumente || []).map((x) => x.kurz).join(' | ').slice(0, 500),
    berichte_pfad: d.berichte_pfad || '', berichte_drive_url: '',
    mail_betreff: d.mail_betreff || '',
    mail_entwurf: (d.mail_entwurf || '').slice(0, 45000),
  };
  const auditZeile = {
    audit_id: d.audit_id, lead_id: d.lead_id, datum: new Date().toISOString(),
    collector_version: d.collector_version || '',
    regelwerk_version: d.regelwerk_version || '',
    website_score: zahl(d.website_score), akquise_score: zahl(d.akquise_score),
    seo: zahl(a.seo), technik: zahl(a.technik), air: zahl(a.air),
    design: zahl(a.design), conversion: zahl(a.conversion),
    local: zahl(a.local), vertrauen: zahl(a.vertrauen),
    compliance: d.compliance || '', seiten_geprueft: zahl(d.seiten_geprueft),
    pfad: d.berichte_pfad || '',
  };
  return [{ json: {
    leadZeile, auditZeile, berichte,
    empfehlung: d.akquise_empfehlung || '',
  } }];
}
function wf1MergeLeadCode() {
  const eingang = $('Nutzlast pruefen').first().json.leadZeile;
  const treffer = $input.all().map((item) => item.json).filter((row) => row && row.lead_id);
  if (treffer.length > 1) throw new Error('Mehrere Sheet-Zeilen fuer Lead ' + eingang.lead_id);
  if (!treffer.length) return [{ json: eingang }];
  const aktuell = treffer[0];
  const status = String(aktuell.status || '');
  const istNeu = !status || status === 'neu';
  return [{ json: {
    ...eingang,
    status: istNeu ? 'analysiert' : status,
    next_action: istNeu ? 'anruf' : (aktuell.next_action || ''),
    next_action_at: istNeu ? eingang.next_action_at : (aktuell.next_action_at || ''),
    notiz: aktuell.notiz ?? '',
    berichte_drive_url: aktuell.berichte_drive_url || '',
  } }];
}
function chooseDriveFolderCode() {
  const leadId = $('Nutzlast pruefen').first().json.leadZeile.lead_id;
  const exakt = $input.all().map((item) => item.json)
    .filter((item) => item.id && item.name === leadId);
  if (exakt.length > 1) throw new Error('Mehrere Drive-Ordner fuer ' + leadId);
  return [{ json: {
    lead_id: leadId, folder_id: exakt[0] ? exakt[0].id : '',
    vorhanden: exakt.length === 1,
  } }];
}
function reportsToBinaryCode() {
  const eingang = $input.first().json;
  const folderId = eingang.folder_id || eingang.id;
  if (!folderId) throw new Error('Drive-Ordner-ID fehlt');
  const berichte = $('Nutzlast pruefen').first().json.berichte || [];
  if (berichte.length !== 4) throw new Error('Vier Berichte fuer Upload erwartet');
  return berichte.map((bericht, index) => ({
    json: { folder_id: folderId, dateiname: bericht.dateiname, bericht_index: index },
    binary: { data: {
      data: bericht.inhalt_base64, mimeType: bericht.mime_type,
      fileName: bericht.dateiname,
    } },
    pairedItem: { item: 0 },
  }));
}
function driveLinkCode() {
  const uploads = $input.all().map((item) => item.json);
  if (uploads.length !== 4 || uploads.some((item) => !item.id)) {
    throw new Error('Nicht alle vier Drive-Uploads wurden bestaetigt');
  }
  const folderId = $('Berichte vorbereiten').first().json.folder_id;
  return [{ json: {
    lead_id: $('Nutzlast pruefen').first().json.leadZeile.lead_id,
    berichte_drive_url: 'https://drive.google.com/drive/folders/' + folderId,
  } }];
}
function wf2GuardCode() {
  const g = $('Gespraech auswerten').first().json;
  const zeilen = $input.all().map((item) => item.json).filter((row) => row && row.lead_id);
  if (zeilen.length !== 1) {
    throw new Error(zeilen.length
      ? 'Mehrere Sheet-Zeilen fuer Lead ' + g.lead_id
      : 'Lead ' + g.lead_id + ' steht nicht im Sheet. Erst die Analyse durchlaufen lassen.');
  }
  const lead = zeilen[0];
  const reihenfolge = ['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen'];
  const terminal = ['gewonnen', 'beendet'];
  const aktuell = String(lead.status || 'neu');
  const vorgeschlagen = String(g.status || aktuell);
  const lebenszyklus = { ...g };
  let statusHinweis = '';
  if (terminal.includes(aktuell) && vorgeschlagen !== aktuell) {
    lebenszyklus.status = aktuell;
    lebenszyklus.next_action = lead.next_action || '';
    lebenszyklus.next_action_at = lead.next_action_at || '';
    lebenszyklus.ende_grund = lead.ende_grund || '';
    lebenszyklus.wiedervorlage_am = lead.wiedervorlage_am || '';
    statusHinweis = 'Status ' + aktuell + ' wurde gegen einen automatischen Ruecksprung geschuetzt.';
  } else if (
    vorgeschlagen !== 'beendet'
    && reihenfolge.indexOf(aktuell) > reihenfolge.indexOf(vorgeschlagen)
  ) {
    lebenszyklus.status = aktuell;
    statusHinweis = 'Status ' + aktuell + ' bleibt erhalten; kein automatischer Ruecksprung.';
  }
  const empfaenger = g.mailadresse || lead.mail || '';
  const darfEntwurf = g.freigabe && empfaenger && lead.mail_entwurf;
  let blockiert = null;
  if (g.freigabe && !empfaenger) blockiert = 'keine Mailadresse hinterlegt';
  if (g.freigabe && !lead.mail_entwurf) blockiert = 'kein Mailentwurf im Sheet - Analyse erst abschliessen';
  return [{ json: {
    ...lebenszyklus, firma: lead.firma || '', empfaenger,
    betreff: lead.mail_betreff || 'Kurz zusammengefasst - die Punkte aus unserem Telefonat',
    mailtext: lead.mail_entwurf || '', darf_entwurf: darfEntwurf, blockiert,
    _status_hinweis: statusHinweis,
  } }];
}
function wf2NoDraftCode() {
  const d = $input.first().json;
  const lesbar = (s) => String(s || '').replace(/_/g, ' ');
  let meldung = d.blockiert
    ? 'Kein Entwurf moeglich fuer ' + d.firma + ': ' + d.blockiert
    : 'Gespraech festgehalten: ' + d.firma + ' (' + lesbar(d.ergebnis) + ')'
      + (d.next_action ? '\nNaechste Aktion: ' + lesbar(d.next_action) + ' am ' + d.next_action_at : '');
  if (d._status_hinweis) meldung += '\n' + d._status_hinweis;
  return [{ json: {
    lead_id: d.lead_id, firma: d.firma, status: d.status,
    next_action: d.next_action, next_action_at: d.next_action_at,
    ende_grund: d.ende_grund, wiedervorlage_am: d.wiedervorlage_am,
    email_freigabe: d.freigabe ? 'ja' : 'nein',
    email_freigabe_am: d.freigabe ? d.heute : '',
    email_freigabe_notiz: d.freigabe_notiz, _meldung: meldung,
  } }];
}
function wf2DraftCode() {
  const antwort = $input.first().json;
  const d = $('Freigabe pruefen').first().json;
  if (!antwort.id) throw new Error('Gmail hat keine Entwurfs-ID geliefert');
  return [{ json: {
    lead_id: d.lead_id, firma: d.firma, status: d.status,
    next_action: d.next_action, next_action_at: d.next_action_at,
    ende_grund: d.ende_grund, wiedervorlage_am: d.wiedervorlage_am,
    email_freigabe: 'ja', email_freigabe_am: d.heute,
    email_freigabe_notiz: d.freigabe_notiz,
    gmail_draft_id: antwort.id,
    gmail_thread_id: (antwort.message && antwort.message.threadId) || '',
    gmail_empfaenger: d.empfaenger, gmail_betreff: d.betreff,
    _meldung: (d._status_hinweis ? d._status_hinweis + '\n' : '')
      + 'Entwurf liegt in Gmail: ' + d.firma + ' an ' + d.empfaenger
      + '\nPruefen und selbst senden. Danach erkennt der Waechter den Versand automatisch.',
  } }];
}
function wf2FinalGuardCode() {
  const vorschlag = { ...$('Sheetzeile bauen').first().json };
  const zeilen = $input.all().map((item) => item.json).filter((row) => row && row.lead_id);
  if (zeilen.length !== 1) {
    throw new Error(zeilen.length
      ? 'Mehrere Sheet-Zeilen fuer Lead ' + vorschlag.lead_id
      : 'Lead ' + vorschlag.lead_id + ' wurde vor dem Schreiben nicht gefunden');
  }
  const aktuell = zeilen[0];
  const reihenfolge = ['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen'];
  const alt = String(aktuell.status || 'neu');
  const neu = String(vorschlag.status || alt);
  const terminalAktuell = ['gewonnen', 'beendet'].includes(alt);
  const ruecksprung = neu !== alt
    && neu !== 'beendet'
    && reihenfolge.indexOf(alt) > reihenfolge.indexOf(neu);
  if (terminalAktuell || ruecksprung) {
    vorschlag.status = alt;
    vorschlag.next_action = aktuell.next_action || '';
    vorschlag.next_action_at = aktuell.next_action_at || '';
    vorschlag.ende_grund = aktuell.ende_grund || '';
    vorschlag.wiedervorlage_am = aktuell.wiedervorlage_am || '';
  }
  return [{ json: vorschlag }];
}
function wf3GuardCode() {
  const vorschlaege = $('Aenderungen isolieren').all().map((item) => item.json);
  const aktuelle = $input.all().map((item) => item.json).filter((row) => row && row.lead_id);
  const reihenfolge = ['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen'];
  const terminal = ['gewonnen', 'beendet'];
  const result = [];
  for (let index = 0; index < vorschlaege.length; index += 1) {
    const vorschlag = { ...vorschlaege[index] };
    const treffer = aktuelle.filter((row) => row.lead_id === vorschlag.lead_id);
    if (treffer.length !== 1) {
      if (treffer.length > 1) throw new Error('Mehrere Sheet-Zeilen fuer Lead ' + vorschlag.lead_id);
      continue;
    }
    const lead = treffer[0];
    const alt = String(lead.status || 'neu');
    const neu = String(vorschlag.status || alt);
    if (terminal.includes(alt)) {
      vorschlag.status = alt;
      vorschlag.next_action = lead.next_action || '';
      vorschlag.next_action_at = lead.next_action_at || '';
      vorschlag.ende_grund = lead.ende_grund || '';
      vorschlag.wiedervorlage_am = lead.wiedervorlage_am || '';
    } else if (neu !== 'beendet' && reihenfolge.indexOf(alt) > reihenfolge.indexOf(neu)) {
      vorschlag.status = alt;
    }
    result.push({ json: vorschlag, pairedItem: { item: index } });
  }
  return result;
}
function deletionCandidatesCode() {
  const grenze = new Date();
  grenze.setMonth(grenze.getMonth() - 24);
  const result = [];
  for (const item of $input.all()) {
    const lead = item.json;
    const leadId = String(lead.lead_id || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(leadId)) continue;
    if (String(lead.status || '') !== 'beendet') continue;
    if (!['kein_bedarf', 'ungeeignet'].includes(String(lead.ende_grund || ''))) continue;
    const datumText = String(lead.unterlagen_gesendet_am || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datumText)) continue;
    const gesendetAm = new Date(datumText + 'T00:00:00Z');
    if (Number.isNaN(gesendetAm.getTime()) || gesendetAm.toISOString().slice(0, 10) !== datumText) continue;
    if (gesendetAm >= grenze) continue;
    const match = /^https:\/\/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(
      String(lead.berichte_drive_url || ''),
    );
    if (!match) continue;
    result.push({ json: { lead_id: leadId, folder_id: match[1] } });
  }
  return result;
}
function validateDeletionTargetCode() {
  const kandidaten = $('Drive-Loeschfristen filtern').all().map((item) => item.json);
  const gefunden = $input.all().map((item) => item.json);
  const result = [];
  for (let index = 0; index < kandidaten.length; index += 1) {
    const kandidat = kandidaten[index];
    const exakt = gefunden.filter((folder) =>
      folder.id === kandidat.folder_id && folder.name === kandidat.lead_id);
    if (exakt.length === 1) {
      result.push({ json: kandidat, pairedItem: { item: index } });
    }
  }
  return result;
}
function clearDriveLinkCode() {
  const kandidaten = $('Drive-Loeschziel pruefen').all().map((item) => item.json);
  return $input.all().map((item, index) => ({
    json: { lead_id: kandidaten[index].lead_id, berichte_drive_url: '' },
    pairedItem: { item: index },
  }));
}
function wf4RequestCode() {
  const ERWARTETES_TOKEN = 'TOKEN_HIER';
  const eingang = $input.first().json;
  const kopf = eingang.headers || {};
  const d = eingang.body || eingang;
  const fehler = (statusCode, error, message) => [{
    json: { ok: false, statusCode, error, message },
  }];
  if (ERWARTETES_TOKEN === 'TOKEN' + '_HIER') {
    return fehler(503, 'not_configured', 'CRM-Webhook-Token ist noch nicht konfiguriert');
  }
  if (kopf['x-crm-token'] !== ERWARTETES_TOKEN) {
    return fehler(401, 'unauthorized', 'Token stimmt nicht');
  }
  const leadId = String(d.lead_id || '').trim();
  const feld = String(d.feld || '').trim();
  const erlaubt = new Set([
    'status', 'notiz', 'ende_grund', 'wiedervorlage_am', 'next_action', 'next_action_at',
  ]);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(leadId)) {
    return fehler(400, 'invalid_lead_id', 'Ungueltige lead_id');
  }
  if (!erlaubt.has(feld)) return fehler(400, 'field_not_allowed', 'Feld ist nicht editierbar');
  const statuswerte = ['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen', 'beendet'];
  const endeGruende = ['', 'kein_bedarf', 'hat_agentur', 'zu_teuer', 'keine_reaktion', 'ungeeignet', 'mail_unzustellbar'];
  const actions = ['', 'analyse', 'anruf', 'followup_call', 'followup_mail', 'wiedervorlage', 'antwort_bearbeiten', 'angebot_erstellen', 'termin'];
  const datumGueltig = (wert) => {
    if (wert === '') return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
    const parsed = new Date(wert + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === wert;
  };
  let wert = d.wert === null || d.wert === undefined ? '' : String(d.wert);
  if (feld === 'notiz') {
    if (wert.length > 5000) return fehler(400, 'value_too_long', 'Notiz darf hoechstens 5000 Zeichen haben');
  } else wert = wert.trim();
  if (feld === 'status' && !statuswerte.includes(wert)) {
    return fehler(400, 'invalid_status', 'Ungueltiger Status');
  }
  if (feld === 'ende_grund' && !endeGruende.includes(wert)) {
    return fehler(400, 'invalid_ende_grund', 'Ungueltiger Abschlussgrund');
  }
  if (feld === 'next_action' && !actions.includes(wert)) {
    return fehler(400, 'invalid_next_action', 'Ungueltige naechste Aktion');
  }
  if (['wiedervorlage_am', 'next_action_at'].includes(feld) && !datumGueltig(wert)) {
    return fehler(400, 'invalid_date', 'Datum muss JJJJ-MM-TT entsprechen');
  }
  const erwarteterStatus = String(d.erwarteter_status || '').trim();
  if (feld === 'status' && !statuswerte.includes(erwarteterStatus)) {
    return fehler(400, 'expected_status_required', 'erwarteter_status fehlt oder ist ungueltig');
  }
  return [{ json: {
    ok: true, statusCode: 200, lead_id: leadId, feld, wert,
    erwarteter_status: erwarteterStatus,
    ruecksprung_bestaetigt: d.ruecksprung_bestaetigt === true,
  } }];
}
function wf4CheckCode() {
  const anfrage = $('Anfrage pruefen').first().json;
  const zeilen = $input.all().map((item) => item.json).filter((row) => row && row.lead_id);
  const fehler = (statusCode, error, message, extra = {}) => [{
    json: { ok: false, statusCode, error, message, ...extra },
  }];
  if (zeilen.length === 0) return fehler(404, 'lead_not_found', 'Lead wurde nicht gefunden');
  if (zeilen.length > 1) return fehler(409, 'duplicate_lead', 'lead_id ist im Sheet nicht eindeutig');
  const lead = zeilen[0];
  const aktuell = String(lead.status || 'neu');
  if (anfrage.feld === 'status' && anfrage.erwarteter_status !== aktuell) {
    return fehler(409, 'status_conflict', 'Status hat sich geaendert, bitte neu laden', {
      current_status: aktuell,
    });
  }
  const reihenfolge = ['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen'];
  const neu = anfrage.feld === 'status' ? anfrage.wert : aktuell;
  const ruecksprung = anfrage.feld === 'status' && neu !== aktuell && (
    ['gewonnen', 'beendet'].includes(aktuell)
    || (neu !== 'beendet' && reihenfolge.indexOf(neu) < reihenfolge.indexOf(aktuell))
  );
  if (ruecksprung && !anfrage.ruecksprung_bestaetigt) {
    return fehler(422, 'backward_transition_requires_confirmation',
      'Dieser Ruecksprung muss bestaetigt werden', { current_status: aktuell });
  }
  const statuswechsel = anfrage.feld === 'status' && neu !== aktuell;
  return [{ json: {
    ok: true, statusCode: 200,
    row: { lead_id: anfrage.lead_id, [anfrage.feld]: anfrage.wert },
    statuswechsel, current_status: aktuell, new_status: neu,
    needs_ende_grund: statuswechsel && neu === 'beendet' && !lead.ende_grund,
  } }];
}
function wf4RowCode() {
  return [{ json: $('Aenderung pruefen').first().json.row }];
}
function wf4ActivityCode() {
  const d = $('Aenderung pruefen').first().json;
  return [{ json: {
    activity_id: 'A-' + Date.now(), lead_id: d.row.lead_id,
    datum: new Date().toISOString(), typ: 'status_wechsel', richtung: '',
    verwendete_argumente: '', ergebnis: 'offen',
    notiz: d.current_status + ' -> ' + d.new_status,
  } }];
}

function wf5AuthCode() {
  const ERWARTETES_TOKEN = 'CRM_READ_TOKEN_HIER';
  const eingang = $input.first().json || {};
  const kopf = eingang.headers && typeof eingang.headers === 'object'
    ? eingang.headers
    : {};
  const authorization = Object.entries(kopf)
    .find(([name]) => String(name).toLowerCase() === 'authorization')?.[1];
  const fehler = (statusCode, error, message) => [{
    json: { ok: false, statusCode, error, message },
  }];
  if (ERWARTETES_TOKEN === 'CRM_READ_TOKEN' + '_HIER') {
    return fehler(500, 'not_configured', 'CRM-Lesezugriff ist nicht konfiguriert');
  }
  const match = /^Bearer ([^\s]+)$/i.exec(typeof authorization === 'string' ? authorization : '');
  const token = match?.[1] || '';
  const sicherGleich = (links, rechts) => {
    const a = String(links);
    const b = String(rechts);
    let unterschied = a.length ^ b.length;
    const laenge = Math.max(a.length, b.length);
    for (let index = 0; index < laenge; index += 1) {
      unterschied |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
    }
    return unterschied === 0;
  };
  if (!token || !sicherGleich(token, ERWARTETES_TOKEN)) {
    return fehler(401, 'unauthorized', 'Nicht autorisiert');
  }
  // Nur dieses tokenfreie Objekt verlaesst die Pruefung.
  return [{ json: { ok: true, statusCode: 200 } }];
}

function wf5ResponseCode() {
  const schemas = {
    leads: [
      'lead_id', 'firma', 'website', 'ort', 'branche', 'ansprechpartner', 'anrede',
      'mail', 'telefon', 'kontaktquelle', 'website_score', 'akquise_score',
      'akquise_ansatz', 'compliance', 'status', 'next_action', 'next_action_at',
      'email_freigabe', 'email_freigabe_am', 'email_freigabe_notiz',
      'gmail_draft_id', 'gmail_thread_id', 'gmail_empfaenger', 'gmail_betreff',
      'unterlagen_gesendet_am', 'ende_grund', 'wiedervorlage_am', 'notiz',
      'berichte_pfad', 'berichte_drive_url', 'mail_betreff', 'mail_entwurf',
    ],
    activities: [
      'activity_id', 'lead_id', 'datum', 'typ', 'richtung',
      'verwendete_argumente', 'ergebnis', 'notiz', 'external_id',
    ],
    audits: [
      'audit_id', 'lead_id', 'datum', 'collector_version', 'regelwerk_version',
      'website_score', 'akquise_score', 'seo', 'technik', 'air', 'design',
      'conversion', 'local', 'vertrauen', 'compliance', 'seiten_geprueft', 'pfad',
    ],
  };
  const zeilen = (knoten, spalten) => $(knoten).all()
    .map((item) => item.json)
    .filter((row) => row && Object.keys(row).length > 0)
    .map((row) => Object.fromEntries(spalten.map((spalte) => [spalte, row[spalte] ?? ''])));
  return [{ json: {
    ok: true,
    leads: zeilen('Leads lesen', schemas.leads),
    activities: zeilen('Activities lesen', schemas.activities),
    audits: zeilen('Audits lesen', schemas.audits),
  } }];
}

function wf5ReadErrorCode() {
  // Fehler des Google-Knotens nie an den Aufrufer oder in eigene Logs weiterreichen.
  return [{ json: {
    ok: false,
    statusCode: 500,
    error: 'read_failed',
    message: 'CRM-Daten konnten nicht geladen werden',
  } }];
}

function wf5ContinueCode() {
  // Sheet-Leseoperationen koennen viele Items liefern. Der naechste Read darf
  // trotzdem nur einmal laufen, sonst vervielfacht sich die API-Last pro Zeile.
  return [{ json: { weiter: true } }];
}

function wf6ExpandMessageIdsCode() {
  const antwort = $input.first().json || {};
  const nachrichten = Array.isArray(antwort.messages) ? antwort.messages : [];
  const gesehen = new Set();
  return nachrichten
    .filter((nachricht) => nachricht && typeof nachricht.id === 'string' && nachricht.id)
    .filter((nachricht) => {
      if (gesehen.has(nachricht.id)) return false;
      gesehen.add(nachricht.id);
      return true;
    })
    .map((nachricht) => ({ json: { gmail_message_id: nachricht.id } }));
}

function wf6NormalizeMessagesCode() {
  const EIGENE_ADRESSE = 'info@360-ai.org';
  const MARKER = '#Anfrage';
  const emailMuster = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const kopf = (nachricht, name) => {
    const headers = (nachricht.payload && nachricht.payload.headers) || [];
    const treffer = headers.find((header) =>
      String(header.name || '').toLowerCase() === name.toLowerCase());
    return treffer ? String(treffer.value || '') : '';
  };
  const adressen = (wert) => [...new Set(
    (String(wert || '').match(emailMuster) || []).map((adresse) => adresse.toLowerCase()),
  )];
  const eigene = EIGENE_ADRESSE.toLowerCase();
  const markerMuster = /(^|\s)#anfrage(?=$|[\s)\]:;,.!?-])/i;
  const result = [];

  for (const item of $input.all()) {
    const nachricht = item.json || {};
    const id = String(nachricht.id || '').trim();
    const ungueltig = (fehler) => result.push({
      json: { ok: false, gmail_message_id: id, fehler },
    });
    if (!id || !nachricht.threadId) {
      ungueltig('Gmail-Metadaten unvollstaendig');
      continue;
    }
    if (!(nachricht.labelIds || []).includes('SENT')) {
      ungueltig('Nachricht liegt nicht in Gesendet');
      continue;
    }
    if (!adressen(kopf(nachricht, 'From')).includes(eigene)) {
      ungueltig('Absender ist nicht ' + EIGENE_ADRESSE);
      continue;
    }
    if (!adressen(kopf(nachricht, 'Bcc')).includes(eigene)) {
      ungueltig('BCC an ' + EIGENE_ADRESSE + ' fehlt');
      continue;
    }
    const betreff = kopf(nachricht, 'Subject').trim();
    if (!markerMuster.test(betreff)) {
      ungueltig('Betreffmarker ' + MARKER + ' fehlt');
      continue;
    }
    const empfaenger = adressen(kopf(nachricht, 'To')).filter((adresse) => adresse !== eigene);
    if (empfaenger.length !== 1) {
      ungueltig('Genau ein externer Empfaenger im An-Feld erwartet');
      continue;
    }
    const toHeader = kopf(nachricht, 'To');
    let name = toHeader.replace(/<[^>]+>/g, '').replace(/^\s*"|"\s*$/g, '').trim();
    if (!name || /@|^=\?/i.test(name)) name = '';
    const zeit = Number(nachricht.internalDate);
    const datum = Number.isFinite(zeit) && zeit > 0 ? new Date(zeit) : new Date();
    result.push({ json: {
      ok: true,
      gmail_message_id: id,
      gmail_thread_id: String(nachricht.threadId),
      empfaenger: empfaenger[0],
      ansprechpartner: name.slice(0, 200),
      betreff: betreff.slice(0, 500),
      gesendet_am: datum.toISOString(),
    } });
  }
  return result;
}

function wf6PrepareWritesCode() {
  const nachrichten = $('Nachrichten normalisieren').all().map((item) => item.json);
  const leads = $('Leads lesen').all().map((item) => item.json)
    .filter((lead) => lead && lead.lead_id);
  const activities = $('Activities lesen').all().map((item) => item.json)
    .filter((activity) => activity && activity.activity_id);
  const externeIds = new Set(activities.map((activity) => String(activity.external_id || ''))
    .filter(Boolean));
  const perMail = new Map();
  const mail = (wert) => String(wert || '').trim().toLowerCase();
  const indexiere = (lead) => {
    for (const adresse of new Set([mail(lead.mail), mail(lead.gmail_empfaenger)])) {
      if (!adresse) continue;
      const liste = perMail.get(adresse) || [];
      if (!liste.some((eintrag) => eintrag.lead_id === lead.lead_id)) liste.push(lead);
      perMail.set(adresse, liste);
    }
  };
  leads.forEach(indexiere);
  const sheetText = (wert, laenge = 500) => {
    let text = String(wert || '').trim().slice(0, laenge);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return text;
  };
  const plusTage = (iso, tage) => {
    const datum = new Date(iso);
    datum.setUTCDate(datum.getUTCDate() + tage);
    return datum.toISOString().slice(0, 10);
  };
  const leadZeilen = [];
  const activityZeilen = [];
  const fehler = [];
  let neu = 0;
  let ergaenzt = 0;
  let duplikate = 0;

  for (const nachricht of nachrichten) {
    if (!nachricht.ok) {
      fehler.push(nachricht.fehler || 'Unbekannter Importfehler');
      continue;
    }
    const externalId = 'gmail:' + nachricht.gmail_message_id;
    if (externeIds.has(externalId)) {
      duplikate += 1;
      continue;
    }
    const treffer = perMail.get(mail(nachricht.empfaenger)) || [];
    if (treffer.length > 1) {
      fehler.push('Mehrere Leads verwenden ' + nachricht.empfaenger + '; Mail nicht zugeordnet');
      continue;
    }
    const sendetag = String(nachricht.gesendet_am).slice(0, 10);
    let lead;
    if (treffer.length === 1) {
      lead = treffer[0];
      const aktuell = String(lead.status || 'neu');
      const frueh = ['neu', 'analysiert'].includes(aktuell);
      const zeile = {
        lead_id: lead.lead_id,
        gmail_thread_id: nachricht.gmail_thread_id,
        gmail_empfaenger: nachricht.empfaenger,
        gmail_betreff: sheetText(nachricht.betreff),
        unterlagen_gesendet_am: lead.unterlagen_gesendet_am || sendetag,
      };
      if (!lead.mail) zeile.mail = nachricht.empfaenger;
      if (!lead.ansprechpartner && nachricht.ansprechpartner) {
        zeile.ansprechpartner = sheetText(nachricht.ansprechpartner, 200);
      }
      if (frueh) {
        zeile.status = 'kontaktiert';
        zeile.next_action = 'followup_call';
        zeile.next_action_at = plusTage(nachricht.gesendet_am, 14);
      } else if (aktuell === 'kontaktiert' && !lead.next_action) {
        zeile.next_action = 'followup_call';
        zeile.next_action_at = plusTage(nachricht.gesendet_am, 14);
      }
      leadZeilen.push(zeile);
      Object.assign(lead, zeile);
      ergaenzt += 1;
    } else {
      const suffix = String(nachricht.gmail_message_id).replace(/[^A-Za-z0-9]/g, '').slice(-12);
      const leadId = 'L-' + sendetag.replace(/-/g, '') + '-mail-' + suffix;
      lead = {
        lead_id: leadId,
        firma: '', website: '', ort: '', branche: '',
        ansprechpartner: sheetText(nachricht.ansprechpartner, 200), anrede: 'sie',
        mail: nachricht.empfaenger, telefon: '', kontaktquelle: 'direkt_mail',
        website_score: '', akquise_score: '', akquise_ansatz: '', compliance: '',
        status: 'kontaktiert', next_action: 'followup_call',
        next_action_at: plusTage(nachricht.gesendet_am, 14),
        email_freigabe: 'nein', email_freigabe_am: '', email_freigabe_notiz: '',
        gmail_draft_id: '', gmail_thread_id: nachricht.gmail_thread_id,
        gmail_empfaenger: nachricht.empfaenger,
        gmail_betreff: sheetText(nachricht.betreff),
        unterlagen_gesendet_am: sendetag, ende_grund: '', wiedervorlage_am: '',
        notiz: 'Automatisch aus gesendeter BCC-Mail mit #Anfrage erfasst.',
        berichte_pfad: '', berichte_drive_url: '', mail_betreff: '', mail_entwurf: '',
      };
      leadZeilen.push(lead);
      leads.push(lead);
      indexiere(lead);
      neu += 1;
    }
    activityZeilen.push({
      activity_id: 'A-mail-' + String(nachricht.gmail_message_id).replace(/[^A-Za-z0-9_-]/g, ''),
      lead_id: lead.lead_id,
      datum: nachricht.gesendet_am,
      typ: 'mail', richtung: 'raus', verwendete_argumente: '', ergebnis: 'offen',
      notiz: sheetText('Betreff: ' + nachricht.betreff, 1000),
      external_id: externalId,
    });
    externeIds.add(externalId);
  }
  return [{ json: { leadZeilen, activityZeilen, neu, ergaenzt, duplikate, fehler } }];
}

function wf6LeadRowsCode() {
  const daten = $input.first().json || {};
  return (daten.leadZeilen || []).map((zeile) => ({
    json: zeile, pairedItem: { item: 0 },
  }));
}

function wf6ActivityRowsCode() {
  const daten = $input.first().json || {};
  return (daten.activityZeilen || []).map((zeile) => ({
    json: zeile, pairedItem: { item: 0 },
  }));
}

function wf6TelegramCode() {
  const daten = $input.first().json || {};
  const fehler = Array.isArray(daten.fehler) ? daten.fehler : [];
  if (!daten.neu && !daten.ergaenzt && !fehler.length) return [];
  const zeilen = [
    'BCC-Import #Anfrage:',
    String(daten.neu || 0) + ' Lead(s) neu angelegt',
    String(daten.ergaenzt || 0) + ' bestehende Lead(s) ergaenzt',
  ];
  if (fehler.length) {
    zeilen.push('Bitte pruefen:');
    zeilen.push(...fehler.slice(0, 10).map((fehlertext) => '- ' + fehlertext));
  }
  return [{ json: { text: zeilen.join('\n') } }];
}

async function buildWf1() {
  const file = 'akquise-wf1-lead-quickcheck.json';
  const workflow = await readWorkflow(file);
  byName(workflow, 'Nutzlast pruefen').parameters.jsCode = bodyOf(wf1PayloadCode);
  byName(workflow, 'Leadzeile isolieren').parameters.jsCode = bodyOf(wf1MergeLeadCode);
  upsertNode(workflow, sheetReadNode({
    id: 'b1000000-0117-4000-8000-000000000117', name: 'Analyse-Lead lesen',
    sheet: 'Leads', lookup: { column: 'lead_id', value: '={{ $json.leadZeile.lead_id }}' },
    position: [40, 140],
  }));
  upsertNode(workflow, ifNode({
    id: 'b1000000-0018-4000-8000-000000000018', name: 'Berichte vorhanden?',
    value: "={{ $('Nutzlast pruefen').first().json.berichte.length === 4 }}",
    position: [940, 140],
  }));
  upsertNode(workflow, {
    parameters: {
      resource: 'fileFolder', operation: 'search', searchMethod: 'name',
      queryString: "={{ $('Nutzlast pruefen').first().json.leadZeile.lead_id }}",
      returnAll: false, limit: 10,
      filter: {
        folderId: { __rl: true, value: 'DRIVE_FOLDER_ID_HIER', mode: 'id' },
        whatToSearch: 'folders', includeTrashed: false,
      },
      options: { fields: ['id', 'name', 'parents', 'webViewLink'] },
    },
    id: 'b1000000-0019-4000-8000-000000000019', name: 'Drive-Ordner suchen',
    type: 'n8n-nodes-base.googleDrive', typeVersion: 3,
    position: [1160, 40], alwaysOutputData: true,
  });
  upsertNode(workflow, codeNode({
    id: 'b1000000-0020-4000-8000-000000000020', name: 'Drive-Ordner bestimmen',
    fn: chooseDriveFolderCode, position: [1380, 40],
  }));
  upsertNode(workflow, ifNode({
    id: 'b1000000-0021-4000-8000-000000000021', name: 'Drive-Ordner vorhanden?',
    value: '={{ $json.vorhanden }}', position: [1600, 40],
  }));
  upsertNode(workflow, {
    parameters: {
      resource: 'folder', operation: 'create',
      name: "={{ $('Nutzlast pruefen').first().json.leadZeile.lead_id }}",
      driveId: { __rl: true, value: 'My Drive', mode: 'list' },
      folderId: { __rl: true, value: 'DRIVE_FOLDER_ID_HIER', mode: 'id' },
      options: { simplifyOutput: true },
    },
    id: 'b1000000-0022-4000-8000-000000000022', name: 'Drive-Ordner anlegen',
    type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [1810, 160],
  });
  upsertNode(workflow, codeNode({
    id: 'b1000000-0023-4000-8000-000000000023', name: 'Berichte vorbereiten',
    fn: reportsToBinaryCode, position: [2020, 40],
  }));
  upsertNode(workflow, {
    parameters: {
      operation: 'upload', inputDataFieldName: 'data', name: '={{ $json.dateiname }}',
      driveId: { __rl: true, value: 'My Drive', mode: 'list' },
      folderId: { __rl: true, value: '={{ $json.folder_id }}', mode: 'id' },
      options: { simplifyOutput: true },
    },
    id: 'b1000000-0024-4000-8000-000000000024', name: 'Berichte hochladen',
    type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [2240, 40],
  });
  upsertNode(workflow, codeNode({
    id: 'b1000000-0025-4000-8000-000000000025', name: 'Drive-Link bauen',
    fn: driveLinkCode, position: [2460, 40],
  }));
  upsertNode(workflow, sheetUpsertNode({
    id: 'b1000000-0026-4000-8000-000000000026', name: 'Drive-Link speichern',
    sheet: 'Leads', columns: LEAD_COLUMNS, match: 'lead_id', position: [2680, 40],
  }));
  workflow.connections['Nutzlast pruefen'] = { main: [[edge('Analyse-Lead lesen')]] };
  workflow.connections['Analyse-Lead lesen'] = { main: [[edge('Leadzeile isolieren')]] };
  workflow.connections['Audit anlegen'] = {
    main: [[edge('Berichte vorhanden?'), edge('Analyse melden')]],
  };
  workflow.connections['Berichte vorhanden?'] = {
    main: [[edge('Drive-Ordner suchen')], [edge('Antwort')]],
  };
  workflow.connections['Drive-Ordner suchen'] = { main: [[edge('Drive-Ordner bestimmen')]] };
  workflow.connections['Drive-Ordner bestimmen'] = { main: [[edge('Drive-Ordner vorhanden?')]] };
  workflow.connections['Drive-Ordner vorhanden?'] = {
    main: [[edge('Berichte vorbereiten')], [edge('Drive-Ordner anlegen')]],
  };
  workflow.connections['Drive-Ordner anlegen'] = { main: [[edge('Berichte vorbereiten')]] };
  workflow.connections['Berichte vorbereiten'] = { main: [[edge('Berichte hochladen')]] };
  workflow.connections['Berichte hochladen'] = { main: [[edge('Drive-Link bauen')]] };
  workflow.connections['Drive-Link bauen'] = { main: [[edge('Drive-Link speichern')]] };
  workflow.connections['Drive-Link speichern'] = { main: [[edge('Antwort')]] };
  const audit = byName(workflow, 'Audit anlegen');
  audit.parameters.operation = 'appendOrUpdate';
  audit.parameters.columns = {
    mappingMode: 'autoMapInputData', matchingColumns: ['audit_id'],
    schema: schema(AUDIT_COLUMNS, 'audit_id'),
  };
  for (const node of workflow.nodes.filter((candidate) =>
    candidate.type === 'n8n-nodes-base.googleSheets'
    && candidate.parameters.sheetName?.value === 'Leads'
    && candidate.parameters.operation === 'appendOrUpdate')) {
    node.parameters.columns.schema = schema(LEAD_COLUMNS, 'lead_id');
  }
  await writeWorkflow(file, workflow);
}
async function buildWf2() {
  const file = 'akquise-wf2-kommunikation.json';
  const workflow = await readWorkflow(file);
  byName(workflow, 'Freigabe pruefen').parameters.jsCode = bodyOf(wf2GuardCode);
  byName(workflow, 'Ohne Entwurf fortschreiben').parameters.jsCode = bodyOf(wf2NoDraftCode);
  byName(workflow, 'Entwurfsdaten sichern').parameters.jsCode = bodyOf(wf2DraftCode);
  upsertNode(workflow, sheetReadNode({
    id: 'b2000000-0030-4000-8000-000000000030', name: 'Lead vor Schreiben erneut lesen',
    sheet: 'Leads', lookup: { column: 'lead_id', value: '={{ $json.lead_id }}' },
    position: [1360, 160],
  }));
  upsertNode(workflow, codeNode({
    id: 'b2000000-0031-4000-8000-000000000031', name: 'Status vor Schreiben absichern',
    fn: wf2FinalGuardCode, position: [1580, 160],
  }));
  workflow.connections['Sheetzeile bauen'] = { main: [[edge('Lead vor Schreiben erneut lesen')]] };
  workflow.connections['Lead vor Schreiben erneut lesen'] = { main: [[edge('Status vor Schreiben absichern')]] };
  workflow.connections['Status vor Schreiben absichern'] = { main: [[edge('Lead fortschreiben')]] };
  for (const node of workflow.nodes.filter((candidate) =>
    candidate.type === 'n8n-nodes-base.googleSheets'
    && candidate.parameters.sheetName?.value === 'Leads'
    && candidate.parameters.operation === 'appendOrUpdate')) {
    node.parameters.columns.schema = schema(LEAD_COLUMNS, 'lead_id');
  }
  for (const node of workflow.nodes.filter((candidate) =>
    candidate.type === 'n8n-nodes-base.googleSheets'
    && candidate.parameters.sheetName?.value === 'Activities')) {
    node.parameters.columns.schema = schema(ACTIVITY_COLUMNS);
  }
  await writeWorkflow(file, workflow);
}
async function buildWf3() {
  const file = 'akquise-wf3-watcher.json';
  const workflow = await readWorkflow(file);
  upsertNode(workflow, sheetReadNode({
    id: 'b3000000-0030-4000-8000-000000000030', name: 'Leadstatus erneut lesen',
    sheet: 'Leads', lookup: { column: 'lead_id', value: '={{ $json.lead_id }}' },
    position: [500, -260],
  }));
  upsertNode(workflow, codeNode({
    id: 'b3000000-0031-4000-8000-000000000031', name: 'Aenderungen absichern',
    fn: wf3GuardCode, position: [720, -260],
  }));
  workflow.connections['Aenderungen isolieren'] = { main: [[edge('Leadstatus erneut lesen')]] };
  workflow.connections['Leadstatus erneut lesen'] = { main: [[edge('Aenderungen absichern')]] };
  workflow.connections['Aenderungen absichern'] = { main: [[edge('Leads fortschreiben')]] };
  upsertNode(workflow, codeNode({
    id: 'b3000000-0032-4000-8000-000000000032', name: 'Drive-Loeschfristen filtern',
    fn: deletionCandidatesCode, position: [60, 420],
  }));
  upsertNode(workflow, {
    parameters: {
      resource: 'fileFolder', operation: 'search', searchMethod: 'name',
      queryString: '={{ $json.lead_id }}', returnAll: false, limit: 10,
      filter: {
        folderId: { __rl: true, value: 'DRIVE_FOLDER_ID_HIER', mode: 'id' },
        whatToSearch: 'folders', includeTrashed: false,
      },
      options: { fields: ['id', 'name', 'parents'] },
    },
    id: 'b3000000-0033-4000-8000-000000000033', name: 'Drive-Ordner im Root suchen',
    type: 'n8n-nodes-base.googleDrive', typeVersion: 3,
    position: [280, 420], alwaysOutputData: true,
  });
  upsertNode(workflow, codeNode({
    id: 'b3000000-0034-4000-8000-000000000034', name: 'Drive-Loeschziel pruefen',
    fn: validateDeletionTargetCode, position: [500, 420],
  }));
  upsertNode(workflow, {
    parameters: {
      resource: 'folder', operation: 'deleteFolder',
      folderNoRootId: { __rl: true, value: '={{ $json.folder_id }}', mode: 'id' },
      options: { deletePermanently: true },
    },
    id: 'b3000000-0035-4000-8000-000000000035', name: 'Drive-Ordner dauerhaft loeschen',
    type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [720, 420],
  });
  upsertNode(workflow, codeNode({
    id: 'b3000000-0036-4000-8000-000000000036', name: 'Drive-Link leeren',
    fn: clearDriveLinkCode, position: [940, 420],
  }));
  upsertNode(workflow, sheetUpsertNode({
    id: 'b3000000-0037-4000-8000-000000000037', name: 'Drive-Link aus Sheet entfernen',
    sheet: 'Leads', columns: LEAD_COLUMNS, match: 'lead_id', position: [1160, 420],
  }));
  const morgen = workflow.connections['Leads lesen (Morgen)']?.main?.[0] || [];
  if (!morgen.some((connection) => connection.node === 'Drive-Loeschfristen filtern')) {
    morgen.push(edge('Drive-Loeschfristen filtern'));
  }
  workflow.connections['Leads lesen (Morgen)'] = { main: [morgen] };
  workflow.connections['Drive-Loeschfristen filtern'] = { main: [[edge('Drive-Ordner im Root suchen')]] };
  workflow.connections['Drive-Ordner im Root suchen'] = { main: [[edge('Drive-Loeschziel pruefen')]] };
  workflow.connections['Drive-Loeschziel pruefen'] = { main: [[edge('Drive-Ordner dauerhaft loeschen')]] };
  workflow.connections['Drive-Ordner dauerhaft loeschen'] = { main: [[edge('Drive-Link leeren')]] };
  workflow.connections['Drive-Link leeren'] = { main: [[edge('Drive-Link aus Sheet entfernen')]] };
  for (const node of workflow.nodes.filter((candidate) =>
    candidate.type === 'n8n-nodes-base.googleSheets'
    && candidate.parameters.sheetName?.value === 'Leads'
    && candidate.parameters.operation === 'appendOrUpdate')) {
    node.parameters.columns.schema = schema(LEAD_COLUMNS, 'lead_id');
  }
  await writeWorkflow(file, workflow);
}
async function buildWf4() {
  const workflow = {
    name: '360ai Akquise — WF4 CRM-Schreiben',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST', path: 'akquise-crm-write',
          responseMode: 'responseNode', options: {},
        },
        id: 'b4000000-0001-4000-8000-000000000001', name: 'Webhook CRM-Schreiben',
        type: 'n8n-nodes-base.webhook', typeVersion: 2,
        position: [-760, 0], webhookId: 'akquise-crm-write',
      },
      codeNode({
        id: 'b4000000-0002-4000-8000-000000000002', name: 'Anfrage pruefen',
        fn: wf4RequestCode, position: [-540, 0],
      }),
      ifNode({
        id: 'b4000000-0003-4000-8000-000000000003', name: 'Anfrage gueltig?',
        value: '={{ $json.ok }}', position: [-320, 0],
      }),
      sheetReadNode({
        id: 'b4000000-0004-4000-8000-000000000004', name: 'Aktuellen Lead lesen',
        sheet: 'Leads', lookup: { column: 'lead_id', value: '={{ $json.lead_id }}' },
        position: [-100, -100],
      }),
      codeNode({
        id: 'b4000000-0005-4000-8000-000000000005', name: 'Aenderung pruefen',
        fn: wf4CheckCode, position: [120, -100],
      }),
      ifNode({
        id: 'b4000000-0006-4000-8000-000000000006', name: 'Aenderung schreibbar?',
        value: '={{ $json.ok }}', position: [340, -100],
      }),
      codeNode({
        id: 'b4000000-0007-4000-8000-000000000007', name: 'Sheet-Aenderung bauen',
        fn: wf4RowCode, position: [560, -180],
      }),
      sheetUpsertNode({
        id: 'b4000000-0008-4000-8000-000000000008', name: 'Lead schreiben',
        sheet: 'Leads', columns: LEAD_COLUMNS, match: 'lead_id', position: [780, -180],
      }),
      ifNode({
        id: 'b4000000-0009-4000-8000-000000000009', name: 'Statuswechsel?',
        value: "={{ $('Aenderung pruefen').first().json.statuswechsel }}",
        position: [1000, -180],
      }),
      codeNode({
        id: 'b4000000-0010-4000-8000-000000000010', name: 'Statusaktivitaet bauen',
        fn: wf4ActivityCode, position: [1220, -260],
      }),
      sheetAppendNode({
        id: 'b4000000-0011-4000-8000-000000000011', name: 'Statusaktivitaet anlegen',
        sheet: 'Activities', columns: ACTIVITY_COLUMNS, position: [1440, -260],
      }),
      {
        parameters: {
          respondWith: 'json',
          responseBody: "={{ JSON.stringify({ ok: true, lead_id: $('Anfrage pruefen').first().json.lead_id, feld: $('Anfrage pruefen').first().json.feld, wert: $('Anfrage pruefen').first().json.wert, needs_ende_grund: $('Aenderung pruefen').first().json.needs_ende_grund }) }}",
          options: {
            responseCode: 200,
            responseHeaders: { entries: [
              { name: 'Content-Type', value: 'application/json; charset=utf-8' },
              { name: 'Cache-Control', value: 'no-store' },
            ] },
          },
        },
        id: 'b4000000-0012-4000-8000-000000000012', name: 'Erfolg antworten',
        type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
        position: [1660, -100],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify({ ok: false, error: $json.error, message: $json.message, current_status: $json.current_status || null }) }}',
          options: {
            responseCode: '={{ Number($json.statusCode || 400) }}',
            responseHeaders: { entries: [
              { name: 'Content-Type', value: 'application/json; charset=utf-8' },
              { name: 'Cache-Control', value: 'no-store' },
            ] },
          },
        },
        id: 'b4000000-0013-4000-8000-000000000013', name: 'Fehler antworten',
        type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
        position: [560, 120],
      },
    ],
    connections: {
      'Webhook CRM-Schreiben': { main: [[edge('Anfrage pruefen')]] },
      'Anfrage pruefen': { main: [[edge('Anfrage gueltig?')]] },
      'Anfrage gueltig?': {
        main: [[edge('Aktuellen Lead lesen')], [edge('Fehler antworten')]],
      },
      'Aktuellen Lead lesen': { main: [[edge('Aenderung pruefen')]] },
      'Aenderung pruefen': { main: [[edge('Aenderung schreibbar?')]] },
      'Aenderung schreibbar?': {
        main: [[edge('Sheet-Aenderung bauen')], [edge('Fehler antworten')]],
      },
      'Sheet-Aenderung bauen': { main: [[edge('Lead schreiben')]] },
      'Lead schreiben': { main: [[edge('Statuswechsel?')]] },
      'Statuswechsel?': {
        main: [[edge('Statusaktivitaet bauen')], [edge('Erfolg antworten')]],
      },
      'Statusaktivitaet bauen': { main: [[edge('Statusaktivitaet anlegen')]] },
      'Statusaktivitaet anlegen': { main: [[edge('Erfolg antworten')]] },
    },
    active: false,
    settings: { executionOrder: 'v1' },
    tags: [{ name: 'akquise' }],
  };
  await writeWorkflow('wf4-crm-write.json', workflow);
}

async function buildWf5() {
  const readOptions = (range) => ({
    dataLocationOnSheet: {
      values: { rangeDefinition: 'specifyRangeA1', range },
    },
  });
  const readNode = ({ id, name, sheet, range, position }) => ({
    ...sheetReadNode({
      id, name, sheet, position,
      options: readOptions(range), explicitRead: true, alwaysOutputData: true,
    }),
    onError: 'continueErrorOutput',
  });
  const workflow = {
    name: '360ai Akquise — WF5 CRM-Lesen',
    nodes: [
      {
        parameters: {
          httpMethod: 'GET', path: 'akquise-crm-read',
          responseMode: 'responseNode', options: {},
        },
        id: 'b5000000-0001-4000-8000-000000000001', name: 'Webhook CRM-Lesen',
        type: 'n8n-nodes-base.webhook', typeVersion: 2,
        position: [-760, 0], webhookId: 'akquise-crm-read',
      },
      {
        ...codeNode({
          id: 'b5000000-0002-4000-8000-000000000002', name: 'Lesetoken pruefen',
          fn: wf5AuthCode, position: [-540, 0],
        }),
        onError: 'continueErrorOutput',
      },
      ifNode({
        id: 'b5000000-0003-4000-8000-000000000003', name: 'Anfrage autorisiert?',
        value: '={{ $json.ok }}', position: [-320, 0],
      }),
      readNode({
        id: 'b5000000-0004-4000-8000-000000000004', name: 'Leads lesen',
        sheet: 'Leads', range: 'A:AF', position: [-100, -160],
      }),
      {
        ...codeNode({
          id: 'b5000000-0011-4000-8000-000000000011', name: 'Leads gesammelt',
          fn: wf5ContinueCode, position: [120, -160],
        }),
        onError: 'continueErrorOutput',
      },
      readNode({
        id: 'b5000000-0005-4000-8000-000000000005', name: 'Activities lesen',
        sheet: 'Activities', range: 'A:I', position: [340, -160],
      }),
      {
        ...codeNode({
          id: 'b5000000-0012-4000-8000-000000000012', name: 'Activities gesammelt',
          fn: wf5ContinueCode, position: [560, -160],
        }),
        onError: 'continueErrorOutput',
      },
      readNode({
        id: 'b5000000-0006-4000-8000-000000000006', name: 'Audits lesen',
        sheet: 'Audits', range: 'A:Q', position: [780, -160],
      }),
      {
        ...codeNode({
          id: 'b5000000-0007-4000-8000-000000000007', name: 'Antwort bauen',
          fn: wf5ResponseCode, position: [1000, -160],
        }),
        onError: 'continueErrorOutput',
      },
      {
        parameters: {
          respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}',
          options: {
            responseCode: 200,
            responseHeaders: { entries: [
              { name: 'Content-Type', value: 'application/json; charset=utf-8' },
              { name: 'Cache-Control', value: 'no-store' },
            ] },
          },
        },
        id: 'b5000000-0008-4000-8000-000000000008', name: 'Erfolg antworten',
        type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
        position: [1220, -160],
      },
      codeNode({
        id: 'b5000000-0009-4000-8000-000000000009', name: 'Lesefehler maskieren',
        fn: wf5ReadErrorCode, position: [780, 100],
      }),
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify({ ok: false, error: $json.error, message: $json.message }) }}',
          options: {
            responseCode: '={{ Number($json.statusCode) === 401 ? 401 : 500 }}',
            responseHeaders: { entries: [
              { name: 'Content-Type', value: 'application/json; charset=utf-8' },
              { name: 'Cache-Control', value: 'no-store' },
            ] },
          },
        },
        id: 'b5000000-0010-4000-8000-000000000010', name: 'Fehler antworten',
        type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
        position: [1220, 100],
      },
    ],
    connections: {
      'Webhook CRM-Lesen': { main: [[edge('Lesetoken pruefen')]] },
      'Lesetoken pruefen': {
        main: [[edge('Anfrage autorisiert?')], [edge('Lesefehler maskieren')]],
      },
      'Anfrage autorisiert?': {
        main: [[edge('Leads lesen')], [edge('Fehler antworten')]],
      },
      'Leads lesen': {
        main: [[edge('Leads gesammelt')], [edge('Lesefehler maskieren')]],
      },
      'Leads gesammelt': {
        main: [[edge('Activities lesen')], [edge('Lesefehler maskieren')]],
      },
      'Activities lesen': {
        main: [[edge('Activities gesammelt')], [edge('Lesefehler maskieren')]],
      },
      'Activities gesammelt': {
        main: [[edge('Audits lesen')], [edge('Lesefehler maskieren')]],
      },
      'Audits lesen': {
        main: [[edge('Antwort bauen')], [edge('Lesefehler maskieren')]],
      },
      'Antwort bauen': {
        main: [[edge('Erfolg antworten')], [edge('Lesefehler maskieren')]],
      },
      'Lesefehler maskieren': { main: [[edge('Fehler antworten')]] },
    },
    active: false,
    settings: {
      executionOrder: 'v1',
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveExecutionProgress: false,
      saveManualExecutions: false,
    },
    tags: [{ name: 'akquise' }],
  };
  await writeWorkflow('wf5-crm-read.json', workflow);
}

async function buildWf6() {
  const gmailSuche = [
    'in:sent',
    'bcc:info@360-ai.org',
    'subject:"#Anfrage"',
    'newer_than:14d',
  ].join(' ');
  const workflow = {
    name: '360ai Akquise — WF6 BCC-Mail-Import',
    nodes: [
      {
        parameters: {
          rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] },
        },
        id: 'b6000000-0001-4000-8000-000000000001', name: 'Alle 5 Minuten',
        type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
        position: [-1100, 0],
      },
      {
        parameters: {
          url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q='
            + encodeURIComponent(gmailSuche),
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'gmailOAuth2',
          options: {},
        },
        id: 'b6000000-0002-4000-8000-000000000002', name: 'Gmail BCC-Mails suchen',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        position: [-880, 0],
      },
      codeNode({
        id: 'b6000000-0003-4000-8000-000000000003', name: 'Gmail-IDs isolieren',
        fn: wf6ExpandMessageIdsCode, position: [-660, 0],
      }),
      {
        parameters: {
          url: '=https://gmail.googleapis.com/gmail/v1/users/me/messages/{{ $json.gmail_message_id }}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Bcc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID',
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'gmailOAuth2',
          options: { response: { response: { neverError: true } } },
        },
        id: 'b6000000-0004-4000-8000-000000000004', name: 'Mail-Metadaten lesen',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        position: [-440, 0], onError: 'continueRegularOutput',
      },
      codeNode({
        id: 'b6000000-0005-4000-8000-000000000005', name: 'Nachrichten normalisieren',
        fn: wf6NormalizeMessagesCode, position: [-220, 0],
      }),
      codeNode({
        id: 'b6000000-0006-4000-8000-000000000006', name: 'Nachrichten gesammelt',
        fn: wf5ContinueCode, position: [0, 0],
      }),
      sheetReadNode({
        id: 'b6000000-0007-4000-8000-000000000007', name: 'Leads lesen',
        sheet: 'Leads', position: [220, 0], explicitRead: true, alwaysOutputData: true,
      }),
      codeNode({
        id: 'b6000000-0008-4000-8000-000000000008', name: 'Leads gesammelt',
        fn: wf5ContinueCode, position: [440, 0],
      }),
      sheetReadNode({
        id: 'b6000000-0009-4000-8000-000000000009', name: 'Activities lesen',
        sheet: 'Activities', position: [660, 0], explicitRead: true, alwaysOutputData: true,
      }),
      codeNode({
        id: 'b6000000-0010-4000-8000-000000000010', name: 'BCC-Import vorbereiten',
        fn: wf6PrepareWritesCode, position: [880, 0],
      }),
      codeNode({
        id: 'b6000000-0011-4000-8000-000000000011', name: 'Leadzeilen isolieren',
        fn: wf6LeadRowsCode, position: [1100, -180],
      }),
      sheetUpsertNode({
        id: 'b6000000-0012-4000-8000-000000000012', name: 'Leads schreiben',
        sheet: 'Leads', columns: LEAD_COLUMNS, match: 'lead_id', position: [1320, -180],
      }),
      codeNode({
        id: 'b6000000-0013-4000-8000-000000000013', name: 'Activityzeilen isolieren',
        fn: wf6ActivityRowsCode, position: [1100, 0],
      }),
      sheetAppendNode({
        id: 'b6000000-0014-4000-8000-000000000014', name: 'Activities schreiben',
        sheet: 'Activities', columns: ACTIVITY_COLUMNS, position: [1320, 0],
      }),
      codeNode({
        id: 'b6000000-0015-4000-8000-000000000015', name: 'Meldung bauen',
        fn: wf6TelegramCode, position: [1100, 180],
      }),
      {
        parameters: {
          chatId: '116755995', text: '={{ $json.text }}',
          additionalFields: { appendAttribution: false },
        },
        id: 'b6000000-0016-4000-8000-000000000016', name: 'Import melden',
        type: 'n8n-nodes-base.telegram', typeVersion: 1.2,
        position: [1320, 180],
      },
    ],
    connections: {
      'Alle 5 Minuten': { main: [[edge('Gmail BCC-Mails suchen')]] },
      'Gmail BCC-Mails suchen': { main: [[edge('Gmail-IDs isolieren')]] },
      'Gmail-IDs isolieren': { main: [[edge('Mail-Metadaten lesen')]] },
      'Mail-Metadaten lesen': { main: [[edge('Nachrichten normalisieren')]] },
      'Nachrichten normalisieren': { main: [[edge('Nachrichten gesammelt')]] },
      'Nachrichten gesammelt': { main: [[edge('Leads lesen')]] },
      'Leads lesen': { main: [[edge('Leads gesammelt')]] },
      'Leads gesammelt': { main: [[edge('Activities lesen')]] },
      'Activities lesen': { main: [[edge('BCC-Import vorbereiten')]] },
      'BCC-Import vorbereiten': { main: [[
        edge('Leadzeilen isolieren'), edge('Activityzeilen isolieren'), edge('Meldung bauen'),
      ]] },
      'Leadzeilen isolieren': { main: [[edge('Leads schreiben')]] },
      'Activityzeilen isolieren': { main: [[edge('Activities schreiben')]] },
      'Meldung bauen': { main: [[edge('Import melden')]] },
    },
    active: false,
    settings: {
      executionOrder: 'v1', timezone: 'Europe/Berlin',
      saveDataErrorExecution: 'none', saveDataSuccessExecution: 'none',
      saveExecutionProgress: false, saveManualExecutions: false,
    },
    tags: [{ name: 'akquise' }],
  };
  await writeWorkflow('wf6-bcc-mail-import.json', workflow);
}

await buildWf1();
await buildWf2();
await buildWf3();
await buildWf4();
await buildWf5();
await buildWf6();
console.log('WF1–WF6 fuer das CRM aktualisiert.');
