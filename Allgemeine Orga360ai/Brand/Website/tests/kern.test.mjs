// Unit-Tests fuer Katalog und Kern der Online-Vorbereitung v2.
// Aufruf im Website-Ordner: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../vorbereitung-fragen.js");
const K = globalThis.VB2;

test("Katalog: Versionen und Schalter", () => {
  assert.equal(K.SCHEMA_VERSION, "2.0.0");
  assert.equal(K.QUESTIONNAIRE_VERSION, "2026-10-v2");
  assert.equal(K.FOTOS_AKTIV, false);
});
test("Katalog: jeder Text hat Du und Sie", () => {
  for (const [k, v] of Object.entries(K.TEXTE)) assert.ok(v.du && v.sie, "fehlt bei " + k);
});
test("Katalog: keine Gedankenstriche", () => {
  assert.ok(!/[–—]/.test(JSON.stringify(K)), "Gedankenstrich gefunden");
});
test("Katalog: Kachel-Listen vollstaendig", () => {
  assert.deepEqual(K.WEITER.map(w => w.id), ["automatisch","abgetippt","weitergeleitet","bescheid","weissnicht"]);
  assert.equal(K.HAEUFIGKEIT.length, 6);
  assert.equal(K.DAUER.length, 6);
  assert.ok(K.PROGRAMM_BEREICHE.length >= 7);
});
