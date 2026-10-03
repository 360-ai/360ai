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
function leererStand(){
  return { betrieb:{taetigkeit:"", personen:{auswahl:"", frei:""}, herkunft:"kunde"},
           programme:[], ziel:{text:"", kacheln:[]}, ablaeufe:[], nochEtwas:"", weissNicht:[] };
}
/* bereich: Zeile, in der ein eigenes Programm eingetragen wurde. Kacheln behalten ihren Bereich. */
function neuesProgramm(name, wofuer, herkunft, bereich){
  var k = kachelZu(name);
  return {id:id("prg"), name:k ? k.name : String(name || "").trim(), quelle:k ? "kachel" : "frei",
          bereich:k ? k.bereich : (bereich || ""), wofuer:wofuer || "", herkunft:herkunft || "kunde"};
}
function neuerSchritt(){
  return {id:id("stp"), was:"", womit:{programmId:"", art:"", frei:""}, weiter:{art:"", womit:""}};
}
function neuerAblauf(name, herkunft){
  return {id:id("abl"), name:name || "", herkunft:herkunft || "kunde",
          ausloeser:{auswahl:"", frei:""}, schritte:[], haeufigkeit:{auswahl:"", frei:""},
          dauer:{auswahl:"", frei:""}, aerger:{kacheln:[], frei:""}, bilder:[]};
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
  d.ablaeufe = d.ablaeufe.filter(function(a){ return a && typeof a === "object"; });
  d.ablaeufe.forEach(function(a){
    var std = neuerAblauf(""); delete std.id; mitStandard(a, std);
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
  if(!voll(s.betrieb.personen.auswahl) && !voll(s.betrieb.personen.frei)) fehlt("betrieb.personen", "Wie viele Personen");
  if(!s.programme.length) fehlt("programme", "Programme");
  var mitName = s.ablaeufe.filter(function(a){ return voll(a.name); });
  if(!mitName.length) fehlt("ablaeufe", "Mindestens ein Ablauf");
  mitName.forEach(function(a){
    var p = "ablauf:" + a.id + ":";
    if(!voll(a.ausloeser.auswahl) && !voll(a.ausloeser.frei)) fehlt(p+"ausloeser", a.name + ": Auslöser");
    if(a.schritte.filter(function(x){ return voll(x.was); }).length < 2) fehlt(p+"schritte", a.name + ": mindestens zwei Schritte");
    if(!voll(a.haeufigkeit.auswahl) && !voll(a.haeufigkeit.frei)) fehlt(p+"haeufigkeit", a.name + ": wie oft");
    if(!voll(a.dauer.auswahl) && !voll(a.dauer.frei)) fehlt(p+"dauer", a.name + ": wie lange");
  });
  return l;
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
var WEITER_KURZ = {automatisch:"automatisch", abgetippt:"abgetippt", weitergeleitet:"weitergeleitet",
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
    nochEtwas:k.nochEtwas, weissNicht:k.weissNicht
  };
}
function zeichen(v){ return Array.from(String(v || "")).length; }
function pruefen(d, kennung){
  var f = [];
  if(!d || d.type !== K.DOC_TYPE || d.schemaVersion !== K.SCHEMA_VERSION) f.push("Falscher Dokumenttyp oder falsche Version.");
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
  dokument:dokument, pruefen:pruefen
};
})();
