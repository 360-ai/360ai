import {
  ACTION_LABELS, END_REASON_LABELS, SHEET_URL, STAMMDATEN_FELDER,
  STATUS_DEFINITIONS, STATUS_LABELS,
  activitiesForLead, asNumber, auditsForLead, dashboardMetrics, filterLeads,
  formatDate, formatDateTime, hasBrokenDate, isArchived, isBackwardTransition,
  isOverdue, kanbanColumns, leadDisplayName, mailHref, parseRouteHash,
  safeDriveUrl, safeHttpUrl, telHref, todayIso,
} from './domain.js';
import {
  ABSCHLUSS_ERGEBNISSE, ANLASS_CHIPS, EINWAENDE, GATEKEEPER_SCHRITT,
  LEITFADEN_PRODUKTE, LEITFADEN_SCHRITTE, baueNotizAusAntworten,
} from './leitfaden.js';

const main = document.querySelector('#main-content');
const syncState = document.querySelector('#sync-state');
const refreshButton = document.querySelector('#refresh-button');
const dialog = document.querySelector('#confirm-dialog');
const leitfadenDialog = document.querySelector('#leitfaden-dialog');
const leitfadenBody = document.querySelector('#leitfaden-body');
const state = {
  leads: [], activities: [], audits: [], meta: {}, loading: true, error: null,
  filters: { search: '', status: '', minScore: '', due: '', archiv: '' },
  saving: new Set(),
  // Bearbeitungszustand der Detailansicht, damit ein Render ihn nicht verliert.
  stammdatenOffen: false,
  kiText: '',
  kiLaeuft: false,
  // Laufender Telefonleitfaden-Wizard (null = nicht aktiv) und dessen Ergebnis,
  // das createView() genau einmal als Prefill konsumiert.
  leitfaden: null,
  leitfadenErgebnis: null,
};

const KI_PROMPT_KEY = 'akquise-crm-ki-prompt-v1';
const kiDefaults = { prompt: '', textarten: {} };
let pointerDrag = null;
const pendingReadScripts = new Map();

const readScriptReceiver = Object.freeze({
  deliver(requestId, payload) {
    pendingReadScripts.get(String(requestId))?.deliver(payload);
  },
});
Object.defineProperty(globalThis, '__AKQUISE_CRM_SYNC_V1__', {
  value: readScriptReceiver,
  configurable: false,
  enumerable: false,
  writable: false,
});

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const attr = escapeHtml;
// Object.hasOwn statt map[value]: sonst liefert ein Sheet-Wert wie "constructor"
// die geerbte Funktion aus Object.prototype als Beschriftung.
const label = (map, value, fallback = '–') => {
  const key = String(value ?? '');
  if (Object.hasOwn(map, key)) return map[key];
  return key || fallback;
};
// Ein unbekannter Status wird als solcher gezeigt, statt faelschlich "Neu" zu heissen.
const statusBadge = (status) => {
  const wert = String(status ?? '');
  const bekannt = Object.hasOwn(STATUS_LABELS, wert);
  return '<span class="status-badge ' + (bekannt ? 'status-' + attr(wert) : 'status-unbekannt') + '">'
    + escapeHtml(bekannt ? STATUS_LABELS[wert] : (wert.trim() || 'Ohne Status')) + '</span>';
};
const complianceBadge = (value) => {
  const labels = { gruen: 'Grün', pruefen: 'Prüfen', kritischer_hinweis: 'Kritischer Hinweis' };
  return '<span class="compliance-badge compliance-' + attr(value || 'pruefen') + '">'
    + escapeHtml(label(labels, value, 'Nicht bewertet')) + '</span>';
};
const score = (value) => '<span class="score">' + asNumber(value) + '</span>';
const statusOptions = (selected) => STATUS_DEFINITIONS.map((item) =>
  '<option value="' + item.value + '"' + (item.value === selected ? ' selected' : '') + '>'
  + item.label + '</option>').join('');
const actionOptions = (selected) => Object.entries(ACTION_LABELS).map(([value, text]) =>
  '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>'
  + escapeHtml(text) + '</option>').join('');
const reasonOptions = (selected) => Object.entries(END_REASON_LABELS).map(([value, text]) =>
  '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>'
  + escapeHtml(text) + '</option>').join('');

function route() {
  return parseRouteHash(location.hash);
}
function setNavigation(current) {
  const navView = current === 'detail' ? 'leads' : current;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === navView) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
function focusHeading() {
  requestAnimationFrame(() => main.querySelector('h1')?.focus({ preventScroll: true }));
}
function setSync(mode, text) {
  syncState.classList.toggle('is-error', mode === 'error');
  syncState.innerHTML = '<i aria-hidden="true"></i>' + escapeHtml(text);
}
// Erfolgsmeldungen verschwinden von selbst. Fehler bleiben stehen, bis sie
// geschlossen werden, und landen in einer Region mit role="alert".
function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = 'toast' + (type === 'error' ? ' is-error' : '');
  const text = document.createElement('span');
  text.textContent = message;
  item.append(text);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Meldung schließen');
  close.textContent = '×';
  close.addEventListener('click', () => item.remove());
  item.append(close);
  document.querySelector(type === 'error' ? '#alert-region' : '#toast-region').append(item);
  if (type !== 'error') setTimeout(() => item.remove(), 5000);
}

function readDataViaScript() {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const script = document.createElement('script');
    let settled = false;
    let timeoutId;
    const cleanup = () => {
      clearTimeout(timeoutId);
      pendingReadScripts.delete(requestId);
      script.remove();
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    pendingReadScripts.set(requestId, {
      deliver: (payload) => settle(resolve, payload),
    });
    script.async = true;
    script.src = '/sync?request_id=' + encodeURIComponent(requestId);
    script.addEventListener('error', () => {
      settle(reject, new Error('Datenquelle nicht erreichbar'));
    }, { once: true });
    script.addEventListener('load', () => {
      if (!settled) settle(reject, new Error('Datenquelle liefert keine Antwort'));
    }, { once: true });
    timeoutId = setTimeout(() => {
      settle(reject, new Error('Datenquelle antwortet nicht rechtzeitig'));
    }, 18000);
    document.head.append(script);
  });
}

async function loadData({ quiet = false } = {}) {
  if (!quiet) {
    state.loading = true;
    state.error = null;
    render();
  }
  refreshButton.disabled = true;
  setSync('loading', 'Synchronisiert …');
  try {
    // Same-origin external scripts remain allowed by CSP when Brave blocks Fetch/XHR.
    const result = await readDataViaScript();
    if (!result?.ok) throw new Error(result?.message || 'Datenquelle nicht erreichbar');
    state.leads = Array.isArray(result.leads) ? result.leads : [];
    state.activities = Array.isArray(result.activities) ? result.activities : [];
    state.audits = Array.isArray(result.audits) ? result.audits : [];
    state.meta = result.meta || {};
    state.loading = false;
    state.error = null;
    setSync('ok', 'Gerade aktualisiert');
    render();
  } catch (error) {
    state.loading = false;
    setSync('error', 'Keine Verbindung');
    // Sind bereits Daten geladen, bleibt die Arbeitsansicht stehen. Sonst wuerde
    // ein kurzer Netzausfall beim Aktualisieren die ganze Liste wegnehmen.
    if (state.leads.length) {
      toast('Aktualisieren fehlgeschlagen: ' + error.message + ' Angezeigt wird der letzte Stand.', 'error');
    } else {
      state.error = error;
      render();
    }
  } finally {
    refreshButton.disabled = false;
  }
}

function render() {
  const current = route();
  setNavigation(current.view);
  if (state.loading) {
    main.innerHTML = '<div class="loading-state" aria-live="polite"><div class="loading-mark" aria-hidden="true"></div><p>Pipeline wird geladen …</p></div>';
    return;
  }
  if (state.error) {
    main.innerHTML = '<div class="error-state"><h1 id="view-title" tabindex="-1">Daten konnten nicht geladen werden</h1>'
      + '<p>' + escapeHtml(state.error.message || 'Unbekannter Fehler') + '</p>'
      + '<button class="button button-primary" type="button" data-action="retry">Erneut versuchen</button></div>';
    return;
  }
  if (current.view === 'dashboard') main.innerHTML = dashboardView();
  if (current.view === 'leads') main.innerHTML = leadsView();
  if (current.view === 'kanban') main.innerHTML = kanbanView();
  if (current.view === 'archiv') main.innerHTML = archivView();
  if (current.view === 'neu') {
    main.innerHTML = createView(state.leitfadenErgebnis);
    // Der Prefill gilt nur fuer diesen einen Aufbau der Seite, sonst geistert er
    // bei jedem weiteren Besuch von #neu unveraendert weiter.
    state.leitfadenErgebnis = null;
  }
  if (current.view === 'detail') main.innerHTML = detailView(current.leadId);
}

