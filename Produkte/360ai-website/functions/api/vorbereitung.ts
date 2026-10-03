// Online-Vorbereitung (Kompakte KI-Potenzialanalyse), Seite /vorbereitung.
//
// Zwei Aktionen, beide per POST:
//   aktion "pruefen": signierten Link pruefen, Konfiguration fuer die Seite
//                     zurueckgeben (Kennung, Kunde, Vorbelegung, Fristen).
//   aktion "senden":  Antworten entgegennehmen, lesbare Zusammenfassung plus
//                     JSON-Anhang an 360ai, Kopie an den Kunden.
//
// Es wird NICHTS gespeichert. Alles, was die Seite braucht, steckt signiert im
// Link (#t=...). Den Link erzeugt _vorbereitung-link.mjs mit demselben
// VORBEREITUNG_SECRET. Die Kopie geht ausschliesslich an die Adresse aus dem
// Link, nie an eine Adresse aus dem Formular: so kann niemand die Funktion
// als Mailschleuder an Dritte benutzen.

import "../../vorbereitung-fragen.js";

interface Env {
  VORBEREITUNG_SECRET: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  MAIL_TO: string;
  VB_MAIL_TO?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITEKEY?: string;
  MAIL_DRY_RUN?: string;
}

interface Payload {
  typ: string; // immer "vb"
  k: string; // Kennung, z. B. REITTER-2026-10-09
  r: string; // Kundenreferenz
  e: string; // Mailadresse fuer die Kopie
  g?: string; // Begruessungszeile auf der Seite, optional
  a?: string; // Anrede in der Kopie-Mail, z. B. "Hallo Steffen,"
  f?: string; // Rueckgabefrist ISO-Datum
  d?: string; // Termin ISO-Datum
  p?: unknown; // Vorbelegung
  iat: number;
  exp: number;
}

// deno-lint-ignore no-explicit-any
const FR: any = (globalThis as any).VB_FRAGEN;

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
// Lesbare Zusammenfassung
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

const STATUS_TEXT: Record<string, string> = {
  unbekannt: "weiß ich nicht",
  "nicht zutreffend": "trifft bei uns nicht zu",
  "Gespräch gewünscht": "möchte ich im Gespräch klären",
};

// deno-lint-ignore no-explicit-any
type Any = any;

function hatInhalt(a: Any): boolean {
  if (!a) return false;
  if (a.status && a.status !== "nicht beantwortet") return true;
  return (
    voll(a.value) || (a.selected && a.selected.length > 0) || voll(a.count) || voll(a.period) ||
    voll(a.active) || voll(a.total) || voll(a.regular) || voll(a.occasional)
  );
}

// Text, der so kurz ist, dass er vermutlich ein Tippfehler oder Testeintrag ist.
function verdaechtig(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s !== "" && s.length < 5 && !/\s/.test(s);
}

function antwortZeilen(q: Any, a: Any, doc: Any): string[] {
  const z: string[] = [];
  if (!a) return z;
  const t = q.type;
  if (t === "textarea" || t === "radio") {
    if (voll(a.value)) z.push(nl(a.value));
    if (a.extra && a.extra.length) z.push(`<i>Richtung:</i> ${esc(a.extra.join(", "))}`);
  } else if (t === "checkboxes") {
    if (a.selected && a.selected.length) z.push(esc(a.selected.join(", ")));
    if (voll(a.value)) z.push(`<i>Ergänzung:</i> ${nl(a.value)}`);
  } else if (t === "frequency") {
    if (voll(a.count) || voll(a.period)) z.push(`${esc(a.count)} ${esc(a.period)}`.trim());
    if (voll(a.basis)) z.push(`<i>Grundlage:</i> ${esc(a.basis)}`);
    if (voll(a.value)) z.push(`<i>Ergänzung:</i> ${nl(a.value)}`);
  } else if (t === "duration") {
    if (voll(a.active)) z.push(`Aktive Minuten je Vorgang: ${esc(a.active)}`);
    if (voll(a.wait)) z.push(`Warte- oder Liegezeit: ${esc(a.wait)}`);
    if (voll(a.basis)) z.push(`<i>Grundlage:</i> ${esc(a.basis)}`);
    if (voll(a.value)) z.push(`<i>Ergänzung:</i> ${nl(a.value)}`);
  } else if (t === "users") {
    const teile = [];
    if (voll(a.total)) teile.push(`insgesamt ${esc(a.total)}`);
    if (voll(a.regular)) teile.push(`regelmäßig ${esc(a.regular)}`);
    if (voll(a.occasional)) teile.push(`gelegentlich ${esc(a.occasional)}`);
    if (teile.length) z.push(teile.join(", "));
    if (voll(a.value)) z.push(`<i>Ergänzung:</i> ${nl(a.value)}`);
  } else if (t === "processpick") {
    const pc = (doc.processCandidates || []) as Any[];
    const name = (id: string) => {
      const p = pc.find((x) => x.id === id);
      return p ? (voll(p.bezeichnung) ? esc(p.bezeichnung) : "(ohne Bezeichnung)") : "";
    };
    if (doc.primaryProcessId) z.push(`Zuerst: <b>${name(doc.primaryProcessId)}</b>`);
    else z.push(`<span style="color:#8c2020">Keine Aufgabe ausgewählt</span>`);
    if (doc.comparisonProcessId) z.push(`Zum Vergleich: ${name(doc.comparisonProcessId)}`);
    if (voll(a.value)) z.push(`<i>Begründung:</i> ${nl(a.value)}`);
  }
  return z;
}

