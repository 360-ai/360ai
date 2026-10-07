// Phasen-Umbau 04.10.2026: patcht die LIVE-Workflows WF-2 bis WF-5 direkt in n8n.
// Bewusst nicht ueber scripts/build-crm-workflows.mjs: das Bauskript und n8n/*.json sind
// aelter als der Live-Stand vom 20.08.2026 (Stammdaten, Archiv, Notiz fehlen dort).
//
// Aufruf aus Tools/Akquise-Tool:
//   node scripts/n8n-phasen-patch.cjs              Probelauf: liest live, sichert, prueft, schreibt NICHT
//   node scripts/n8n-phasen-patch.cjs --schreiben  schreibt die gepatchten Workflows per API zurueck
// Jede Ersetzung muss genau einmal greifen, sonst Abbruch vor dem Schreiben. Ein zweiter
// Lauf nach erfolgreichem Schreiben bricht deshalb ab (nichts mehr zu ersetzen), das ist gewollt.
// Backups landen in n8n-backup-<zeitstempel>/ (gitignored, enthalten Tokens).
const fs = require('fs');
const path = require('path');

const KEY = fs.readFileSync(
  path.join(__dirname, '../../../Firma/Technik/n8n-workflows/.env'), 'utf8',
).trim();
const BASIS = 'https://n8n.360-ai.org/api/v1/workflows/';
const SCHREIBEN = process.argv.includes('--schreiben');
const ERLAUBTE_SETTINGS = ['executionOrder', 'saveDataErrorExecution', 'saveDataSuccessExecution',
  'saveManualExecutions', 'saveExecutionProgress', 'executionTimeout', 'errorWorkflow', 'timezone',
  'callerPolicy', 'callerIds', 'timeSavedPerExecution'];

const ALT_REIHE = "['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen']";
const NEU_REIHE = "['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'fragebogen_raus', 'fragebogen_da', 'termin', 'angebot', 'gewonnen', 'kunde_betreuung']";
// Automatik (WF-2/WF-3) fasst Kunden und Verlorene nie an.
const ALT_TERM = "['gewonnen', 'beendet']";
const NEU_TERM = "['gewonnen', 'kunde_betreuung', 'beendet']";

// Online-Vorbereitung (06.10.2026): Versand, Erinnerung, Ruecklauf. Muss zu VB_FIELDS in
// crm/functions/lib/validation.js passen.
const VB_LISTE = "'vb_kennung', 'vb_link', 'vb_mail', 'vb_begruessung', 'vb_frist', 'vb_termin',"
  + " 'vb_versand_am', 'vb_erinnert_am', 'vb_eingang_am'";
const VB_DATUM = "['vb_frist', 'vb_termin', 'vb_versand_am', 'vb_erinnert_am', 'vb_eingang_am']";
const VB_PRUEFUNG = [
  String.raw`    if (feld === 'vb_kennung' && !/^[A-Za-z0-9._-]{0,80}$/.test(wert)) return ['invalid_kennung', 'Ungueltige Kennung'];`,
  String.raw`    if (feld === 'vb_link' && wert !== '' && !(/^https:\/\/\S+$/.test(wert) && wert.length <= 8000)) return ['invalid_link', 'Link muss mit https:// beginnen'];`,
  String.raw`    if (feld === 'vb_begruessung' && wert.length > 200) return ['value_too_long', 'Begruessung zu lang'];`,
  String.raw`    if (` + VB_DATUM + String.raw`.includes(feld) && wert !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return ['invalid_date', 'Datum muss JJJJ-MM-TT sein'];`,
  '',
].join('\n');

