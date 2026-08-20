import { importPKCS8, SignJWT } from 'jose';

// Legacy-Adapter fuer die isolierten Unit-Tests. Kein Produktions-Entry-Point
// importiert dieses Modul; der CRM-Lesepfad laeuft ausschliesslich ueber n8n.

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
let tokenCache = null;

function required(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) throw new Error(key + ' fehlt');
  return value;
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function rowsToObjects(values = []) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const headers = values[0].map((value) => String(value || '').trim());
  if (!headers.some(Boolean)) return [];
  return values.slice(1)
    .filter((row) => Array.isArray(row) && row.some((value) => value !== '' && value !== null))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? '']).filter(([header]) => header),
    ));
}

export function batchRangesToData(valueRanges = []) {
  const bySheet = new Map();
  for (const entry of valueRanges) {
    const sheet = String(entry.range || '').split('!')[0].replace(/^'|'$/g, '');
    bySheet.set(sheet, rowsToObjects(entry.values || []));
  }
  return {
    leads: bySheet.get('Leads') || [],
    activities: bySheet.get('Activities') || [],
    audits: bySheet.get('Audits') || [],
  };
}

export function resetGoogleTokenCache() {
  tokenCache = null;
}

export async function getGoogleAccessToken(env, fetchImpl = fetch) {
  const email = required(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const keyId = required(env, 'GOOGLE_PRIVATE_KEY_ID');
  const privateKeyB64 = required(env, 'GOOGLE_PRIVATE_KEY_B64');
  const cacheKey = email + ':' + keyId;
  if (tokenCache && tokenCache.cacheKey === cacheKey && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.value;
  }
  const privateKey = await importPKCS8(decodeBase64Utf8(privateKeyB64), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SHEETS_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: keyId })
    .setIssuer(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error('Google OAuth antwortet mit HTTP ' + response.status);
  const result = await response.json();
  if (!result.access_token) throw new Error('Google OAuth liefert kein Access-Token');
  tokenCache = {
    cacheKey,
    value: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
  return tokenCache.value;
}

export async function readCrmSheets(env, fetchImpl = fetch) {
  const spreadsheetId = required(env, 'GOOGLE_SPREADSHEET_ID');
  const query = new URLSearchParams({
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  // Keep the API response limited to the documented CRM schemas. In particular,
  // do not expose internal helper columns or future sheet additions by default.
  for (const range of ['Leads!A:AF', 'Activities!A:I', 'Audits!A:Q']) {
    query.append('ranges', range);
  }
  const token = await getGoogleAccessToken(env, fetchImpl);
  const response = await fetchImpl(
    'https://sheets.googleapis.com/v4/spreadsheets/'
      + encodeURIComponent(spreadsheetId) + '/values:batchGet?' + query,
    { headers: { Authorization: 'Bearer ' + token } },
  );
  if (!response.ok) throw new Error('Google Sheets antwortet mit HTTP ' + response.status);
  const result = await response.json();
  return batchRangesToData(result.valueRanges || []);
}
