// Erzeugt den persoenlichen Link zur Online-Vorbereitung (/vorbereitung).
// Wird NICHT ausgeliefert (build.sh kopiert nur feste Dateien).
//
// Aufruf:
//   node _vorbereitung-link.mjs <kunde.json> [--basis=https://360-ai.org]
//
// <kunde.json> (Beispiel):
//   {
//     "kennung": "REITTER-2026-10-09",
//     "kunde":   "Reitter, Frankenberg",
//     "email":   "info@firmareitter.de",      <- NUR hierhin geht die Kopie
//     "anrede":  "Hallo Tom, hallo Leon,",    <- erste Zeile der Kopie-Mail
//     "gruss":   "",                          <- optionale Zeile oben auf der Seite
//     "frist":   "2026-10-05",
//     "termin":  "2026-10-09",
//     "gueltigTage": 30,
//     "prefill": { "respondents": [], "systems": [], "processCandidates": [], "answers": {} }
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
for (const f of ["frist", "termin"]) {
  if (c[f] && !/^\d{4}-\d{2}-\d{2}$/.test(c[f])) throw new Error(`${f} bitte als JJJJ-MM-TT`);
}

const tage = Number(c.gueltigTage) || 30;
const payload = {
  typ: "vb",
  k: c.kennung,
  r: c.kunde,
  e: c.email.toLowerCase(),
  ...(c.gruss ? { g: c.gruss } : {}),
  ...(c.anrede ? { a: c.anrede } : {}),
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
console.error(`\nKennung ${c.kennung}, Kopie an ${payload.e}, gueltig bis ${new Date(payload.exp).toLocaleDateString("de-DE")}, Laenge ${link.length} Zeichen`);
if (link.length > 2000) console.error("ACHTUNG: ueber 2000 Zeichen. Manche Mailprogramme kuerzen so lange Links. Vorbelegung kuerzen.");
