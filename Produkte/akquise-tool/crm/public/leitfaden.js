// Reine Daten für den Telefonleitfaden-Wizard. Kein DOM-Zugriff hier, analog domain.js.

export const LEITFADEN_PRODUKTE = [
  { id: 'webdesign', label: 'Webdesign' },
  { id: 'beratungstool', label: 'Beratungstool' },
];

// Nachweis des sachlichen Bezugs bei B2B-Kaltakquise (§ 7 Abs. 2 UWG) — Pflichtangabe
// vor dem eigentlichen Gespräch, landet als erste Zeile im Notiztext.
export const ANLASS_CHIPS = [
  'Website-Mangel festgestellt', 'Empfehlung', 'Bestehender Kontakt', 'Sonstiger Anlass',
];

// Produktunabhängig: Empfang/Sekretariat kommt vor jedem Opener.
export const GATEKEEPER_SCHRITT = {
  id: 'gatekeeper',
  type: 'gatekeeper',
  titel: 'Wer ist dran?',
  skript: 'Guten Tag, hier ist [Name] von 360ai. Ich hätte gern kurz [Ansprechpartner / '
    + 'Inhaber / Geschäftsführung] gesprochen — geht das gerade, oder ist er/sie besser zu '
    + 'einem anderen Zeitpunkt erreichbar?',
};

export const LEITFADEN_SCHRITTE = {
  webdesign: [
    {
      id: 'opener',
      type: 'opener',
      titel: 'Opener',
      skript: 'Guten Tag, hier ist [Name] von 360ai aus [Ort]. Ich habe mir kurz Ihre '
        + 'Website [Firma] angeschaut — [Aufhänger einsetzen]. Deswegen wollte ich kurz '
        + 'mit Ihnen sprechen, haben Sie zwei Minuten?',
      aufhaengerChips: [
        'Lange Ladezeit / nicht mobil-optimiert', 'Kein Impressum / Datenschutz',
        'Veraltetes Design', 'Keine klare Kontaktmöglichkeit', 'Schlechte Google-Auffindbarkeit',
      ],
    },
    {
      id: 'bedarf',
      type: 'bedarf',
      titel: 'Bedarf & Zustimmung',
      fragen: [
        {
          id: 'anfragen',
          frage: 'Wie viele Anfragen bekommen Sie aktuell über Ihre Website?',
          zustimmung: 'Mehr Anfragen ohne mehr Werbebudget wäre interessant für Sie?',
        },
        { id: 'zustaendigkeit', frage: 'Wer kümmert sich bei Ihnen aktuell um die Website?' },
        {
          id: 'wunsch',
          frage: 'Was würden Sie an Ihrer aktuellen Seite ändern, wenn Sie könnten?',
        },
        {
          id: 'mobil',
          frage: 'Was passiert, wenn ein Kunde die Seite auf dem Handy nicht vernünftig sehen kann?',
          zustimmung: 'Das kostet Sie dann vermutlich auch schon mal einen Kunden, oder?',
        },
      ],
    },
    {
      id: 'pitch',
      type: 'pitch',
      titel: 'Kurzpitch',
      skript: 'Genau da setzen wir an: Wir bauen Ihnen eine neue, schnelle Website, die auf '
        + 'jedem Gerät gut aussieht und gezielt mehr Anfragen bringen soll. Rechtlich sauber, '
        + 'mit allem was dazugehört, in der Regel innerhalb weniger Wochen fertig.',
    },
    {
      id: 'abschluss',
      type: 'abschluss',
      titel: 'Abschluss',
      skript: 'Am besten schauen wir uns das kurz unverbindlich gemeinsam an. Passt Ihnen '
        + 'das eher [Tag A] oder [Tag B]?',
    },
  ],
  beratungstool: [
    {
      id: 'opener',
      type: 'opener',
      titel: 'Opener',
      skript: 'Guten Tag, hier ist [Name] von 360ai. Wir helfen Betrieben, mit einer '
        + 'KI-gestützten Analyse in kurzer Zeit herauszufinden, wo Zeit und Geld verloren '
        + 'geht, ohne tagelange Prozessaufnahme. Haben Sie zwei Minuten?',
      aufhaengerChips: [
        'Wiederkehrende manuelle Aufgaben', 'Fachkräftemangel / Zeitdruck',
        'Unklare Prozesse', 'Kein Überblick über Digitalisierungspotenzial',
      ],
    },
    {
      id: 'bedarf',
      type: 'bedarf',
      titel: 'Bedarf & Zustimmung',
      fragen: [
        {
          id: 'zeitaufwand',
          frage: 'Wie viel Zeit verbringt Ihr Team mit wiederkehrenden Aufgaben wie '
            + 'Angeboten oder Dokumentation?',
          zustimmung: 'Diese Zeit könnten Sie sicher auch anders gut gebrauchen?',
        },
        { id: 'engpass', frage: 'Wo hakt es bei Ihnen im Tagesgeschäft am häufigsten?' },
        {
          id: 'analyse',
          frage: 'Haben Sie das schon mal systematisch analysiert, oder fehlt dafür die Zeit?',
          zustimmung: 'Ein klarer Überblick ohne eigenen Zeitaufwand wäre also hilfreich?',
        },
        {
          id: 'potenzial',
          frage: 'Was würde es bedeuten, wenn Sie dafür 20 % weniger Zeit bräuchten?',
        },
      ],
    },
    {
      id: 'pitch',
      type: 'pitch',
      titel: 'Kurzpitch',
      skript: 'Unser Tool analysiert Ihre Abläufe KI-gestützt und zeigt in kurzer Zeit die '
        + 'größten Zeitfresser und was sich automatisieren lässt. Kein tagelanger '
        + 'Beratungsprozess, sondern ein klarer Bericht als Grundlage für die nächsten Schritte.',
    },
    {
      id: 'abschluss',
      type: 'abschluss',
      titel: 'Abschluss',
      skript: 'Am sinnvollsten wäre ein kurzes, unverbindliches Gespräch, in dem wir das '
        + 'größte Potenzial bei Ihnen finden. Passt Ihnen eher [Tag A] oder [Tag B]?',
    },
  ],
};

