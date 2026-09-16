// Testendpunkt: prueft, ob Cloudflare Pages Functions auf diesem Projekt ausgeliefert
// werden. Darf nach bestandenem Test wieder entfernt werden.
export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
    headers: { "content-type": "application/json" },
  });
};
