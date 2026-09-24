// MOB - Mobil und Barrierefreiheit. Zaehlt zur Achse "technik".
// Diese Regeln messen Geometrie und Attribute. Ob ein Handlungsknopf gut ist,
// entscheidet erst die Bewertungsstufe.

import { pass, warn, fail, unknown, prozent, pfad } from './_helfer.mjs';

export default [
  {
    id: 'MOB-01',
    name: 'VIEWPORT_META',
    gruppe: 'mobil', achse: 'technik', gewicht: 3, kundentext_erlaubt: true,
    messung: 'meta[name=viewport] der Startseite',
    pruefe(facts) {
      const m = facts.mobile;
      if (!m || m.viewport_meta === undefined) return unknown('Mobilmessung fehlt');
      if (!m.viewport_meta) return fail('Die Seite enthaelt keine Angabe zur Darstellung auf Mobilgeraeten.', { viewport: null });
      if (!m.has_width_device_width) return warn('Die Angabe zur Mobildarstellung passt sich nicht der Geraetebreite an.', { viewport: m.viewport_meta });
      return pass('Die Seite ist fuer die Darstellung auf Mobilgeraeten eingerichtet.', { viewport: m.viewport_meta });
    },
  },
  {
    id: 'MOB-02',
    name: 'ZOOM_NOT_BLOCKED',
    gruppe: 'mobil', achse: 'technik', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Attribute user-scalable und maximum-scale im viewport-Meta',
    pruefe(facts) {
      const m = facts.mobile;
      if (!m || m.viewport_meta === undefined) return unknown('Mobilmessung fehlt');
      if (!m.viewport_meta) return unknown('kein viewport-Meta vorhanden');
      const maxScale = m.maximum_scale != null ? Number(m.maximum_scale) : null;
      const wert = { user_scalable: m.user_scalable, maximum_scale: maxScale };

      if (m.user_scalable === false || maxScale === 1) {
        return fail('Auf dem Smartphone laesst sich die Schrift nicht vergroessern; das Vergroessern ist gesperrt.', wert);
      }
      if (maxScale != null && maxScale > 1 && maxScale < 2) {
        return warn(`Das Vergroessern auf dem Smartphone ist auf das ${maxScale}-fache begrenzt.`, wert);
      }
      return pass('Die Schrift laesst sich auf dem Smartphone frei vergroessern.', wert);
    },
  },
  {
    id: 'MOB-03',
    name: 'NO_HORIZONTAL_OVERFLOW',
    gruppe: 'mobil', achse: 'technik', gewicht: 3, kundentext_erlaubt: true,
    messung: 'Ansicht bei 375 Pixel Breite, scrollWidth gegen clientWidth',
    pruefe(facts) {
      const m = facts.mobile;
      if (!m || m.overflow_checked == null) return unknown('Ueberlaufmessung fehlt');
      const betroffen = m.overflow_pages ?? [];
      const wert = { betroffen: betroffen.length, geprueft: m.overflow_checked, seiten: betroffen.slice(0, 4).map((x) => pfad(x.url)) };
      if (betroffen.length >= 2) return fail(`Auf ${betroffen.length} von ${m.overflow_checked} geprueften Seiten laesst sich die Ansicht auf dem Handy seitlich verschieben.`, wert);
      if (betroffen.length === 1) return warn('Auf einer Seite laesst sich die Ansicht auf dem Handy seitlich verschieben.', wert);
      return pass(`Auf allen ${m.overflow_checked} geprueften Seiten passt die Mobilansicht in die Bildschirmbreite.`, wert);
    },
  },
  {
    id: 'MOB-04',
    name: 'BASE_FONT_SIZE',
    gruppe: 'mobil', achse: 'technik', gewicht: 1, kundentext_erlaubt: true,
    messung: 'Berechnete Schriftgroesse des laengsten Textblocks in der Mobilansicht',
    pruefe(facts) {
      const px = facts.mobile?.base_font_px;
      if (px == null) return unknown('keine Schriftgroesse gemessen');
      const wert = { pixel: Math.round(px) };
      if (px < 14) return fail(`Der Fliesstext ist auf dem Handy nur ${Math.round(px)} Pixel gross.`, wert);
      if (px < 16) return warn(`Der Fliesstext ist auf dem Handy ${Math.round(px)} Pixel gross.`, wert);
      return pass(`Der Fliesstext ist auf dem Handy ${Math.round(px)} Pixel gross.`, wert);
    },
  },
  {
    id: 'MOB-05',
    name: 'TAP_TARGET_SIZE',
    gruppe: 'mobil', achse: 'technik', gewicht: 1, kundentext_erlaubt: false,
    messung: 'Anteil bedienbarer Elemente unter 44 mal 44 Pixel in der Mobilansicht',
    pruefe(facts) {
      const m = facts.mobile;
      if (m?.interactive_total == null || !m.interactive_total) return unknown('keine bedienbaren Elemente gemessen');
      const anteil = prozent(m.interactive_small, m.interactive_total);
      const wert = { anteil_prozent: anteil, klein: m.interactive_small, gesamt: m.interactive_total };
      if (anteil > 25) return fail(`${anteil} Prozent der anklickbaren Elemente sind kleiner als die empfohlene Mindestgroesse.`, wert);
      if (anteil > 10) return warn(`${anteil} Prozent der anklickbaren Elemente sind kleiner als die empfohlene Mindestgroesse.`, wert);
      return pass('Die anklickbaren Elemente sind ausreichend gross.', wert);
    },
  },
  {
    id: 'MOB-06',
    name: 'CTA_IN_FIRST_VIEWPORT',
    gruppe: 'mobil', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Sichtbares Link- oder Schaltflaechenelement mit Bounding Box vollstaendig in den ersten 800 Pixeln, mobil',
    pruefe(facts) {
      const el = facts.mobile?.first_screen_elements;
      if (!Array.isArray(el)) return unknown('Mobilmessung fehlt');

      const kontakt = el.filter((e) => e.is_tel || e.is_mail
        || /anfrage|angebot|kontakt|termin|anrufen|beraten|buchen|reservier/i.test(e.text ?? ''));
      const wert = {
        elemente_gesamt: el.length,
        kontaktwege: kontakt.length,
        beispiele: el.slice(0, 6).map((e) => e.text).filter(Boolean),
      };

      if (!el.length) return fail('Im ersten Bildschirm der Mobilansicht ist kein anklickbares Element sichtbar.', wert);
      if (!kontakt.length) return warn('Im ersten Bildschirm der Mobilansicht wird kein Weg zur Kontaktaufnahme angeboten, nur Navigation.', wert);
      return pass('Im ersten Bildschirm der Mobilansicht wird ein Weg zur Kontaktaufnahme angeboten.', wert);
    },
  },
  {
    id: 'MOB-07',
    name: 'CONTRAST_MAIN_TEXT',
    gruppe: 'mobil', achse: 'technik', gewicht: 2, kundentext_erlaubt: true,
    messung: 'Kontrastverhaeltnis des laengsten Textblocks zum dahinterliegenden Hintergrund',
    pruefe(facts) {
      const c = facts.mobile?.contrast_ratio;
      if (c == null) return unknown('kein Kontrastwert gemessen');
      const wert = { verhaeltnis: c };
      if (c < 3) return fail(`Der Fliesstext hebt sich mit einem Verhaeltnis von ${c} zu 1 kaum vom Hintergrund ab.`, wert);
      if (c < 4.5) return warn(`Der Kontrast des Fliesstexts liegt bei ${c} zu 1 und damit unter der Empfehlung.`, wert);
      return pass(`Der Fliesstext hebt sich mit ${c} zu 1 deutlich vom Hintergrund ab.`, wert);
    },
  },
];
