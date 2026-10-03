// Online-Vorbereitung (Kompakte KI-Potenzialanalyse), Seite /vorbereitung.
//
// Zwei Aktionen, beide per POST:
//   aktion "pruefen": signierten Link pruefen, Konfiguration fuer die Seite
//                     zurueckgeben (Kennung, Kunde, Vorbelegung, Fristen).
//   aktion "senden":  Antworten entgegennehmen, lesbare Zusammenfassung plus
//                     JSON-Anhang an 360ai, Kopie an den Kunden.
//                     Schema 2.0.0: Ablaeufe als Kette, Programmkarte.
//
// Es wird NICHTS gespeichert. Alles, was die Seite braucht, steckt signiert im
// Link (#t=...). Den Link erzeugt _vorbereitung-link.mjs mit demselben
// VORBEREITUNG_SECRET. Die Kopie geht ausschliesslich an die Adresse aus dem
// Link, nie an eine Adresse aus dem Formular: so kann niemand die Funktion
// als Mailschleuder an Dritte benutzen.

import "../../vorbereitung-fragen.js";
import "../../vorbereitung-kern.js";

interface Env {
  VORBEREITUNG_SECRET: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  MAIL_TO: string;
  VB_MAIL_TO?: string;
  VB_MAIL_FROM?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITEKEY?: string;
  MAIL_DRY_RUN?: string;
}

interface Payload {
  typ: string; // immer "vb"
  k: string; // Kennung, z. B. REITTER-2026-10-09
  r: string; // Kundenreferenz
  e: string; // Mailadresse fuer die Kopie
  v?: number; // Linkversion, 2 fuer den gefuehrten Assistenten
  du?: boolean; // Anrede: true = Du, sonst Sie
  a?: string; // Anrede in der Kopie-Mail, z. B. "Hallo Steffen,"
  f?: string; // Rueckgabefrist ISO-Datum
  d?: string; // Termin ISO-Datum
  p?: unknown; // Vorbelegung
  iat: number;
  exp: number;
}

// deno-lint-ignore no-explicit-any
const K: any = (globalThis as any).VB2;
// deno-lint-ignore no-explicit-any
const C: any = (globalThis as any).VB2_KERN;
// deno-lint-ignore no-explicit-any
type Any = any;

const enc = new TextEncoder();
const MAX_BODY = 2_400_000; // 2 MB Antwortdokument plus Huelle

