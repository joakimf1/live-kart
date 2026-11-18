// Lager et VAPID-nøkkelpar for push-varsler. Kjør én gang:
//   node worker/generate-vapid.mjs
// og lim verdiene inn som secrets i Cloudflare (se worker/README.md).
const { subtle } = globalThis.crypto;
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
const jwk = await subtle.exportKey('jwk', kp.privateKey);
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log('\nVAPID_PUBLIC (offentlig – greit å vise):\n' + b64u(raw));
console.log('\nVAPID_PRIVATE_JWK (HEMMELIG – del aldri, legg bare inn som secret):\n' + JSON.stringify(jwk));
console.log('\nKommandoer:\n  npx wrangler secret put VAPID_PUBLIC\n  npx wrangler secret put VAPID_PRIVATE_JWK\n');
