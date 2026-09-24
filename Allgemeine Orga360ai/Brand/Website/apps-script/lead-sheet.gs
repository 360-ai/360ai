/**
 * Nimmt bestaetigte Leads der Seite /ki-startleitfaden entgegen und schreibt sie
 * in die Lasche BLATT_NAME dieser Datei (wird angelegt, falls sie fehlt).
 *
 * Einrichtung siehe LEAD-FUNNEL-SETUP.md im Ordner Brand/Website.
 * Wichtig: SECRET muss exakt dem Wert entsprechen, der in Cloudflare unter
 * SHEET_SECRET hinterlegt ist. Die Web-App-Adresse ist oeffentlich erreichbar,
 * das Secret ist der einzige Schutz davor, dass Fremde Zeilen eintragen.
 */

var SECRET = 'HIER_DAS_SHEET_SECRET_EINSETZEN';

// Name der Lasche, in die geschrieben wird. Wird angelegt, falls sie fehlt.
var BLATT_NAME = 'leadmagnet';

var KOPF = [
  'Zeitstempel Anfrage',
  'Zeitstempel Bestaetigung',
  'Vorname',
  'Nachname',
  'Firma',
  'E-Mail',
  'Dokument',
  'Einwilligung',
  'Einwilligungstext Version',
  'IP bei Bestaetigung',
  'User Agent',
  'Quelle',
  'Abgemeldet am'
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Ohne Sperre koennen zwei gleichzeitige Anmeldungen in dieselbe Zeile schreiben.
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);

    if (d.secret !== SECRET) {
      return ContentService.createTextOutput('fehler: falsches secret');
    }

    var blatt = blattHolen();

    if (blatt.getLastRow() === 0) {
      blatt.appendRow(KOPF);
      blatt.getRange(1, 1, 1, KOPF.length).setFontWeight('bold');
      blatt.setFrozenRows(1);
    }

    // Doppelklick auf den Bestaetigungslink darf keine zweite Zeile erzeugen.
    var vorhanden = blatt.getLastRow() > 1
      ? blatt.getRange(2, 6, blatt.getLastRow() - 1, 2).getValues()
      : [];
    for (var i = 0; i < vorhanden.length; i++) {
      if (String(vorhanden[i][0]).toLowerCase() === String(d.email).toLowerCase()
          && String(vorhanden[i][1]) === String(d.dokument)) {
        return ContentService.createTextOutput('ok (bereits vorhanden)');
      }
    }

    blatt.appendRow([
      datum(d.zeitstempel_anfrage),
      datum(d.zeitstempel_bestaetigung),
      d.vorname || '',
      d.nachname || '',
      d.firma || '',
      d.email || '',
      d.dokument || '',
      d.einwilligung || '',
      d.einwilligungstext_version || '',
      d.ip_bestaetigung || '',
      d.user_agent || '',
      d.quelle || '',
      ''
    ]);

    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('fehler: ' + err);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Liefert die Lasche BLATT_NAME. Gibt es sie nicht, wird sie angelegt.
 * Wichtig: niemals in die erste Lasche schreiben. In derselben Datei liegen
 * CRM- und Kundendaten, dort wuerden Leadzeilen unten drangehaengt.
 */
function blattHolen() {
  var datei = SpreadsheetApp.getActiveSpreadsheet();
  var blaetter = datei.getSheets();
  for (var i = 0; i < blaetter.length; i++) {
    if (blaetter[i].getName().toLowerCase() === BLATT_NAME.toLowerCase()) {
      return blaetter[i];
    }
  }
  return datei.insertSheet(BLATT_NAME);
}

function datum(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d;
}

/** Nur zum Testen in der Apps-Script-Oberflaeche. */
function testEintrag() {
  var antwort = doPost({
    postData: {
      contents: JSON.stringify({
        secret: SECRET,
        zeitstempel_anfrage: new Date().toISOString(),
        zeitstempel_bestaetigung: new Date().toISOString(),
        vorname: 'Test',
        nachname: 'Eintrag',
        firma: 'Testfirma',
        email: 'test@example.com',
        dokument: 'startleitfaden',
        einwilligung: 'ja, Double-Opt-In bestaetigt',
        einwilligungstext_version: 'v1-2026-09-16',
        ip_bestaetigung: '0.0.0.0',
        user_agent: 'Test',
        quelle: 'test'
      })
    }
  });
  Logger.log(antwort.getContent());
}
