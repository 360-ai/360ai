const isoDay = (offset) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const lead = (lead_id, firma, status, score, extra = {}) => ({
  lead_id, firma, status, akquise_score: score, website_score: Math.max(32, 100 - score),
  website: 'https://' + lead_id.toLowerCase() + '.example',
  ort: extra.ort || 'Marburg', branche: extra.branche || 'handwerk',
  ansprechpartner: extra.ansprechpartner || 'Alex Beispiel',
  anrede: 'sie', mail: 'kontakt@' + lead_id.toLowerCase() + '.example',
  telefon: '+49 6421 555 ' + String(score).padStart(2, '0'),
  kontaktquelle: 'website', akquise_ansatz: extra.ansatz || 'relaunch',
  compliance: extra.compliance || 'gruen',
  next_action: extra.next_action || '', next_action_at: extra.next_action_at || '',
  ende_grund: extra.ende_grund || '', wiedervorlage_am: extra.wiedervorlage_am || '',
  notiz: extra.notiz || '', berichte_drive_url: extra.berichte_drive_url || '',
});

export function createDemoData() {
  const leads = [
    lead('L-DEMO-001', 'Nordlicht Holzbau', 'neu', 82, { next_action: 'analyse', next_action_at: isoDay(0), ort: 'Gießen' }),
    lead('L-DEMO-002', 'Klarwerk Gebäudetechnik', 'analysiert', 78, { next_action: 'anruf', next_action_at: isoDay(-1), compliance: 'pruefen' }),
    lead('L-DEMO-003', 'Morgenrot Dach & Fassade', 'kontaktiert', 73, { next_action: 'followup_call', next_action_at: isoDay(0), ort: 'Wetzlar' }),
    lead('L-DEMO-004', 'Lahnform Metallbau', 'qualifiziert', 88, { next_action: 'antwort_bearbeiten', next_action_at: isoDay(0), berichte_drive_url: 'https://drive.google.com/drive/folders/demo-lahnform' }),
    lead('L-DEMO-005', 'Grünfaden Gartenbau', 'angebot', 69, { next_action: 'followup_call', next_action_at: isoDay(3), ansatz: 'sichtbarkeit' }),
    lead('L-DEMO-006', 'Raumkante Innenausbau', 'gewonnen', 91, { notiz: 'Startgespräch für September vormerken.' }),
    lead('L-DEMO-007', 'Bergstrom Elektrotechnik', 'beendet', 61, { ende_grund: 'kein_bedarf' }),
    lead('L-DEMO-008', 'Eichenblick Schreinerei', 'analysiert', 57, { next_action: 'anruf', next_action_at: isoDay(2), compliance: 'kritischer_hinweis' }),
    lead('L-DEMO-009', 'Quellklar Haustechnik', 'qualifiziert', 76, { next_action: 'followup_mail', next_action_at: isoDay(-2), ort: 'Kirchhain' }),
  ];
  const activities = [
    ['A-101', 'L-DEMO-004', -2, 'anruf', 'local,conversion', 'zusage', 'Auswertung gewünscht'],
    ['A-102', 'L-DEMO-004', -1, 'mail', 'local,conversion', 'offen', 'Unterlagen versendet'],
    ['A-103', 'L-DEMO-003', -4, 'anruf', 'mobil,technik', 'erreicht', 'Rückruf vereinbart'],
    ['A-104', 'L-DEMO-005', -8, 'anruf', 'seo,local', 'zusage', 'Angebot besprechen'],
    ['A-105', 'L-DEMO-006', -20, 'anruf', 'conversion,trust', 'zusage', 'Projekt zugesagt'],
    ['A-106', 'L-DEMO-006', -18, 'status_wechsel', '', 'offen', 'angebot -> gewonnen'],
    ['A-107', 'L-DEMO-009', -3, 'antwort', 'air,local', 'zusage', 'Interesse bestätigt'],
    ['A-108', 'L-DEMO-007', -30, 'anruf', 'seo', 'absage', 'Aktuell kein Bedarf'],
  ].map(([activity_id, lead_id, offset, typ, verwendete_argumente, ergebnis, notiz]) => ({
    activity_id, lead_id, datum: isoDay(offset) + 'T09:30:00.000Z',
    typ, richtung: typ === 'antwort' ? 'rein' : 'raus',
    verwendete_argumente, ergebnis, notiz,
  }));
  const audits = leads.slice(0, 7).map((item, index) => ({
    audit_id: isoDay(-index) + '-' + item.lead_id,
    lead_id: item.lead_id, datum: isoDay(-index) + 'T08:00:00.000Z',
    collector_version: '1.0.0', regelwerk_version: '1.0.0',
    website_score: item.website_score, akquise_score: item.akquise_score,
    seo: 48 + index, technik: 55, air: 42, design: 61,
    conversion: 46, local: 52, vertrauen: 64,
    compliance: item.compliance, seiten_geprueft: 9, pfad: '',
  }));
  return { leads, activities, audits };
}
