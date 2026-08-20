#!/usr/bin/env node
// Abschluss eines Analyselaufs.
//
// Fuehrt Messung, Regelergebnisse und Bewertung zusammen, berechnet den
// Gesamtscore und den Akquise-Score, schreibt lead.json und erzeugt die
// Nutzlast fuer den n8n-Webhook.
//
// Wichtig: Diese Datei schreibt NICHT ins Google Sheet. Der einzige Prozess,
// der CRM-Zustand veraendert, ist n8n (Single Writer). Hier entsteht nur die
// Nutzlast; das Senden ist ein eigener, ausdruecklicher Schritt.
//
// Aufruf:
//   node pipeline/abschluss.mjs <auditordner> [--senden]

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalisiereScore } from '../rules/engine.mjs';
import { akquiseScore } from '../scoring/akquise.mjs';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const lesen = async (p) => JSON.parse(await readFile(p, 'utf8'));

const BERICHT_TYPEN = [
  ['intern', 'md', 'text/markdown; charset=utf-8'],
  ['telefon', 'md', 'text/markdown; charset=utf-8'],
  ['mail', 'md', 'text/markdown; charset=utf-8'],
  ['kunde', 'html', 'text/html; charset=utf-8'],
];
const MAX_BERICHT_BYTES = 2 * 1024 * 1024;

/**
 * Liest genau den vierteiligen Berichtssatz eines Analyselaufs. Nur fest
 * benannte Dateien werden aufgenommen; Pfade oder beliebige lokale Dateien
 * koennen dadurch nie in die Webhook-Nutzlast geraten.
 */
export async function berichtDateienLesen(berichteDir, { datum = null } = {}) {
  if (!existsSync(berichteDir)) return [];

  const dateien = await readdir(berichteDir);
  const gruppen = new Map();
  for (const name of dateien) {
    const treffer = /^(\d{4}-\d{2}-\d{2})_(intern|telefon|mail|kunde)\.(md|html)$/.exec(name);
    if (!treffer) continue;
    const [, tag, typ, endung] = treffer;
    const erwartet = BERICHT_TYPEN.find(([t, e]) => t === typ && e === endung);
    if (!erwartet) continue;
    if (!gruppen.has(tag)) gruppen.set(tag, new Map());
    if (gruppen.get(tag).has(typ)) throw new Error(`Doppelter Berichtstyp ${typ} fuer ${tag}`);
    gruppen.get(tag).set(typ, { name, mime_type: erwartet[2] });
  }

  const tag = datum
    ? String(datum).slice(0, 10)
    : [...gruppen.keys()].sort().at(-1);
  if (!tag || !gruppen.has(tag)) return [];

  const gruppe = gruppen.get(tag);
  const fehlend = BERICHT_TYPEN.map(([typ]) => typ).filter((typ) => !gruppe.has(typ));
  if (fehlend.length) throw new Error(`Berichtssatz ${tag} unvollstaendig: ${fehlend.join(', ')}`);

  const result = [];
  for (const [typ] of BERICHT_TYPEN) {
    const meta = gruppe.get(typ);
    const inhalt = await readFile(path.join(berichteDir, meta.name));
    if (inhalt.byteLength > MAX_BERICHT_BYTES) {
      throw new Error(`Bericht ${meta.name} ist groesser als 2 MB`);
    }
    result.push({
      dateiname: meta.name,
      mime_type: meta.mime_type,
      inhalt_base64: inhalt.toString('base64'),
    });
  }
  return result;
}