function dashboardView() {
  const metrics = dashboardMetrics(state.leads, state.activities);
  const due = filterLeads(state.leads, { due: 'due' }).slice(0, 7);
  const maxStatus = Math.max(1, ...Object.values(metrics.byStatus));
  const bars = STATUS_DEFINITIONS.map((item) => {
    const count = metrics.byStatus[item.value] || 0;
    return '<div class="pipeline-row status-' + item.value + '"><span>' + item.label + '</span>'
      + '<progress class="bar-progress" value="' + count + '" max="' + maxStatus
      + '" aria-label="' + count + ' Leads: ' + item.label + '">' + count + '</progress>'
      + '<strong>' + count + '</strong></div>';
  }).join('');
  const argumentsList = metrics.arguments.slice(0, 5).map((item) =>
    '<div class="argument-item"><div><strong>' + escapeHtml(item.argument) + '</strong>'
    + '<small>' + item.wins + ' Zusagen · ' + item.uses + ' Verwendungen</small></div>'
    + '<span class="argument-rate">' + item.rate + '%</span></div>').join('');
  return '<section aria-labelledby="view-title">'
    + '<header class="view-head"><div><p class="kicker">Heute im Blick</p>'
    + '<h1 id="view-title" tabindex="-1">Guten Tag, Denis.</h1>'
    + '<p>' + metrics.due + ' Aufgaben sind fällig. Deine Pipeline wird direkt aus dem Google Sheet berechnet.</p></div>'
    + '<div class="view-head-actions"><a class="button button-secondary" href="#leads">Alle Leads</a>'
    + '<a class="button button-primary" href="#kanban">Pipeline öffnen</a></div></header>'
    + '<div class="metric-grid">'
    + metricCard('Leads gesamt', metrics.total, metrics.newCount + ' neu in der Pipeline', 'metric-lavender')
    + metricCard('Heute fällig', metrics.due, metrics.overdue + ' davon überfällig', 'metric-amber')
    + metricCard('Erfolgsquote', metrics.successRate + '%', metrics.won + ' Leads gewonnen', 'metric-green')
    + metricCard('Ø Akquise-Score', metrics.averageScore, 'über alle bewerteten Leads', 'metric-mint')
    + '</div><div class="dashboard-grid"><div class="stack">'
    + '<section class="panel"><div class="panel-head"><h2>Pipeline-Verteilung</h2><a href="#kanban">Zum Kanban →</a></div>'
    + '<div class="pipeline-bars">' + bars + '</div></section>'
    + '<section class="panel"><div class="panel-head"><h2>Nächste Aktionen</h2><a href="#leads">Alle anzeigen →</a></div>'
    + (due.length ? '<div class="action-list">' + due.map(actionRow).join('') + '</div>'
      : '<div class="empty-state compact-empty"><div class="empty-symbol">✓</div><p>Heute ist nichts fällig.</p></div>')
    + '</section></div><aside class="stack"><section class="panel"><div class="panel-head"><h2>Argumente, die wirken</h2></div>'
    + (argumentsList ? '<div class="argument-list">' + argumentsList + '</div>'
      : '<p class="result-count">Noch keine Zusagen mit Argument-Historie.</p>')
    + '</section><section class="panel"><h2>Systemstatus</h2><div class="facts-grid system-facts">'
    + '<div class="data-item"><small>Datenquelle</small><p>Google Sheet</p></div>'
    + '<div class="data-item"><small>Letzter Abruf</small><p>' + escapeHtml(formatDateTime(state.meta.generated_at, 'Gerade')) + '</p></div>'
    + '</div></section></aside></div></section>';
}
function metricCard(name, value, note, colorClass) {
  return '<article class="metric-card ' + colorClass + '"><small>' + name + '</small>'
    + '<p class="metric-value">' + value + '</p><p class="metric-note">' + note + '</p></article>';
}
function actionRow(lead) {
  return '<button class="action-row" type="button" data-open-lead="' + attr(lead.lead_id) + '">'
    + '<span class="action-main"><strong>' + escapeHtml(leadDisplayName(lead)) + '</strong>'
    + '<span>' + escapeHtml(label(ACTION_LABELS, lead.next_action, 'Aufgabe')) + ' · Score ' + asNumber(lead.akquise_score) + '</span></span>'
    + '<span class="due-date ' + (isOverdue(lead) ? 'is-overdue' : '') + '">' + escapeHtml(formatDate(lead.next_action_at)) + '</span></button>';
}

// Keine Treffer und gar keine Daten sind zwei verschiedene Lagen.
function leerzustand(vorhandene) {
  if (vorhandene === 0) {
    return '<div class="empty-state"><div class="empty-symbol" aria-hidden="true">+</div>'
      + '<p>Noch kein Lead in der Pipeline.</p>'
      + '<a class="button button-primary" href="#neu">Ersten Lead anlegen</a></div>';
  }
  return '<div class="empty-state"><div class="empty-symbol" aria-hidden="true">⌕</div>'
    + '<p>Für diese Filter gibt es keine Leads.</p></div>';
}

function leadsView() {
  const leads = filterLeads(state.leads, state.filters);
  const aktive = state.leads.filter((lead) => !isArchived(lead));
  const archiviert = state.leads.length - aktive.length;
  const rows = leads.map((lead) => '<tr tabindex="0" role="button" data-open-lead="' + attr(lead.lead_id) + '">'
    + '<td><span class="lead-name"><strong>' + escapeHtml(leadDisplayName(lead)) + '</strong><small>' + escapeHtml(lead.ort || lead.branche || '–') + '</small></span></td>'
    + '<td>' + statusBadge(lead.status) + '</td><td>' + score(lead.akquise_score) + '</td>'
    + '<td>' + escapeHtml(label(ACTION_LABELS, lead.next_action)) + '</td>'
    + '<td><span class="due-date ' + (isOverdue(lead) ? 'is-overdue' : '') + '">' + escapeHtml(formatDate(lead.next_action_at)) + '</span></td>'
    + '<td>' + complianceBadge(lead.compliance) + '</td></tr>').join('');
  const cards = leads.map((lead) => '<article class="mobile-lead-card" tabindex="0" role="button" data-open-lead="' + attr(lead.lead_id) + '">'
    + statusBadge(lead.status) + '<h2>' + escapeHtml(leadDisplayName(lead)) + '</h2>'
    + '<p>' + escapeHtml([lead.ort, lead.branche].filter(Boolean).join(' · ') || lead.lead_id) + '</p>'
    + '<div class="mobile-card-foot"><span>Score ' + asNumber(lead.akquise_score) + '</span>'
    + '<span class="' + (isOverdue(lead) ? 'due-date is-overdue' : '') + '">' + escapeHtml(formatDate(lead.next_action_at, 'Keine Aktion')) + '</span></div></article>').join('');
  return '<section aria-labelledby="view-title"><header class="view-head"><div><p class="kicker">Arbeitsansicht</p>'
    + '<h1 id="view-title" tabindex="-1">Leads</h1><p>Suchen, priorisieren und direkt in die vollständige Lead-Akte springen.</p></div>'
    + '<div class="view-head-actions">'
    + '<button class="button button-secondary" type="button" data-quick-filter="new">Neue Leads</button>'
    + '<button class="button button-secondary" type="button" data-quick-filter="due">Heute zu tun</button>'
    + '<a class="button button-primary" href="#neu">+ Neuer Lead</a></div></header>'
    + '<div class="filter-panel" aria-label="Lead-Filter"><label class="field search-field"><span>Suche</span>'
    + '<input id="lead-search" type="search" value="' + attr(state.filters.search) + '" placeholder="Firma, Ort, Kontakt …" autocomplete="off"></label>'
    + '<label class="field"><span>Status</span><select id="status-filter"><option value="">Alle Status</option>'
    + STATUS_DEFINITIONS.map((item) => '<option value="' + item.value + '"' + (state.filters.status === item.value ? ' selected' : '') + '>' + item.label + '</option>').join('')
    + '</select></label><label class="field"><span>Akquise-Score</span><select id="score-filter">'
    + [['','Alle Scores'],['55','ab 55'],['75','ab 75'],['85','ab 85']].map(([value,text]) =>
      '<option value="' + value + '"' + (String(state.filters.minScore) === value ? ' selected' : '') + '>' + text + '</option>').join('')
    + '</select></label><label class="field"><span>Fälligkeit</span><select id="due-filter">'
    + [['', 'Alle'], ['due', 'Heute & überfällig'], ['overdue', 'Nur überfällig'],
      ['broken', 'Datum unlesbar']].map(([value, text]) =>
      '<option value="' + value + '"' + (state.filters.due === value ? ' selected' : '') + '>' + text + '</option>').join('')
    + '</select></label></div>'
    + '<p class="result-count" role="status">' + leads.length + ' von ' + aktive.length + ' Leads'
    + (archiviert ? ' · <a href="#archiv">' + archiviert + ' im Archiv</a>' : '') + '</p>'
    + (leads.length ? '<div class="table-wrap"><table class="lead-table"><caption class="visually-hidden">Gefilterte Leads</caption>'
      + '<thead><tr><th>Lead</th><th>Status</th><th>Score</th><th>Nächste Aktion</th><th>Fällig</th><th>Compliance</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div><div class="mobile-lead-list">' + cards + '</div>'
      : leerzustand(aktive.length))
    + '</section>';
}

