// Agent-Schnittstelle fuer Langdock. Feste Fassade vor dem CRM: Heute liest sie ueber
// WF-5 und schreibt ueber WF-4, spaeter kann darunter eine Datenbank liegen, ohne dass
// sich die Langdock-Integration aendert. Einrichtung in Langdock: crm/langdock/EINRICHTUNG.md.
import { END_REASON_LABELS, PIPELINE, STATUS_LABELS } from '../../public/domain.js';
import { readCrmWebhook } from '../api/leads.js';
import { schreibeCrm } from './crm-write.js';
import { createDemoData } from './demo-data.js';
import { localBypassEnabled } from './access.js';
import { apiError, json } from './responses.js';
import { STATUSES, validateWritePayload } from './validation.js';

const MAX_TREFFER = 50;
const MAX_AKTIVITAETEN = 30;
// Kennzeichnet im Verlauf, was ein Agent geschrieben hat.
const AGENT_PRAEFIX = 'Langdock: ';

const phaseMitLabel = (status) => ({
  phase: String(status || ''),
  phase_label: STATUS_LABELS[status] || 'Ohne gültigen Status',
});

export function kurzLead(lead) {
  return {
    lead_id: lead.lead_id,
    firma: lead.firma || '',
    ansprechpartner: lead.ansprechpartner || '',
    ort: lead.ort || '',
    mail: lead.mail || '',
    ...phaseMitLabel(lead.status),
    next_action: lead.next_action || '',
    next_action_at: lead.next_action_at || '',
    archiviert: Boolean(lead.archiviert_am),
  };
}

export function sucheLeads(leads, { suche = '', phase = '', archiv = false } = {}) {
  const begriff = String(suche).trim().toLocaleLowerCase('de');
  return leads
    .filter((lead) => archiv || !lead.archiviert_am)
    .filter((lead) => !phase || lead.status === phase)
    .filter((lead) => !begriff || [
      lead.lead_id, lead.firma, lead.ansprechpartner, lead.mail, lead.ort, lead.website,
    ].join(' ').toLocaleLowerCase('de').includes(begriff))
    .slice(0, MAX_TREFFER)
    .map(kurzLead);
}

export function leadAkte(daten, leadId) {
  const lead = daten.leads.find((eintrag) => eintrag.lead_id === leadId);
  if (!lead) return null;
  const verlauf = daten.activities
    .filter((eintrag) => eintrag.lead_id === leadId)
    .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')))
    .slice(0, MAX_AKTIVITAETEN)
    .map((eintrag) => ({
      datum: eintrag.datum, typ: eintrag.typ, richtung: eintrag.richtung || '',
      ergebnis: eintrag.ergebnis || '', notiz: eintrag.notiz || '',
    }));
  return {
    ...lead,
    ...phaseMitLabel(lead.status),
    ende_grund_label: END_REASON_LABELS[lead.ende_grund] || '',
    verlauf,
  };
}

export async function ladeDaten(context) {
  return localBypassEnabled(context.request, context.env) && context.env.LOCAL_DEMO_DATA === 'true'
    ? createDemoData()
    : readCrmWebhook(context.env);
}

// Lokale Demo schreibt nicht, sie bestaetigt nur.
async function schreibe(context, payload) {
  if (localBypassEnabled(context.request, context.env) && context.env.LOCAL_DEMO_DATA === 'true') {
    return { ok: true, status: 200, result: { demo: true } };
  }
  return schreibeCrm(context.env, payload);
}

export async function leseJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return { fehler: apiError(415, 'content_type_required', 'application/json erwartet') };
  }
  const roh = await request.text().catch(() => null);
  if (roh === null || new TextEncoder().encode(roh).byteLength > 16384) {
    return { fehler: apiError(413, 'body_too_large', 'Anfrage ist zu groß') };
  }
  try {
    const wert = JSON.parse(roh);
    if (!wert || typeof wert !== 'object' || Array.isArray(wert)) throw new Error('kein Objekt');
    return { wert };
  } catch {
    return { fehler: apiError(400, 'invalid_json', 'JSON-Objekt erwartet') };
  }
}

const antwortAusFehler = (antwort, schonGeschrieben = []) => json({
  ok: false,
  error: antwort.error,
  message: antwort.message,
  current_phase: antwort.current_status || null,
  schon_geschrieben: schonGeschrieben,
}, { status: antwort.status });

