# Action 9: `lead_anlegen` (schreibend, Aktionstyp Ändern, im Agenten Hand)

Stand 21.10.2026. Ergänzt `EINRICHTUNG.md` (dort Kopf, Authentifizierung und Actions 1 bis 8). Endpunkt
`POST /api/agent/lead` ist live seit Deployment `6e3db0b7`.

Langdock → Integrations → `360ai CRM` → Add action.

**Name:** `lead_anlegen` · **Aktionstyp:** Ändern

**Beschreibung:** Das Feld kürzt bei rund 200 Zeichen. Eingerichtet am 21.10. mit der Kurzfassung „Legt einen neuen
Lead oder Kunden im CRM an, direkt in der Zielphase. Vorher immer leads_suchen. Bei 409 Treffer zeigen und fragen. Bei
angelegt:true nie erneut anlegen. Datum JJJJ-MM-TT.“ Langfassung (Regeln stehen zusätzlich in der Agent-Anweisung):
„Legt einen neuen Lead oder Kunden im CRM an, direkt in der richtigen Phase. Vorher IMMER leads_suchen mit Firma
und E-Mail aufrufen. Antwortet die Action mit 409 (mögliche Dublette), dem Nutzer die Treffer zeigen und nur nach
ausdrücklicher Bestätigung mit doppeltOk = ja erneut aufrufen. Kommt ok:false mit angelegt:true, ist der Lead schon
da: NICHT erneut anlegen, sondern mit phase_setzen nachholen. Datum immer als JJJJ-MM-TT.“

| Input (Bezeichnung → Feld-ID) | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| Firma → `firma` | TEXT | ja | Firmenname |
| Ansprechpartner → `ansprechpartner` | TEXT | nein | Vor- und Nachname, mehrere mit Komma |
| Straße → `strasse` | TEXT | nein | |
| Ort → `ort` | TEXT | nein | PLZ und Ort |
| Branche → `branche` | TEXT | nein | |
| Telefon → `telefon` | TEXT | nein | nur Ziffern, Leerzeichen, + ( ) / - |
| Handy → `handy` | TEXT | nein | |
| Mail → `mail` | TEXT | nein | |
| Website → `website` | TEXT | nein | https:// wird ergänzt, Leerzeichen entfernt |
| Anrede → `anrede` | SELECT | nein | `du`, `sie` |
| Kontaktquelle → `kontaktquelle` | SELECT | nein | `website`, `telefonat`, `empfehlung`, `direkt_mail`, `sonstiges` (Bestandskunde = sonstiges, in die Notiz schreiben) |
| Phase → `phase` | SELECT | nein | `neu`, `analysiert`, `kontaktiert`, `qualifiziert`, `fragebogen_raus`, `fragebogen_da`, `termin`, `angebot`, `gewonnen`, `kunde_betreuung`; leer = neu |
| Fällig am → `faelligAm` | TEXT | nein | Wiedervorlage JJJJ-MM-TT |
| Nächste Aktion → `nextAction` | SELECT | nein | `anruf`, `followup_call`, `followup_mail`, `wiedervorlage`, `antwort_bearbeiten`, `angebot_erstellen`, `termin`; leer + Datum = wiedervorlage |
| Notiz → `notiz` | MULTI_LINE_TEXT | nein | landet im Verlauf, gekennzeichnet mit „Langdock:“ |
| Doppelt ok → `doppeltOk` | SELECT | nein | `nein`, `ja`; nur nach Rückfrage beim Nutzer auf ja (Langdock hat keinen Ja/Nein-Typ, 21.10.) |

```javascript
const BASIS = 'https://360ai-akquise-crm.pages.dev/api/agent';
const kopf = {
  'CF-Access-Client-Id': data.auth.clientId,
  'CF-Access-Client-Secret': data.auth.clientSecret,
  'Content-Type': 'application/json',
};
const i = data.input;
const response = await ld.request({
  method: 'POST', url: BASIS + '/lead', headers: kopf,
  body: {
    firma: i.firma || '', ansprechpartner: i.ansprechpartner || '', strasse: i.strasse || '',
    ort: i.ort || '', branche: i.branche || '', telefon: i.telefon || '', handy: i.handy || '',
    mail: i.mail || '', website: i.website || '', anrede: i.anrede || '',
    kontaktquelle: i.kontaktquelle || '', phase: i.phase || 'neu', faellig_am: i.faelligAm || '',
    next_action: i.nextAction || '', notiz: i.notiz || '', doppelt_ok: i.doppeltOk === true || i.doppeltOk === 'ja',
  },
});
return response.json;
```

**Im Agenten „CRM-Assistent“:** Integration anklicken, bei `lead_anlegen` die **Hand** wählen (Bestätigen-Knopf).

**Ergänzung für die Anweisung des CRM-Assistenten:**
„Neuen Lead anlegen: erst leads_suchen mit Firma und mit E-Mail. Gibt es einen Treffer, nicht anlegen, sondern
nachfragen. Dann lead_anlegen mit allen genannten Stammdaten, Phase, Wiedervorlage (faelligAm) und einer kurzen Notiz,
woher der Kontakt kommt. Bei 409 die Treffer zeigen und fragen. Bei angelegt:true nie ein zweites Mal anlegen.“

**Stand 21.10.2026, 23:00:** Action angelegt (16 Felder), Test mit `zz-test` ok (L-20261021-zz-test-7at9: Phase
Angebot raus, Wiedervorlage 30.10., Notiz im Verlauf). Testlead danach per phase auf Verloren gesetzt, Archivieren
im CRM von Hand.

**Testen:** „Aktion testen“ führt sofort aus und legt wirklich an. Zum Test Firma `zz-test` verwenden, danach im CRM
archivieren.

**Antworten der Schnittstelle:**
- 200 `{ok:true, lead_id, phase, phase_label, next_action, next_action_at, geschrieben}`
- 400 ungültige Eingabe (nichts geschrieben)
- 409 `moegliche_dublette` mit `treffer` (nichts geschrieben)
- 502 CRM nicht lesbar (nichts geschrieben, später erneut)
- ok:false mit `angelegt:true` und `lead_id`: Lead existiert, ein Folgefeld fehlt → phase_setzen
- ok:false mit `angelegt:true` und „nur die Notiz fehlt“ → Notiz mit notiz_anhaengen nachtragen
- 504 `write_timeout` mit `angelegt:"unklar"`: CRM hat nicht geantwortet, Lead evtl. trotzdem da → NICHT erneut
  anlegen, nach einer Minute leads_suchen (seit 22.10.: Wartezeit 30 s, Nachlesen nach Abbruch, leere Leseantwort
  wird neu gelesen)

**Ergänzung für die Anweisung des CRM-Assistenten (22.10.):**
„Antwortet lead_anlegen mit write_timeout und angelegt "unklar", nicht erneut anlegen: eine Minute warten, dann
leads_suchen nach der Firma. Meldet die Antwort, dass nur die Notiz fehlt, die Notiz mit notiz_anhaengen nachtragen.
Fehlercodes dem Nutzer wörtlich nennen, nicht umdeuten.“