function detailView(leadId) {
  const lead = state.leads.find((item) => item.lead_id === leadId);
  if (!lead) return '<div class="error-state"><div class="error-symbol">?</div><strong>Lead nicht gefunden</strong>'
    + '<p>Der Datensatz wurde möglicherweise geändert.</p><a class="button button-primary" href="#leads">Zur Lead-Liste</a></div>';
  const activities = activitiesForLead(state.activities, leadId);
  const audits = auditsForLead(state.audits, leadId);
  const latestAudit = audits[0];
  const reports = safeDriveUrl(lead.berichte_drive_url);
  const timeline = activities.length ? activities.map(timelineItem).join('')
    : '<p class="result-count">Noch keine Aktivitäten erfasst.</p>';
  const axes = latestAudit ? ['seo','technik','air','design','conversion','local','vertrauen'].map((axis) => {
    const value = asNumber(latestAudit[axis]);
    return '<div class="axis"><div class="axis-label"><span>' + escapeHtml(axis) + '</span><strong>' + value + '</strong></div>'
      + '<progress class="bar-progress" value="' + Math.min(100, Math.max(0, value))
      + '" max="100" aria-label="' + escapeHtml(axis) + ': ' + value + '">' + value + '</progress></div>';
  }).join('') : '<p class="result-count">Noch kein Audit vorhanden.</p>';
  return '<section aria-labelledby="view-title"><header class="view-head detail-head"><div>'
    + '<a class="back-link" href="#leads">← Zurück zu Leads</a><p class="kicker">' + escapeHtml(lead.lead_id) + '</p>'
    + '<h1 id="view-title" tabindex="-1">' + escapeHtml(leadDisplayName(lead)) + '</h1>'
    + '<p>' + escapeHtml([lead.branche, lead.ort].filter(Boolean).join(' · ') || 'Lead-Details') + '</p></div>'
    + '<div class="view-head-actions">' + statusBadge(lead.status) + '</div></header>'
    + (lead.status === 'beendet' && !lead.ende_grund
      ? '<p class="missing-note">Für diesen beendeten Lead fehlt noch der Abschlussgrund.</p>' : '')
    + (isArchived(lead)
      ? '<p class="missing-note">Dieser Lead ist seit ' + escapeHtml(formatDate(lead.archiviert_am))
        + ' archiviert und taucht in den Arbeitsansichten nicht mehr auf.</p>' : '')
    + (hasBrokenDate(lead)
      ? '<p class="missing-note">Mindestens ein Datum steht im Sheet in einem Format, das nicht '
        + 'gelesen werden kann. Bitte im Sheet auf JJJJ-MM-TT korrigieren.</p>' : '')
    + '<div class="detail-grid"><div class="detail-main">'
    + stammdatenPanel(lead)
    + '<section class="panel"><div class="panel-head"><h2>CRM-Felder bearbeiten</h2></div>'
    + '<form class="edit-form" id="lead-edit-form" data-lead-id="' + attr(lead.lead_id) + '"><div class="form-grid">'
    + '<label class="field"><span>Status</span><select name="status">' + statusOptions(lead.status) + '</select></label>'
    + '<label class="field"><span>Abschlussgrund</span><select name="ende_grund">' + reasonOptions(lead.ende_grund || '') + '</select></label>'
    + '<label class="field"><span>Nächste Aktion</span><select name="next_action">' + actionOptions(lead.next_action || '') + '</select></label>'
    + '<label class="field"><span>Fällig am</span><input name="next_action_at" type="date" value="' + attr(String(lead.next_action_at || '').slice(0,10)) + '"></label>'
    + '<label class="field"><span>Wiedervorlage</span><input name="wiedervorlage_am" type="date" value="' + attr(String(lead.wiedervorlage_am || '').slice(0,10)) + '"></label>'
    + '<label class="field form-full"><span>Notiz</span><textarea name="notiz" maxlength="5000" placeholder="Nächste Schritte, Gesprächsnotizen …">' + escapeHtml(lead.notiz || '') + '</textarea></label>'
    + '</div><div class="form-actions"><button class="button button-primary" type="submit">Änderungen speichern</button></div></form>'
    + '</section>'
    + kiPanel(lead)
    + '<section class="panel"><div class="panel-head"><h2>Verlauf</h2>'
    + '<span class="result-count">' + activities.length + ' Einträge</span></div>'
    + '<form class="edit-form" id="notiz-form" data-lead-id="' + attr(lead.lead_id) + '">'
    + '<label class="field form-full"><span>Notiz zum Verlauf hinzufügen</span>'
    + '<textarea name="wert" rows="3" maxlength="5000" required '
    + 'placeholder="Was ist passiert? Wird mit Datum im Verlauf festgehalten."></textarea></label>'
    + '<div class="form-actions">'
    + '<button class="button button-secondary" type="submit">Notiz eintragen</button></div></form>'
    + '<div class="timeline">' + timeline + '</div></section></div>'
    + '<aside class="detail-side"><section class="panel"><div class="panel-head"><h2>Bewertung</h2></div>'
    + '<div class="score-pair"><div class="score-block"><strong>' + asNumber(lead.akquise_score) + '</strong><span>Akquise-Score</span></div>'
    + '<div class="score-block"><strong>' + asNumber(lead.website_score) + '</strong><span>Website-Score</span></div></div>'
    + '<div class="facts-grid">' + dataItem('Ansatz', lead.akquise_ansatz) + '<div class="data-item"><small>Compliance</small>' + complianceBadge(lead.compliance) + '</div>'
    + dataItem('Unterlagen gesendet', formatDate(lead.unterlagen_gesendet_am)) + dataItem('Mail-Betreff', lead.mail_betreff)
    + '</div></section><section class="panel"><div class="panel-head"><h2>Berichte</h2></div>'
    + (reports ? '<div class="report-card"><div><strong>Vier Analyseberichte</strong><small>Intern · Telefon · Mail · Kunde</small></div>'
      + '<a class="button button-primary" href="' + attr(reports) + '" target="_blank" rel="noopener noreferrer">In Drive öffnen</a></div>'
      : '<p class="result-count">Noch kein Drive-Ordner verknüpft.</p>')
    + '</section><section class="panel"><div class="panel-head"><h2>Letzter Audit</h2>'
    + (latestAudit ? '<span class="result-count">' + escapeHtml(formatDate(latestAudit.datum)) + '</span>' : '') + '</div>'
    + '<div class="axis-list">' + axes + '</div></section>'
    + '<section class="panel"><div class="panel-head"><h2>Lead-Verwaltung</h2></div>'
    + (isArchived(lead)
      ? '<p class="result-count">Der Lead liegt im Archiv. Die Daten bleiben im Sheet erhalten.</p>'
        + '<div class="form-actions"><button class="button button-secondary" type="button" '
        + 'data-action="reaktivieren" data-lead-id="' + attr(lead.lead_id) + '">'
        + 'Aus dem Archiv holen</button></div>'
      : '<p class="result-count">Archivieren blendet den Lead aus allen Arbeitsansichten aus. '
        + 'Die Zeile im Google Sheet bleibt bestehen und lässt sich jederzeit zurückholen.</p>'
        + '<div class="form-actions"><button class="button button-danger" type="button" '
        + 'data-action="archivieren" data-lead-id="' + attr(lead.lead_id) + '">'
        + 'Lead archivieren</button></div>')
    + '</section></aside></div></section>';
}
function dataItem(name, value, href = null) {
  const text = value || '–';
  return '<div class="data-item"><small>' + escapeHtml(name) + '</small>'
    + (href ? '<a href="' + attr(href) + '"' + (String(href).startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '') + '>'
      + escapeHtml(text) + '</a>' : '<p>' + escapeHtml(text) + '</p>') + '</div>';
}

const AKTIVITAET_LABELS = {
  status_wechsel: 'Status geändert', anruf: 'Anruf', mail: 'Mail', antwort: 'Antwort',
  followup: 'Follow-up', termin: 'Termin', angebot: 'Angebot', notiz: 'Notiz',
};

// Lange Texte (etwa der Mailtext aus dem Gmail-Import) stehen ausklappbar
// in einem <details>, damit die Zeitleiste lesbar bleibt.
function timelineItem(activity) {
  const text = String(activity.notiz || '');
  const lang = text.length > 180 || text.includes('\n');
  const kopf = '<strong>'
    + escapeHtml(label(AKTIVITAET_LABELS, activity.typ, activity.typ || 'Ereignis'))
    + '</strong><time>' + escapeHtml(formatDateTime(activity.datum)) + '</time>'
    + (activity.richtung ? '<small>' + escapeHtml(activity.richtung === 'rein' ? 'eingehend' : 'ausgehend') + '</small>' : '')
    + (activity.ergebnis ? '<small>Ergebnis: ' + escapeHtml(activity.ergebnis) + '</small>' : '');
  let koerper = '';
  if (text && lang) {
    koerper = '<details class="activity-detail"><summary>Text anzeigen</summary>'
      + '<pre class="activity-text">' + escapeHtml(text) + '</pre></details>';
  } else if (text) {
    koerper = '<p>' + escapeHtml(text) + '</p>';
  }
  return '<div class="timeline-item"><span class="timeline-dot" aria-hidden="true"></span>'
    + '<div class="timeline-copy">' + kopf + koerper + '</div></div>';
}

function stammdatenPanel(lead) {
  const kopf = '<div class="panel-head"><h2>Kundendaten</h2>'
    + '<button class="button button-quiet" type="button" data-action="stammdaten-toggle">'
    + (state.stammdatenOffen ? 'Abbrechen' : 'Bearbeiten') + '</button></div>';
  if (!state.stammdatenOffen) {
    return '<section class="panel">' + kopf + '<div class="contact-grid">'
      + dataItem('Firma', lead.firma)
      + dataItem('Ansprechpartner', lead.ansprechpartner)
      + dataItem('Straße', lead.strasse)
      + dataItem('PLZ und Ort', lead.ort)
      + dataItem('Telefon', lead.telefon, telHref(lead.telefon))
      + dataItem('Handy', lead.handy, telHref(lead.handy))
      + dataItem('E-Mail', lead.mail, mailHref(lead.mail))
      + dataItem('Website', lead.website, safeHttpUrl(lead.website))
      + dataItem('Branche', lead.branche)
      + dataItem('Anrede', lead.anrede === 'du' ? 'Du' : 'Sie')
      + dataItem('Quelle', lead.kontaktquelle)
      + '</div></section>';
  }
  const felder = STAMMDATEN_FELDER.map((feld) => {
    const wert = String(lead[feld.name] ?? '');
    if (feld.type === 'select') {
      const optionen = feld.options.map(([value, text]) =>
        '<option value="' + attr(value) + '"' + (value === wert ? ' selected' : '') + '>'
        + escapeHtml(text) + '</option>').join('');
      return '<label class="field"><span>' + escapeHtml(feld.label) + '</span>'
        + '<select name="' + attr(feld.name) + '">' + optionen + '</select></label>';
    }
    return '<label class="field"><span>' + escapeHtml(feld.label) + '</span>'
      + '<input name="' + attr(feld.name) + '" type="' + attr(feld.type) + '" maxlength="200"'
      + ' value="' + attr(wert) + '"></label>';
  }).join('');
  return '<section class="panel">' + kopf
    + '<form class="edit-form" id="stammdaten-form" data-lead-id="' + attr(lead.lead_id) + '">'
    + '<div class="form-grid">' + felder + '</div>'
    + '<div class="form-actions">'
    + '<button class="button button-primary" type="submit">Kundendaten speichern</button>'
    + '</div></form></section>';
}

