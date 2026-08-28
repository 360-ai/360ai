# CSS-Build

`app.css` ist die gebündelte, ausgelieferte Datei. Sie wird **nicht** von Hand editiert.

## Neu bauen

```sh
cat fonts.css styles.css overrides.css refinements.css offer-carousel.css contact-conversion.css \
    statement-fan.css about-craft.css hero-planet.css hero-earth.css legal.css seo-local.css subpages.css polish.css \
  > app.css
```

Die Reihenfolge ist die alte `<link>`-Reihenfolge aus `index.html` plus `subpages.css` und `polish.css` als letzte Dateien.
`subpages.css` enthält die Styles der Leistungs- und Ratgeber-Unterseiten (Header, Hero, Sektionen, Artikel, 4-spaltiger Footer) und muss vor `polish.css` stehen.
Reihenfolge nicht ändern: spätere Dateien überschreiben bewusst frühere (z. B. `overrides.css`,
Doppel-Regeln in `styles.css`).

Quelldateien bleiben im Repo, werden aber nicht mehr direkt eingebunden. Änderungen immer in der
passenden Quelldatei machen, dann `app.css` neu bauen.
