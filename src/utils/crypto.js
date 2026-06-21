export const CRED_TOKEN = 'DxAWNxxXPz4eGTcgIRk0UCgKWj4zDxQVDxpTWAtWPS08XUovEj1RCw==';
export const CRED_REPO  = 'JREUKRFVHQsPUVcrAQoHAUsTGxFfRh8PHBATClYPBw==';

export function xorEncode(str, key) {
  const keyBytes = new TextEncoder().encode(key);
  const strBytes = new TextEncoder().encode(str);
  const result = new Uint8Array(strBytes.length);
  for (let i = 0; i < strBytes.length; i++) result[i] = strBytes[i] ^ keyBytes[i % keyBytes.length];
  let binary = '';
  for (let i = 0; i < result.length; i++) binary += String.fromCharCode(result[i]);
  return btoa(binary);
}

export function xorDecode(encoded, key) {
  const binary = atob(encoded);
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
  return new TextDecoder().decode(result);
}