/** Legt einen neuen Lead an oder ergaenzt einen bestehenden. */
export function leadZusammenbauen(vorhanden, facts, assessment) {
  const imp = facts.impressum ?? {};
  const jetzt = new Date().toISOString();

  return {
    lead_id: vorhanden?.lead_id ?? facts.meta?.lead_id ?? null,
    angelegt_am: vorhanden?.angelegt_am ?? jetzt,
    geaendert_am: jetzt,

    // Stammdaten. Was der Collector aus dem Impressum gezogen hat, fuellt nur
    // Luecken - von Hand Eingetragenes wird nie ueberschrieben.
    firma: vorhanden?.firma ?? imp.firmenname ?? null,
    website: facts.http?.final_url ?? vorhanden?.website ?? null,
    ort: vorhanden?.ort ?? imp.adresse?.ort ?? null,
    plz: vorhanden?.plz ?? imp.adresse?.plz ?? null,
    strasse: vorhanden?.strasse ?? imp.adresse?.strasse ?? null,
    branche: vorhanden?.branche ?? facts.meta?.branche ?? null,
    keyword: vorhanden?.keyword ?? facts.meta?.keyword ?? null,
    ansprechpartner: vorhanden?.ansprechpartner ?? imp.vertretung ?? null,
    anrede: vorhanden?.anrede ?? 'sie',
    mail: vorhanden?.mail ?? imp.email ?? null,
    telefon: vorhanden?.telefon ?? imp.telefon ?? null,
    rechtsform: vorhanden?.rechtsform ?? imp.rechtsform ?? null,
    register: vorhanden?.register ?? imp.register ?? null,

    kontaktquelle: vorhanden?.kontaktquelle ?? 'website',
    quelle_notiz: vorhanden?.quelle_notiz ?? null,
    persoenliche_verbindung: vorhanden?.persoenliche_verbindung ?? null,
    potenzial_manuell: vorhanden?.potenzial_manuell ?? null,

    // Vertriebsstatus. Sieben Stufen, alles andere sind Felder.
    status: vorhanden?.status ?? 'analysiert',
    next_action: vorhanden?.next_action ?? 'anruf',
    next_action_at: vorhanden?.next_action_at ?? null,
    unterlagen_gesendet_am: vorhanden?.unterlagen_gesendet_am ?? null,
    ende_grund: vorhanden?.ende_grund ?? null,
    wiedervorlage_am: vorhanden?.wiedervorlage_am ?? null,

    // Mail-Freigabe. Ohne diese Angabe erzeugt n8n keinen Gmail-Entwurf.
    email_freigabe: vorhanden?.email_freigabe ?? false,
    email_freigabe_am: vorhanden?.email_freigabe_am ?? null,
    email_freigabe_durch: vorhanden?.email_freigabe_durch ?? null,
    email_freigabe_notiz: vorhanden?.email_freigabe_notiz ?? null,

    gmail: vorhanden?.gmail ?? { draft_id: null, thread_id: null, empfaenger: null, betreff: null, erstellt_am: null },

    // Historie wird nur ergaenzt, nie ueberschrieben.
    historie: [...(vorhanden?.historie ?? [])],

    // Aktueller Analysestand. Aeltere Laeufe bleiben in audits erhalten.
    audits: [...(vorhanden?.audits ?? [])],
    akquise_ansatz: assessment?.akquise?.ansatz ?? null,
  };
}

/**
 * Liest den fertigen Mailentwurf aus dem Berichtsordner.
 * Erwartet das Format aus DOKUMENTE.md: eine Betreffzeile "**Betreff:** ..." und
 * den Mailtext zwischen der ersten und der letzten Trennlinie. Der Abschnitt
 * "Nicht in der Mail enthalten" wird abgeschnitten - er ist interne Notiz.
 */
