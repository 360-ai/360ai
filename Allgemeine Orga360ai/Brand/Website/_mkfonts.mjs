import fs from "node:fs";
const css = fs.readFileSync("gf.css", "utf8");
let out = `/* fonts.css — lokal gehostete Schriften (Manrope, DM Mono), latin + latin-ext.
   Aus Google Fonts extrahiert am 2026-08-28. Neu bauen: node _mkfonts.mjs (nur bei Font-Update noetig). */\n\n`;
const dl = [];
const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const subset = m[1];
  if (subset !== "latin" && subset !== "latin-ext") continue;
  const body = m[2];
  const fam = body.match(/font-family:\s*'([^']+)'/)[1];
  const wght = body.match(/font-weight:\s*(\d+)/)[1];
  const url = body.match(/url\(([^)]+)\)/)[1];
  const range = body.match(/unicode-range:\s*([^;]+);/)[1].trim();
  const slug = fam.toLowerCase().replace(/\s+/g, "-") + "-" + wght + "-" + subset + ".woff2";
  dl.push(url + " " + slug);
  out += `@font-face {\n  font-family: '${fam}';\n  font-style: normal;\n  font-weight: ${wght};\n  font-display: swap;\n  src: url(assets/fonts/${slug}) format("woff2");\n  unicode-range: ${range};\n}\n\n`;
}
fs.writeFileSync("fonts.css", out);
fs.writeFileSync("_dl.txt", dl.join("\n") + "\n");
console.log("font-face blocks:", dl.length);