function kiPanel(lead) {
  const textarten = Object.entries(kiDefaults.textarten);
  const optionen = textarten.length
    ? textarten.map(([value, text]) => '<option value="' + attr(value) + '">'
      + escapeHtml(text) + '</option>').join('')
    : '<option value="freitext">Freier Text</option>';
  return '<section class="panel">'
    + '<div class="panel-head"><h2>Text mit KI verfassen</h2>'
    + '<button class="button button-quiet" type="button" data-action="ki-prompt-reset">'
    + 'Standardprompt</button></div>'
    + '<form class="edit-form" id="ki-form" data-lead-id="' + attr(lead.lead_id) + '">'
    + '<div class="form-grid">'
    + '<label class="field"><span>Textart</span><select name="textart">' + optionen + '</select></label>'
    + '<label class="field"><span>Zusatzanweisung für diesen Text</span>'
    + '<input name="zusatz" type="text" maxlength="500" placeholder="z. B. auf den Messebesuch eingehen"></label>'
    + '<label class="field form-full"><span>Grundprompt (wird gespeichert)</span>'
    + '<textarea name="prompt" rows="8" maxlength="8000">' + escapeHtml(ladePrompt()) + '</textarea></label>'
    + '</div><div class="form-actions">'
    + '<button class="button button-primary" type="submit"' + (state.kiLaeuft ? ' disabled' : '') + '>'
    + (state.kiLaeuft ? 'Text wird geschrieben …' : 'Text erzeugen') + '</button>'
    + '</div></form>'
    + (state.kiText
      ? '<div class="ki-ergebnis"><div class="panel-head"><h3>Vorschlag</h3>'
        + '<button class="button button-quiet" type="button" data-action="ki-copy">Kopieren</button></div>'
        + '<pre class="activity-text" id="ki-ergebnis-text">' + escapeHtml(state.kiText) + '</pre></div>'
      : '<p class="result-count">Der Text nutzt Stammdaten, Notizen und den Verlauf dieses Leads.</p>')
    + '</section>';
}

// Der Grundprompt liegt im Browser, damit er ohne Sheet-Schema anpassbar bleibt.
function ladePrompt() {
  try {
    return localStorage.getItem(KI_PROMPT_KEY) || kiDefaults.prompt;
  } catch {
    return kiDefaults.prompt;
  }
}
function speicherePrompt(text) {
  try {
    if (text.trim() && text.trim() !== kiDefaults.prompt.trim()) {
      localStorage.setItem(KI_PROMPT_KEY, text);
    } else {
      localStorage.removeItem(KI_PROMPT_KEY);
    }
  } catch {
    // Ohne localStorage bleibt der Prompt nur fuer diese Sitzung bestehen.
  }
}

// Erzeugt eine Lead-ID nach dem Muster aus SHEET.md: L-JJJJMMTT-kurzform.
function neueLeadId(firma, ansprechpartner, mail) {
  const quelle = [firma, ansprechpartner, mail].map((v) => String(v || '').trim()).find(Boolean) || 'lead';
  const slug = quelle.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'lead';
  const zufall = Math.random().toString(36).slice(2, 6);
  return 'L-' + todayIso().replaceAll('-', '') + '-' + slug + '-' + zufall;
}

// --- Telefonleitfaden-Wizard ---
// Reine Notizhilfe: der einzige dauerhafte Effekt ist ein vorformulierter Notiztext
// (state.leitfadenErgebnis), den createView() genau einmal uebernimmt. Keine eigenen
// Sheet-Spalten, kein zusaetzlicher Server-Zustand.

function leitfadenSchritte(produkt) {
  return [GATEKEEPER_SCHRITT, ...(LEITFADEN_SCHRITTE[produkt] || [])];
}
function leitfadenGesamtschritte(produkt) {
  const arr = LEITFADEN_SCHRITTE[produkt] || LEITFADEN_SCHRITTE.webdesign;
  return 2 + arr.length;
}

function starteLeitfaden() {
  state.leitfaden = { produkt: null, produktWahl: '', schrittIndex: 0, antworten: {} };
  renderLeitfadenSchritt();
  leitfadenDialog.showModal();
}

// Einziger Ausgang aus dem Wizard, egal ob per Button oder Escape-Taste (siehe
// leitfadenDialog "close"-Listener unten). uebernehmen=false verwirft absichtlich
// (nur beim expliziten "Ueberspringen" auf der Produktauswahl).
function beendeLeitfaden({ uebernehmen }) {
  const wiz = state.leitfaden;
  if (!wiz) return;
  if (uebernehmen && wiz.produkt) {
    state.leitfadenErgebnis = {
      notiz: baueNotizAusAntworten(wiz.produkt, wiz.antworten),
      kontaktquelle: 'telefonat',
    };
  }
  state.leitfaden = null;
  if (leitfadenDialog.open) leitfadenDialog.close();
  geheZuNeu();
}

// Ein Klick auf "+ Neuer Lead" waehrend der Hash schon #neu ist (z. B. nach
// "Ueberspringen" oder einem zweiten Wizard-Durchlauf) aendert den Hash nicht, daher
// feuert kein hashchange und render() liefe sonst nie erneut. render() ist idempotent,
// ein zusaetzlicher Aufruf hier ist also unproblematisch.
function geheZuNeu() {
  if (location.hash === '#neu') render();
  else location.hash = 'neu';
}

function leitfadenChip(gruppe, wert, text, ausgewaehlt) {
  return '<button type="button" class="chip-button' + (ausgewaehlt ? ' is-selected' : '') + '" '
    + 'data-chip-gruppe="' + attr(gruppe) + '" data-chip-wert="' + attr(wert) + '">'
    + escapeHtml(text) + '</button>';
}

// Kein eigener Wizard-Schritt mehr, sondern in jedem Gespraechsschritt erreichbar,
// damit ein Einwand nicht bis zu einem festen Zeitpunkt warten muss.
function leitfadenEinwandPanel(produkt) {
  const erfasst = state.leitfaden.antworten.einwaende || [];
  const eintraege = (EINWAENDE[produkt] || []).map((eintrag) => {
    const istErfasst = erfasst.includes(eintrag.einwand);
    return '<div class="leitfaden-einwand">'
      + '<p class="leitfaden-einwand-frage">' + escapeHtml(eintrag.einwand) + '</p>'
      + '<p class="leitfaden-einwand-antwort">' + escapeHtml(eintrag.antwort) + '</p>'
      + '<button type="button" class="button button-quiet" data-action="einwand-erfasst" '
      + 'data-einwand="' + attr(eintrag.einwand) + '"' + (istErfasst ? ' disabled' : '') + '>'
      + (istErfasst ? '✓ Erfasst' : 'Kam im Gespräch vor') + '</button></div>';
  }).join('');
  return '<details class="leitfaden-akkordeon"><summary>Einwand gerade gekommen?</summary>'
    + eintraege + '</details>';
}

function leitfadenNav({
  zurueck = true, weiterLabel = 'Weiter', weiterAktion = 'weiter', weiterDeaktiviert = false,
} = {}) {
  return '<div class="leitfaden-actions">'
    + (zurueck ? '<button type="button" class="button button-secondary" data-action="zurueck">Zurück</button>' : '<span></span>')
    + '<button type="button" class="button button-primary" data-action="' + attr(weiterAktion) + '"'
    + (weiterDeaktiviert ? ' disabled' : '') + '>' + escapeHtml(weiterLabel) + '</button></div>';
}

function renderProduktauswahl() {
  const wiz = state.leitfaden;
  const anlass = wiz.antworten.sachlicherAnlass || '';
  return '<p class="leitfaden-progress">Schritt 1 von ' + leitfadenGesamtschritte(wiz.produktWahl) + '</p>'
    + '<h2 id="leitfaden-title">Welches Produkt?</h2>'
    + '<div class="chip-group">' + LEITFADEN_PRODUKTE.map((p) =>
      leitfadenChip('produkt', p.id, p.label, wiz.produktWahl === p.id)).join('') + '</div>'
    + '<label class="field"><span>Sachlicher Anlass des Anrufs</span>'
    + '<div class="chip-group">' + ANLASS_CHIPS.map((text) =>
      leitfadenChip('anlass', text, text, anlass === text)).join('') + '</div>'
    + '<input type="text" data-feld="anlass-freitext" placeholder="oder eigener Anlass" '
    + 'value="' + attr(ANLASS_CHIPS.includes(anlass) ? '' : anlass) + '"></label>'
    + '<p class="result-count">Dient als Nachweis des sachlichen Bezugs bei B2B-Kaltakquise (§ 7 UWG).</p>'
    + '<div class="leitfaden-actions">'
    + '<button type="button" class="button button-secondary" data-action="ueberspringen">'
    + 'Ohne Leitfaden – direkt zum Formular</button>'
    + '<button type="button" class="button button-primary" data-action="produkt-weiter"'
    + (wiz.produktWahl && anlass ? '' : ' disabled') + '>Weiter</button></div>';
}

