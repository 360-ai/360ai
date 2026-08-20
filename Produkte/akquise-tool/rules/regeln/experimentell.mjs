// EXP - Experimentelle Signale. Gewicht 0, nie im Kundentext.
//
// Diese Regeln werden erhoben und im internen Bericht genannt, bewegen aber
// keinen Score. Grund: Fuer ihre Wirkung gibt es derzeit keinen belastbaren
// Nachweis, und 360ai verkauft nichts, was nicht belegbar wirkt.
// Aendert sich die Beleglage, wandert eine Regel mit Gewicht in die AIR-Achse
// und der Wechsel wird im Regelkatalog dokumentiert.

import { pass, fail, unknown, alleSeiten, prozent } from './_helfer.mjs';

export default [
  {
    id: 'EXP-01',
    name: 'LLMS_TXT',
    gruppe: 'experimentell', achse: null, gewicht: 0, kundentext_erlaubt: false,
    messung: 'Abruf von /llms.txt',
    pruefe(facts) {
      if (!facts.llms_txt) return unknown('nicht geprueft');
      return facts.llms_txt.found
        ? pass('Eine llms.txt ist hinterlegt.', { gefunden: true })
        : fail('Es ist keine llms.txt hinterlegt.', { gefunden: false, hinweis: 'ohne Score-Wirkung, Nutzen nicht belegt' });
    },
  },
  {
    id: 'EXP-02',
    name: 'AI_CRAWLER_POLICY',
    gruppe: 'experimentell', achse: null, gewicht: 0, kundentext_erlaubt: false,
    messung: 'Eintraege fuer GPTBot, ClaudeBot, PerplexityBot und Google-Extended in der robots.txt',
    pruefe(facts) {
      const ai = facts.robots_txt?.ai_crawlers;
      if (!ai) return unknown('robots.txt nicht ausgewertet');
      const genannt = Object.entries(ai).filter(([, v]) => v !== 'not_mentioned');
      const blockiert = Object.entries(ai).filter(([, v]) => v === 'blocked').map(([k]) => k);
      // Bewusst wertungsfrei: Sowohl Zulassen als auch Sperren kann gewollt sein.
      return pass(
        genannt.length
          ? `Die robots.txt regelt ${genannt.length} KI-Crawler ausdruecklich${blockiert.length ? `, davon ${blockiert.length} gesperrt` : ''}.`
          : 'Die robots.txt trifft keine ausdrueckliche Regelung fuer KI-Crawler.',
        { geregelt: genannt.length, blockiert, alle: ai }
      );
    },
  },
  {
    id: 'EXP-03',
    name: 'ANSWER_SHAPED_CONTENT',
    gruppe: 'experimentell', achse: null, gewicht: 0, kundentext_erlaubt: false,
    messung: 'Anteil der Ueberschriften, die als Frage formuliert sind',
    pruefe(facts) {
      const ueberschriften = alleSeiten(facts).flatMap((p) => p.headings ?? []).filter((h) => h.level >= 2);
      if (ueberschriften.length < 5) return unknown('zu wenige Ueberschriften fuer eine Aussage');
      const fragen = ueberschriften.filter((h) => /\?\s*$/.test(h.text));
      const anteil = prozent(fragen.length, ueberschriften.length);
      return pass(`${anteil} Prozent der Ueberschriften sind als Frage formuliert.`, {
        anteil_prozent: anteil, fragen: fragen.length, ueberschriften: ueberschriften.length,
        beispiele: fragen.slice(0, 3).map((h) => h.text),
      });
    },
  },
];
