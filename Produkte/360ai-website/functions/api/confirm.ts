// Bestaetigt die Anmeldung (Double-Opt-In), schreibt die Zeile ins Google Sheet
// und verschickt den Downloadlink.
//
// Bewusst POST und nicht GET: Mailfilter von Firmen (Outlook Safe Links,
// Proofpoint) rufen Links in Mails automatisch auf. Bei einem GET-Link wuerden
// die eine Einwilligung bestaetigen, die nie ein Mensch geklickt hat. Genau der
// Beweiswert des Double-Opt-In waere damit hin. Deshalb klickt der Empfaenger
// auf der Bestaetigungsseite noch einen Knopf.

interface Env {
  TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  MAIL_TO: string;
  SITE_URL: string;
  SHEET_WEBHOOK_URL: string;
  SHEET_SECRET: string;
}

const DOCS: Record<string, { titel: string; datei: string }> = {
  startleitfaden: {
    titel: "KI-Startleitfaden",
    datei: "/assets/downloads/360ai-ki-startleitfaden-3c724391d4888a2c.pdf",
  },
};

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pruefeSignatur(teil: string, sig: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    return await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), enc.encode(teil));
  } catch {
    return false;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function deutschesDatum(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(d);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { t?: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, fehler: "Ungueltige Anfrage." }, 400);
  }

  const token = typeof body.t === "string" ? body.t : "";
  const [teil, sig] = token.split(".");
  if (!teil || !sig || !(await pruefeSignatur(teil, sig, env.TOKEN_SECRET))) {
    return json({ ok: false, fehler: "Dieser Bestaetigungslink ist ungueltig. Bitte fordern Sie das Dokument erneut an." }, 400);
  }

  let p: Record<string, string | number>;
  try {
    p = JSON.parse(new TextDecoder().decode(b64urlToBytes(teil)));
  } catch {
    return json({ ok: false, fehler: "Dieser Bestaetigungslink ist ungueltig." }, 400);
  }

  if (typeof p.exp !== "number" || Date.now() > p.exp) {
    return json({ ok: false, fehler: "Dieser Bestaetigungslink ist abgelaufen. Bitte fordern Sie das Dokument erneut an." }, 410);
  }

  const dok = DOCS[String(p.d)] || DOCS.startleitfaden;
  const site = env.SITE_URL || "https://360-ai.org";
  const downloadUrl = `${site}${dok.datei}`;
  const jetzt = new Date();
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 300);

  // 1. Zeile ins Google Sheet. Schlaegt das fehl, bekommt der Interessent
  //    trotzdem sein Dokument, und Denis eine Warnmail mit allen Daten,
  //    damit kein Lead verloren geht.
  let sheetOk = false;
  let sheetFehler = "";
  try {
    const res = await fetch(env.SHEET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.SHEET_SECRET,
        zeitstempel_anfrage: new Date(Number(p.iat)).toISOString(),
        zeitstempel_bestaetigung: jetzt.toISOString(),
        vorname: p.v,
        nachname: p.n,
        firma: p.f,
        email: p.e,
        dokument: p.d,
        einwilligung: "ja, Double-Opt-In bestaetigt",
        einwilligungstext_version: p.c,
        ip_bestaetigung: ip,
        user_agent: ua,
        quelle: p.u,
      }),
    });
    const txt = (await res.text()).slice(0, 200);
    sheetOk = res.ok && txt.includes("ok");
    if (!sheetOk) sheetFehler = `HTTP ${res.status}: ${txt}`;
  } catch (e) {
    sheetFehler = String(e).slice(0, 200);
  }

  // 2. Downloadmail an den Interessenten
  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#f5f5f3;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#1b1c1a">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
<p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7B8CB6">360ai</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Ihr ${dok.titel}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Guten Tag ${p.v} ${p.n},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6">vielen Dank fuer die Bestaetigung. Hier ist Ihr Leitfaden:</p>
<p style="margin:0 0 24px"><a href="${downloadUrl}" style="display:inline-block;background:#1b1c1a;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:15px">${dok.titel} herunterladen</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#5b5c58">Falls der Knopf nicht funktioniert:<br /><span style="word-break:break-all">${downloadUrl}</span></p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Wenn beim Lesen Fragen auftauchen, antworten Sie einfach auf diese Mail. Ein kurzes Kennenlernen am Telefon dauert 15 Minuten und kostet nichts.</p>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5b5c58">360ai, Denis Schmidt, Frankenberg (Eder)<br /><a href="${site}/impressum" style="color:#5b5c58">Impressum</a> &middot; <a href="${site}/datenschutz" style="color:#5b5c58">Datenschutz</a><br />Sie moechten keine weiteren Mails? Eine Antwort mit dem Wort Abmelden genuegt, dann loeschen wir Ihre Adresse.</p>
</div></body></html>`;

  const text = `Guten Tag ${p.v} ${p.n},

vielen Dank fuer die Bestaetigung. Hier ist Ihr ${dok.titel}:

${downloadUrl}

Wenn beim Lesen Fragen auftauchen, antworten Sie einfach auf diese Mail. Ein kurzes Kennenlernen am Telefon dauert 15 Minuten und kostet nichts.

360ai, Denis Schmidt, Frankenberg (Eder)
${site}/impressum | ${site}/datenschutz

Sie moechten keine weiteren Mails? Eine Antwort mit dem Wort Abmelden genuegt, dann loeschen wir Ihre Adresse.`;

  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [String(p.e)],
      reply_to: env.MAIL_TO || "info@360-ai.org",
      subject: `Ihr ${dok.titel}`,
      html,
      text,
    }),
  });

  if (!mail.ok) {
    console.log("Resend-Fehler (confirm):", mail.status, (await mail.text()).slice(0, 300));
  }

  // 3. Notmeldung an Denis, falls das Sheet nicht geschrieben wurde
  if (!sheetOk) {
    console.log("Sheet-Fehler:", sheetFehler);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.MAIL_TO || "info@360-ai.org"],
        subject: "ACHTUNG: Lead konnte nicht ins Google Sheet geschrieben werden",
        text: `Ein bestaetigter Lead konnte nicht gespeichert werden. Bitte von Hand eintragen.

Zeitpunkt: ${deutschesDatum(jetzt)}
Name: ${p.v} ${p.n}
Firma: ${p.f || "keine Angabe"}
E-Mail: ${p.e}
Dokument: ${p.d}
Einwilligung: ja, Double-Opt-In bestaetigt (${p.c})
IP: ${ip}
Quelle: ${p.u || "keine"}

Technischer Grund: ${sheetFehler}`,
      }),
    }).catch(() => {});
  }

  return json({ ok: true, download: dok.datei, titel: dok.titel });
};