function renderLeitfadenGatekeeper(schritt) {
  return '<p class="leitfaden-skript">' + escapeHtml(schritt.skript) + '</p>'
    + '<div class="leitfaden-actions-inline">'
    + '<button type="button" class="button button-primary" data-action="gatekeeper-entscheider">'
    + 'Entscheider direkt erreicht</button>'
    + '<button type="button" class="button button-secondary" data-action="gatekeeper-weiterleitung">'
    + 'Weiterleitung/Rückruf nötig</button></div>'
    + '<div class="leitfaden-actions"><button type="button" class="button button-secondary" '
    + 'data-action="zurueck">Zurück</button><span></span></div>';
}

function renderLeitfadenOpener(schritt, produkt) {
  const antwort = state.leitfaden.antworten.opener || {};
  const ausgewaehlt = antwort.aufhaenger || [];
  return '<p class="leitfaden-skript">' + escapeHtml(schritt.skript) + '</p>'
    + '<div class="field"><span>Aufhänger</span><div class="chip-group">'
    + schritt.aufhaengerChips.map((c) => leitfadenChip('aufhaenger', c, c, ausgewaehlt.includes(c))).join('')
    + '</div></div>'
    + '<label class="field"><span>Individuelle Notiz</span>'
    + '<textarea data-feld="opener-freitext" rows="2">' + escapeHtml(antwort.freitext || '') + '</textarea></label>'
    + leitfadenEinwandPanel(produkt) + leitfadenNav();
}

function renderLeitfadenBedarf(schritt, produkt) {
  const bedarfAntworten = state.leitfaden.antworten.bedarf || {};
  const fragen = schritt.fragen.map((frage) => {
    const eintrag = bedarfAntworten[frage.id] || {};
    const zustimmungBlock = frage.zustimmung
      ? '<p class="leitfaden-skript-mini">' + escapeHtml(frage.zustimmung) + '</p><div class="chip-group">'
        + leitfadenChip('zustimmung-' + frage.id, 'ja', 'Zugestimmt', eintrag.zustimmung === 'ja')
        + leitfadenChip('zustimmung-' + frage.id, 'nein', 'Widerspruch', eintrag.zustimmung === 'nein')
        + '</div>'
      : '';
    return '<div class="leitfaden-frage"><p class="leitfaden-skript">' + escapeHtml(frage.frage) + '</p>'
      + '<textarea data-feld="bedarf-antwort" data-frage-id="' + attr(frage.id) + '" rows="2">'
      + escapeHtml(eintrag.antwort || '') + '</textarea>' + zustimmungBlock + '</div>';
  }).join('');
  return fragen + leitfadenEinwandPanel(produkt) + leitfadenNav();
}

function renderLeitfadenPitch(schritt, produkt) {
  return '<p class="leitfaden-skript leitfaden-skript-gross">' + escapeHtml(schritt.skript) + '</p>'
    + leitfadenEinwandPanel(produkt) + leitfadenNav();
}

function renderLeitfadenAbschluss(schritt, produkt) {
  const abschluss = state.leitfaden.antworten.abschluss || {};
  return '<p class="leitfaden-skript">' + escapeHtml(schritt.skript) + '</p>'
    + '<div class="field"><span>Ergebnis</span><div class="chip-group">'
    + ABSCHLUSS_ERGEBNISSE.map((e) => leitfadenChip('ergebnis', e.value, e.label, abschluss.ergebnis === e.value)).join('')
    + '</div></div>'
    + '<label class="field"><span>Notiz</span><textarea data-feld="abschluss-freitext" rows="3">'
    + escapeHtml(abschluss.freitext || '') + '</textarea></label>'
    + leitfadenEinwandPanel(produkt) + leitfadenNav({ weiterLabel: 'Übernehmen', weiterAktion: 'uebernehmen' });
}

function renderLeitfadenSchritt() {
  const wiz = state.leitfaden;
  if (!wiz) return;
  if (!wiz.produkt) {
    leitfadenBody.innerHTML = renderProduktauswahl();
    return;
  }
  const schritte = leitfadenSchritte(wiz.produkt);
  const schritt = schritte[wiz.schrittIndex];
  const kopf = '<p class="leitfaden-progress">Schritt ' + (wiz.schrittIndex + 2) + ' von '
    + leitfadenGesamtschritte(wiz.produkt) + '</p>'
    + '<h2 id="leitfaden-title">' + escapeHtml(schritt.titel) + '</h2>';
  let inhalt = '';
  if (schritt.type === 'gatekeeper') inhalt = renderLeitfadenGatekeeper(schritt);
  else if (schritt.type === 'opener') inhalt = renderLeitfadenOpener(schritt, wiz.produkt);
  else if (schritt.type === 'bedarf') inhalt = renderLeitfadenBedarf(schritt, wiz.produkt);
  else if (schritt.type === 'pitch') inhalt = renderLeitfadenPitch(schritt, wiz.produkt);
  else if (schritt.type === 'abschluss') inhalt = renderLeitfadenAbschluss(schritt, wiz.produkt);
  leitfadenBody.innerHTML = kopf + inhalt;
}

// Nur bei echtem Schrittwechsel den Fokus auf die neue Ueberschrift setzen, sonst
// wuerde jeder Chip-Klick den Fokus vom gerade geklickten Button wegreissen.
function leitfadenSchrittWechsel() {
  renderLeitfadenSchritt();
  const heading = leitfadenBody.querySelector('h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
}

function leitfadenChipKlick(gruppe, wert) {
  const wiz = state.leitfaden;
  if (gruppe === 'produkt') {
    wiz.produktWahl = wert;
    renderLeitfadenSchritt();
    return;
  }
  if (gruppe === 'anlass') {
    wiz.antworten.sachlicherAnlass = wert === wiz.antworten.sachlicherAnlass ? '' : wert;
    renderLeitfadenSchritt();
    return;
  }
  if (gruppe === 'aufhaenger') {
    const opener = wiz.antworten.opener || (wiz.antworten.opener = {});
    const liste = opener.aufhaenger || (opener.aufhaenger = []);
    const index = liste.indexOf(wert);
    if (index === -1) liste.push(wert); else liste.splice(index, 1);
    renderLeitfadenSchritt();
    return;
  }
  if (gruppe.startsWith('zustimmung-')) {
    const frageId = gruppe.slice('zustimmung-'.length);
    const bedarf = wiz.antworten.bedarf || (wiz.antworten.bedarf = {});
    const eintrag = bedarf[frageId] || (bedarf[frageId] = {});
    eintrag.zustimmung = eintrag.zustimmung === wert ? null : wert;
    renderLeitfadenSchritt();
    return;
  }
  if (gruppe === 'ergebnis') {
    const abschluss = wiz.antworten.abschluss || (wiz.antworten.abschluss = {});
    abschluss.ergebnis = abschluss.ergebnis === wert ? '' : wert;
    renderLeitfadenSchritt();
  }
}

leitfadenBody.addEventListener('click', (event) => {
  const wiz = state.leitfaden;
  if (!wiz) return;
  const chip = event.target.closest('[data-chip-gruppe]');
  if (chip) {
    leitfadenChipKlick(chip.dataset.chipGruppe, chip.dataset.chipWert);
    return;
  }
  const aktion = event.target.closest('[data-action]')?.dataset.action;
  if (!aktion) return;
  if (aktion === 'ueberspringen') {
    beendeLeitfaden({ uebernehmen: false });
    return;
  }
  if (aktion === 'produkt-weiter') {
    if (!wiz.produktWahl || !wiz.antworten.sachlicherAnlass) return;
    wiz.produkt = wiz.produktWahl;
    wiz.schrittIndex = 0;
    leitfadenSchrittWechsel();
    return;
  }
  if (aktion === 'gatekeeper-entscheider') {
    wiz.antworten.gatekeeper = { ergebnis: 'entscheider' };
    wiz.schrittIndex += 1;
    leitfadenSchrittWechsel();
    return;
  }
  if (aktion === 'gatekeeper-weiterleitung') {
    wiz.antworten.gatekeeper = { ergebnis: 'weiterleitung' };
    wiz.antworten.abschluss = { ...wiz.antworten.abschluss, ergebnis: 'wiedervorlage' };
    wiz.schrittIndex = leitfadenSchritte(wiz.produkt).findIndex((s) => s.type === 'abschluss');
    leitfadenSchrittWechsel();
    return;
  }
  if (aktion === 'einwand-erfasst') {
    const einwand = event.target.closest('[data-einwand]')?.dataset.einwand;
    if (!einwand) return;
    const liste = wiz.antworten.einwaende || (wiz.antworten.einwaende = []);
    if (!liste.includes(einwand)) liste.push(einwand);
    renderLeitfadenSchritt();
    return;
  }
  if (aktion === 'weiter') {
    wiz.schrittIndex += 1;
    leitfadenSchrittWechsel();
    return;
  }
  if (aktion === 'zurueck') {
    if (wiz.schrittIndex === 0) {
      wiz.produkt = null;
      leitfadenSchrittWechsel();
      return;
    }
    wiz.schrittIndex -= 1;
    leitfadenSchrittWechsel();
    return;
  }
  if (aktion === 'uebernehmen') {
    beendeLeitfaden({ uebernehmen: true });
  }
});

leitfadenBody.addEventListener('input', (event) => {
  const wiz = state.leitfaden;
  if (!wiz) return;
  const feld = event.target.dataset.feld;
  if (!feld) return;
  if (feld === 'anlass-freitext') {
    wiz.antworten.sachlicherAnlass = event.target.value;
    const position = event.target.selectionStart;
    renderLeitfadenSchritt();
    const next = leitfadenBody.querySelector('[data-feld="anlass-freitext"]');
    next?.focus();
    next?.setSelectionRange(position, position);
    return;
  }
  if (feld === 'opener-freitext') {
    (wiz.antworten.opener || (wiz.antworten.opener = {})).freitext = event.target.value;
    return;
  }
  if (feld === 'bedarf-antwort') {
    const frageId = event.target.dataset.frageId;
    const bedarf = wiz.antworten.bedarf || (wiz.antworten.bedarf = {});
    (bedarf[frageId] || (bedarf[frageId] = {})).antwort = event.target.value;
    return;
  }
  if (feld === 'abschluss-freitext') {
    (wiz.antworten.abschluss || (wiz.antworten.abschluss = {})).freitext = event.target.value;
  }
});

// Escape-Taste oder anderes natives Schliessen des <dialog> darf bereits eingetragene
// Notizen nicht kommentarlos verwerfen — nur das explizite "Ueberspringen" verwirft.
leitfadenDialog.addEventListener('close', () => {
  const wiz = state.leitfaden;
  if (!wiz) return;
  if (wiz.produkt) {
    state.leitfadenErgebnis = {
      notiz: baueNotizAusAntworten(wiz.produkt, wiz.antworten),
      kontaktquelle: 'telefonat',
    };
  }
  state.leitfaden = null;
  geheZuNeu();
});

// "+ Neuer Lead" gibt es an mehreren Stellen (Desktop-Header innerhalb von #main-content
// und die Mobile-Nav ausserhalb davon) - ein document-weiter Listener deckt beide ab,
// ohne die bestehende main-Klick-Delegation anzufassen.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href="#neu"]');
  if (!link) return;
  event.preventDefault();
  try {
    starteLeitfaden();
  } catch {
    // Kaputte Leitfaden-Daten duerfen den Zugang zum leeren Formular nicht blockieren.
    state.leitfaden = null;
    geheZuNeu();
  }
});

