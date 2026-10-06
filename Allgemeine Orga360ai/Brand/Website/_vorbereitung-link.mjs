// Erzeugt den persoenlichen Link zur Online-Vorbereitung (/vorbereitung).
// Wird NICHT ausgeliefert (build.sh kopiert nur feste Dateien).
//
// Aufruf:
//   node _vorbereitung-link.mjs <kunde.json> [--basis=https://360-ai.org]
//
// <kunde.json> (Beispiel):
//   {
//     "kennung": "REITTER-2026-10-09",
//     "lead_id": "L-20260909-reitter",        <- optional: dann wird der Versand im CRM vermerkt
//                                                (Erinnerung 3 Tage vor Frist), --ohne-crm schaltet ab
//     "kunde":   "Reitter, Frankenberg",
//     "email":   "info@firmareitter.de",      <- NUR hierhin geht die Kopie
//     "anrede":  "du",                        <- "du" oder "sie", gilt fuer Seite und Kopie-Mail
//     "begruessung": "Hallo Tom, hallo Leon,", <- erste Zeile der Kopie-Mail
//     "frist":   "2026-10-05",
//     "termin":  "2026-10-09",
//     "gueltigTage": 30,
//     "prefill": { "betrieb": {"taetigkeit": ""}, "programme": [{"name": "", "wofuer": ""}],
//                  "ablaeufe": [{"name": ""}] }      <- Format v2, Ablaeufe nur vorbelegen,
//                                                      wenn sicher (Anker-Befund 11)
//   }
//
// Das Geheimnis liegt ausserhalb des Repos in
//   %USERPROFILE%\.360ai_vorbereitung_secret
// und muss identisch mit VORBEREITUNG_SECRET im Cloudflare-Projekt "360ai" sein.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const datei = args.find((a) => !a.startsWith("--"));
const basis = (args.find((a) => a.startsWith("--basis=")) || "--basis=https://360-ai.org").slice(8).replace(/\/$/, "");
if (!datei) {
  console.error("Aufruf: node _vorbereitung-link.mjs <kunde.json> [--basis=https://360-ai.org]");
  process.exit(1);
}

const secret = (process.env.VORBEREITUNG_SECRET || readFileSync(join(homedir(), ".360ai_vorbereitung_secret"), "utf8")).trim();
const c = JSON.parse(readFileSync(datei, "utf8").replace(/^﻿/, ""));

for (const f of ["kennung", "kunde", "email"]) {
  if (!c[f] || typeof c[f] !== "string") throw new Error(`Feld fehlt: ${f}`);
}
if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(c.email)) throw new Error(`Keine gueltige Mailadresse: ${c.email}`);
const anrede = (c.anrede || "sie").toLowerCase();
if (!["du", "sie"].includes(anrede)) throw new Error("anrede bitte du oder sie");
if (c.prefill && (c.prefill.processCandidates || c.prefill.systems || c.prefill.answers || c.prefill.respondents)) {
  throw new Error("Vorbelegung im alten Format (v1). Bitte auf betrieb/programme/ablaeufe umstellen.");
}
for (const f of ["frist", "termin"]) {
  if (c[f] && !/^\d{4}-\d{2}-\d{2}$/.test(c[f])) throw new Error(`${f} bitte als JJJJ-MM-TT`);
}

const tage = Number(c.gueltigTage) || 30;
const payload = {
  typ: "vb",
  v: 2,
  du: anrede === "du",
  k: c.kennung,
  r: c.kunde,
  e: c.email.toLowerCase(),
  ...(c.begruessung ? { a: c.begruessung } : {}),
  ...(c.frist ? { f: c.frist } : {}),
  ...(c.termin ? { d: c.termin } : {}),
  ...(c.prefill ? { p: c.prefill } : {}),
  iat: Date.now(),
  exp: Date.now() + tage * 24 * 60 * 60 * 1000,
};

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const teil = b64url(JSON.stringify(payload));
const sig = b64url(createHmac("sha256", secret).update(teil).digest());
const link = `${basis}/vorbereitung#t=${teil}.${sig}`;

console.log(link);
console.error(`\nKennung ${c.kennung}, ${anrede === "du" ? "Du" : "Sie"}, Kopie an ${payload.e}, gueltig bis ${new Date(payload.exp).toLocaleDateString("de-DE")}, Laenge ${link.length} Zeichen`);
if (link.length > 2000) console.error("ACHTUNG: ueber 2000 Zeichen. Manche Mailprogramme kuerzen so lange Links. Vorbelegung kuerzen.");

// Versand im CRM vermerken: Phase "Fragebogen raus", Frist, Termin, Link. Daraus erzeugt der
// Langdock-Workflow 3 Tage vor der Frist die Erinnerung. Nur wenn "lead_id" in kunde.json steht.
// Zugang: %USERPROFILE%\.360ai_crm_service_token mit {"client_id": "...", "client_secret": "..."}
// (Cloudflare Access Service Token, siehe Tools/Akquise-Tool/crm/langdock/EINRICHTUNG.md).
if (c.lead_id && !args.includes("--ohne-crm")) {
  let zugang = null;
  try {
    zugang = JSON.parse(readFileSync(join(homedir(), ".360ai_crm_service_token"), "utf8"));
  } catch {
    console.error("\nCRM: kein Zugang in ~/.360ai_crm_service_token, Versand NICHT vermerkt. Ohne Vermerk keine Erinnerung.");
  }
  if (zugang) {
    const antwort = await fetch("https://360ai-akquise-crm.pages.dev/api/agent/vorbereitung", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Access-Client-Id": zugang.client_id,
        "CF-Access-Client-Secret": zugang.client_secret,
      },
      body: JSON.stringify({
        lead_id: c.lead_id, kennung: c.kennung, link, mail: payload.e, anrede,
        begruessung: c.begruessung || "", frist: c.frist || "", termin: c.termin || "",
      }),
      redirect: "manual",
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    const text = await antwort.text();
    let plan = "";
    try {
      const j = JSON.parse(text);
      plan = j.erinnerung_am ? `Erinnerung geht am ${j.erinnerung_am} raus` : `KEINE Erinnerung: ${j.erinnerung_grund}`;
    } catch { /* Antwort ohne JSON */ }
    console.error(antwort.ok
      ? `\nCRM: Versand bei ${c.lead_id} vermerkt (Fragebogen raus). ${plan}.`
      : `\nCRM: Vermerk FEHLGESCHLAGEN (HTTP ${antwort.status}) ${text.slice(0, 200)}`);
  }
} else if (!c.lead_id) {
  console.error("\nCRM: keine lead_id in kunde.json, Versand nicht vermerkt. Ohne Vermerk keine Erinnerung.");
}
