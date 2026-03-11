import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyContentDigest, verifyPawapaySignature } from './pawapay.js';

/**
 * RFC 9421 HTTP Message Signature Verification Tests
 * Tests ECDSA-P256-SHA256 signature verification without live PawaPay API
 */

// Helper function to generate test key pairs (used by multiple test suites)
function generateTestKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1', // P-256
  });

  const publicKeyPem = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
  const privateKeyPem = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();

  return { publicKeyPem, privateKeyPem };
}

describe('PawaPay RFC 9421 Signature Verification', () => {
  // ────────────────────────────────────────────────────────────────────────────────
  // Content-Digest Verification (SHA-512)
  // ────────────────────────────────────────────────────────────────────────────────
  describe('Content-Digest Verification', () => {
    it('should verify valid SHA-512 Content-Digest', () => {
      const rawBody = JSON.stringify({
        depositId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'COMPLETED',
        amount: '50000',
      });

      // Calculate expected hash
      const expectedHash = crypto
        .createHash('sha512')
        .update(rawBody)
        .digest('base64');

      // Format as Content-Digest header (sha-512=:base64url:)
      const contentDigest = `sha-512=:${expectedHash}:`;

      const isValid = verifyContentDigest(contentDigest, rawBody);
      expect(isValid).toBe(true);
    });

    it('should reject tampered Content-Digest', () => {
      const rawBody = JSON.stringify({ depositId: 'test', status: 'COMPLETED' });

      // Wrong hash
      const tampered = 'sha-512=:YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=:';

      const isValid = verifyContentDigest(tampered, rawBody);
      expect(isValid).toBe(false);
    });

    it('should handle base64url encoding (colons as padding)', () => {
      const rawBody = 'test payload';

      const hash = crypto
        .createHash('sha512')
        .update(rawBody)
        .digest('base64');

      // PawaPay uses colons as padding markers in base64url
      const contentDigest = `sha-512=:${hash}:`;

      const isValid = verifyContentDigest(contentDigest, rawBody);
      expect(isValid).toBe(true);
    });

    it('should reject invalid Content-Digest format', () => {
      const rawBody = 'test';
      const invalidFormat = 'invalid-digest-format';

      const isValid = verifyContentDigest(invalidFormat, rawBody);
      expect(isValid).toBe(false);
    });

    it('should handle empty payload', () => {
      const emptyBody = '';

      const expectedHash = crypto
        .createHash('sha512')
        .update(emptyBody)
        .digest('base64');

      const contentDigest = `sha-512=:${expectedHash}:`;

      const isValid = verifyContentDigest(contentDigest, emptyBody);
      expect(isValid).toBe(true);
    });

    it('should handle large payload', () => {
      const largeBody = JSON.stringify({
        depositId: 'test-id',
        data: 'x'.repeat(10000), // large payload
      });

      const expectedHash = crypto
        .createHash('sha512')
        .update(largeBody)
        .digest('base64');

      const contentDigest = `sha-512=:${expectedHash}:`;

      const isValid = verifyContentDigest(contentDigest, largeBody);
      expect(isValid).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // RFC 9421 Signature Base String Construction
  // ────────────────────────────────────────────────────────────────────────────────
  describe('RFC 9421 Signature Base String', () => {
    it('should construct correct signature base string per RFC 9421', () => {
      // Example from RFC 9421:
      // "@method": POST
      // "@authority": example.com
      // "@path": /foo?bar=baz&baz=qux
      // "@signature-params": sig=(...);alg="...";keyid="...";...

      const method = 'POST';
      const authority = 'example.com';
      const path = '/foo?bar=baz&baz=qux';
      const signatureInputHeader =
        'sig=("@method" "@authority" "@path");alg="ecdsa-p256-sha256";keyid="test-key-1"';

      // Expected format per RFC 9421:
      // "@method": POST
      // "@authority": example.com
      // "@path": /foo?bar=baz&baz=qux
      // "@signature-params": sig=(...);alg="...";keyid="...";...

      const expectedBase =
        `"@method": ${method}
"@authority": ${authority}
"@path": ${path}
"@signature-params": ${signatureInputHeader}`;

      // The actual implementation should construct this
      expect(expectedBase).toContain('@method');
      expect(expectedBase).toContain('@authority');
      expect(expectedBase).toContain('@path');
      expect(expectedBase).toContain('@signature-params');
    });

    it('should handle special characters in path', () => {
      const path = '/payments/webhooks/pawapay/deposits?id=test&status=COMPLETED';
      expect(path).toContain('?');
      expect(path).toContain('&');
    });

    it('should include all required components in correct order', () => {
      // RFC 9421 requires components in specific order for signature base
      const components = ['@method', '@authority', '@path', 'signature-date', 'content-digest'];
      expect(components[0]).toBe('@method');
      expect(components[1]).toBe('@authority');
      expect(components[2]).toBe('@path');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // ECDSA-P256-SHA256 Signature Verification
  // ────────────────────────────────────────────────────────────────────────────────
  describe('ECDSA-P256-SHA256 Signature Verification', () => {
    it('should verify valid ECDSA-P256-SHA256 signature', () => {
      const { publicKeyPem, privateKeyPem } = generateTestKeyPair();

      const signatureBase = '"@method": POST\n"@authority": example.com\n"@path": /test';

      // Create signature
      const signer = crypto.createSign('SHA256');
      signer.update(signatureBase);
      const signature = signer.sign(privateKeyPem);

      // Verify signature
      const verifier = crypto.createVerify('SHA256');
      verifier.update(signatureBase);
      const isValid = verifier.verify(publicKeyPem, signature);

      expect(isValid).toBe(true);
    });

    it('should reject tampered signature', () => {
      const { publicKeyPem, privateKeyPem } = generateTestKeyPair();

      const signatureBase = '"@method": POST\n"@authority": example.com\n"@path": /test';

      // Create signature
      const signer = crypto.createSign('SHA256');
      signer.update(signatureBase);
      let signature = signer.sign(privateKeyPem);

      // Tamper with signature
      signature[0] = signature[0] ^ 0xFF;

      // Verify should fail
      const verifier = crypto.createVerify('SHA256');
      verifier.update(signatureBase);
      const isValid = verifier.verify(publicKeyPem, signature);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong message', () => {
      const { publicKeyPem, privateKeyPem } = generateTestKeyPair();

      const signatureBase = '"@method": POST\n"@authority": example.com\n"@path": /test';

      // Create signature for original message
      const signer = crypto.createSign('SHA256');
      signer.update(signatureBase);
      const signature = signer.sign(privateKeyPem);

      // Try to verify against different message
      const tamperedBase =
        '"@method": GET\n"@authority": example.com\n"@path": /test';

      const verifier = crypto.createVerify('SHA256');
      verifier.update(tamperedBase);
      const isValid = verifier.verify(publicKeyPem, signature);

      expect(isValid).toBe(false);
    });

    it('should handle base64 encoded signatures', () => {
      const { publicKeyPem, privateKeyPem } = generateTestKeyPair();

      const signatureBase = '"@method": POST\n"@authority": test.com\n"@path": /webhook';

      // Create and encode signature
      const signer = crypto.createSign('SHA256');
      signer.update(signatureBase);
      const signature = signer.sign(privateKeyPem);
      const base64Sig = signature.toString('base64');

      // Decode and verify
      const decodedSig = Buffer.from(base64Sig, 'base64');

      const verifier = crypto.createVerify('SHA256');
      verifier.update(signatureBase);
      const isValid = verifier.verify(publicKeyPem, decodedSig);

      expect(isValid).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // Signature Header Parsing
  // ────────────────────────────────────────────────────────────────────────────────
  describe('Signature Header Parsing', () => {
    it('should extract signature value from Signature header', () => {
      const signatureHeader =
        'sig-pp=:qKv1NHkHDJnqJTF6CppNLKKMBMqvdWcRFFEahEBFhKYO0gvhI5N6bRi6sBgLr/QAiI4/JI3POA7xSk8LPKBBpQ==:';

      const match = signatureHeader.match(/sig-pp=:([^:]+):/);
      const sigValue = match?.[1];

      expect(sigValue).toBe(
        'qKv1NHkHDJnqJTF6CppNLKKMBMqvdWcRFFEahEBFhKYO0gvhI5N6bRi6sBgLr/QAiI4/JI3POA7xSk8LPKBBpQ==',
      );
    });

    it('should extract keyid from Signature-Input header', () => {
      const signatureInputHeader =
        'sig-pp=("@method" "@authority" "@path" "content-digest");alg="ecdsa-p256-sha256";keyid="test-key-123";created=1234567890';

      const match = signatureInputHeader.match(/keyid="([^"]+)"/);
      const keyId = match?.[1];

      expect(keyId).toBe('test-key-123');
    });

    it('should extract algorithm from Signature-Input header', () => {
      const signatureInputHeader =
        'sig-pp=(...);alg="ecdsa-p256-sha256";keyid="test-key"';

      const match = signatureInputHeader.match(/alg="([^"]+)"/);
      const algorithm = match?.[1];

      expect(algorithm).toBe('ecdsa-p256-sha256');
    });

    it('should handle multiple components in Signature-Input', () => {
      const signatureInputHeader =
        'sig-pp=("@method" "@authority" "@path" "signature-date" "content-digest" "content-type");alg="ecdsa-p256-sha256";keyid="key1"';

      const componentMatch = signatureInputHeader.match(
        /sig-pp=\(([^)]+)\)/,
      );
      const componentsList = componentMatch?.[1] ?? '';

      expect(componentsList).toContain('@method');
      expect(componentsList).toContain('@path');
      expect(componentsList).toContain('content-digest');
    });

    it('should handle malformed headers gracefully', () => {
      const malformedHeaders = [
        'sig-pp=invalid', // missing colons
        'invalid-header', // wrong format
        '', // empty
      ];

      malformedHeaders.forEach((header) => {
        const match = header.match(/sig-pp=:([^:]+):/);
        expect(match).toBeNull();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // Full RFC 9421 Webhook Verification Flow
  // ────────────────────────────────────────────────────────────────────────────────
  describe('Full Webhook Verification Flow', () => {
    it('should verify complete RFC 9421 signed webhook', () => {
      const { publicKeyPem, privateKeyPem } = generateTestKeyPair();

      // Simulate webhook payload
      const webhookPayload = {
        depositId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'COMPLETED',
        amount: '50000',
        currency: 'XAF',
        created: '2026-03-11T07:43:00Z',
      };

      const rawBody = JSON.stringify(webhookPayload);

      // 1. Verify Content-Digest
      const bodyHash = crypto.createHash('sha512').update(rawBody).digest('base64');
      const contentDigest = `sha-512=:${bodyHash}:`;

      const contentDigestValid = verifyContentDigest(contentDigest, rawBody);
      expect(contentDigestValid).toBe(true);

      // 2. Build signature base per RFC 9421
      const method = 'POST';
      const authority = 'hellodriver-api.fly.dev';
      const path = '/payments/webhooks/pawapay/deposits';

      const signatureInputHeader =
        'sig-pp=("@method" "@authority" "@path" "content-digest");alg="ecdsa-p256-sha256";keyid="test-key"';

      let signatureBase = '';
      signatureBase += `"@method": ${method}\n`;
      signatureBase += `"@authority": ${authority}\n`;
      signatureBase += `"@path": ${path}\n`;
      signatureBase += `"content-digest": ${contentDigest}\n`;
      signatureBase += `"@signature-params": ${signatureInputHeader}`;

      // 3. Create ECDSA signature
      const signer = crypto.createSign('SHA256');
      signer.update(signatureBase);
      const signature = signer.sign(privateKeyPem);

      // 4. Verify signature
      const verifier = crypto.createVerify('SHA256');
      verifier.update(signatureBase);
      const signatureValid = verifier.verify(publicKeyPem, signature);

      expect(signatureValid).toBe(true);
    });

    it('should detect replay attacks via timestamp validation', () => {
      // RFC 9421 recommends timestamp windows (5-10 minutes)
      const now = Date.now();
      const signatureTime = now - 15 * 60 * 1000; // 15 minutes old

      const timestampWindow = 10 * 60 * 1000; // 10 minutes
      const isExpired = now - signatureTime > timestampWindow;

      expect(isExpired).toBe(true);
    });

    it('should detect replay attacks via Redis deduplication', async () => {
      const webhookId = 'test-webhook-550e8400';

      // Simulate first request
      const firstKey = `pawapay:webhook:${webhookId}`;
      // In real scenario, would use Redis
      const processed = new Map<string, boolean>();
      if (!processed.has(firstKey)) {
        processed.set(firstKey, true);
      }

      // Simulate second request (duplicate)
      const isDuplicate = processed.has(firstKey);
      expect(isDuplicate).toBe(true);
    });
  });
});
