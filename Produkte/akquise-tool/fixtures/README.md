# Fixtures

Eingefrorene `facts.json` echter Websites. Die Regressionstests laufen dagegen und **nicht**
gegen die Live-Seiten — sonst schlagen Tests fehl, sobald jemand seine Website ändert.

| Fixture | Quelle | wofür |
|---|---|---|
| `helfri` | helfri-bau.de, Scan 14.08.2026 | Positivfall: WordPress/Divi von 2020, viele belegbare Mängel |
| `bravo` | bravo-fkb.de, Scan 14.08.2026 | Positivfall: Single-Page-Anwendung, fehlende Rechtstexte |
| `sauber` | www.schreck-kunststofftechnik.de, Scan 14.08.2026 | **Negativfall**: von 360ai gebaut, darf keine Fehlalarme auslösen |

Der Negativfall ist der wichtigere. Ohne ihn misst man nur die Trefferquote, nicht die
Falschalarmquote. Er hat beim Bau bereits zwei echte Fehler aufgedeckt: vorangestellte
Überschriften wurden als Teil der Adresse gelesen, und Fließtext-Links zählten als zu kleine
Schaltflächen.

## Was hier an Daten liegt — bewusste Abwägung

Diese Dateien enthalten Inhalte öffentlicher Unternehmenswebsites, darunter Angaben aus dem
Impressum: Firmenname, Anschrift, Telefonnummer, geschäftliche E-Mail und der Name des
Geschäftsführers.

Das steht in einer gewissen Spannung zur Grundregel des Projekts, dass Leaddaten nicht in die
Versionierung gehören (siehe `README.md`). Die Abwägung ist bewusst so getroffen:

- Es handelt sich um **Pflichtangaben nach § 5 DDG**, die veröffentlicht sein müssen — keine
  privaten Daten und keine Daten, die durch Recherche zusammengetragen wurden.
- Es sind **drei Testfälle**, keine wachsende Leaddatenbank. Genau letztere sollte die Regel
  verhindern.
- Ohne echte Daten wären die Tests wertlos: Der Fall „Firmierung in drei Schreibweisen" lässt
  sich nicht sinnvoll erfinden.
- Zwei der drei Betriebe sind Akquise-Kontakte, der dritte ist ein eigener Kunde.

**Falls das anders bewertet werden soll:** Die Fixtures können pseudonymisiert werden. Betroffen
wären die Felder `impressum.vertretung`, `impressum.email`, `impressum.telefon` sowie die
`text`-Felder der Kontakt- und Impressumsseiten. Die Tests zu TRU-01 und TRU-02 müssten dann
angepasst werden, weil sie auf namentlich genannte Ansprechpartner prüfen.

Screenshots und gespeichertes HTML liegen **nicht** hier, sondern unter
`~/Documents/360ai/Kunden/Akquise/` und sind von der Versionierung ausgeschlossen.

## Warum die Fixtures eine ältere Collector-Version tragen

In den Dateien steht `collector_version: 1.0.0`, aktuell ist 1.1.0. Das ist Absicht: Die
Fixtures prüfen die **Rule Engine**, nicht den Collector. Sie werden nur dann neu erzeugt, wenn
eine Änderung am Collector auch die Regelergebnisse verändern soll — sonst würde jede
Collector-Anpassung stillschweigend die Messlatte verschieben.

Der Collector selbst wird über die Tests in `tests/extract.test.mjs` geprüft, die mit
handgeschriebenen HTML-Schnipseln arbeiten.

## Aktualisieren

```bash
node collector/scan.mjs https://helfri-bau.de --lead-id TEST-helfri --branche bauunternehmen \
  --keyword "Bauunternehmen Frankenberg" --limit 12
cp ~/Documents/360ai/Kunden/Akquise/TEST-helfri/<datum>/facts.json fixtures/helfri/facts.json
npm test
```

Ändert sich dabei ein Testergebnis, ist zuerst zu klären, ob sich die **Website** geändert hat
oder eine **Regel** falsch liegt. Beim Aktualisieren `meta.audit_dir` auf `(fixture)` setzen,
damit kein lokaler Pfad in die Versionierung gerät.
