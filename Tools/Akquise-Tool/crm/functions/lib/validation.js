// CRM-Felder: Arbeitsstand der Pipeline.
export const CRM_FIELDS = [
  'status', 'notiz', 'ende_grund', 'wiedervorlage_am', 'next_action', 'next_action_at',
];
// Stammdaten: Wer der Lead ist. Frueher nur von WF-1 geschrieben, jetzt auch im CRM.
export const STAMM_FIELDS = [
  'firma', 'ansprechpartner', 'strasse', 'ort', 'branche',
  'telefon', 'handy', 'mail', 'website', 'anrede', 'kontaktquelle',
];
export const EDITABLE_FIELDS = new Set([...CRM_FIELDS, ...STAMM_FIELDS]);

export const STATUSES = [
  'neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen', 'beendet',
];
const END_REASONS = [
  '', 'kein_bedarf', 'hat_agentur', 'zu_teuer',
  'keine_reaktion', 'ungeeignet', 'mail_unzustellbar',
];
const NEXT_ACTIONS = [
  '', 'analyse', 'anruf', 'followup_call', 'followup_mail',
  'wiedervorlage', 'antwort_bearbeiten', 'angebot_erstellen', 'termin',
];
const ANREDEN = ['', 'du', 'sie'];
const QUELLEN = ['', 'website', 'telefonat', 'empfehlung', 'direkt_mail', 'sonstiges'];

export const AKTIONEN = ['update', 'create', 'archivieren', 'reaktivieren', 'notiz'];

const validDate = (value) => {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const validMail = (value) => value === ''
  || /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
const validTel = (value) => value === '' || (value.length <= 40 && /^[\d+()/\s.-]+$/.test(value));
const validUrl = (value) => {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.href.length <= 300;
  } catch {
    return false;
  }
};

// Steuerzeichen raus, Zeilenumbrueche bleiben erhalten.
const STEUERZEICHEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const saeubern = (value) => String(value ?? '').replace(STEUERZEICHEN, '');

const FEHLER = (status, error, message) => ({ ok: false, status, error, message });

// Prueft einen einzelnen Feldwert. Rueckgabe: null = in Ordnung, sonst Fehlerobjekt.
function pruefeFeld(feld, wert) {
  if (feld === 'notiz') {
    return wert.length > 5000 ? FEHLER(400, 'value_too_long', 'Die Notiz ist zu lang') : null;
  }
  if (feld === 'status' && !STATUSES.includes(wert)) {
    return FEHLER(400, 'invalid_status', 'Ungültiger Status');
  }
  if (feld === 'ende_grund' && !END_REASONS.includes(wert)) {
    return FEHLER(400, 'invalid_ende_grund', 'Ungültiger Abschlussgrund');
  }
  if (feld === 'next_action' && !NEXT_ACTIONS.includes(wert)) {
    return FEHLER(400, 'invalid_next_action', 'Ungültige nächste Aktion');
  }
  if (['wiedervorlage_am', 'next_action_at'].includes(feld) && !validDate(wert)) {
    return FEHLER(400, 'invalid_date', 'Datum muss JJJJ-MM-TT entsprechen');
  }
  if (feld === 'anrede' && !ANREDEN.includes(wert)) {
    return FEHLER(400, 'invalid_anrede', 'Anrede muss „du“ oder „Sie“ sein');
  }
  if (feld === 'kontaktquelle' && !QUELLEN.includes(wert)) {
    return FEHLER(400, 'invalid_kontaktquelle', 'Ungültige Kontaktquelle');
  }
  if (feld === 'mail' && !validMail(wert)) {
    return FEHLER(400, 'invalid_mail', 'Die E-Mail-Adresse ist ungültig');
  }
  if (['telefon', 'handy'].includes(feld) && !validTel(wert)) {
    return FEHLER(400, 'invalid_telefon', 'Die Rufnummer enthält unerlaubte Zeichen');
  }
  if (feld === 'website' && !validUrl(wert)) {
    return FEHLER(400, 'invalid_website', 'Die Website muss mit http:// oder https:// beginnen');
  }
  if (['firma', 'ansprechpartner', 'strasse', 'ort', 'branche'].includes(feld) && wert.length > 200) {
    return FEHLER(400, 'value_too_long', 'Der Wert ist zu lang');
  }
  return null;
}

const validLeadId = (value) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value);

export function validateWritePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return FEHLER(400, 'invalid_body', 'JSON-Objekt erwartet');
  }
  const aktion = String(input.aktion || 'update').trim();
  if (!AKTIONEN.includes(aktion)) {
    return FEHLER(400, 'invalid_aktion', 'Unbekannte Aktion');
  }
  if (aktion === 'create') return validateCreate(input);

  const lead_id = String(input.lead_id || '').trim();
  if (!validLeadId(lead_id)) return FEHLER(400, 'invalid_lead_id', 'Ungültige Lead-ID');

  if (aktion === 'archivieren' || aktion === 'reaktivieren') {
    return { ok: true, value: { aktion, lead_id } };
  }
  if (aktion === 'notiz') {
    const text = saeubern(input.wert).trim();
    if (!text) return FEHLER(400, 'value_required', 'Die Notiz darf nicht leer sein');
    if (text.length > 5000) return FEHLER(400, 'value_too_long', 'Die Notiz ist zu lang');
    return { ok: true, value: { aktion, lead_id, wert: text } };
  }

  const feld = String(input.feld || '').trim();
  if (!EDITABLE_FIELDS.has(feld)) {
    return FEHLER(400, 'field_not_allowed', 'Dieses Feld ist nicht editierbar');
  }
  let wert = saeubern(input.wert);
  // Nur die Notiz behaelt bewusst ihre Formatierung inklusive Rand-Leerzeichen.
  if (feld !== 'notiz') wert = wert.trim();
  const fehler = pruefeFeld(feld, wert);
  if (fehler) return fehler;

  const erwarteter_status = String(input.erwarteter_status || '').trim();
  if (feld === 'status' && !STATUSES.includes(erwarteter_status)) {
    return FEHLER(400, 'expected_status_required', 'Der zuletzt gelesene Status fehlt');
  }
  return {
    ok: true,
    value: {
      aktion: 'update',
      lead_id,
      feld,
      wert,
      erwarteter_status,
      ruecksprung_bestaetigt: input.ruecksprung_bestaetigt === true,
    },
  };
}

// Beim Anlegen wird ein ganzer Stammdatensatz auf einmal geprueft.
function validateCreate(input) {
  const roh = input.lead;
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    return FEHLER(400, 'invalid_body', 'Lead-Daten fehlen');
  }
  const lead = {};
  for (const feld of STAMM_FIELDS) {
    const wert = saeubern(roh[feld]).trim();
    const fehler = pruefeFeld(feld, wert);
    if (fehler) return fehler;
    lead[feld] = wert;
  }
  // Ohne einen dieser drei Werte laesst sich der Lead spaeter nicht wiedererkennen.
  if (!lead.firma && !lead.ansprechpartner && !lead.mail) {
    return FEHLER(400, 'identity_required', 'Bitte mindestens Firma, Ansprechpartner oder E-Mail angeben');
  }
  const notiz = saeubern(roh.notiz);
  if (notiz.length > 5000) return FEHLER(400, 'value_too_long', 'Die Notiz ist zu lang');

  const lead_id = String(input.lead_id || '').trim();
  if (!validLeadId(lead_id)) return FEHLER(400, 'invalid_lead_id', 'Ungültige Lead-ID');

  return { ok: true, value: { aktion: 'create', lead_id, lead: { ...lead, notiz } } };
}