// Als Dauer-Panel in jedem Schritt ab dem Opener erreichbar, kein eigener Wizard-Schritt.
export const EINWAENDE = {
  webdesign: [
    {
      einwand: 'Wir haben schon eine Website',
      antwort: 'Verstehe ich gut. Die Frage ist eher, ob sie Ihnen aktuell so viele '
        + 'Anfragen bringt, wie sie könnte. Wie zufrieden sind Sie damit?',
    },
    {
      einwand: 'Zu teuer / kein Budget',
      antwort: 'Das höre ich öfter am Anfang. Meist finanziert sich eine neue Website über '
        + 'die zusätzlichen Anfragen von selbst. Wollen wir uns die Zahlen unverbindlich anschauen?',
    },
    {
      einwand: 'Kein Interesse',
      antwort: 'Kein Problem bei einem Anruf aus dem Nichts. Darf ich fragen, woran das '
        + 'liegt, damit ich weiß, ob ich später nochmal anfragen soll?',
    },
    {
      einwand: 'Schicken Sie mir was per Mail',
      antwort: 'Mache ich gerne. Was ist Ihnen bei einer Website am wichtigsten, damit ich '
        + 'das gezielt reinschreibe?',
    },
    {
      einwand: 'Machen wir selbst / haben jemanden dafür',
      antwort: 'Gut zu wissen. Wie viel Zeit kostet das aktuell? Eine externe Zweitmeinung '
        + 'lohnt sich oft trotzdem.',
    },
  ],
  beratungstool: [
    {
      einwand: 'Wir nutzen schon KI-Tools',
      antwort: 'Guter Ausgangspunkt. Meist läuft das aber punktuell statt systematisch über '
        + 'den ganzen Betrieb. Wo setzen Sie KI aktuell ein?',
    },
    {
      einwand: 'Zu kompliziert / zu technisch',
      antwort: 'Verstehe ich. Am Ende bekommen Sie einen verständlichen Bericht, keine '
        + 'technische Doku — dafür müssen Sie nichts programmieren.',
    },
    {
      einwand: 'Kein Budget',
      antwort: 'Die Analyse selbst ist niedrigschwellig, damit Sie erstmal sehen, ob sich '
        + 'eine größere Investition überhaupt lohnt.',
    },
    {
      einwand: 'Kein Interesse',
      antwort: 'Verstehe ich bei einem Anruf ohne Vorwarnung. Ist Prozessoptimierung bei '
        + 'Ihnen aktuell kein Thema, oder gerade keine Priorität?',
    },
    {
      einwand: 'Schicken Sie Infos per Mail',
      antwort: 'Gerne. Was beschäftigt Sie aktuell am meisten im Tagesgeschäft, damit ich '
        + 'etwas Passendes schicke?',
    },
  ],
};

