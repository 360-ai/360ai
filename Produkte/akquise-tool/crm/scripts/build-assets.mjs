import { access, copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules', '@fontsource-variable', 'outfit');
const filesRoot = path.join(packageRoot, 'files');
const assetsOutput = path.join(root, 'public', 'assets');
const fontOutput = path.join(assetsOutput, 'fonts');
const logoSource = path.join(root, 'assets', '360ai-logo.svg');

await access(packageRoot);
const files = await readdir(filesRoot);
const font = files.find((name) => name === 'outfit-latin-wght-normal.woff2')
  || files.find((name) => /^outfit-latin.*wght.*normal\.woff2$/.test(name));
if (!font) throw new Error('Outfit Variable Latin WOFF2 wurde im Font-Paket nicht gefunden');

await access(logoSource);
await mkdir(fontOutput, { recursive: true });
await copyFile(path.join(filesRoot, font), path.join(fontOutput, 'outfit-latin-variable.woff2'));
await copyFile(path.join(packageRoot, 'LICENSE'), path.join(fontOutput, 'OFL.txt'));
await copyFile(logoSource, path.join(assetsOutput, '360ai-logo.svg'));
console.log('Lokale Outfit-Webfont und 360ai-Logo bereitgestellt.');
