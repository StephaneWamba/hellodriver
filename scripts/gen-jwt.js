#!/usr/bin/env node
/**
 * Generate a test JWT token for manual API testing
 * Usage: node scripts/gen-jwt.js [authId] [jwtSecret] [expiresIn]
 */

const crypto = require('crypto');

const args = process.argv.slice(2);
const authId = args[0] || '8d908cc2-6767-41a7-8ac2-2883006668ed';
const jwtSecret = args[1] || process.env.SUPABASE_JWT_SECRET;
const expiresIn = parseInt(args[2] || '86400', 10);

if (!jwtSecret) {
  console.error('❌ Error: SUPABASE_JWT_SECRET not provided');
  console.error('');
  console.error('Usage:');
  console.error('  export SUPABASE_JWT_SECRET="your-secret"');
  console.error('  node scripts/gen-jwt.js [authId] [jwtSecret] [expiresInSeconds]');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/gen-jwt.js 8d908cc2-6767-41a7-8ac2-2883006668ed "$(flyctl secrets get SUPABASE_JWT_SECRET -a hellodriver-api)"');
  process.exit(1);
}

function encodeBase64Url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const header = { alg: 'HS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: authId,
  phone: '+24107654321',
  aud: 'authenticated',
  role: 'authenticated',
  iat: now,
  exp: now + expiresIn,
};

const headerB64 = encodeBase64Url(header);
const payloadB64 = encodeBase64Url(payload);
const message = `${headerB64}.${payloadB64}`;

const signature = crypto
  .createHmac('sha256', jwtSecret)
  .update(message)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '');

const jwt = `${message}.${signature}`;

console.log('✓ JWT Token Generated');
console.log('');
console.log('Token:');
console.log(jwt);
console.log('');
console.log('Use in curl:');
console.log(`curl -H "Authorization: Bearer ${jwt}" https://hellodriver-api.fly.dev/payments/wallet`);