export const ABSCHLUSS_ERGEBNISSE = [
  { value: 'termin', label: 'Termin vereinbart' },
  { value: 'wiedervorlage', label: 'Wiedervorlage' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'nicht_erreicht', label: 'Nicht erreicht' },
];

const abschnitt = (titel, inhalt) => (inhalt ? '## ' + titel + '\n' + inhalt : '');

// Baut aus dem gesammelten Wizard-Stand einen einzigen Notiztext. Läuft auch mit
// unvollständigen Antworten (Abbruch mitten im Gespräch), einfach mit weniger Abschnitten.
export function baueNotizAusAntworten(produktId, antworten = {}) {
  const produktLabel = LEITFADEN_PRODUKTE.find((p) => p.id === produktId)?.label || produktId;
  const schritte = LEITFADEN_SCHRITTE[produktId] || [];
  const bedarfSchritt = schritte.find((s) => s.type === 'bedarf');

  const anlassText = antworten.sachlicherAnlass || '';

  const gatekeeper = antworten.gatekeeper || {};
  const gatekeeperText = gatekeeper.ergebnis === 'weiterleitung'
    ? 'Weiterleitung/Rückruf nötig' + (gatekeeper.rueckruf ? ' — genannter Zeitpunkt: ' + gatekeeper.rueckruf : '')
    : (gatekeeper.ergebnis === 'entscheider' ? 'Entscheider direkt erreicht' : '');

  const opener = antworten.opener || {};
  const aufhaengerText = [
    ...(Array.isArray(opener.aufhaenger) ? opener.aufhaenger : []),
    opener.freitext,
  ].filter(Boolean).join('; ');

  const bedarfAntworten = antworten.bedarf || {};
  const bedarfText = (bedarfSchritt?.fragen || [])
    .map((frage) => {
      const eintrag = bedarfAntworten[frage.id];
      if (!eintrag?.antwort && !eintrag?.zustimmung) return '';
      const zustimmungText = eintrag.zustimmung
        ? ' (Zustimmungsfrage: ' + (eintrag.zustimmung === 'ja' ? 'zugestimmt' : 'Widerspruch') + ')'
        : '';
      return '- ' + frage.frage + ' → ' + (eintrag.antwort || '–') + zustimmungText;
    })
    .filter(Boolean)
    .join('\n');

  const einwaendeListe = Array.isArray(antworten.einwaende) ? antworten.einwaende : [];
  const einwaendeText = einwaendeListe.map((einwand) => '- ' + einwand).join('\n');

  const abschluss = antworten.abschluss || {};
  const ergebnisLabel = ABSCHLUSS_ERGEBNISSE.find((e) => e.value === abschluss.ergebnis)?.label;
  const abschlussText = [ergebnisLabel, abschluss.freitext].filter(Boolean).join(' — ');

  return [
    'Produkt: ' + produktLabel,
    abschnitt('Sachlicher Anlass', anlassText),
    abschnitt('Erreichbarkeit', gatekeeperText),
    abschnitt('Aufhänger', aufhaengerText),
    abschnitt('Bedarf & Zustimmung', bedarfText),
    abschnitt('Einwände im Gespräch', einwaendeText),
    abschnitt('Gesprächsergebnis', abschlussText),
  ].filter(Boolean).join('\n\n');
}
