// Das Google Sheet bleibt die fachliche Wahrheit; der Link ist der Weg dorthin.
export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1f13Dsh6IIrBD7cConaJw7rGauEPE65HVvMRlSkSr8dQ/edit';

// Stammdaten, die das CRM selbst pflegen darf. Muss zur Whitelist in
// functions/lib/validation.js und im n8n-Workflow WF-4 passen.
export const STAMMDATEN_FELDER = [
  { name: 'firma', label: 'Firma', type: 'text' },
  { name: 'ansprechpartner', label: 'Ansprechpartner', type: 'text' },
  { name: 'strasse', label: 'Straße und Hausnummer', type: 'text' },
  { name: 'ort', label: 'PLZ und Ort', type: 'text' },
  { name: 'telefon', label: 'Telefon (Festnetz)', type: 'tel' },
  { name: 'handy', label: 'Handy', type: 'tel' },
  { name: 'mail', label: 'E-Mail', type: 'email' },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'branche', label: 'Branche', type: 'text' },
  { name: 'anrede', label: 'Anrede', type: 'select', options: [['sie', 'Sie'], ['du', 'Du']] },
  {
    name: 'kontaktquelle',
    label: 'Kontaktquelle',
    type: 'select',
    options: [['website', 'Website'], ['telefonat', 'Telefonat'], ['empfehlung', 'Empfehlung'],
      ['direkt_mail', 'Direkt-Mail'], ['sonstiges', 'Sonstiges']],
  },
];

export const STATUS_DEFINITIONS = [
  { value: 'neu', label: 'Neu' },
  { value: 'analysiert', label: 'Analysiert' },
  { value: 'kontaktiert', label: 'Kontaktiert' },
  { value: 'qualifiziert', label: 'Qualifiziert' },
  { value: 'angebot', label: 'Angebot' },
  { value: 'gewonnen', label: 'Gewonnen' },
  { value: 'beendet', label: 'Beendet' },
];
export const STATUS_VALUES = STATUS_DEFINITIONS.map((status) => status.value);
export const STATUS_LABELS = Object.fromEntries(
  STATUS_DEFINITIONS.map((status) => [status.value, status.label]),
);
export const END_REASON_LABELS = {
  '': 'Kein Grund gewählt',
  kein_bedarf: 'Kein Bedarf',
  hat_agentur: 'Hat bereits eine Agentur',
  zu_teuer: 'Zu teuer',
  keine_reaktion: 'Keine Reaktion',
  ungeeignet: 'Ungeeignet',
  mail_unzustellbar: 'Mail unzustellbar',
};
export const ACTION_LABELS = {
  '': 'Keine nächste Aktion',
  analyse: 'Analyse',
  anruf: 'Anruf',
  followup_call: 'Telefonisch nachfassen',
  followup_mail: 'Per Mail nachfassen',
  wiedervorlage: 'Wiedervorlage',
  antwort_bearbeiten: 'Antwort bearbeiten',
  angebot_erstellen: 'Angebot erstellen',
  termin: 'Termin',
};

const terminal = new Set(['gewonnen', 'beendet']);
export const asNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

// Sheet-Werte sind nicht vertrauenswuerdig: Google kann ein Datum als "20.08.2026"
// oder als Seriennummer zurueckliefern. Nur echtes JJJJ-MM-TT zaehlt als Datum,
// alles andere gilt als "kein Datum" statt als falsches Datum.
export const isoDate = (value) => {
  const raw = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(raw + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return '';
  const zurueck = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return zurueck === raw ? raw : '';
};

// Datum im Sheet vorhanden, aber unlesbar. Wird im UI sichtbar gemacht,
// damit ein kaputter Wert nicht lautlos aus der Wiedervorlage faellt.
export const hasBrokenDate = (lead = {}) => ['next_action_at', 'wiedervorlage_am']
  .some((feld) => Boolean(String(lead[feld] ?? '').trim()) && !isoDate(lead[feld]));

export const isArchived = (lead = {}) => Boolean(String(lead.archiviert_am ?? '').trim());
export const leadDisplayName = (lead = {}) => [
  lead.firma, lead.ansprechpartner, lead.mail, lead.telefon, lead.lead_id,
].map((value) => String(value || '').trim()).find(Boolean) || 'Unbenannter Lead';
export const todayIso = (now = new Date()) => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};
export const isDue = (lead, today = todayIso()) => {
  const datum = isoDate(lead.next_action_at);
  return Boolean(datum) && datum <= today
    && !terminal.has(String(lead.status || '')) && !isArchived(lead);
};
export const isOverdue = (lead, today = todayIso()) => {
  const datum = isoDate(lead.next_action_at);
  return Boolean(datum) && datum < today
    && !terminal.has(String(lead.status || '')) && !isArchived(lead);
};

const searchText = (lead) => [
  lead.firma, lead.website, lead.ort, lead.strasse, lead.ansprechpartner,
  lead.mail, lead.telefon, lead.handy, lead.lead_id,
].join(' ').toLocaleLowerCase('de');

export function filterLeads(leads, filters = {}) {
  const query = String(filters.search || '').trim().toLocaleLowerCase('de');
  const minScore = asNumber(filters.minScore);
  return [...leads]
    // Archivierte Leads erscheinen nur im ausdruecklichen Archiv-Filter.
    .filter((lead) => (filters.archiv === 'nur' ? isArchived(lead) : !isArchived(lead)))
    .filter((lead) => !query || searchText(lead).includes(query))
    .filter((lead) => !filters.status || lead.status === filters.status)
    .filter((lead) => !minScore || asNumber(lead.akquise_score) >= minScore)
    .filter((lead) => {
      if (filters.due === 'due') return isDue(lead);
      if (filters.due === 'overdue') return isOverdue(lead);
      if (filters.due === 'broken') return hasBrokenDate(lead);
      return true;
    })
    .sort((a, b) => {
      const dueA = isDue(a) ? 0 : 1;
      const dueB = isDue(b) ? 0 : 1;
      if (dueA !== dueB) return dueA - dueB;
      const dateOrder = String(a.next_action_at || '9999').localeCompare(String(b.next_action_at || '9999'));
      return dateOrder || asNumber(b.akquise_score) - asNumber(a.akquise_score);
    });
}