function tabelle(kopf: string[], zeilen: string[][]): string {
  if (!zeilen.length) return `<p style="margin:4px 0;color:#8c2020">keine Einträge</p>`;
  const th = kopf.map((k) => `<th style="text-align:left;font-size:11px;color:#7B8CB6;padding:4px 8px 4px 0">${esc(k)}</th>`).join("");
  const tr = zeilen
    .map((r) => `<tr>${r.map((c) => `<td style="padding:4px 8px 4px 0;vertical-align:top;border-top:1px solid #E4E8F0">${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

const MARK_VORBELEGT = ` <span style="font-size:11px;color:#8a4b12;background:#FBF3E8;padding:1px 5px;border-radius:4px">vorbelegt, nicht bestätigt</span>`;
const MARK_PRUEFEN = ` <span style="font-size:11px;color:#8c2020;background:#FBECEC;padding:1px 5px;border-radius:4px">sehr kurz, prüfen</span>`;

function zelle(v: unknown, intern: boolean, kurzPruefen = false): string {
  return esc(v) + (intern && kurzPruefen && verdaechtig(v) ? MARK_PRUEFEN : "");
}

function frageBlock(q: Any, a: Any, doc: Any, intern: boolean): string {
  let inhalt = "";
  if (q.type === "respondents") {
    inhalt = tabelle(
      ["Name oder Rolle", "Aufgabe im Betrieb", "Erreichbar über"],
      (doc.respondents || []).map((r: Any) => [zelle(r.name, intern) + (intern && r.herkunft === "vorbelegt" ? MARK_VORBELEGT : ""), esc(r.funktion), esc(r.erreichbarkeit)]),
    );
  } else if (q.type === "systems") {
    inhalt = tabelle(
      ["System", "Wofür", "Nutzer", "Betreut von", "Version / Tarif"],
      (doc.systems || []).map((s: Any) => [esc(s.name) + (intern && s.herkunft === "vorbelegt" ? MARK_VORBELEGT : ""), esc(s.aufgabe), esc(s.nutzer), esc(s.betreuung), esc(s.version)]),
    );
  } else if (q.type === "processes") {
    inhalt = tabelle(
      ["Aufgabe", "Rolle", "Häufigkeit", "Was stört"],
      (doc.processCandidates || []).map((p: Any) => [
        (voll(p.bezeichnung) ? zelle(p.bezeichnung, intern, true) : "<i>(ohne Bezeichnung)</i>") +
          (intern && p.herkunft === "vorbelegt" ? MARK_VORBELEGT : "") +
          (p.vertiefung === "primaer" ? " <b>(zuerst)</b>" : p.vertiefung === "vergleich" ? " (Vergleich)" : ""),
        esc(p.zustaendigeRolle), esc(p.haeufigkeit), zelle(p.problem, intern, true),
      ]),
    );
  } else {
    const z = antwortZeilen(q, a, doc);
    inhalt = z.length ? z.map((x) => `<div style="margin:2px 0">${x}</div>`).join("") : "";
  }
  const st = a && STATUS_TEXT[a.status] ? `<div style="margin:2px 0;color:#7B8CB6"><i>Status: ${esc(STATUS_TEXT[a.status])}</i></div>` : "";
  const vb = intern && a && a.herkunft === "vorbelegt" ? MARK_VORBELEGT : "";
  const kurz = intern && a && (q.type === "textarea") && verdaechtig(a.value) ? MARK_PRUEFEN : "";
  const leer = !inhalt && !st ? `<div style="color:#9a9aa6">keine Angabe</div>` : "";
  return `<div style="padding:10px 0;border-top:1px solid #E4E8F0">
<div style="font-weight:600;font-size:14px"><span style="color:#7B8CB6;font-size:11px;letter-spacing:1px;margin-right:6px">${esc(q.id)}</span>${esc(q.label)}${vb}${kurz}</div>
<div style="font-size:14px;margin-top:4px">${inhalt}${st}${leer}</div></div>`;
}

function offenePunkte(doc: Any): string[] {
  const punkte: string[] = [];
  const alle: Any[] = [];
  for (const s of FR.SECTIONS) for (const q of s.questions) alle.push(q);
  const label = (id: string) => (alle.find((q) => q.id === id) || FR.P_FULL.find((q: Any) => q.id === id) || {}).label || "";
  const ans = doc.answers || {};

  const fehlt = FR.REQUIRED_TOP.filter((id: string) => {
    if (id === "A03") return !(doc.respondents || []).length && !hatInhalt(ans[id]);
    if (id === "B01") return !(doc.systems || []).length && !hatInhalt(ans[id]);
    if (id === "C01") return !(doc.processCandidates || []).length && !hatInhalt(ans[id]);
    return !hatInhalt(ans[id]);
  });
  const prim = (doc.processCandidates || []).find((p: Any) => p.id === doc.primaryProcessId);
  if (!prim) punkte.push("<b>Keine Aufgabe zum Vertiefen gewählt:</b> P01 bis P09 fehlen komplett.");
  else {
    for (const id of FR.REQUIRED_PRIMARY_PROCESS) if (!hatInhalt((prim.answers || {})[id])) fehlt.push(id);
  }
  if (fehlt.length) punkte.push(`<b>Pflichtfragen ohne Antwort:</b> ${fehlt.map((id: string) => `${esc(id)} (${esc(label(id))})`).join("; ")}`);

  const nachStatus = (status: string) => {
    const ids: string[] = [];
    for (const [id, a] of Object.entries(ans)) if ((a as Any)?.status === status) ids.push(id);
    if (prim) for (const [id, a] of Object.entries(prim.answers || {})) if ((a as Any)?.status === status) ids.push(id);
    return ids;
  };
  const gespraech = nachStatus("Gespräch gewünscht");
  if (gespraech.length) punkte.push(`<b>Im Gespräch klären:</b> ${gespraech.map(esc).join(", ")}`);
  const unbekannt = nachStatus("unbekannt");
  if (unbekannt.length) punkte.push(`<b>Weiß ich nicht:</b> ${unbekannt.map(esc).join(", ")}`);

  const vorbelegt: string[] = [];
  for (const [id, a] of Object.entries(ans)) if ((a as Any)?.herkunft === "vorbelegt") vorbelegt.push(id);
  const zeilenVb =
    (doc.respondents || []).filter((r: Any) => r.herkunft === "vorbelegt").length +
    (doc.systems || []).filter((r: Any) => r.herkunft === "vorbelegt").length +
    (doc.processCandidates || []).filter((r: Any) => r.herkunft === "vorbelegt").length;
  if (vorbelegt.length || zeilenVb) {
    punkte.push(`<b>Vorbelegt und nie angefasst:</b> ${[...vorbelegt.map(esc), zeilenVb ? `${zeilenVb} Listenzeile(n)` : ""].filter(Boolean).join(", ")}`);
  }
  if (prim && prim.herkunft === "vorbelegt") {
    punkte.push("<b>Achtung Anker:</b> die vertiefte Aufgabe ist eine von uns vorbelegte, die der Kunde nicht verändert hat.");
  }

  const kurz = (doc.processCandidates || []).filter((p: Any) => verdaechtig(p.bezeichnung)).map((p: Any) => esc(p.bezeichnung));
  if (kurz.length) punkte.push(`<b>Sehr kurze Aufgabennamen, prüfen:</b> ${kurz.join(", ")}`);
  return punkte;
}

function zusammenfassung(doc: Any, intern: boolean): string {
  let html = "";
  const ans = doc.answers || {};
  for (const s of FR.SECTIONS) {
    html += `<h2 style="font-size:16px;margin:26px 0 4px;color:#1a1a2e">${esc(s.id)} · ${esc(s.title)}</h2>`;
    for (const q of s.questions) html += frageBlock(q, ans[q.id], doc, intern);
    if (s.id === "C") {
      for (const [rolle, titel, defs] of [
        ["primaer", "Erste Aufgabe, ausführlicher", FR.P_FULL],
        ["vergleich", "Zweite Aufgabe, Kurzvergleich", FR.P_SHORT],
      ] as [string, string, Any[]][]) {
        const p = (doc.processCandidates || []).find((x: Any) => x.vertiefung === rolle);
        if (!p) {
          if (rolle === "primaer") html += `<h2 style="font-size:16px;margin:26px 0 4px">${titel}</h2><p style="color:#8c2020">Keine Aufgabe ausgewählt.</p>`;
          continue;
        }
        html += `<h2 style="font-size:16px;margin:26px 0 4px;color:#1a1a2e">${titel}: ${voll(p.bezeichnung) ? esc(p.bezeichnung) : "(ohne Bezeichnung)"}</h2>`;
        for (const q of defs) html += frageBlock(q, (p.answers || {})[q.id], doc, intern);
      }
    }
  }
  return html;
}

function rahmen(inhalt: string): string {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#F9F9F9;padding:20px;font-family:Helvetica,Arial,sans-serif;color:#1a1a2e">
<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #E4E8F0;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7B8CB6">360ai</p>
${inhalt}
<p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#6b7080">360ai, Denis Schmidt, Frankenberg (Eder)<br>info@360-ai.org · www.360-ai.org</p>
</div></body></html>`;
}

// Fuer Mailprogramme ohne HTML: kurze Textfassung, der Inhalt steckt im Anhang.
function textFassung(doc: Any, intern: boolean): string {
  const z: string[] = [];
  const ans = doc.answers || {};
  for (const s of FR.SECTIONS) {
    z.push(`\n== ${s.id} ${s.title} ==`);
    for (const q of s.questions) {
      const a = ans[q.id];
      const roh = antwortZeilen(q, a, doc).map((x) => x.replace(/<br>/g, "\n").replace(/<[^>]+>/g, ""));
      const st = a && STATUS_TEXT[a.status] ? ` [${STATUS_TEXT[a.status]}]` : "";
      if (["respondents", "systems", "processes"].includes(q.type)) continue;
      z.push(`${q.id} ${q.label}${st}\n${roh.join("\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") || "(keine Angabe)"}`);
    }
  }
  return (intern ? "Vollständige Angaben im JSON-Anhang und in der HTML-Fassung dieser Mail.\n" : "") + z.join("\n");
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
    return json({
      ok: true,
      config: {
        kennung: p.k,
        kunde: p.r || "",
        gruss: p.g || "",
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
        ? "Ihr Link ist inzwischen abgelaufen. Bitte sichern Sie Ihre Angaben als Datei und schicken Sie sie an info@360-ai.org."
        : "Der Link ist ungültig. Bitte öffnen Sie ihn direkt aus unserer E-Mail.",
    }, 403);
  }
  const p = pr.p;
  const ip = request.headers.get("CF-Connecting-IP") || "";

  if (!(await turnstileOk(env, typeof body.turnstile === "string" ? body.turnstile.slice(0, 3000) : "", ip))) {
    return json({ ok: false, fehler: "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte noch einmal senden." }, 400);
  }
  if (!(await mengeOk(`k:${p.k}`, 8, 3600)) || (ip && !(await mengeOk(`ip:${ip}`, 20, 3600)))) {
    return json({ ok: false, fehler: "Sie haben in kurzer Zeit sehr oft gesendet. Bitte versuchen Sie es in einer Stunde noch einmal." }, 429);
  }

  const doc = body.doc;
  if (
    !doc || typeof doc !== "object" || doc.type !== FR.DOC_TYPE || doc.schemaVersion !== FR.SCHEMA_VERSION ||
    doc.questionnaireId !== p.k || typeof doc.answers !== "object" ||
    !Array.isArray(doc.respondents) || !Array.isArray(doc.systems) || !Array.isArray(doc.processCandidates)
  ) {
    return json({ ok: false, fehler: "Die Angaben passen nicht zu dieser Vorbereitung. Bitte laden Sie die Seite neu." }, 400);
  }
  if (doc.processCandidates.length > 8 || doc.systems.length > 40 || doc.respondents.length > 10) {
    return json({ ok: false, fehler: "Es sind mehr Einträge vorhanden als erlaubt." }, 400);
  }

  const jsonText = JSON.stringify(doc, null, 2);
  const kunde = einzeilig(doc.customerReference || p.r || p.k, 80);
  const rev = Number(doc.revision) || 0;
  const fassung = rev > 0 ? `, Fassung ${rev + 1}` : "";
  const dateiname = `${p.k.replace(/[^A-Za-z0-9._-]/g, "_")}_r${rev}.json`;

  // ---- Mail an 360ai --------------------------------------------------------
  const punkte = offenePunkte(doc);
  const kopf = `<h1 style="margin:0 0 6px;font-size:21px">Vorbereitung eingegangen: ${esc(kunde)}</h1>
<p style="margin:0;color:#6b7080;font-size:13px">Kennung ${esc(p.k)} · Fassung ${rev + 1}${doc.supersedesSubmissionId ? " (ersetzt die vorige)" : ""} · Termin ${esc(datum(p.d)) || "nicht gesetzt"} · Kopie an ${esc(p.e)}</p>
<div style="margin:18px 0 6px;padding:14px 16px;background:#FBF3E8;border:1px solid #e8d5ba;border-radius:8px;font-size:14px;color:#5a3a12">
<div style="font-weight:700;margin-bottom:6px">Zu klären</div>
${punkte.length ? `<ul style="margin:0;padding-left:18px">${punkte.map((x) => `<li style="margin:3px 0">${x}</li>`).join("")}</ul>` : "Nichts Auffälliges. Alle Pflichtfragen haben eine Antwort."}
</div>
<p style="font-size:12px;color:#6b7080;margin:6px 0 0">Vollständige Rohdaten im Anhang ${esc(dateiname)}.</p>`;
  const htmlIntern = rahmen(kopf + zusammenfassung(doc, true));
  const betreffIntern = einzeilig(`Vorbereitung eingegangen: ${kunde} (${p.k}${fassung})`, 180);

  const intern = await resend(env, {
    from: env.MAIL_FROM,
    to: [env.VB_MAIL_TO || env.MAIL_TO || "info@360-ai.org"],
    reply_to: p.e,
    subject: betreffIntern,
    html: htmlIntern,
    text: textFassung(doc, true),
    attachments: [{ filename: dateiname, content: b64(jsonText) }],
  });
  if (!intern.ok) {
    console.log("Resend-Fehler (vorbereitung intern):", intern.detail);
    return json({ ok: false, fehler: "Das Senden hat gerade nicht geklappt." }, 502);
  }

  // ---- Kopie an den Kunden ---------------------------------------------------
  const anrede = einzeilig(p.a || "Guten Tag,", 80);
  const kopfKunde = `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(anrede)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 12px">vielen Dank, Ihre Vorbereitung ist bei uns angekommen${rev > 0 ? ` (Fassung ${rev + 1}, sie ersetzt die vorige)` : ""}. Unten finden Sie eine Kopie Ihrer Angaben.</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 12px">Wenn Ihnen noch etwas einfällt, öffnen Sie einfach wieder den Link aus unserer ersten E-Mail, ergänzen Sie und senden Sie erneut. Sie können auch direkt auf diese Mail antworten.</p>
${p.d ? `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">Wir sehen uns am ${esc(datum(p.d))}.</p>` : ""}`;
  let kopie: string | null = p.e;
  const kunden = await resend(env, {
    from: env.MAIL_FROM,
    to: [p.e],
    reply_to: env.VB_MAIL_TO || env.MAIL_TO || "info@360-ai.org",
    subject: "Ihre Vorbereitung ist bei 360ai angekommen",
    html: rahmen(kopfKunde + zusammenfassung(doc, false)),
    text: `${anrede}\n\nvielen Dank, Ihre Vorbereitung ist bei uns angekommen. Hier eine Kopie Ihrer Angaben.\n` + textFassung(doc, false),
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