// prefill kommt aus einem durchlaufenen Telefonleitfaden (state.leitfadenErgebnis) und
// befuellt ausschliesslich bestehende Felder, keine neuen Formularfelder.
function createView(prefill = null) {
  const felder = STAMMDATEN_FELDER.map((feld) => {
    if (feld.type === 'select') {
      const vorgabe = feld.name === 'kontaktquelle' ? prefill?.kontaktquelle : '';
      const optionen = feld.options.map(([value, text]) =>
        '<option value="' + attr(value) + '"' + (value === vorgabe ? ' selected' : '') + '>'
        + escapeHtml(text) + '</option>').join('');
      return '<label class="field"><span>' + escapeHtml(feld.label) + '</span>'
        + '<select name="' + attr(feld.name) + '">' + optionen + '</select></label>';
    }
    return '<label class="field"><span>' + escapeHtml(feld.label) + '</span>'
      + '<input name="' + attr(feld.name) + '" type="' + attr(feld.type) + '" maxlength="200"></label>';
  }).join('');
  return '<section aria-labelledby="view-title"><header class="view-head"><div>'
    + '<a class="back-link" href="#leads">← Zurück zu Leads</a>'
    + '<p class="kicker">Neuer Eintrag</p>'
    + '<h1 id="view-title" tabindex="-1">Lead anlegen</h1>'
    + '<p>Der Lead wird über n8n in das Google Sheet geschrieben und startet im Status „Neu“.</p>'
    + '</div></header>'
    + '<div class="detail-grid"><div class="detail-main"><section class="panel">'
    + '<div class="panel-head"><h2>Kundendaten</h2></div>'
    + '<form class="edit-form" id="create-form"><div class="form-grid">' + felder
    + '<label class="field form-full"><span>Notiz</span>'
    + '<textarea name="notiz" maxlength="5000" rows="4" '
    + 'placeholder="Woher kommt der Kontakt, was ist bekannt?">' + escapeHtml(prefill?.notiz || '')
    + '</textarea></label>'
    + '</div><p class="result-count">Mindestens Firma, Ansprechpartner oder E-Mail wird benötigt.</p>'
    + '<div class="form-actions"><a class="button button-secondary" href="#leads">Abbrechen</a>'
    + '<button class="button button-primary" type="submit">Lead anlegen</button></div></form>'
    + '</section></div></div></section>';
}

function archivView() {
  const leads = filterLeads(state.leads, { ...state.filters, archiv: 'nur' });
  const zeilen = leads.map((lead) => '<tr><td><span class="lead-name">'
    + '<strong>' + escapeHtml(leadDisplayName(lead)) + '</strong>'
    + '<small>' + escapeHtml(lead.ort || lead.branche || '–') + '</small></span></td>'
    + '<td>' + statusBadge(lead.status) + '</td>'
    + '<td>' + escapeHtml(formatDate(lead.archiviert_am)) + '</td>'
    + '<td><button class="button button-quiet" type="button" data-open-lead="'
    + attr(lead.lead_id) + '">Öffnen</button></td></tr>').join('');
  return '<section aria-labelledby="view-title"><header class="view-head"><div>'
    + '<p class="kicker">Ausgeblendet</p><h1 id="view-title" tabindex="-1">Archiv</h1>'
    + '<p>Archivierte Leads bleiben im Google Sheet erhalten und lassen sich zurückholen.</p></div>'
    + '<div class="view-head-actions"><a class="button button-secondary" href="#leads">Zu den Leads</a>'
    + '</div></header>'
    + (leads.length
      ? '<div class="table-wrap"><table class="lead-table">'
        + '<caption class="visually-hidden">Archivierte Leads</caption><thead><tr>'
        + '<th>Lead</th><th>Status</th><th>Archiviert am</th><th>Aktion</th></tr></thead>'
        + '<tbody>' + zeilen + '</tbody></table></div>'
      : '<div class="empty-state"><div class="empty-symbol" aria-hidden="true">✓</div>'
        + '<p>Das Archiv ist leer.</p></div>')
    + '</section>';
}

function kanbanCard(lead, ablegbar) {
  const faellig = formatDate(lead.next_action_at, '');
  // Datum und Ort sind verschiedene Dinge und teilen sich nicht mehr dasselbe Feld.
  const rechts = faellig
    ? '<span class="' + (isOverdue(lead) ? 'due-date is-overdue' : 'due-date') + '">'
      + escapeHtml(faellig) + '</span>'
    : '<span class="kanban-ort">' + escapeHtml(lead.ort || 'Kein Termin') + '</span>';
  return '<article class="kanban-card' + (state.saving.has(lead.lead_id) ? ' is-saving' : '') + '"'
    + (ablegbar ? ' draggable="true"' : '') + ' data-lead-id="' + attr(lead.lead_id) + '"'
    + (state.saving.has(lead.lead_id) ? ' aria-busy="true"' : '') + '>'
    + '<div class="card-top">'
    + '<button class="kanban-open" type="button" data-open-lead="' + attr(lead.lead_id) + '">'
    + escapeHtml(leadDisplayName(lead)) + '</button>'
    + (ablegbar ? '<span class="drag-handle" aria-hidden="true" title="Verschieben">⠿</span>' : '')
    + '</div>'
    + '<div class="kanban-meta"><span>Score ' + asNumber(lead.akquise_score) + '</span>' + rechts + '</div>'
    + (hasBrokenDate(lead) ? '<p class="missing-note compact">Datum im Sheet unlesbar</p>' : '')
    + '<label class="field"><span class="visually-hidden">Status für '
    + escapeHtml(leadDisplayName(lead)) + '</span>'
    + '<select class="card-status-select" data-lead-id="' + attr(lead.lead_id) + '"'
    + (state.saving.has(lead.lead_id) ? ' disabled' : '') + '>'
    + statusOptions(lead.status) + '</select></label></article>';
}

function kanbanView() {
  const spalten = kanbanColumns(state.leads);
  const sichtbar = spalten.reduce((summe, spalte) => summe + spalte.leads.length, 0);
  const columns = spalten.map((spalte) => {
    const cards = spalte.leads.map((lead) => kanbanCard(lead, spalte.ablegbar)).join('');
    return '<section class="kanban-column status-' + attr(spalte.value) + '"'
      + (spalte.ablegbar ? ' data-status="' + attr(spalte.value) + '"' : '')
      + ' aria-labelledby="column-' + attr(spalte.value) + '">'
      + '<header class="kanban-head"><h2 id="column-' + attr(spalte.value) + '">'
      + escapeHtml(spalte.label) + '</h2>'
      + '<span class="kanban-count">' + spalte.leads.length + '</span></header>'
      + (spalte.ablegbar ? '' : '<p class="missing-note compact">Diese Leads haben keinen gültigen '
        + 'Status. Bitte unten einen Status wählen.</p>')
      + '<div class="kanban-cards">' + (cards || '<p class="result-count">Keine Leads</p>')
      + '</div></section>';
  }).join('');
  return '<section aria-labelledby="view-title"><header class="view-head"><div><p class="kicker">Pipeline</p>'
    + '<h1 id="view-title" tabindex="-1">Kanban</h1><p>Karten ziehen oder den Status direkt auswählen. '
    + 'Konflikte mit Automationen werden nicht überschrieben.</p></div>'
    + '<div class="view-head-actions">'
    + '<a class="button button-primary" href="#neu">+ Neuer Lead</a>'
    + '<span class="result-count">' + sichtbar + ' Leads</span></div></header>'
    + '<div class="kanban-shell"><div class="kanban-board" role="group" tabindex="0" '
    + 'aria-label="Lead-Pipeline">' + columns + '</div></div></section>';
}

async function postWrite(payload) {
  const response = await fetch('/api/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    const error = new Error(result.message || 'Änderung konnte nicht gespeichert werden');
    error.code = result.error;
    error.status = response.status;
    error.currentStatus = result.current_status;
    throw error;
  }
  return result;
}