export function argumentMetrics(activities) {
  const stats = new Map();
  for (const activity of activities) {
    const argumentsUsed = String(activity.verwendete_argumente || '')
      .split(/[,;]/).map((value) => value.trim()).filter(Boolean);
    for (const argument of new Set(argumentsUsed)) {
      const current = stats.get(argument) || { argument, uses: 0, wins: 0, rate: 0 };
      current.uses += 1;
      if (String(activity.ergebnis) === 'zusage') current.wins += 1;
      stats.set(argument, current);
    }
  }
  return [...stats.values()]
    .map((item) => ({ ...item, rate: item.uses ? Math.round(item.wins / item.uses * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.uses - a.uses);
}

export function dashboardMetrics(allLeads, activities) {
  // Archivierte Leads zaehlen nirgends mit, sonst weicht die Kopfzahl von der Liste ab.
  const leads = allLeads.filter((lead) => !isArchived(lead));
  const total = leads.length;
  const won = leads.filter((lead) => lead.status === 'gewonnen').length;
  const scores = leads.map((lead) => asNumber(lead.akquise_score)).filter((score) => score > 0);
  return {
    total,
    archiviert: allLeads.length - total,
    ohneStatus: leads.filter((lead) => !STATUS_VALUES.includes(String(lead.status || ''))).length,
    brokenDates: leads.filter((lead) => hasBrokenDate(lead)).length,
    won,
    successRate: total ? Math.round(won / total * 100) : 0,
    due: leads.filter((lead) => isDue(lead)).length,
    overdue: leads.filter((lead) => isOverdue(lead)).length,
    newCount: leads.filter((lead) => lead.status === 'neu').length,
    averageScore: scores.length
      ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : 0,
    byStatus: Object.fromEntries(
      STATUS_VALUES.map((status) => [status, leads.filter((lead) => lead.status === status).length]),
    ),
    arguments: argumentMetrics(activities),
  };
}

// Baut die Kanban-Spalten. Leads mit unbekanntem oder leerem Status landen in
// einer eigenen Sammelspalte, statt lautlos aus der Arbeitsansicht zu verschwinden.
export function kanbanColumns(allLeads) {
  const leads = allLeads.filter((lead) => !isArchived(lead));
  const nachScore = (a, b) => asNumber(b.akquise_score) - asNumber(a.akquise_score);
  const spalten = STATUS_DEFINITIONS.map((status) => ({
    value: status.value,
    label: status.label,
    ablegbar: true,
    leads: leads.filter((lead) => lead.status === status.value).sort(nachScore),
  }));
  const waisen = leads
    .filter((lead) => !STATUS_VALUES.includes(String(lead.status || ''))).sort(nachScore);
  if (waisen.length) {
    spalten.push({
      value: 'ohne-status', label: 'Ohne gültigen Status', ablegbar: false, leads: waisen,
    });
  }
  return spalten;
}

export const activitiesForLead = (activities, leadId) => activities
  .filter((activity) => activity.lead_id === leadId)
  .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
export const auditsForLead = (audits, leadId) => audits
  .filter((audit) => audit.lead_id === leadId)
  .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));

export function isBackwardTransition(from, to) {
  if (from === to) return false;
  if (terminal.has(from)) return true;
  if (to === 'beendet') return false;
  return STATUS_VALUES.indexOf(to) < STATUS_VALUES.indexOf(from);
}

// encodeURIComponent zerstoert tel:/mailto:-Ziele (aus + wird %2B, aus @ wird %40).
// Stattdessen wird streng validiert und der Wert unveraendert eingesetzt.
export function telHref(value) {
  const roh = String(value ?? '').trim();
  if (!roh) return null;
  const ziffern = roh.replace(/[^\d+]/g, '');
  const nummer = (ziffern.startsWith('+') ? '+' : '') + ziffern.replace(/\+/g, '');
  return /^\+?\d{4,20}$/.test(nummer) ? 'tel:' + nummer : null;
}
export function mailHref(value) {
  const roh = String(value ?? '').trim();
  // Bewusst ohne ? & % : verhindert das Anhaengen fremder mailto-Header.
  return /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(roh) ? 'mailto:' + roh : null;
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function safeDriveUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'drive.google.com' ? url.href : null;
  } catch {
    return null;
  }
}

export function parseRouteHash(hash) {
  const raw = String(hash || '').replace(/^#/, '') || 'dashboard';
  if (raw.startsWith('lead/')) {
    try {
      return { view: 'detail', leadId: decodeURIComponent(raw.slice(5)) };
    } catch {
      return { view: 'leads' };
    }
  }
  return { view: ['dashboard', 'leads', 'kanban', 'archiv', 'neu'].includes(raw) ? raw : 'dashboard' };
}

export function formatDate(value, fallback = '–') {
  const raw = isoDate(value);
  if (!raw) return fallback;
  // T12:00 haelt die Anzeige in jeder Zeitzone auf demselben Kalendertag.
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(raw + 'T12:00:00'));
}
export function formatDateTime(value, fallback = '–') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}