const plan = {
  j6FzVR8nm0apVvPp: { // WF-2 Kommunikation
    'Freigabe pruefen': [[ALT_REIHE, NEU_REIHE, 1], [ALT_TERM, NEU_TERM, 1]],
    'Status vor Schreiben absichern': [[ALT_REIHE, NEU_REIHE, 1], [ALT_TERM, NEU_TERM, 1]],
  },
  ZyMc3ufxeGnQ7o1k: { // WF-3 Waechter
    'Kandidaten filtern': [[ALT_TERM, NEU_TERM, 1]],
    'Aufgaben zusammenstellen': [[ALT_TERM, NEU_TERM, 1]],
    'Aenderungen absichern': [[ALT_REIHE, NEU_REIHE, 1], [ALT_TERM, NEU_TERM, 1]],
  },
  '7vKzuyhNfyXkAFj1': { // WF-4 CRM-Schreiben
    'Anfrage pruefen': [
      ["const CRM_FELDER = ['status', 'notiz', 'ende_grund', 'wiedervorlage_am', 'next_action', 'next_action_at'];",
        "const CRM_FELDER = ['status', 'notiz', 'ende_grund', 'wiedervorlage_am', 'next_action', 'next_action_at',\n    'verlust_notiz', 'kunden_id', " + VB_LISTE + "];", 1],
      ["const statuswerte = ['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'angebot', 'gewonnen', 'beendet'];",
        "const statuswerte = ['neu', 'analysiert', 'kontaktiert', 'qualifiziert', 'fragebogen_raus', 'fragebogen_da',\n    'termin', 'angebot', 'gewonnen', 'kunde_betreuung', 'ruht', 'beendet'];", 1],
      ["const endeGruende = ['', 'kein_bedarf', 'hat_agentur', 'zu_teuer', 'keine_reaktion', 'ungeeignet', 'mail_unzustellbar'];",
        "const endeGruende = ['', 'kein_bedarf', 'hat_agentur', 'zu_teuer', 'keine_reaktion', 'ungeeignet', 'mail_unzustellbar',\n    'zeitpunkt', 'wettbewerber', 'intern_geloest', 'ich_abgesagt', 'sonstiges'];", 1],
      ["    if (feld === 'status' && !statuswerte.includes(wert)) return ['invalid_status', 'Ungueltiger Status'];",
        VB_PRUEFUNG + "    if (feld === 'verlust_notiz' && wert.length > 2000) return ['value_too_long', 'Absage-Notiz darf hoechstens 2000 Zeichen haben'];\n    if (feld === 'kunden_id' && !/^[A-Za-z0-9._-]{0,60}$/.test(wert)) return ['invalid_kunden_id', 'Ungueltige Kunden-ID'];\n    if (feld === 'status' && !statuswerte.includes(wert)) return ['invalid_status', 'Ungueltiger Status'];", 1],
    ],
    'Aenderung pruefen': [
      [ALT_REIHE, NEU_REIHE, 1],
      // Muss zu isBackwardTransition in crm/public/domain.js passen: Ruecksprung nur aus
      // Verloren heraus oder rueckwaerts innerhalb der Pipeline. 'ruht' ist ein Seitenweg.
      ["    ['gewonnen', 'beendet'].includes(aktuell)\n    || (neu !== 'beendet' && reihenfolge.indexOf(neu) < reihenfolge.indexOf(aktuell))",
        "    aktuell === 'beendet'\n    || (reihenfolge.includes(neu) && reihenfolge.includes(aktuell)\n      && reihenfolge.indexOf(neu) < reihenfolge.indexOf(aktuell))", 1],
    ],
  },
  IsQp7BWYIrv0dNlb: { // WF-5 CRM-Lesen: neue Spalten muessen hier ausgeliefert werden
    'Antwort bauen': [[
      "'berichte_pfad', 'berichte_drive_url', 'mail_betreff', 'mail_entwurf', 'archiviert_am',",
      "'berichte_pfad', 'berichte_drive_url', 'mail_betreff', 'mail_entwurf', 'archiviert_am',\n      'verlust_notiz', 'kunden_id', " + VB_LISTE + ",", 1]],
  },
};

async function main() {
  const sicherung = path.join(__dirname, '..',
    'n8n-backup-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(sicherung, { recursive: true });
  const fertig = [];
  for (const [id, knoten] of Object.entries(plan)) {
    const antwort = await fetch(BASIS + id, { headers: { 'X-N8N-API-KEY': KEY } });
    if (!antwort.ok) throw new Error(id + ': Lesen HTTP ' + antwort.status);
    const w = await antwort.json();
    fs.writeFileSync(path.join(sicherung, id + '.json'), JSON.stringify(w, null, 2));
    for (const [name, ersetzungen] of Object.entries(knoten)) {
      const n = w.nodes.find((x) => x.name === name);
      if (!n) throw new Error(id + ': Knoten fehlt ' + name);
      let code = n.parameters.jsCode;
      for (const [alt, neu, anzahl] of ersetzungen) {
        const treffer = code.split(alt).length - 1;
        if (treffer !== anzahl) {
          throw new Error(w.name + ' / ' + name + ': ' + treffer + 'x statt ' + anzahl + 'x: ' + alt.slice(0, 60));
        }
        code = code.split(alt).join(neu);
      }
      new Function(code); // Syntaxpruefung, fuehrt nichts aus
      n.parameters.jsCode = code;
    }
    // WF-5: mit den vb_*-Spalten wird A:AZ (52 Spalten) knapp, Lesebereich erweitern.
    const leadsLesen = w.nodes.find((x) => x.name === 'Leads lesen');
    const bereich = leadsLesen?.parameters?.options?.dataLocationOnSheet?.values;
    if (bereich) {
      if (bereich.range !== 'A:AZ') throw new Error(w.name + ': Leads-Bereich unerwartet ' + bereich.range);
      bereich.range = 'A:BZ';
    }
    fertig.push(w);
    console.log('geprueft:', w.name);
  }
  if (!SCHREIBEN) {
    console.log('Probelauf ok, nichts geschrieben. Sicherung: ' + sicherung);
    return;
  }
  for (const w of fertig) {
    const settings = Object.fromEntries(
      Object.entries(w.settings || {}).filter(([k]) => ERLAUBTE_SETTINGS.includes(k)),
    );
    const antwort = await fetch(BASIS + w.id, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: w.name, nodes: w.nodes, connections: w.connections, settings, staticData: w.staticData || null,
      }),
    });
    const text = await antwort.text();
    if (!antwort.ok) throw new Error(w.name + ': Schreiben HTTP ' + antwort.status + ' ' + text.slice(0, 200));
    console.log('geschrieben:', w.name);
  }
  console.log('Fertig. Sicherung: ' + sicherung);
  console.log('JETZT im n8n-Editor pruefen, ob WF-2 bis WF-5 die neue Version aktiv haben (ggf. Publish).');
  console.log('Erst danach das CRM deployen, sonst lehnt WF-4 die neuen Phasen mit invalid_status ab.');
}

main().catch((fehler) => {
  console.error('ABBRUCH:', fehler.message);
  process.exit(1);
});