export async function notizAnhaengen(context, eingabe) {
  const text = String(eingabe.text ?? '').trim();
  const pruefung = validateWritePayload({
    aktion: 'notiz', lead_id: eingabe.lead_id, wert: text ? AGENT_PRAEFIX + text : '',
  });
  if (!pruefung.ok) return apiError(pruefung.status, pruefung.error, pruefung.message);
  const antwort = await schreibe(context, pruefung.value);
  if (!antwort.ok) return antwortAusFehler(antwort);
  return json({ ok: true, lead_id: pruefung.value.lead_id });
}

// Setzt die Phase und die dazu noetigen Felder. Ein Agent darf nie rueckwaerts springen;
// das bleibt eine bewusste Entscheidung im CRM.
export async function phaseSetzen(context, eingabe) {
  const leadId = String(eingabe.lead_id || '').trim();
  const phase = String(eingabe.phase || '').trim();
  const erwartet = String(eingabe.erwartete_phase || '').trim();
  const grund = String(eingabe.grund || '').trim();
  const notiz = String(eingabe.notiz || '').trim();
  const faellig = String(eingabe.faellig_am || '').trim();

  if (!STATUSES.includes(phase)) return apiError(400, 'invalid_phase', 'Unbekannte Phase');
  if (phase === 'beendet' && (!grund || !notiz)) {
    return apiError(400, 'reason_required', 'Verloren braucht grund und notiz');
  }
  if (phase === 'ruht' && !faellig) {
    return apiError(400, 'date_required', 'Ruht braucht faellig_am (JJJJ-MM-TT)');
  }

  const schritte = [
    { feld: 'status', wert: phase },
    ...(phase === 'beendet' ? [
      { feld: 'ende_grund', wert: grund },
      { feld: 'verlust_notiz', wert: notiz },
    ] : []),
    ...(faellig ? [{ feld: 'next_action_at', wert: faellig }] : []),
  ];
  // Alles vorab pruefen, damit nicht die Haelfte geschrieben wird und der Rest scheitert.
  const geprueft = [];
  for (const schritt of schritte) {
    const pruefung = validateWritePayload({
      lead_id: leadId, ...schritt,
      erwarteter_status: schritt.feld === 'status' ? erwartet : phase,
      ruecksprung_bestaetigt: false,
    });
    if (!pruefung.ok) return apiError(pruefung.status, pruefung.error, pruefung.message);
    geprueft.push(pruefung.value);
  }

  const geschrieben = [];
  for (const payload of geprueft) {
    const antwort = await schreibe(context, payload);
    if (!antwort.ok) {
      if (antwort.status === 422) {
        return json({
          ok: false,
          error: 'backward_not_allowed',
          message: 'Ruecksprung in eine fruehere Phase bitte im CRM selbst bestaetigen.',
          schon_geschrieben: geschrieben,
        }, { status: 409 });
      }
      return antwortAusFehler(antwort, geschrieben);
    }
    geschrieben.push(payload.feld);
  }
  if (notiz && phase !== 'beendet') {
    await notizAnhaengen(context, { lead_id: leadId, text: notiz });
  }
  return json({ ok: true, lead_id: leadId, ...phaseMitLabel(phase), geschrieben });
}

// ---------------------------------------------------------------------------
// Online-Vorbereitung: Versand vermerken, faellige Erinnerungen, Ruecklauf vermerken.
// Die Langdock-Workflows rufen das auf (crm/langdock/EINRICHTUNG.md, Abschnitte 4 und 5).

// Tage vor der Frist, an denen erinnert wird.
export const ERINNERUNG_TAGE = 3;
// Liegen zwischen Versand und Frist weniger Tage, wird erst 1 Tag vor der Frist erinnert
// (Entscheidung Denis 07.10.2026).
const MIN_LAUFZEIT_TAGE = ERINNERUNG_TAGE + 2;
const KURZ_ERINNERUNG_TAGE = 1;