// Oeffnet den Bestaetigungsdialog. Liefert den Rueckgabewert und, falls ein
// Abschlussgrund verlangt wird, dessen Auswahl.
async function oeffneDialog({ title, message, needsReason = false, reasonValue = '' }) {
  if (dialog.open) return { bestaetigt: false, reason: null };
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-message').textContent = message;
  const reasonWrap = document.querySelector('#dialog-reason-wrap');
  const reasonSelect = document.querySelector('#dialog-reason');
  reasonWrap.hidden = !needsReason;
  reasonSelect.required = needsReason;
  reasonSelect.innerHTML = needsReason ? reasonOptions(reasonValue) : '';
  dialog.returnValue = '';
  dialog.showModal();
  // Fokus auf das Feld, das ausgefuellt werden muss, sonst auf Bestaetigen.
  (needsReason ? reasonSelect : document.querySelector('#dialog-confirm')).focus();
  const returnValue = await new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
  });
  return { bestaetigt: returnValue === 'confirm', reason: reasonSelect.value || null };
}

async function confirmAction({ title, message }) {
  const { bestaetigt } = await oeffneDialog({ title, message });
  return bestaetigt;
}

async function confirmStatusChange(lead, target, { forceConfirmation = false } = {}) {
  const backward = isBackwardTransition(lead.status, target);
  const needsReason = target === 'beendet' && !lead.ende_grund;
  if (!backward && !needsReason && !forceConfirmation) {
    return { confirmed: true, reason: null, backward: false };
  }
  const { bestaetigt, reason } = await oeffneDialog({
    title: backward ? 'Rücksprung bestätigen?' : 'Lead beenden?',
    message: backward
      ? 'Der Status wird von „' + label(STATUS_LABELS, lead.status) + '“ auf „'
        + label(STATUS_LABELS, target) + '“ zurückgesetzt. Dieser Schritt bleibt in den '
        + 'Aktivitäten sichtbar.'
      : 'Bitte einen Abschlussgrund wählen. Er lässt sich später in der Lead-Akte ändern.',
    needsReason,
    reasonValue: lead.ende_grund || '',
  });
  if (!bestaetigt) return { confirmed: false };
  // Frueher schloss der Dialog hier kommentarlos und es passierte nichts.
  if (needsReason && !reason) {
    toast('Ohne Abschlussgrund wurde nichts geändert.', 'error');
    return { confirmed: false };
  }
  return {
    confirmed: true,
    reason: needsReason ? reason : null,
    backward: backward || forceConfirmation,
  };
}

async function moveLead(leadId, target, options = {}) {
  const lead = state.leads.find((item) => item.lead_id === leadId);
  if (!lead) return false;
  if (lead.status === target) {
    render();
    return false;
  }
  // Sperre vor dem Dialog setzen, sonst kann ein zweiter Statuswechsel desselben
  // Leads dazwischenrutschen, waehrend der Dialog offen steht.
  if (state.saving.has(leadId)) {
    toast('Für diesen Lead läuft noch eine Speicherung. Bitte kurz warten.', 'error');
    render();
    return false;
  }
  state.saving.add(leadId);
  const vorher = lead.status;
  try {
    const decision = await confirmStatusChange(lead, target, options);
    if (!decision.confirmed) {
      render();
      return false;
    }
    const result = await postWrite({
      lead_id: leadId, feld: 'status', wert: target,
      erwarteter_status: vorher,
      ruecksprung_bestaetigt: decision.backward,
    });
    // Erst nach dem Abschlussgrund uebernehmen: sonst greift beim Wiederholen
    // die Gleichheitspruefung oben und der Fehler bliebe unsichtbar.
    if (decision.reason) {
      await postWrite({
        lead_id: leadId, feld: 'ende_grund', wert: decision.reason,
        erwarteter_status: target,
      });
      lead.ende_grund = decision.reason;
    }
    lead.status = target;
    state.activities.unshift({
      activity_id: 'local-' + Date.now(), lead_id: leadId,
      datum: new Date().toISOString(), typ: 'status_wechsel',
      ergebnis: 'offen', notiz: vorher + ' -> ' + target,
    });
    toast('Status auf „' + label(STATUS_LABELS, target) + '“ geändert.');
    if (result.needs_ende_grund && !decision.reason) {
      toast('Bitte noch einen Abschlussgrund ergänzen.', 'error');
    }
    render();
    return true;
  } catch (error) {
    if (error.status === 422 && !options.forceConfirmation) {
      state.saving.delete(leadId);
      return moveLead(leadId, target, { forceConfirmation: true });
    }
    if (error.status === 409 && error.code === 'status_conflict') {
      toast('Status hat sich zwischenzeitlich geändert. Die Daten werden neu geladen.', 'error');
      await loadData({ quiet: true });
    } else {
      // Der Status kann bereits geschrieben sein, wenn erst der Abschlussgrund scheitert.
      toast(error.message, 'error');
      await loadData({ quiet: true });
    }
    return false;
  } finally {
    state.saving.delete(leadId);
  }
}

// Formularwerte kommen laut HTML-Standard mit CRLF, die Sheet-Daten mit LF.
// Ohne Angleichung gilt jede mehrzeilige Notiz bei jedem Speichern als geaendert.
const normText = (value) => String(value ?? '').replaceAll('\r\n', '\n');
const DATUMSFELDER = new Set(['wiedervorlage_am', 'next_action_at']);
const vergleichswert = (feld, value) => (DATUMSFELDER.has(feld)
  ? normText(value).slice(0, 10)
  : normText(value));

const FELD_TITEL = {
  notiz: 'Notiz', ende_grund: 'Abschlussgrund', wiedervorlage_am: 'Wiedervorlage',
  next_action: 'Nächste Aktion', next_action_at: 'Fällig am',
  ...Object.fromEntries(STAMMDATEN_FELDER.map((feld) => [feld.name, feld.label])),
};

// Schreibt geaenderte Felder einzeln. Bei einem Fehler bleibt das bereits
// Geschriebene stehen; der Nutzer erfaehrt genau, was gespeichert wurde.
async function saveFields(lead, values, felder) {
  const geaendert = felder.filter(
    (feld) => vergleichswert(feld, lead[feld]) !== vergleichswert(feld, values[feld]),
  );
  if (!geaendert.length) return { ok: true, gespeichert: [] };
  const gespeichert = [];
  try {
    for (const feld of geaendert) {
      const wert = normText(values[feld]);
      await postWrite({
        lead_id: lead.lead_id, feld, wert, erwarteter_status: lead.status,
      });
      lead[feld] = wert;
      gespeichert.push(feld);
    }
    return { ok: true, gespeichert };
  } catch (error) {
    const offen = geaendert.filter((feld) => !gespeichert.includes(feld));
    const hinweis = gespeichert.length
      ? ' Gespeichert wurde bereits: ' + gespeichert.map((feld) => FELD_TITEL[feld]).join(', ')
        + '. Nicht gespeichert: ' + offen.map((feld) => FELD_TITEL[feld]).join(', ') + '.'
      : '';
    toast(error.message + hinweis, 'error');
    // Neu laden, damit Formular und Sheet nicht auseinanderlaufen.
    await loadData({ quiet: true });
    return { ok: false, gespeichert };
  }
}

async function saveDetailForm(form) {
  const lead = state.leads.find((item) => item.lead_id === form.dataset.leadId);
  if (!lead || state.saving.has(lead.lead_id)) return;
  const values = Object.fromEntries(new FormData(form));
  const statusChanged = String(lead.status ?? '') !== values.status;
  const button = form.querySelector('button[type="submit"]');
  state.saving.add(lead.lead_id);
  button.disabled = true;
  button.textContent = 'Wird gespeichert …';
  try {
    const ergebnis = await saveFields(lead, values, [
      'notiz', 'ende_grund', 'wiedervorlage_am', 'next_action', 'next_action_at',
    ]);
    if (!ergebnis.ok) return;
    state.saving.delete(lead.lead_id);
    if (statusChanged) {
      await moveLead(lead.lead_id, values.status);
      return;
    }
    toast(ergebnis.gespeichert.length ? 'Änderungen gespeichert.' : 'Keine Änderungen.');
    render();
  } finally {
    state.saving.delete(lead.lead_id);
    button.disabled = false;
    button.textContent = 'Änderungen speichern';
  }
}

// Haengt einen datierten Eintrag an den Verlauf. Die Dauernotiz am Lead bleibt davon
// unberuehrt, damit sich Momentaufnahme und Verlauf nicht gegenseitig ueberschreiben.
async function saveNotiz(form) {
  const leadId = form.dataset.leadId;
  const lead = state.leads.find((item) => item.lead_id === leadId);
  const text = normText(new FormData(form).get('wert')).trim();
  if (!lead || !text || state.saving.has(leadId)) return;
  const button = form.querySelector('button[type="submit"]');
  state.saving.add(leadId);
  button.disabled = true;
  try {
    await postWrite({ aktion: 'notiz', lead_id: leadId, wert: text });
    state.activities.unshift({
      activity_id: 'local-' + Date.now(), lead_id: leadId,
      datum: new Date().toISOString(), typ: 'notiz', richtung: '',
      ergebnis: '', notiz: text,
    });
    toast('Notiz im Verlauf eingetragen.');
    render();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving.delete(leadId);
    button.disabled = false;
  }
}

async function archiviereLead(leadId, aktion) {
  const lead = state.leads.find((item) => item.lead_id === leadId);
  if (!lead || state.saving.has(leadId)) return;
  const archivieren = aktion === 'archivieren';
  if (archivieren) {
    const bestaetigt = await confirmAction({
      title: 'Lead archivieren?',
      message: '„' + leadDisplayName(lead) + '“ verschwindet aus allen Arbeitsansichten. '
        + 'Die Zeile im Google Sheet bleibt erhalten und lässt sich jederzeit zurückholen.',
    });
    if (!bestaetigt) return;
  }
  state.saving.add(leadId);
  try {
    await postWrite({ aktion, lead_id: leadId });
    lead.archiviert_am = archivieren ? todayIso() : '';
    toast(archivieren ? 'Lead archiviert.' : 'Lead ist wieder aktiv.');
    if (archivieren) location.hash = 'leads';
    else render();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving.delete(leadId);
  }
}

