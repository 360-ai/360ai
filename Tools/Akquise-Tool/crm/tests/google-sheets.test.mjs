import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from 'jose';

import {
  batchRangesToData,
  getGoogleAccessToken,
  readCrmSheets,
  resetGoogleTokenCache,
  rowsToObjects,
} from '../functions/lib/google-sheets.js';

async function googleEnv() {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const pem = await exportPKCS8(privateKey);
  return {
    env: {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'crm-reader@example.iam.gserviceaccount.com',
      GOOGLE_PRIVATE_KEY_ID: 'key-1',
      GOOGLE_PRIVATE_KEY_B64: Buffer.from(pem, 'utf8').toString('base64'),
      GOOGLE_SPREADSHEET_ID: 'sheet/id with spaces',
    },
    publicKey,
  };
}

test('Sheet-Zeilen werden anhand der Kopfzeile dynamisch abgebildet', () => {
  assert.deepEqual(rowsToObjects([
    ['lead_id', 'firma', '', 'status'],
    ['L-1', 'Alpha', 'ignorieren', 'neu'],
    ['', '', '', ''],
    ['L-2', '', '', 'angebot'],
  ]), [
    { lead_id: 'L-1', firma: 'Alpha', status: 'neu' },
    { lead_id: 'L-2', firma: '', status: 'angebot' },
  ]);
  assert.deepEqual(rowsToObjects([]), []);
  assert.deepEqual(rowsToObjects([['', '']]), []);
});

test('Batch-Antwort ordnet Leads, Activities und Audits unabhaengig von der Reihenfolge zu', () => {
  const data = batchRangesToData([
    { range: 'Activities!A1:C2', values: [['activity_id'], ['A-1']] },
    { range: "'Leads'!A1:C2", values: [['lead_id'], ['L-1']] },
  ]);
  assert.deepEqual(data.leads, [{ lead_id: 'L-1' }]);
  assert.deepEqual(data.activities, [{ activity_id: 'A-1' }]);
  assert.deepEqual(data.audits, []);
});

test('Service-Account-Assertion ist kurzlebig und auf Sheets readonly begrenzt', async () => {
  resetGoogleTokenCache();
  const { env, publicKey } = await googleEnv();
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.method, 'POST');
    const assertion = new URLSearchParams(options.body).get('assertion');
    const { payload, protectedHeader } = await jwtVerify(assertion, publicKey, {
      issuer: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      audience: 'https://oauth2.googleapis.com/token',
      algorithms: ['RS256'],
    });
    assert.equal(protectedHeader.kid, env.GOOGLE_PRIVATE_KEY_ID);
    assert.equal(payload.scope, 'https://www.googleapis.com/auth/spreadsheets.readonly');
    assert.ok(payload.exp - payload.iat <= 3600);
    return Response.json({ access_token: 'token-abc', expires_in: 3600 });
  };
  assert.equal(await getGoogleAccessToken(env, fetchImpl), 'token-abc');
  assert.equal(await getGoogleAccessToken(env, fetchImpl), 'token-abc');
  assert.equal(calls, 1, 'Token wird bis kurz vor Ablauf wiederverwendet');
  resetGoogleTokenCache();
});

test('CRM liest alle drei Tabellen in einem Batch und setzt das Bearer-Token', async () => {
  resetGoogleTokenCache();
  const { env } = await googleEnv();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'read-token', expires_in: 3600 });
    }
    return Response.json({ valueRanges: [
      { range: 'Leads!A1:B2', values: [['lead_id', 'firma'], ['L-1', 'Alpha']] },
      { range: 'Activities!A1:B2', values: [['activity_id', 'lead_id'], ['A-1', 'L-1']] },
      { range: 'Audits!A1:B2', values: [['audit_id', 'lead_id'], ['AU-1', 'L-1']] },
    ] });
  };
  const data = await readCrmSheets(env, fetchImpl);
  assert.equal(data.leads[0].firma, 'Alpha');
  assert.equal(data.activities[0].lead_id, 'L-1');
  assert.equal(data.audits[0].audit_id, 'AU-1');
  assert.equal(calls.length, 2);
  const sheetRequest = calls[1];
  const url = new URL(sheetRequest.url);
  assert.ok(url.pathname.includes('/spreadsheets/sheet%2Fid%20with%20spaces/values:batchGet'));
  assert.deepEqual(url.searchParams.getAll('ranges'), [
    'Leads!A:AF', 'Activities!A:I', 'Audits!A:Q',
  ]);
  assert.equal(sheetRequest.options.headers.Authorization, 'Bearer read-token');
  resetGoogleTokenCache();
});

test('Google-Fehler werden ohne fremde Antworttexte gemeldet', async () => {
  resetGoogleTokenCache();
  const { env } = await googleEnv();
  await assert.rejects(
    () => getGoogleAccessToken(env, async () => new Response('secret detail', { status: 401 })),
    /HTTP 401/,
  );
  resetGoogleTokenCache();
});
