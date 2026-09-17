// Nimmt das Formular der Lead-Magnet-Seite entgegen und verschickt die
// Bestaetigungsmail (Double-Opt-In). Es wird hier noch NICHTS gespeichert:
// erst der bestaetigte Klick in confirm.ts schreibt die Zeile ins Google Sheet.
//
// Der Zwischenstand steckt signiert im Token, deshalb braucht diese Funktion
// weder Datenbank noch KV.

interface Env {
  TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  MAIL_TO: string;
  SITE_URL: string;
  TURNSTILE_SECRET?: string;
}

// Version des Einwilligungstextes. Bei JEDER Aenderung des Checkbox-Textes
// auf der Seite hochzaehlen, sonst laesst sich spaeter nicht mehr belegen,
// wozu jemand zugestimmt hat.
export const CONSENT_VERSION = "v1-2026-09-16";

const DOCS: Record<string, { titel: string; datei: string }> = {
  startleitfaden: {
    titel: "KI-Startleitfaden",
    datei: "/assets/downloads/360ai-ki-startleitfaden-3c724391d4888a2c.pdf",
  },
};

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(sig);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Absichtlich nachsichtig: die Adresse muss ohnehin den Bestaetigungsklick
// ueberstehen, eine strenge Regex wuerde nur echte Adressen aussperren.
function istMail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v) && v.length <= 200;
}

async function turnstileOk(env: Env, token: string, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // noch nicht eingerichtet
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, fehler: "Ungueltige Anfrage." }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";

  // Bot-Falle: ein fuer Menschen unsichtbares Feld. Wer es ausfuellt, ist keiner.
  if (clean(body.website, 100) !== "") return json({ ok: true });

  // Zweite Bot-Falle: Formulare, die in unter zwei Sekunden abgeschickt werden,
  // hat niemand ausgefuellt.
  const t0 = Number(body.t0);
  if (Number.isFinite(t0) && Date.now() - t0 < 2000) return json({ ok: true });

  const vorname = clean(body.vorname, 80);
  const nachname = clean(body.nachname, 80);
  const firma = clean(body.firma, 120);
  const email = clean(body.email, 200).toLowerCase();
  const doc = clean(body.doc, 40) || "startleitfaden";
  const utm = clean(body.utm, 80);
  const consent = body.consent === true;

  if (!vorname || !nachname) return json({ ok: false, fehler: "Bitte Vor- und Nachnamen angeben." }, 400);
  if (!istMail(email)) return json({ ok: false, fehler: "Bitte eine gueltige E-Mail-Adresse angeben." }, 400);
  if (!consent) return json({ ok: false, fehler: "Ohne Einwilligung koennen wir Ihnen nichts zuschicken." }, 400);
  if (!DOCS[doc]) return json({ ok: false, fehler: "Unbekanntes Dokument." }, 400);

  if (!(await turnstileOk(env, clean(body.turnstile, 3000), ip))) {
    return json({ ok: false, fehler: "Pruefung fehlgeschlagen. Bitte Seite neu laden." }, 400);
  }

  const payload = {
    v: vorname,
    n: nachname,
    f: firma,
    e: email,
    d: doc,
    c: CONSENT_VERSION,
    u: utm,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const teil = b64url(enc.encode(JSON.stringify(payload)));
  const token = `${teil}.${await sign(teil, env.TOKEN_SECRET)}`;

  const site = env.SITE_URL || "https://360-ai.org";
  const link = `${site}/ki-startleitfaden-bestaetigen?t=${encodeURIComponent(token)}`;
  const dok = DOCS[doc];

  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#f5f5f3;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#1b1c1a">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
<p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7B8CB6">360ai</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Noch ein Klick, dann kommt Ihr ${dok.titel}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Guten Tag ${vorname} ${nachname},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Sie haben den ${dok.titel} angefordert. Bitte bestaetigen Sie kurz, dass diese Adresse Ihnen gehoert. Danach schicken wir Ihnen den Downloadlink sofort zu.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#1b1c1a;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:15px">Anmeldung bestaetigen</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#5b5c58">Falls der Knopf nicht funktioniert, kopieren Sie diese Adresse in Ihren Browser:<br /><span style="word-break:break-all">${link}</span></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#5b5c58">Der Link gilt sieben Tage. Wenn Sie das nicht angefordert haben, ignorieren Sie diese Mail einfach. Ohne Ihre Bestaetigung speichern wir nichts und schreiben Ihnen nicht wieder.</p>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5b5c58">360ai, Denis Schmidt, Frankenberg (Eder)<br /><a href="${site}/impressum" style="color:#5b5c58">Impressum</a> &middot; <a href="${site}/datenschutz" style="color:#5b5c58">Datenschutz</a></p>
</div></body></html>`;

  const text = `Guten Tag ${vorname} ${nachname},

Sie haben den ${dok.titel} angefordert. Bitte bestaetigen Sie kurz, dass diese Adresse Ihnen gehoert:

${link}

Danach bekommen Sie den Downloadlink sofort zugeschickt. Der Link gilt sieben Tage.

Wenn Sie das nicht angefordert haben, ignorieren Sie diese Mail. Ohne Ihre Bestaetigung speichern wir nichts.

360ai, Denis Schmidt, Frankenberg (Eder)
${site}/impressum | ${site}/datenschutz`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [email],
      reply_to: env.MAIL_TO || "info@360-ai.org",
      subject: `Bitte bestaetigen: Ihr ${dok.titel}`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.log("Resend-Fehler (lead):", res.status, detail.slice(0, 300));
    return json({ ok: false, fehler: "Die Bestaetigungsmail konnte nicht versendet werden. Bitte spaeter erneut versuchen." }, 502);
  }

  return json({ ok: true });
};
