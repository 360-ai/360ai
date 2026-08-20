// Gemeinsame Bausteine der Regeln. Ergebnisse werden hier einheitlich geformt,
// damit jede Regel dieselbe Struktur liefert.

export const pass = (text, wert = null, belege = []) => ({ ergebnis: 'PASS', text, wert, belege });
export const warn = (text, wert = null, belege = []) => ({ ergebnis: 'WARN', text, wert, belege });
export const fail = (text, wert = null, belege = []) => ({ ergebnis: 'FAIL', text, wert, belege });
export const na = (grund) => ({ ergebnis: 'NA', grund });
export const unknown = (grund) => ({ ergebnis: 'UNKNOWN', grund });

/** Waehlt PASS/WARN/FAIL anhand zweier Schwellen. Kleinere Werte sind besser. */
export function stufeKleinerBesser(wert, warnAb, failAb, texte) {
  if (wert >= failAb) return fail(texte.fail, texte.wert ?? { wert });
  if (wert >= warnAb) return warn(texte.warn, texte.wert ?? { wert });
  return pass(texte.pass, texte.wert ?? { wert });
}

/** Waehlt PASS/WARN/FAIL anhand zweier Schwellen. Groessere Werte sind besser. */
export function stufeGroesserBesser(wert, warnUnter, failUnter, texte) {
  if (wert < failUnter) return fail(texte.fail, texte.wert ?? { wert });
  if (wert < warnUnter) return warn(texte.warn, texte.wert ?? { wert });
  return pass(texte.pass, texte.wert ?? { wert });
}

/** Seiten mit echtem Inhalt - Rechtstexte zaehlen bei Inhaltsregeln nicht mit. */
export function inhaltsseiten(facts) {
  return (facts.pages ?? []).filter(
    (p) => !['impressum', 'datenschutz'].includes(p.rolle) && !p.error
  );
}

export function alleSeiten(facts) {
  return (facts.pages ?? []).filter((p) => !p.error);
}

/** Alle Inhaltsbilder mit gemessener Groesse. Icons und Logos bleiben aussen vor. */
export function inhaltsbilder(facts) {
  const bilder = [];
  const gesehen = new Set();
  for (const p of facts.pages ?? []) {
    for (const img of p.images ?? []) {
      if (gesehen.has(img.src)) continue;
      gesehen.add(img.src);
      if (/logo|icon|favicon|sprite|pixel|spacer/i.test(img.src)) continue;
      bilder.push({ ...img, seite: p.url });
    }
  }
  return bilder;
}

export const pfad = (url) => { try { return new URL(url).pathname; } catch { return url; } };

export const prozent = (teil, gesamt) => (gesamt ? Math.round((teil / gesamt) * 100) : 0);
