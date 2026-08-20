// Tests fuer die sichere Uebergabe der vier lokal erzeugten Berichte an WF-1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { berichtDateienLesen, mailDokumentLesen } from '../pipeline/abschluss.mjs';

const mitTempOrdner = async (fn) => {
  const wurzel = await mkdtemp(path.join(os.tmpdir(), 'akquise-berichte-test-'));
  try {
    const berichte = path.join(wurzel, 'berichte');
    await mkdir(berichte);
    return await fn(berichte);
  } finally {
    await rm(wurzel, { recursive: true, force: true });
  }
};

const satzSchreiben = async (ordner, datum, { ohne = null } = {}) => {
  const typen = [
    ['intern', 'md'], ['telefon', 'md'], ['mail', 'md'], ['kunde', 'html'],
  ];
  for (const [typ, endung] of typen) {
    if (typ === ohne) continue;
    await writeFile(path.join(ordner, `${datum}_${typ}.${endung}`), `${datum}:${typ}`, 'utf8');
  }
};

test('BerichtDateienLesen liefert genau den datierten Vierersatz in stabiler Reihenfolge', async () => {
  await mitTempOrdner(async (ordner) => {
    await satzSchreiben(ordner, '2026-08-15');
    await satzSchreiben(ordner, '2026-08-16');
    await writeFile(path.join(ordner, '2026-08-16_screenshot.png'), 'kein Bericht', 'utf8');
    await writeFile(path.join(ordner, 'notizen.txt'), 'nicht mitsenden', 'utf8');

    const r = await berichtDateienLesen(ordner, { datum: '2026-08-16T12:00:00Z' });
    assert.deepEqual(r.map((bericht) => bericht.dateiname), [
      '2026-08-16_intern.md',
      '2026-08-16_telefon.md',
      '2026-08-16_mail.md',
      '2026-08-16_kunde.html',
    ]);
    assert.deepEqual(
      r.map((bericht) => Buffer.from(bericht.inhalt_base64, 'base64').toString('utf8')),
      ['2026-08-16:intern', '2026-08-16:telefon', '2026-08-16:mail', '2026-08-16:kunde'],
    );
    assert.deepEqual(r.map((bericht) => bericht.mime_type), [
      'text/markdown; charset=utf-8',
      'text/markdown; charset=utf-8',
      'text/markdown; charset=utf-8',
      'text/html; charset=utf-8',
    ]);
  });
});

test('BerichtDateienLesen lehnt einen unvollstaendigen Satz ab', async () => {
  await mitTempOrdner(async (ordner) => {
    await satzSchreiben(ordner, '2026-08-16', { ohne: 'telefon' });
    await assert.rejects(
      berichtDateienLesen(ordner, { datum: '2026-08-16' }),
      /Berichtssatz 2026-08-16 unvollstaendig: telefon/,
    );
  });
});

test('BerichtDateienLesen blockiert einzelne Dateien ueber zwei MB', async () => {
  await mitTempOrdner(async (ordner) => {
    await satzSchreiben(ordner, '2026-08-16');
    await writeFile(
      path.join(ordner, '2026-08-16_intern.md'),
      Buffer.alloc(2 * 1024 * 1024 + 1, 65),
    );
    await assert.rejects(
      berichtDateienLesen(ordner, { datum: '2026-08-16' }),
      /groesser als 2 MB/,
    );
  });
});

test('BerichtDateienLesen gibt fuer einen noch nicht vorhandenen Berichtsordner leer zurueck', async () => {
  const nichtVorhanden = path.join(os.tmpdir(), `akquise-nicht-vorhanden-${Date.now()}`);
  assert.deepEqual(await berichtDateienLesen(nichtVorhanden), []);
});

test('MailDokumentLesen nimmt den Mailtext desselben Audit-Datums statt des neuesten', async () => {
  await mitTempOrdner(async (ordner) => {
    await writeFile(path.join(ordner, '2026-08-15_mail.md'), [
      '**Betreff:** Alter Betreff',
      '---',
      'Alter auditgenauer Mailtext',
      '---',
      '## Nicht in der Mail enthalten',
      'Interne Alt-Notiz',
    ].join('\n'), 'utf8');
    await writeFile(path.join(ordner, '2026-08-16_mail.md'), [
      '**Betreff:** Neuer Betreff',
      '---',
      'Neuer Mailtext',
      '---',
      '## Nicht in der Mail enthalten',
      'Interne Neu-Notiz',
    ].join('\n'), 'utf8');

    const alt = await mailDokumentLesen(ordner, { datum: '2026-08-15T14:00:00Z' });
    assert.equal(alt.betreff, 'Alter Betreff');
    assert.equal(alt.text, 'Alter auditgenauer Mailtext');

    const fehlt = await mailDokumentLesen(ordner, { datum: '2026-08-14' });
    assert.deepEqual(fehlt, { betreff: null, text: null });
  });
});