export async function mailDokumentLesen(berichteDir, { datum = null } = {}) {
  if (!existsSync(berichteDir)) return { betreff: null, text: null };
  const dateien = (await readdir(berichteDir)).filter((f) => /_mail\.md$/.test(f)).sort();
  if (!dateien.length) return { betreff: null, text: null };

  const dateiname = datum
    ? `${String(datum).slice(0, 10)}_mail.md`
    : dateien[dateien.length - 1];
  if (!dateien.includes(dateiname)) return { betreff: null, text: null };
  const roh = await readFile(path.join(berichteDir, dateiname), 'utf8');
  const betreff = /^\*\*Betreff:\*\*\s*(.+)$/m.exec(roh)?.[1]?.trim() ?? null;

  const abschnitte = roh.split(/^---$/m);
  // Der Mailtext ist der Block zwischen der ersten Trennlinie und dem
  // internen Abschnitt am Ende.
  let text = abschnitte.length >= 3 ? abschnitte.slice(1).join('\n---\n') : roh;
  text = text.split(/^##\s+Nicht in der Mail enthalten/m)[0];
  text = text.replace(/^\s*---\s*$/gm, '').trim();

  return { betreff, text: text || null };
}

export async function abschluss(auditDir, { senden = false } = {}) {
  const facts = await lesen(path.join(auditDir, 'facts.json'));
  const findings = await lesen(path.join(auditDir, 'findings.json'));

  const geprueftPfad = path.join(auditDir, 'assessment.geprueft.json');
  if (!existsSync(geprueftPfad)) {
    throw new Error(`assessment.geprueft.json fehlt in ${auditDir}. Erst den Validator laufen lassen.`);
  }
  const geprueft = await lesen(geprueftPfad);
  if (!geprueft.ok) {
    throw new Error(`Das Assessment hat die Pruefung nicht bestanden: ${geprueft.abbruchgrund}`);
  }
  const assessment = geprueft.assessment;

  const branchen = await lesen(path.join(WURZEL, 'scoring', 'branchen.json'));
  const blacklist = await lesen(path.join(WURZEL, 'blacklist.json'));
  const profil = branchen[facts.meta?.branche] ?? branchen._default;

  // Lead-Ordner liegt eine Ebene ueber dem Auditordner.
  const leadDir = path.dirname(auditDir);
  const leadPfad = path.join(leadDir, 'lead.json');
  const vorhanden = existsSync(leadPfad) ? await lesen(leadPfad) : null;

  const lead = leadZusammenbauen(vorhanden, facts, assessment);

  const scores = finalisiereScore(findings.scores, assessment.vision);
  const akquise = akquiseScore({ assessment, findings, facts, lead, branche: profil, blacklist });

  const auditId = path.basename(auditDir);
  lead.audits = [
    ...lead.audits.filter((a) => a.audit_id !== auditId),
    {
      audit_id: auditId,
      datum: facts.meta?.scanned_at ?? null,
      collector_version: facts.meta?.collector_version ?? null,
      regelwerk_version: findings.meta?.regelwerk_version ?? null,
      website_score: scores.website_score,
      akquise_score: akquise.score,
      achsen: Object.fromEntries(Object.entries(scores.achsen).map(([k, v]) => [k, v.score])),
      compliance: findings.compliance.ampel,
      seiten_geprueft: facts.meta?.pages_checked?.length ?? 0,
      pfad: auditDir,
    },
  ].sort((a, b) => String(b.datum).localeCompare(String(a.datum)));

  lead.akquise_ansatz = assessment.akquise?.ansatz ?? null;
  lead.historie.push({
    datum: new Date().toISOString(),
    typ: 'analyse',
    notiz: `Website-Score ${scores.website_score}, Akquise-Score ${akquise.score}, Compliance ${findings.compliance.ampel}`,
  });

  await writeFile(leadPfad, JSON.stringify(lead, null, 2), 'utf8');

  // Der Mailtext muss mitgeschickt werden: n8n laeuft auf dem Server und hat
  // keinen Zugriff auf die lokalen Berichte. Ohne ihn koennte WF-2 spaeter
  // keinen Gmail-Entwurf bauen.
  const berichteDir = path.join(leadDir, 'berichte');
  const mail = await mailDokumentLesen(berichteDir, { datum: auditId });
  const berichte = await berichtDateienLesen(berichteDir, { datum: auditId });
  if (senden && berichte.length !== 4) {
    throw new Error(`Vier Berichtsdateien fuer ${String(auditId).slice(0, 10)} erwartet, ${berichte.length} gefunden`);
  }

  // Sonst bewusst schmal: keine Rohfakten, keine Screenshots, kein interner
  // Bericht - n8n braucht Zustand, Zahlen und den fertigen Mailtext.
  const nutzlast = {
    lead_id: lead.lead_id,
    audit_id: auditId,
    firma: lead.firma,
    website: lead.website,
    ort: lead.ort,
    branche: lead.branche,
    ansprechpartner: lead.ansprechpartner,
    anrede: lead.anrede,
    mail: lead.mail,
    telefon: lead.telefon,
    kontaktquelle: lead.kontaktquelle,
    website_score: scores.website_score,
    akquise_score: akquise.score,
    akquise_empfehlung: akquise.empfehlung,
    akquise_ansatz: lead.akquise_ansatz,
    achsen: Object.fromEntries(Object.entries(scores.achsen).map(([k, v]) => [k, v.score])),
    compliance: findings.compliance.ampel,
    compliance_signale: findings.compliance.signale,
    status: lead.status,
    next_action: lead.next_action,
    next_action_at: lead.next_action_at,
    argumente: (assessment.akquise?.reihenfolge ?? [])
      .map((id) => assessment.feststellungen.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => ({ id: f.id, kategorie: f.kategorie, kurz: f.feststellung })),
    berichte_pfad: path.join(leadDir, 'berichte'),
    regelwerk_version: findings.meta?.regelwerk_version ?? null,
    collector_version: facts.meta?.collector_version ?? null,
    seiten_geprueft: facts.meta?.pages_checked?.length ?? 0,
    mail_betreff: mail.betreff,
    mail_entwurf: mail.text,
    berichte,
  };

  await mkdir(path.join(leadDir, 'berichte'), { recursive: true });
  await writeFile(path.join(auditDir, 'zusammenfassung.json'),
    JSON.stringify({ scores, akquise, nutzlast }, null, 2), 'utf8');

  let gesendet = null;
  if (senden) {
    const url = process.env.AKQUISE_WEBHOOK_URL;
    const token = process.env.AKQUISE_WEBHOOK_TOKEN;
    if (!url) throw new Error('AKQUISE_WEBHOOK_URL ist nicht gesetzt');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Akquise-Token': token } : {}) },
      body: JSON.stringify(nutzlast),
    });
    const antwort = (await res.text()).slice(0, 300);
    gesendet = { status: res.status, ok: res.ok, antwort };
    if (!res.ok) throw new Error(`n8n-Webhook antwortet mit HTTP ${res.status}: ${antwort}`);
  }

  return { lead, scores, akquise, nutzlast, gesendet, leadPfad };
}

// ---------------------------------------------------------------- Einstieg

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const auditDir = process.argv[2];
  if (!auditDir) {
    console.error('Aufruf: node pipeline/abschluss.mjs <auditordner> [--senden]');
    process.exit(1);
  }
  try {
    const r = await abschluss(path.resolve(auditDir), { senden: process.argv.includes('--senden') });
    console.error(`  Website-Score: ${r.scores.website_score}/100`);
    console.error(`  Akquise-Score: ${r.akquise.score}/100 -> ${r.akquise.empfehlung}`);
    if (r.akquise.knockout) console.error(`  Knock-out: ${r.akquise.knockout.detail}`);
    for (const h of r.akquise.hinweise) console.error(`  Hinweis: ${h}`);
    if (r.gesendet) console.error(`  An n8n gesendet: HTTP ${r.gesendet.status}`);
    console.log(r.leadPfad);
  } catch (err) {
    console.error('Abbruch:', err.message);
    process.exit(1);
  }
}