function b64urlBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "===".slice((b.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64(text: string): string {
  const bytes = enc.encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function hmac(teil: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64urlBytes(await crypto.subtle.sign("HMAC", key, enc.encode(teil)));
}

function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

type Pruefung = { ok: true; p: Payload } | { ok: false; grund: "kaputt" | "abgelaufen"; kennung?: string };

async function tokenPruefen(t: unknown, secret: string): Promise<Pruefung> {
  if (typeof t !== "string" || t.length > 12000 || !secret) return { ok: false, grund: "kaputt" };
  const [teil, sig] = t.split(".");
  if (!teil || !sig) return { ok: false, grund: "kaputt" };
  if (!gleich(await hmac(teil, secret), sig)) return { ok: false, grund: "kaputt" };
  let p: Payload;
  try {
    p = JSON.parse(b64urlDecode(teil));
  } catch {
    return { ok: false, grund: "kaputt" };
  }
  if (!p || p.typ !== "vb" || typeof p.k !== "string" || typeof p.e !== "string") return { ok: false, grund: "kaputt" };
  if (typeof p.exp !== "number" || Date.now() > p.exp) return { ok: false, grund: "abgelaufen", kennung: p.k };
  return { ok: true, p };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function turnstileOk(env: Env, token: string, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // noch nicht eingerichtet
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

// Einfache Mengenbremse ohne Datenbank: Zaehler im Edge-Cache des Rechenzentrums.
// Greift nur auf der eigenen Domain (360-ai.org), auf *.pages.dev ist der
// Cache wirkungslos. Fehler hier blockieren nie den Versand.
async function mengeOk(schluessel: string, max: number, sekunden: number): Promise<boolean> {
  try {
    // deno-lint-ignore no-explicit-any
    const cache = (caches as any).default as Cache;
    const url = `https://360-ai.org/__rl/vb/${encodeURIComponent(schluessel)}`;
    const hit = await cache.match(url);
    const n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= max) return false;
    await cache.put(url, new Response(String(n + 1), { headers: { "Cache-Control": `max-age=${sekunden}` } }));
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Lesbare Zusammenfassung (Schema 2.0.0)
// ---------------------------------------------------------------------------

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function nl(v: unknown): string {
  return esc(v).replace(/\r?\n/g, "<br>");
}
function voll(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== "";
}
function einzeilig(v: unknown, max = 160): string {
  return String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}
function datum(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}
// Auswahl plus freies Feld zu einem Text
function wahl(x: Any): string {
  return [x?.auswahl, x?.frei].filter(voll).map((s: string) => String(s).trim()).join(", ");
}

const H2 = `style="font-size:16px;margin:26px 0 6px;color:#1a1a2e"`;
const KLEIN = `style="font-size:12px;color:#6b7080"`;
const MARK_VB = ` <span style="font-size:11px;color:#8a4b12;background:#FBF3E8;padding:1px 5px;border-radius:4px">vorbelegt, nicht bestätigt</span>`;

// Lesbarer Name zu einem weissNicht- oder Luecken-Schluessel
function schluesselText(doc: Any, k: string): string {
  const fest: Record<string, string> = {
    "betrieb.taetigkeit": "Was der Betrieb macht", "betrieb.personen": "Wie viele Personen",
    programme: "Programme", ablaeufe: "Abläufe", ziel: "Ziel",
  };
  if (fest[k]) return fest[k];
  const m = /^ablauf:([^:]+):(.+)$/.exec(k);
  if (m) {
    const a = (doc.ablaeufe || []).find((x: Any) => x.id === m[1]);
    const teil: Record<string, string> = { ausloeser: "Auslöser", schritte: "Schritte", haeufigkeit: "wie oft", dauer: "wie lange", aerger: "was nervt" };
    return `${a ? a.name : "Ablauf"}: ${teil[m[2]] || m[2]}`;
  }
  return k;
}

function zuKlaeren(doc: Any): string[] {
  const p: string[] = [];
  const l = C.luecken(doc);
  if (l.length) p.push(`<b>Fehlt:</b> ${l.map((x: Any) => esc(x.text)).join("; ")}`);
  const wn = (doc.weissNicht || []) as string[];
  if (wn.length) p.push(`<b>Weiß ich nicht:</b> ${wn.map((k) => esc(schluesselText(doc, k))).join("; ")}`);
  const vb: string[] = [];
  if (doc.betrieb?.herkunft === "vorbelegt") vb.push("Betrieb");
  (doc.programme || []).filter((x: Any) => x.herkunft === "vorbelegt").forEach((x: Any) => vb.push(esc(x.name)));
  (doc.ablaeufe || []).filter((x: Any) => x.herkunft === "vorbelegt").forEach((x: Any) => vb.push("Ablauf " + esc(x.name)));
  if (vb.length) p.push(`<b>Vorbelegt und nie bestätigt:</b> ${vb.join(", ")}`);
  const offen: string[] = [];
  (doc.ablaeufe || []).forEach((a: Any) => {
    const sch = (a.schritte || []).filter((x: Any) => voll(x.was));
    // Der letzte Schritt hat keinen Uebergang
    for (let i = 0; i < sch.length - 1; i++) {
      const art = sch[i].weiter?.art || "";
      if (!art || art === "weissnicht") offen.push(`${esc(a.name)}: nach „${esc(einzeilig(sch[i].was, 60))}“`);
    }
  });
  if (offen.length) p.push(`<b>Übergang unklar:</b> ${offen.join("; ")}`);
  // Schritt ohne Womit: der Uebergang faellt sonst still aus der Programmkarte.
  const ohneWomit: string[] = [];
  (doc.ablaeufe || []).forEach((a: Any) => {
    (a.schritte || []).filter((x: Any) => voll(x.was)).forEach((x: Any, i: number) => {
      if (!x.womit?.programmId && !x.womit?.art && !voll(x.womit?.frei)) ohneWomit.push(`${esc(a.name)}, Schritt ${i + 1}`);
    });
  });
  if (ohneWomit.length) p.push(`<b>Womit fehlt:</b> ${ohneWomit.join("; ")}`);
  return p;
}

const ART_FARBE: Record<string, [string, string]> = {
  automatisch: ["#EAF5F3", "#2f6b66"],
  abgetippt: ["#FBF3E8", "#8a4b12"],
  weitergeleitet: ["#FBF3E8", "#8a4b12"],
};
function artText(art: string): string {
  const w = K.WEITER.find((x: Any) => x.id === art);
  return w ? w.titel : "unbekannt";
}

function programmkarteHtml(doc: Any): string {
  const paare = C.programmkarte(doc);
  if (!paare.length) return `<p ${KLEIN}>Keine Übergänge zwischen verschiedenen Programmen beschrieben.</p>`;
  const td = `style="padding:5px 8px 5px 0;border-top:1px solid #E4E8F0;vertical-align:top"`;
  const zeilen = paare.map((x: Any) => {
    const [bg, fg] = ART_FARBE[x.art] || ["#F0F3FA", "#3d4b70"];
    const hinweis = x.art === "abgetippt" || x.art === "weitergeleitet" ? " · <b>Ansatzpunkt</b>" : "";
    return `<tr><td ${td}>${esc(x.von)}</td>
<td ${td}><span style="background:${bg};color:${fg};padding:2px 6px;border-radius:4px;font-size:12px">${esc(artText(x.art))}${x.womit ? " (" + esc(x.womit) + ")" : ""}</span>${hinweis}</td>
<td ${td}>${esc(x.nach)}</td>
<td ${td}><span style="color:#6b7080;font-size:12px">${esc(x.ablauf)}</span></td></tr>`;
  }).join("");
  const th = (t: string) => `<th style="text-align:left;font-size:11px;color:#7B8CB6;padding:0 8px 4px 0">${t}</th>`;
  return `<table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr>${th("Von")}${th("Übergang")}${th("Nach")}${th("Ablauf")}</tr></thead><tbody>${zeilen}</tbody></table>`;
}

function ablaufHtml(a: Any, doc: Any, intern: boolean): string {
  const sch = (a.schritte || []).filter((x: Any) => voll(x.was));
  const liste = sch.map((x: Any, i: number) => {
    const w = C.womitName(x.womit, doc.programme || []);
    const weiter = i < sch.length - 1
      ? `<div style="color:#7B8CB6;font-size:12px;margin:2px 0 0 2px">↓ ${esc(artText(x.weiter?.art || ""))}${x.weiter?.art === "automatisch" && voll(x.weiter?.womit) ? " (" + esc(x.weiter.womit) + ")" : ""}</div>`
      : "";
    return `<li style="margin:6px 0">${nl(x.was)}${w ? ` <span style="color:#6b7080">· ${esc(w)}</span>` : ""}${weiter}</li>`;
  }).join("");
  const zeile = (k: string, v: string) => v ? `<div style="margin:2px 0"><span style="color:#6b7080">${k}:</span> ${v}</div>` : "";
  const aerger = [...(a.aerger?.kacheln || []), a.aerger?.frei].filter(voll).map((s: string) => esc(s)).join(", ");
  return `<h3 style="font-size:15px;margin:20px 0 4px">${esc(a.name || "(ohne Namen)")}${intern && a.herkunft === "vorbelegt" ? MARK_VB : ""}</h3>
<div style="font-size:14px">${zeile("Los geht es mit", esc(wahl(a.ausloeser)))}
${sch.length ? `<ol style="margin:6px 0 6px;padding-left:22px">${liste}</ol>` : `<div style="color:#8c2020">Keine Schritte beschrieben.</div>`}
${sch.length > 1 ? `<div ${KLEIN}>Kurz: ${esc(C.ketteText(a, doc.programme || []))}</div>` : ""}
${zeile("Wie oft", esc(wahl(a.haeufigkeit)))}${zeile("Dauer je Vorgang", esc(wahl(a.dauer)))}${zeile("Was nervt", aerger)}</div>`;
}

// Gespraechsbogen-Punkte: was die Extra-Runde schon beantwortet hat, was im Termin offen bleibt.
const GESPRAECH: [string, string][] = [["B04", "Programmbetreuung"], ["B05", "Wechsel"], ["D01", "Datenarten"], ["E03", "Zieltermin"],
  ["D02", "Grenzen"], ["D03", "Vorgaben und Beteiligte"], ["D04", "Test und Verantwortung"], ["D05", "Akzeptanz"], ["D06", "Nutzerzahl"],
  ["E01", "Budget einmalig"], ["E02", "Budget laufend"], ["E04", "Entscheider"], ["P07", "Prüfung und Fehlerfolge"]];
function terminZeile(doc: Any): string {
  const da = new Set(C.extraBeantwortet(doc).map((x: Any) => x.code));
  const vorab = GESPRAECH.filter(([c]) => da.has(c)).map(([c, t]) => `${t} (${c})`);
  const offen = GESPRAECH.filter(([c]) => !da.has(c)).map(([c, t]) => `${t} (${c})`);
  return `<p style="font-size:13px;color:#3d4b70;margin:10px 0 0">${vorab.length ? `<b>Schon vorab beantwortet:</b> ${vorab.join(", ")}.<br>` : ""}<b>Im Termin noch klären:</b> ${offen.join(", ")}. Steht im Gesprächsbogen.</p>`;
}
function extraHtml(doc: Any): string {
  const l = C.extraBeantwortet(doc);
  if (!l.length) return "";
  return `<h2 ${H2}>Extra-Runde</h2><ul style="margin:0;padding-left:18px;font-size:14px">${l.map((x: Any) =>
    `<li style="margin:3px 0"><span style="color:#6b7080">${esc(x.titel)}:</span> ${esc(x.wert)}</li>`).join("")}</ul>`;
}

function zusammenfassung(doc: Any, intern: boolean): string {
  let h = "";
  if (intern) h += `<h2 ${H2}>Programmkarte</h2>` + programmkarteHtml(doc);
  h += `<h2 ${H2}>Abläufe</h2>`;
  h += (doc.ablaeufe || []).length
    ? doc.ablaeufe.map((a: Any) => ablaufHtml(a, doc, intern)).join("")
    : `<p style="color:#8c2020">Kein Ablauf beschrieben.</p>`;
  h += `<h2 ${H2}>Betrieb</h2><div style="font-size:14px">${nl(doc.betrieb?.taetigkeit) || "<i>keine Angabe</i>"}${intern && doc.betrieb?.herkunft === "vorbelegt" ? MARK_VB : ""}<br><span style="color:#6b7080">Personen:</span> ${esc(wahl(doc.betrieb?.personen)) || "<i>keine Angabe</i>"}</div>`;
  const pr = (doc.programme || []).map((x: Any) =>
    `<li>${esc(x.name)}${voll(x.wofuer) ? ` <span style="color:#6b7080">· ${esc(x.wofuer)}</span>` : ""}${intern && x.herkunft === "vorbelegt" ? MARK_VB : ""}</li>`).join("");
  h += `<h2 ${H2}>Programme</h2>${pr ? `<ul style="margin:0;padding-left:18px;font-size:14px">${pr}</ul>` : "<i>keine Angabe</i>"}`;
  const ziel = [nl(doc.ziel?.text), (doc.ziel?.kacheln || []).length ? `<span style="color:#6b7080">Richtung:</span> ${esc(doc.ziel.kacheln.join(", "))}` : ""].filter(Boolean).join("<br>");
  h += `<h2 ${H2}>Ziel</h2><div style="font-size:14px">${ziel || "<i>keine Angabe</i>"}</div>`;
  h += extraHtml(doc);
  if (voll(doc.nochEtwas)) h += `<h2 ${H2}>Noch etwas</h2><div style="font-size:14px">${nl(doc.nochEtwas)}</div>`;
  return h;
}

// Fuer Mailprogramme ohne HTML
function textFassung(doc: Any): string {
  const z: string[] = [];
  for (const a of doc.ablaeufe || []) {
    z.push(`\n== ${a.name} ==`, `Los geht es mit: ${wahl(a.ausloeser)}`, C.ketteText(a, doc.programme || []),
      `Wie oft: ${wahl(a.haeufigkeit)} | Dauer: ${wahl(a.dauer)}`);
  }
  z.push(`\n== Betrieb ==`, String(doc.betrieb?.taetigkeit || ""), `Personen: ${wahl(doc.betrieb?.personen)}`);
  z.push(`\n== Programme ==`, (doc.programme || []).map((x: Any) => x.name + (voll(x.wofuer) ? ` (${x.wofuer})` : "")).join(", "));
  if (voll(doc.ziel?.text)) z.push(`\n== Ziel ==`, String(doc.ziel.text));
  const ex = C.extraBeantwortet(doc);
  if (ex.length) z.push(`\n== Extra-Runde ==`, ...ex.map((x: Any) => `${x.titel}: ${x.wert}`));
  if (voll(doc.nochEtwas)) z.push(`\n== Noch etwas ==`, String(doc.nochEtwas));
  return z.join("\n");
}

function rahmen(inhalt: string): string {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#F9F9F9;padding:20px;font-family:Helvetica,Arial,sans-serif;color:#1a1a2e">
<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #E4E8F0;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7B8CB6">360ai</p>
${inhalt}
<p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#6b7080">360ai, Denis Schmidt, Frankenberg (Eder)<br>info@360-ai.org · www.360-ai.org</p>
</div></body></html>`;
}


async function resend(env: Env, mail: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
  if (env.MAIL_DRY_RUN === "1") {
    console.log("MAIL_DRY_RUN, nicht gesendet:", mail.to, mail.subject);
    return { ok: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(mail),
  });
  if (res.ok) return { ok: true };
  return { ok: false, detail: `${res.status} ${(await res.text()).slice(0, 300)}` };
}

// ---------------------------------------------------------------------------

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const laenge = Number(request.headers.get("content-length") || "0");
  if (laenge > MAX_BODY) return json({ ok: false, fehler: "Die Angaben sind zu umfangreich." }, 413);

  let roh: string;
  let body: Any;
  try {
    roh = await request.text();
    if (roh.length > MAX_BODY) return json({ ok: false, fehler: "Die Angaben sind zu umfangreich." }, 413);
    body = JSON.parse(roh);
  } catch {
    return json({ ok: false, fehler: "Ungültige Anfrage." }, 400);
  }

  const pr = await tokenPruefen(body?.t, env.VORBEREITUNG_SECRET);

  if (body?.aktion === "pruefen") {
    if (!pr.ok) {
      if (pr.grund === "abgelaufen") {
        return json({
          ok: false,
          titel: "Dieser Link ist abgelaufen",
          fehler: "Bitte melden Sie sich kurz bei uns unter info@360-ai.org, wir schicken Ihnen einen neuen. Ihr bisheriger Stand in diesem Browser bleibt erhalten.",
          kennung: pr.kennung,
        });
      }
      return json({ ok: false });
    }
    const p = pr.p;
    if (p.v !== 2) {
      return json({
        ok: false,
        titel: "Dieser Link ist veraltet",
        fehler: "Die Vorbereitung wurde inzwischen überarbeitet. Bitte melden Sie sich kurz bei uns unter info@360-ai.org, wir schicken Ihnen einen neuen Link.",
      });
    }
    return json({
      ok: true,
      config: {
        kennung: p.k,
        kunde: p.r || "",
        anrede: p.du ? "du" : "sie",
        frist: p.f || "",
        termin: p.d || "",
        prefill: p.p || null,
        kopieAn: p.e,
        turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
      },
    });
  }

  if (body?.aktion !== "senden") return json({ ok: false, fehler: "Ungültige Anfrage." }, 400);

  // Bot-Falle wie beim Lead-Formular.
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true, revision: 0 });

  if (!pr.ok) {
    return json({
      ok: false,
      fehler: pr.grund === "abgelaufen"
        ? "Der Link ist inzwischen abgelaufen. Bitte die Angaben als Datei sichern und an info@360-ai.org schicken."
        : "Der Link ist ungültig. Bitte direkt aus unserer E-Mail öffnen.",
    }, 403);
  }
  const p = pr.p;
  const du = p.du === true;
  const ip = request.headers.get("CF-Connecting-IP") || "";

  if (!(await turnstileOk(env, typeof body.turnstile === "string" ? body.turnstile.slice(0, 3000) : "", ip))) {
    return json({ ok: false, fehler: "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte noch einmal senden." }, 400);
  }
  if (!(await mengeOk(`k:${p.k}`, 8, 3600)) || (ip && !(await mengeOk(`ip:${ip}`, 20, 3600)))) {
    return json({ ok: false, fehler: "In kurzer Zeit wurde sehr oft gesendet. Bitte in einer Stunde noch einmal versuchen." }, 429);
  }

  const doc = body.doc;
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return json({ ok: false, fehler: "Die Angaben passen nicht zu dieser Vorbereitung. Bitte die Seite neu laden." }, 400);
  }
  // Fehlende Teilobjekte auffuellen, bevor irgendeine Kernlogik liest.
  C.normalisieren(doc);
  const fehler = C.pruefen(doc, p.k);
  if (fehler.length) {
    console.log("Vorbereitung abgewiesen:", fehler.slice(0, 3).join(" | "));
    return json({ ok: false, fehler: "Die Angaben passen nicht zu dieser Vorbereitung: " + fehler[0] }, 400);
  }

  const jsonText = JSON.stringify(doc, null, 2);
  const kunde = einzeilig(doc.customerReference || p.r || p.k, 80);
  const rev = Number(doc.revision) || 0;
  const fassung = rev > 0 ? `, Fassung ${rev + 1}` : "";
  const dateiname = `${p.k.replace(/[^A-Za-z0-9._-]/g, "_")}_r${rev}.json`;

  // ---- Mail an 360ai --------------------------------------------------------
  const punkte = zuKlaeren(doc);
  const kopf = `<h1 style="margin:0 0 6px;font-size:21px">Vorbereitung eingegangen: ${esc(kunde)}</h1>
<p style="margin:0;color:#6b7080;font-size:13px">Kennung ${esc(p.k)} · Fassung ${rev + 1}${doc.supersedesSubmissionId ? " (ersetzt die vorige)" : ""} · Termin ${esc(datum(p.d)) || "nicht gesetzt"} · ${du ? "Du" : "Sie"} · Kopie an ${esc(p.e)}</p>
<div style="margin:18px 0 6px;padding:14px 16px;background:#FBF3E8;border:1px solid #e8d5ba;border-radius:8px;font-size:14px;color:#5a3a12">
<div style="font-weight:700;margin-bottom:6px">Zu klären</div>
${punkte.length ? `<ul style="margin:0;padding-left:18px">${punkte.map((x) => `<li style="margin:3px 0">${x}</li>`).join("")}</ul>` : "Nichts Auffälliges."}
</div>
${terminZeile(doc)}
<p style="font-size:12px;color:#6b7080;margin:6px 0 0">Rohdaten im Anhang ${esc(dateiname)}.</p>`;
  const htmlIntern = rahmen(kopf + zusammenfassung(doc, true));
  const betreffIntern = einzeilig(`Vorbereitung eingegangen: ${kunde} (${p.k}${fassung})`, 180);

  const intern = await resend(env, {
    from: env.VB_MAIL_FROM || env.MAIL_FROM,
    to: [env.VB_MAIL_TO || env.MAIL_TO || "info@360-ai.org"],
    reply_to: p.e,
    subject: betreffIntern,
    html: htmlIntern,
    text: "Vollständige Angaben im JSON-Anhang und in der HTML-Fassung dieser Mail.\n" + textFassung(doc),
    attachments: [{ filename: dateiname, content: b64(jsonText) }],
  });
  if (!intern.ok) {
    console.log("Resend-Fehler (vorbereitung intern):", intern.detail);
    return json({ ok: false, fehler: "Das Senden hat gerade nicht geklappt." }, 502);
  }

  // ---- Kopie an den Kunden ---------------------------------------------------
  const anrede = einzeilig(p.a || (du ? "Hallo," : "Guten Tag,"), 80);
  const absatz = (t: string) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${t}</p>`;
  const kopfKunde = absatz(esc(anrede)) +
    absatz(du
      ? `danke, deine Vorbereitung ist bei uns angekommen${rev > 0 ? ` (Fassung ${rev + 1}, sie ersetzt die vorige)` : ""}. Unten findest du eine Kopie deiner Angaben.`
      : `vielen Dank, Ihre Vorbereitung ist bei uns angekommen${rev > 0 ? ` (Fassung ${rev + 1}, sie ersetzt die vorige)` : ""}. Unten finden Sie eine Kopie Ihrer Angaben.`) +
    absatz(du
      ? "Wenn dir noch etwas einfällt, öffne einfach wieder den Link aus unserer ersten E-Mail, ergänze und sende erneut. Du kannst auch direkt auf diese Mail antworten."
      : "Wenn Ihnen noch etwas einfällt, öffnen Sie einfach wieder den Link aus unserer ersten E-Mail, ergänzen Sie und senden Sie erneut. Sie können auch direkt auf diese Mail antworten.") +
    (p.d ? absatz(`Wir sehen uns am ${esc(datum(p.d))}.`) : "");
  let kopie: string | null = p.e;
  const kunden = await resend(env, {
    from: env.VB_MAIL_FROM || env.MAIL_FROM,
    to: [p.e],
    reply_to: env.VB_MAIL_TO || env.MAIL_TO || "info@360-ai.org",
    subject: du ? "Deine Vorbereitung ist bei 360ai angekommen" : "Ihre Vorbereitung ist bei 360ai angekommen",
    html: rahmen(kopfKunde + zusammenfassung(doc, false)),
    text: `${anrede}\n\n${du ? "danke, deine Vorbereitung ist bei uns angekommen. Hier eine Kopie deiner Angaben." : "vielen Dank, Ihre Vorbereitung ist bei uns angekommen. Hier eine Kopie Ihrer Angaben."}\n` + textFassung(doc),
  });
  if (!kunden.ok) {
    // Nicht fatal: 360ai hat die Angaben. Der Kunde sieht dann keinen Kopie-Hinweis.
    console.log("Resend-Fehler (vorbereitung kopie):", kunden.detail);
    kopie = null;
  }

  const antwort: Record<string, unknown> = { ok: true, revision: rev, kopie };
  if (env.MAIL_DRY_RUN === "1") antwort.vorschau = { betreff: betreffIntern, html: htmlIntern };
  return json(antwort);
};
