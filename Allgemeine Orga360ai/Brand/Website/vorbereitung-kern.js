/* Reine Logik der 360ai-Vorbereitung v2, ohne DOM.
   Laeuft im Browser (klassisches Skript nach vorbereitung-fragen.js),
   in der Function (Seiteneffekt-Import) und unter node --test.
   Setzt globalThis.VB2_KERN. Kein require: der Functions-Bundle kennt
   keine Node-Module, globalThis.crypto gibt es ueberall. */
(function(){
"use strict";
var K = globalThis.VB2;

function rnd(){
  var a = new Uint8Array(6);
  globalThis.crypto.getRandomValues(a);
  return Array.prototype.map.call(a, function(b){ return ("0"+b.toString(16)).slice(-2); }).join("");
}
function id(p){ return p + "-" + rnd(); }
function voll(v){ return v !== undefined && v !== null && String(v).trim() !== ""; }
function kopie(o){ return JSON.parse(JSON.stringify(o)); }

/* ---------------------------------------------------------------- Stand */
function alleKacheln(){
  var l = [];
  K.PROGRAMM_BEREICHE.forEach(function(b){ b.kacheln.forEach(function(k){ l.push({name:k, bereich:b.id}); }); });
  return l;
}
function kachelZu(name){
  var n = String(name || "").trim().toLowerCase();
  var l = alleKacheln();
  for(var i=0;i<l.length;i++) if(l[i].name.toLowerCase() === n) return l[i];
  return null;
}
function wahlLeer(){ return {auswahl:"", frei:""}; }
function leeresExtra(){
  return { betreut:"", wechsel:wahlLeer(), vorlagen:"", daten:{kacheln:[], frei:""},
           imAblauf:"", testet:"", nutzer:wahlLeer(), entscheider:"", probiert:"",
           zieltermin:wahlLeer(), budgetEinmal:wahlLeer(), budgetLaufend:wahlLeer(), grenzen:{kacheln:[], frei:""} };
}
/* Feld der Extra-Runde, Kennung im Gespraechsbogen, Kurzname fuer die Mail. */
var EXTRA_FELDER = [
  ["betreut","B04","Wer betreut die Programme"], ["wechsel","B05","Wechsel geplant"], ["vorlagen","B03","Wo liegen Vorlagen"],
  ["daten","D01","Datenarten"], ["imAblauf","A03","Wer arbeitet täglich im Ablauf"], ["testet","D04","Wer testet und betreut"],
  ["nutzer","D06","Anzahl Nutzer"], ["entscheider","E04","Wer entscheidet"], ["probiert","A06","Schon ausprobiert"],
  ["zieltermin","E03","Zieltermin"], ["budgetEinmal","E01","Rahmen einmalig"], ["budgetLaufend","E02","Rahmen laufend"],
  ["grenzen","D02","Was eine Lösung nie tun darf"]
];
function extraWert(v){
  if(v === null || v === undefined) return "";
  if(typeof v === "string") return v.trim();
  var teile = [];
  if(Array.isArray(v.kacheln)) teile = teile.concat(v.kacheln);
  if(voll(v.auswahl)) teile.push(v.auswahl);
  if(voll(v.frei)) teile.push(String(v.frei).trim());
  return teile.join(", ");
}
function extraBeantwortet(s){
  var e = s.extra || {};
  return EXTRA_FELDER.map(function(f){ return {feld:f[0], code:f[1], titel:f[2], wert:extraWert(e[f[0]])}; })
                     .filter(function(x){ return voll(x.wert); });
}
function leererStand(){
  return { betrieb:{taetigkeit:"", personen:{auswahl:"", frei:"", buero:"", draussen:"", azubis:""}, herkunft:"kunde"},
           programme:[], ziel:{text:"", kacheln:[]}, ablaeufe:[], nochEtwas:"", weissNicht:[],
           extra:leeresExtra() };
}
/* bereich: Zeile, in der ein eigenes Programm eingetragen wurde. Kacheln behalten ihren Bereich. */
function neuesProgramm(name, wofuer, herkunft, bereich){
  var k = kachelZu(name);
  return {id:id("prg"), name:k ? k.name : String(name || "").trim(), quelle:k ? "kachel" : "frei",
          bereich:k ? k.bereich : (bereich || ""), wofuer:wofuer || "", herkunft:herkunft || "kunde", details:{}};
}
function neuerSchritt(){
  return {id:id("stp"), was:"", womit:{programmId:"", art:"", frei:""}, weiter:{art:"", womit:""}};
}
function neuerAblauf(name, herkunft){
  return {id:id("abl"), name:name || "", herkunft:herkunft || "kunde",
          ausloeser:{kacheln:[], auswahl:"", frei:""}, schritte:[], haeufigkeit:{auswahl:"", frei:"", proWoche:""},
          dauer:{auswahl:"", frei:""}, mengePasst:"", aerger:{kacheln:[], frei:""}, bilder:[]};
}
function prefillAnwenden(s, p){
  if(!p) return s;
  if(p.betrieb && voll(p.betrieb.taetigkeit)){ s.betrieb.taetigkeit = p.betrieb.taetigkeit; s.betrieb.herkunft = "vorbelegt"; }
  (p.programme || []).forEach(function(x){ if(x && voll(x.name)) s.programme.push(neuesProgramm(x.name, x.wofuer, "vorbelegt")); });
  (p.ablaeufe || []).slice(0, K.MAX_ABLAEUFE).forEach(function(x){ if(x && voll(x.name)) s.ablaeufe.push(neuerAblauf(x.name, "vorbelegt")); });
  return s;
}

/* Fuellt fehlende Teilobjekte mit Standardwerten. Schuetzt Kern und Server
   vor alten oder unvollstaendigen Staenden (sonst TypeError, 500 statt 400). */
function mitStandard(ziel, std){
  Object.keys(std).forEach(function(k){
    if(ziel[k] === undefined || ziel[k] === null) ziel[k] = kopie(std[k]);
    else if(std[k] && typeof std[k] === "object" && !Array.isArray(std[k]) && typeof ziel[k] === "object") mitStandard(ziel[k], std[k]);
  });
  return ziel;
}
function normalisieren(d){
  mitStandard(d, leererStand());
  if(!Array.isArray(d.programme)) d.programme = [];
  if(!Array.isArray(d.ablaeufe)) d.ablaeufe = [];
  if(!Array.isArray(d.weissNicht)) d.weissNicht = [];
  d.programme = d.programme.filter(function(p){ return p && typeof p === "object"; });
  d.programme.forEach(function(p){
    if(!p.details || typeof p.details !== "object" || Array.isArray(p.details)) p.details = {};
    /* Eigener Eintrag, fuer den es inzwischen eine Kachel gibt (z. B. ChatGPT seit v2.1): zuordnen. */
    var k = p.quelle === "frei" ? kachelZu(p.name) : null;
    if(k){ p.quelle = "kachel"; p.bereich = k.bereich; p.name = k.name; }
  });
  d.ablaeufe = d.ablaeufe.filter(function(a){ return a && typeof a === "object"; });
  d.ablaeufe.forEach(function(a){
    var std = neuerAblauf(""); delete std.id; mitStandard(a, std);
    if(!Array.isArray(a.ausloeser.kacheln)) a.ausloeser.kacheln = [];
    /* Schema 2.0.0 hatte nur eine Auswahl: in die Mehrfachauswahl uebernehmen. */
    if(voll(a.ausloeser.auswahl)){
      if(a.ausloeser.kacheln.indexOf(a.ausloeser.auswahl) < 0) a.ausloeser.kacheln.push(a.ausloeser.auswahl);
      a.ausloeser.auswahl = "";
    }
    if(!Array.isArray(a.schritte)) a.schritte = [];
    a.schritte = a.schritte.filter(function(x){ return x && typeof x === "object"; });
    a.schritte.forEach(function(x){ var ss = neuerSchritt(); delete ss.id; mitStandard(x, ss); });
  });
  return d;
}

/* ---------------------------------------------------------------- Luecken */
function istWN(s, k){ return s.weissNicht.indexOf(k) >= 0; }
function luecken(s){
  var l = [];
  function fehlt(k, text){ if(!istWN(s, k)) l.push({schluessel:k, text:text}); }
  if(!voll(s.betrieb.taetigkeit)) fehlt("betrieb.taetigkeit", "Was der Betrieb macht");
  var ps = s.betrieb.personen;
  if(!voll(ps.auswahl) && !voll(ps.frei) && !voll(ps.buero) && !voll(ps.draussen)) fehlt("betrieb.personen", "Wie viele Personen");
  if(!s.programme.length) fehlt("programme", "Programme");
  var mitName = s.ablaeufe.filter(function(a){ return voll(a.name); });
  if(!mitName.length) fehlt("ablaeufe", "Mindestens ein Ablauf");
  mitName.forEach(function(a){
    var p = "ablauf:" + a.id + ":";
    if(!a.ausloeser.kacheln.length && !voll(a.ausloeser.auswahl) && !voll(a.ausloeser.frei)) fehlt(p+"ausloeser", a.name + ": Auslöser");
    if(a.schritte.filter(function(x){ return voll(x.was); }).length < 2) fehlt(p+"schritte", a.name + ": mindestens zwei Schritte");
    else if(uebergaengeOffen(a).length) fehlt(p+"uebergaenge", a.name + ": wie es von Schritt zu Schritt weitergeht");
    if(!voll(a.haeufigkeit.auswahl) && !voll(a.haeufigkeit.frei) && !voll(a.haeufigkeit.proWoche)) fehlt(p+"haeufigkeit", a.name + ": wie oft");
    if(!voll(a.dauer.auswahl) && !voll(a.dauer.frei)) fehlt(p+"dauer", a.name + ": wie lange");
  });
  return l;
}

/* Schritte (mit Inhalt), nach denen der Uebergang nicht angegeben ist. Der letzte hat keinen. */
function uebergaengeOffen(a){
  var sch = schritteMitInhalt(a), l = [];
  for(var i=0;i<sch.length-1;i++) if(!voll(sch[i].weiter.art)) l.push(i);
  return l;
}

/* ---------------------------------------------------------------- Menge */
function zahlen(v){
  var m = String(v || "").replace(/,/g, ".").match(/\d+(\.\d+)?/g);
  return m ? m.map(Number).filter(function(n){ return n > 0; }) : [];
}
/* Hochrechnung Stunden pro Woche aus wie oft und Dauer je Vorgang. null, wenn zu ungenau. */
function wochenStunden(a){
  var oft = null, n = zahlen(a.haeufigkeit.proWoche);
  if(n.length) oft = [n[0], n[n.length > 1 ? 1 : 0]];
  else if(K.HAEUFIGKEIT_PRO_WOCHE[a.haeufigkeit.auswahl]) oft = K.HAEUFIGKEIT_PRO_WOCHE[a.haeufigkeit.auswahl];
  var min = K.DAUER_MINUTEN[a.dauer.auswahl] || null;
  if(!oft || !min) return null;
  return {von:oft[0] * min[0] / 60, bis:oft[1] * min[1] / 60};
}
function zahlText(x){ return String(Math.round(x * 10) / 10).replace(".", ","); }
function stundenText(w){
  if(!w) return "";
  if(w.bis <= 1){
    var a = Math.max(1, Math.round(w.von * 60)), b = Math.max(1, Math.round(w.bis * 60));
    return (a === b ? a : a + " bis " + b) + " Min. pro Woche";
  }
  var v = zahlText(w.von), z = zahlText(w.bis);
  return (v === z ? v : v + " bis " + z) + " Std. pro Woche";
}
function ausloeserText(a){
  var x = a.ausloeser, l = (x.kacheln || []).slice();
  if(voll(x.auswahl) && l.indexOf(x.auswahl) < 0) l.push(x.auswahl);
  if(voll(x.frei)) l.push(String(x.frei).trim());
  return l.join(", ");
}

/* ---------------------------------------------------------------- Rueckfragen am Programm */
function rueckfragenFuer(p){
  return K.RUECKFRAGEN.filter(function(r){
    if(r.bereiche && r.bereiche.indexOf(p.bereich) >= 0) return true;
    if(r.namen && p.quelle === "kachel" && r.namen.indexOf(p.name) >= 0) return true;
    if(r.frei && p.quelle === "frei" && r.frei.indexOf(p.bereich || "") >= 0) return true;
    return false;
  });
}
/* Je Programm: beantwortete und offene Rueckfragen ("weiss nicht" zaehlt als offen). */
function rueckfragenStand(s){
  return s.programme.map(function(p){
    var fr = rueckfragenFuer(p), d = p.details || {};
    return {
      name:p.name,
      antworten:fr.filter(function(r){ return voll(d[r.id]) && d[r.id] !== K.RUECK_WEISSNICHT; })
                  .map(function(r){ return {kurz:r.kurz, wert:d[r.id]}; }),
      offen:fr.filter(function(r){ return !voll(d[r.id]) || d[r.id] === K.RUECK_WEISSNICHT; }).map(function(r){ return r.kurz; })
    };
  }).filter(function(x){ return x.antworten.length || x.offen.length; });
}

/* ---------------------------------------------------------------- Kette */
function womitName(w, programme){
  if(w.programmId){ for(var i=0;i<programme.length;i++) if(programme[i].id === w.programmId) return programme[i].name; }
  if(voll(w.frei)) return String(w.frei).trim();
  for(var j=0;j<K.WOMIT_EXTRA.length;j++){
    if(K.WOMIT_EXTRA[j].id === w.art) return K.WOMIT_EXTRA[j].titel.replace(/^./, function(c){ return c.toUpperCase(); });
  }
  return "";
}
var WEITER_KURZ = {automatisch:"automatisch", abgetippt:"abgetippt", weitergeleitet:"weitergeleitet", uebergeben:"übergeben",
                   bescheid:"Bescheid gesagt", weissnicht:"?"};
function weiterKurz(art){ return WEITER_KURZ[art] || ""; }
function schritteMitInhalt(a){ return a.schritte.filter(function(x){ return voll(x.was); }); }
function ketteText(a, programme){
  var teile = [];
  var sch = schritteMitInhalt(a);
  sch.forEach(function(x, i){
    var w = womitName(x.womit, programme);
    teile.push(String(x.was).trim() + (w ? " (" + w + ")" : ""));
    if(i < sch.length - 1){
      var t = weiterKurz(x.weiter.art) || "?";
      teile.push(t + (x.weiter.art === "automatisch" && voll(x.weiter.womit) ? " (" + String(x.weiter.womit).trim() + ")" : ""));
    }
  });
  return teile.join(" → ");
}
function programmkarte(s){
  var paare = [];
  s.ablaeufe.forEach(function(a){
    var sch = schritteMitInhalt(a);
    for(var i=0;i<sch.length-1;i++){
      var von = womitName(sch[i].womit, s.programme), nach = womitName(sch[i+1].womit, s.programme);
      if(!von || !nach || von === nach) continue;
      paare.push({von:von, nach:nach, art:sch[i].weiter.art || "", womit:String(sch[i].weiter.womit || "").trim(), ablauf:a.name});
    }
  });
  return paare;
}
function programmInVerwendung(s, pid){
  return s.ablaeufe.filter(function(a){ return a.schritte.some(function(x){ return x.womit.programmId === pid; }); })
                   .map(function(a){ return a.name; });
}
function programmEntfernen(s, pid){
  var p = null;
  s.programme = s.programme.filter(function(x){ if(x.id === pid){ p = x; return false; } return true; });
  if(!p) return;
  s.ablaeufe.forEach(function(a){ a.schritte.forEach(function(x){
    if(x.womit.programmId === pid){ x.womit.programmId = ""; x.womit.frei = p.name; }
  }); });
}

/* ---------------------------------------------------------------- Dokument */
function dokument(s, m){
  var k = normalisieren(kopie(s));
  k.programme = k.programme.filter(function(p){ return voll(p.name); });
  k.ablaeufe = k.ablaeufe.filter(function(a){ return voll(a.name) || a.schritte.some(function(x){ return voll(x.was); }); });
  k.ablaeufe.forEach(function(a){
    a.schritte = a.schritte.filter(function(x){ return voll(x.was) || voll(x.womit.frei) || x.womit.programmId; });
  });
  return {
    type:K.DOC_TYPE, schemaVersion:K.SCHEMA_VERSION, questionnaireVersion:K.QUESTIONNAIRE_VERSION,
    questionnaireId:m.kennung, submissionId:m.submissionId || id("sub"),
    revision: m.unveraendert ? m.lastRevision : m.lastRevision + 1,
    baseSubmissionId: m.unveraendert ? null : (m.lastSubmissionId || null),
    supersedesSubmissionId: m.unveraendert ? null : (m.lastSubmissionId || null),
    createdAt:m.createdAt, exportedAt:new Date().toISOString(), customerReference:m.kunde || "",
    anrede:m.anrede === "du" ? "du" : "sie",
    betrieb:k.betrieb, programme:k.programme, ziel:k.ziel, ablaeufe:k.ablaeufe,
    extra:k.extra, nochEtwas:k.nochEtwas, weissNicht:k.weissNicht
  };
}
function zeichen(v){ return Array.from(String(v || "")).length; }
function pruefen(d, kennung){
  var f = [];
  if(!d || d.type !== K.DOC_TYPE || K.SCHEMA_VERSIONEN_OK.indexOf(d.schemaVersion) < 0) f.push("Falscher Dokumenttyp oder falsche Version.");
  if(!d || d.questionnaireId !== kennung) f.push("Kennung passt nicht zu dieser Vorbereitung.");
  if(!d || !Array.isArray(d.ablaeufe) || !Array.isArray(d.programme)){ f.push("Abläufe oder Programme fehlen."); return f; }
  if(d.ablaeufe.length > K.MAX_ABLAEUFE) f.push("Mehr als " + K.MAX_ABLAEUFE + " Abläufe.");
  if(d.programme.length > K.MAX_PROGRAMME) f.push("Mehr als " + K.MAX_PROGRAMME + " Programme.");
  d.ablaeufe.forEach(function(a){
    if((a.schritte || []).length > K.MAX_SCHRITTE) f.push("Ablauf mit mehr als " + K.MAX_SCHRITTE + " Schritten.");
  });
  (function lauf(v, pfad){
    if(typeof v === "string"){ if(zeichen(v) > K.MAX_TEXT) f.push(pfad + ": mehr als " + K.MAX_TEXT + " Zeichen."); return; }
    if(v && typeof v === "object") Object.keys(v).forEach(function(k){ lauf(v[k], pfad ? pfad + "." + k : k); });
  })(d, "");
  return f;
}

globalThis.VB2_KERN = {
  leererStand:leererStand, neuesProgramm:neuesProgramm, neuerSchritt:neuerSchritt, neuerAblauf:neuerAblauf,
  prefillAnwenden:prefillAnwenden, kachelZu:kachelZu, voll:voll, normalisieren:normalisieren,
  luecken:luecken, womitName:womitName, weiterKurz:weiterKurz, ketteText:ketteText, programmkarte:programmkarte,
  programmInVerwendung:programmInVerwendung, programmEntfernen:programmEntfernen,
  dokument:dokument, pruefen:pruefen, extraBeantwortet:extraBeantwortet, EXTRA_FELDER:EXTRA_FELDER,
  uebergaengeOffen:uebergaengeOffen, wochenStunden:wochenStunden, stundenText:stundenText, ausloeserText:ausloeserText,
  rueckfragenFuer:rueckfragenFuer, rueckfragenStand:rueckfragenStand
};
})();