async function createLead(form) {
  const values = Object.fromEntries(new FormData(form));
  const lead_id = neueLeadId(values.firma, values.ansprechpartner, values.mail);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Wird angelegt …';
  try {
    await postWrite({
      aktion: 'create',
      lead_id,
      lead: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, normText(v)])),
    });
    toast('Lead angelegt.');
    await loadData({ quiet: true });
    location.hash = 'lead/' + encodeURIComponent(lead_id);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Lead anlegen';
  }
}

async function erzeugeKiText(form) {
  const leadId = form.dataset.leadId;
  if (state.kiLaeuft) return;
  const values = Object.fromEntries(new FormData(form));
  speicherePrompt(normText(values.prompt));
  state.kiLaeuft = true;
  state.kiText = '';
  render();
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        textart: values.textart,
        prompt: normText(values.prompt),
        zusatz: normText(values.zusatz),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'Der Text konnte nicht erzeugt werden');
    }
    state.kiText = result.text;
    if (result.abgeschnitten) toast('Der Text wurde vorzeitig beendet. Bitte prüfen.', 'error');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.kiLaeuft = false;
    render();
  }
}

async function kopiereKiText() {
  try {
    await navigator.clipboard.writeText(state.kiText);
    toast('Text in die Zwischenablage kopiert.');
  } catch {
    // Ohne Zwischenablagerecht bleibt das Markieren von Hand.
    document.querySelector('#ki-ergebnis-text')?.focus();
    toast('Kopieren war nicht möglich. Bitte den Text von Hand markieren.', 'error');
  }
}

async function saveStammdaten(form) {
  const lead = state.leads.find((item) => item.lead_id === form.dataset.leadId);
  if (!lead || state.saving.has(lead.lead_id)) return;
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type="submit"]');
  state.saving.add(lead.lead_id);
  button.disabled = true;
  button.textContent = 'Wird gespeichert …';
  try {
    const ergebnis = await saveFields(lead, values, STAMMDATEN_FELDER.map((feld) => feld.name));
    if (!ergebnis.ok) return;
    toast(ergebnis.gespeichert.length ? 'Kundendaten gespeichert.' : 'Keine Änderungen.');
    state.stammdatenOffen = false;
    render();
  } finally {
    state.saving.delete(lead.lead_id);
    button.disabled = false;
    button.textContent = 'Kundendaten speichern';
  }
}

main.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open-lead]');
  if (open) {
    location.hash = 'lead/' + encodeURIComponent(open.dataset.openLead);
    return;
  }
  if (event.target.closest('[data-action="retry"]')) {
    loadData();
    return;
  }
  const aktion = event.target.closest('[data-action]')?.dataset.action;
  if (aktion === 'stammdaten-toggle') {
    state.stammdatenOffen = !state.stammdatenOffen;
    render();
    if (state.stammdatenOffen) document.querySelector('#stammdaten-form input')?.focus();
    return;
  }
  if (aktion === 'ki-prompt-reset') {
    speicherePrompt('');
    render();
    toast('Standardprompt wiederhergestellt.');
    return;
  }
  if (aktion === 'ki-copy') {
    kopiereKiText();
    return;
  }
  if (aktion === 'archivieren' || aktion === 'reaktivieren') {
    const leadId = event.target.closest('[data-lead-id]')?.dataset.leadId;
    if (leadId) archiviereLead(leadId, aktion);
    return;
  }
  const quick = event.target.closest('[data-quick-filter]');
  if (quick) {
    // "Neue Leads" ist ein Statuskriterium und gehoert nicht in den Faelligkeitsfilter,
    // sonst schliessen sich beide Filter gegenseitig aus.
    const wert = quick.dataset.quickFilter;
    state.filters.due = wert === 'due' ? 'due' : '';
    state.filters.status = wert === 'new' ? 'neu' : '';
    render();
  }
});
main.addEventListener('keydown', (event) => {
  const target = event.target.closest('[data-open-lead]');
  if (target && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    location.hash = 'lead/' + encodeURIComponent(target.dataset.openLead);
  }
});
main.addEventListener('input', (event) => {
  if (event.target.id !== 'lead-search') return;
  state.filters.search = event.target.value;
  const position = event.target.selectionStart;
  render();
  const next = document.querySelector('#lead-search');
  next?.focus();
  next?.setSelectionRange(position, position);
});
main.addEventListener('change', (event) => {
  if (event.target.classList.contains('card-status-select')) {
    moveLead(event.target.dataset.leadId, event.target.value);
    return;
  }
  const filter = {
    'status-filter': 'status', 'score-filter': 'minScore', 'due-filter': 'due',
  }[event.target.id];
  if (!filter) return;
  state.filters[filter] = event.target.value;
  render();
  // Nach dem Neuaufbau steht der Fokus sonst am Seitenanfang.
  document.querySelector('#' + event.target.id)?.focus();
});
main.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.id) return;
  const handler = {
    'lead-edit-form': saveDetailForm,
    'stammdaten-form': saveStammdaten,
    'notiz-form': saveNotiz,
    'ki-form': erzeugeKiText,
    'create-form': createLead,
  }[form.id];
  if (!handler) return;
  event.preventDefault();
  handler(form);
});
main.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.kanban-card');
  if (!card) return;
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.leadId);
});
main.addEventListener('dragend', (event) => {
  event.target.closest('.kanban-card')?.classList.remove('is-dragging');
  document.querySelectorAll('.kanban-column.is-over').forEach((column) => column.classList.remove('is-over'));
});
main.addEventListener('dragover', (event) => {
  // Nur Spalten mit gueltigem Zielstatus nehmen Karten an.
  const column = event.target.closest('.kanban-column[data-status]');
  if (!column) return;
  event.preventDefault();
  // Muss alle Spalten durchlaufen: der frueher genutzte Selektor .is-over fand nur
  // bereits markierte Spalten, konnte die Klasse also nie vergeben.
  document.querySelectorAll('.kanban-column').forEach((item) => item.classList.toggle('is-over', item === column));
});
main.addEventListener('drop', (event) => {
  const column = event.target.closest('.kanban-column[data-status]');
  if (!column) return;
  event.preventDefault();
  const leadId = event.dataTransfer.getData('text/plain');
  column.classList.remove('is-over');
  moveLead(leadId, column.dataset.status);
});

main.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.drag-handle');
  if (!handle || event.pointerType === 'mouse') return;
  const card = handle.closest('.kanban-card');
  pointerDrag = { pointerId: event.pointerId, leadId: card.dataset.leadId, card, started: false };
  handle.setPointerCapture(event.pointerId);
});
main.addEventListener('pointermove', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  if (!pointerDrag.started) {
    pointerDrag.started = true;
    document.body.classList.add('is-pointer-dragging');
    pointerDrag.card.classList.add('is-dragging');
  }
  const column = document.elementFromPoint(event.clientX, event.clientY)?.closest('.kanban-column[data-status]');
  // Muss alle Spalten durchlaufen: der frueher genutzte Selektor .is-over fand nur
  // bereits markierte Spalten, konnte die Klasse also nie vergeben.
  document.querySelectorAll('.kanban-column').forEach((item) => item.classList.toggle('is-over', item === column));
});
main.addEventListener('pointerup', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  const active = pointerDrag;
  const column = document.elementFromPoint(event.clientX, event.clientY)?.closest('.kanban-column[data-status]');
  active.card.classList.remove('is-dragging');
  document.body.classList.remove('is-pointer-dragging');
  document.querySelectorAll('.kanban-column.is-over').forEach((item) => item.classList.remove('is-over'));
  pointerDrag = null;
  if (active.started && column) moveLead(active.leadId, column.dataset.status);
});
main.addEventListener('pointercancel', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  pointerDrag.card.classList.remove('is-dragging');
  document.body.classList.remove('is-pointer-dragging');
  document.querySelectorAll('.kanban-column.is-over').forEach((item) => item.classList.remove('is-over'));
  pointerDrag = null;
});

// Ein Fehler beim Aufbau einer Ansicht darf die Navigation nicht lautlos blockieren.
window.addEventListener('hashchange', () => {
  try {
    render();
  } catch (error) {
    main.innerHTML = '<div class="error-state">'
      + '<h1 id="view-title" tabindex="-1">Ansicht konnte nicht aufgebaut werden</h1>'
      + '<p>' + escapeHtml(error.message) + '</p>'
      + '<button class="button button-primary" type="button" data-action="retry">Neu laden</button></div>';
  }
  focusHeading();
});
refreshButton.addEventListener('click', () => loadData());

// Der Weg zur eigentlichen Datenquelle, bewusst unauffaellig in der Fusszeile.
const sheetLink = document.querySelector('#sheet-link');
if (sheetLink) sheetLink.href = SHEET_URL;

// Standardprompt und Textarten kommen vom Server, damit sie nur an einer Stelle gepflegt werden.
async function ladeKiDefaults() {
  try {
    const response = await fetch('/api/ai', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const result = await response.json();
    if (!result?.ok) return;
    kiDefaults.prompt = String(result.default_prompt || '');
    kiDefaults.textarten = result.textarten && typeof result.textarten === 'object'
      ? result.textarten : {};
    if (route().view === 'detail') render();
  } catch {
    // Ohne Vorlagen bleibt das KI-Panel benutzbar, nur ohne vorbelegten Prompt.
  }
}
ladeKiDefaults();
document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long', day: '2-digit', month: 'long',
}).format(new Date());
loadData();