export const heuteBerlin = (jetzt = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(jetzt);

const tagesAbstand = (von, bis) => Math.round(
  (Date.parse(bis + 'T00:00:00Z') - Date.parse(von + 'T00:00:00Z')) / 86400000,
);
const istDatum = (wert) => /^\d{4}-\d{2}-\d{2}$/.test(String(wert || ''));
const vorPhase = (aktuell, ziel) => !PIPELINE.includes(aktuell)
  || PIPELINE.indexOf(aktuell) < PIPELINE.indexOf(ziel);

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const datumLang = (iso) => {
  if (!istDatum(iso)) return '';
  const [j, m, t] = iso.split('-');
  return `${WOCHENTAGE[new Date(iso + 'T12:00:00Z').getUTCDay()]}, ${Number(t)}.${Number(m)}.${j}`;
};

const SIGNATUR = [
  'Viele Grüße', 'Denis', '', 'Denis Schmidt',
  '360ai | KI-Beratung & Automatisierung für den Mittelstand', '',
  'Wangershäuser Str. 7 · 35066 Frankenberg (Eder)', 'Tel. 0152 2923 9908',
  'info@360-ai.org · www.360-ai.org',
].join('\n');

// Feste Vorlage ohne KI: Diese eine Mail geht ohne Freigabe raus (Entscheidung Denis 06.10.2026).
export function erinnerungsMail(lead) {
  const du = lead.anrede === 'du';
  const name = String(lead.ansprechpartner || '').trim();
  const vorname = name.split(/\s+/)[0] || '';
  const begruessung = String(lead.vb_begruessung || '').trim()
    || (du ? (vorname ? `Hallo ${vorname},` : 'Hallo,') : (name ? `Guten Tag ${name},` : 'Guten Tag,'));
  const frist = datumLang(lead.vb_frist);
  const termin = datumLang(lead.vb_termin);
  const anlass = `kurze Erinnerung an die Vorbereitung${termin ? ` für unseren Termin am ${termin}` : ''}.`;
  const zeilen = du ? [
    begruessung, '',
    anlass + (frist ? ` Wenn du sie bis ${frist} abschickst, kann ich mich gezielt vorbereiten und wir sparen im Termin Zeit.` : ''),
    '', 'Hier geht es weiter:', lead.vb_link, '',
    'Was du nicht weißt, lass einfach offen. Lieber unvollständig abschicken als gar nicht. Wenn etwas hakt, antworte kurz auf diese Mail.',
  ] : [
    begruessung, '',
    anlass + (frist ? ` Wenn Sie sie bis ${frist} abschicken, kann ich mich gezielt vorbereiten und wir sparen im Termin Zeit.` : ''),
    '', 'Hier geht es weiter:', lead.vb_link, '',
    'Was Sie nicht wissen, lassen Sie einfach offen. Lieber unvollständig abschicken als gar nicht. Wenn etwas hakt, antworten Sie kurz auf diese Mail.',
  ];
  return {
    an: lead.vb_mail || lead.mail,
    betreff: 'Kurze Erinnerung: Vorbereitung für unseren Termin',
    text: zeilen.join('\n') + '\n\n' + SIGNATUR,
  };
}

const tageVor = (iso, tage) => new Date(Date.parse(iso + 'T00:00:00Z') - tage * 86400000)
  .toISOString().slice(0, 10);

// Erinnerungstag: 3 Tage vor dem Stichtag, bei knapper Laufzeit 1 Tag vorher.
// Leer, wenn auch das nicht mindestens einen Tag nach dem Versand liegt.
function erinnerungsTag(stichtag, versand) {
  if (!istDatum(versand)) return tageVor(stichtag, ERINNERUNG_TAGE);
  const laufzeit = tagesAbstand(versand, stichtag);
  if (laufzeit >= MIN_LAUFZEIT_TAGE) return tageVor(stichtag, ERINNERUNG_TAGE);
  if (laufzeit > KURZ_ERINNERUNG_TAGE) return tageVor(stichtag, KURZ_ERINNERUNG_TAGE);
  return '';
}

// Faellig: Fragebogen raus, nichts zurueck, noch nicht erinnert, ab Erinnerungstag bis zur Frist.
// Bewusst ein Fenster statt "genau heute": Faellt ein Lauf aus, holt der naechste nach.
// Ohne Frist zaehlt der Termin. Ohne beides keine Erinnerung.
export function erinnerungenFaellig(leads, heute = heuteBerlin()) {
  return leads
    .filter((lead) => !lead.archiviert_am && lead.status === 'fragebogen_raus')
    .filter((lead) => !lead.vb_eingang_am && !lead.vb_erinnert_am)
    .filter((lead) => lead.vb_link && (lead.vb_mail || lead.mail))
    .filter((lead) => {
      const stichtag = istDatum(lead.vb_frist) ? lead.vb_frist : lead.vb_termin;
      if (!istDatum(stichtag) || heute > stichtag) return false;
      const tag = erinnerungsTag(stichtag, lead.vb_versand_am);
      return Boolean(tag) && heute >= tag;
    })
    .map((lead) => ({
      lead_id: lead.lead_id,
      firma: lead.firma || '',
      kennung: lead.vb_kennung || '',
      frist: lead.vb_frist || '',
      termin: lead.vb_termin || '',
      ...erinnerungsMail(lead),
    }));
}

// Wann die Erinnerung geplant ist, oder warum keine kommt. Fuer die Rueckmeldung beim Versand.
export function erinnerungsPlan(frist, termin, versand) {
  const stichtag = istDatum(frist) ? frist : termin;
  if (!istDatum(stichtag)) return { erinnerung_am: '', erinnerung_grund: 'keine Frist und kein Termin' };
  const tag = erinnerungsTag(stichtag, versand);
  if (!tag) return { erinnerung_am: '', erinnerung_grund: `weniger als ${KURZ_ERINNERUNG_TAGE + 1} Tage bis ${stichtag}` };
  return { erinnerung_am: tag, erinnerung_grund: '' };
}

// Schreibt mehrere Felder nacheinander, alles vorher geprueft. Rueckgabe: null oder Fehlerantwort.
async function schreibeFelder(context, leadId, status, felder) {
  const geprueft = [];
  for (const [feld, wert] of felder) {
    const pruefung = validateWritePayload({
      lead_id: leadId, feld, wert, erwarteter_status: status, ruecksprung_bestaetigt: false,
    });
    if (!pruefung.ok) return apiError(pruefung.status, pruefung.error, pruefung.message);
    geprueft.push(pruefung.value);
  }
  const geschrieben = [];
  for (const payload of geprueft) {
    const antwort = await schreibe(context, payload);
    if (!antwort.ok) return antwortAusFehler(antwort, geschrieben);
    geschrieben.push(payload.feld);
  }
  return null;
}

// Wechselt die Phase nur vorwaerts. Rueckgabe: [Phase danach, Fehlerantwort oder null].
async function phaseVorwaerts(context, lead, ziel) {
  if (lead.status === 'beendet' || !vorPhase(lead.status, ziel)) return [lead.status, null];
  const fehler = await schreibeFelder(context, lead.lead_id, lead.status, [['status', ziel]]);
  return fehler ? [lead.status, fehler] : [ziel, null];
}

// POST /api/agent/vorbereitung: Der Link ist verschickt.
export async function vorbereitungVermerken(context, eingabe, daten, heute = heuteBerlin()) {
  const leadId = String(eingabe.lead_id || '').trim();
  const lead = daten.leads.find((eintrag) => eintrag.lead_id === leadId);
  if (!lead) return apiError(404, 'lead_not_found', 'Lead nicht gefunden. Erst mit leads suchen.');
  const kennung = String(eingabe.kennung || '').trim();
  const link = String(eingabe.link || '').trim();
  if (!kennung || !link) return apiError(400, 'value_required', 'kennung und link sind Pflicht');
  const andere = daten.leads.find((eintrag) => eintrag.vb_kennung === kennung && eintrag.lead_id !== leadId);
  if (andere) return apiError(409, 'kennung_vergeben', `Kennung gehört schon zu ${andere.lead_id}`);
  const anrede = String(eingabe.anrede || '').trim().toLowerCase();
  const frist = String(eingabe.frist || '').trim();
  const termin = String(eingabe.termin || '').trim();
  const felder = [
    ['vb_kennung', kennung], ['vb_link', link],
    ['vb_mail', String(eingabe.mail || '').trim()],
    ['vb_begruessung', String(eingabe.begruessung || '').trim()],
    ['vb_frist', frist], ['vb_termin', termin],
    ['vb_versand_am', heute], ['vb_erinnert_am', ''], ['vb_eingang_am', ''],
    ...(['du', 'sie'].includes(anrede) && anrede !== lead.anrede ? [['anrede', anrede]] : []),
    ...(frist ? [['next_action', 'wiedervorlage'], ['next_action_at', frist]] : []),
  ];
  // Vorab pruefen, damit nicht die Phase wechselt und danach ein Feld scheitert.
  for (const [feld, wert] of felder) {
    const pruefung = validateWritePayload({ lead_id: leadId, feld, wert, erwarteter_status: lead.status });
    if (!pruefung.ok) return apiError(pruefung.status, pruefung.error, `${feld}: ${pruefung.message}`);
  }
  const [phase, fehler] = await phaseVorwaerts(context, lead, 'fragebogen_raus');
  if (fehler) return fehler;
  const fehler2 = await schreibeFelder(context, leadId, phase, felder);
  if (fehler2) return fehler2;
  await notizAnhaengen(context, {
    lead_id: leadId,
    text: `Fragebogen raus (${kennung}).${frist ? ` Frist ${frist}.` : ''}${termin ? ` Termin ${termin}.` : ''}`,
  });
  return json({ ok: true, lead_id: leadId, ...phaseMitLabel(phase), kennung, ...erinnerungsPlan(frist, termin, heute) });
}

// POST /api/agent/vorbereitung/erinnert: Die Erinnerung ist raus.
export async function erinnerungVermerken(context, eingabe, daten, heute = heuteBerlin()) {
  const leadId = String(eingabe.lead_id || '').trim();
  const lead = daten.leads.find((eintrag) => eintrag.lead_id === leadId);
  if (!lead) return apiError(404, 'lead_not_found', 'Lead nicht gefunden');
  const fehler = await schreibeFelder(context, leadId, lead.status, [['vb_erinnert_am', heute]]);
  if (fehler) return fehler;
  await notizAnhaengen(context, {
    lead_id: leadId, text: `Erinnerung an den Fragebogen verschickt an ${lead.vb_mail || lead.mail}.`,
  });
  return json({ ok: true, lead_id: leadId, erinnert_am: heute });
}

// POST /api/agent/vorbereitung/eingang: Der Ruecklauf ist da (Webhook aus vorbereitung.ts ueber Langdock).
// Liefert, was der Workflow fuer Entwurf, Kalender und Drive braucht.
export async function eingangVermerken(context, eingabe, daten, heute = heuteBerlin()) {
  const kennung = String(eingabe.kennung || '').trim();
  const lead = kennung ? daten.leads.find((eintrag) => eintrag.vb_kennung === kennung) : null;
  if (!lead) {
    return apiError(404, 'unbekannte_kennung',
      `Zur Kennung ${kennung || '(leer)'} gibt es keinen Lead. Bitte im CRM zuordnen.`);
  }
  const fassung = Number(eingabe.fassung) || 1;
  const erneut = Boolean(lead.vb_eingang_am);
  const [phase, fehler] = await phaseVorwaerts(context, lead, 'fragebogen_da');
  if (fehler) return fehler;
  const felder = erneut ? [] : [
    ['vb_eingang_am', heute],
    ...(istDatum(lead.vb_termin) ? [['next_action', 'termin'], ['next_action_at', lead.vb_termin]] : []),
  ];
  const fehler2 = await schreibeFelder(context, lead.lead_id, phase, felder);
  if (fehler2) return fehler2;
  const kurz = String(eingabe.kurzfassung || '').trim().slice(0, 4000);
  await notizAnhaengen(context, {
    lead_id: lead.lead_id,
    text: `Fragebogen da (${kennung}, Fassung ${fassung}${erneut ? ', ersetzt die vorige' : ''}).${kurz ? '\n' + kurz : ''}`,
  });
  return json({
    ok: true,
    erneut,
    lead: {
      lead_id: lead.lead_id,
      firma: lead.firma || '',
      ansprechpartner: lead.ansprechpartner || '',
      anrede: lead.anrede || '',
      mail: lead.vb_mail || lead.mail || '',
      begruessung: lead.vb_begruessung || '',
      termin: lead.vb_termin || '',
      frist: lead.vb_frist || '',
      drive_url: lead.berichte_drive_url || '',
      ...phaseMitLabel(phase),
    },
  });
}

export { STATUS_LABELS, END_REASON_LABELS };
