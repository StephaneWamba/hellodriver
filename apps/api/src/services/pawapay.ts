import { AppError, ErrorCode } from '../errors.js';
import crypto from 'crypto';

export type PawapayOperator = 'AIRTEL_GABON' | 'MOOV_GABON';

export interface PawapayDepositRequest {
  depositId: string;
  amount: string;
  msisdn: string;
  correspondent: PawapayOperator;
  statementDescription?: string;
}

export interface PawapayDepositResponse {
  depositId: string;
  status: 'ACCEPTED' | 'REJECTED';
  created?: string;
  respondedByPayer?: string;
}

export interface PawapayDepositStatusResponse {
  depositId: string;
  status: 'ACCEPTED' | 'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  amount: string;
  currency: string;
  correspondent?: string;
  payer?: { type: string; address: { value: string } };
  created?: string;
  respondedByPayer?: string;
  correspondentIds?: Record<string, string>;
}

export interface PawapayPayoutRequest {
  payoutId: string;
  amount: string;
  msisdn: string;
  correspondent: PawapayOperator;
  statementDescription?: string;
}

export interface PawapayPayoutResponse {
  payoutId: string;
  status: 'ACCEPTED' | 'REJECTED';
  created?: string;
}

export interface PawapayPayoutStatusResponse {
  payoutId: string;
  status: 'ACCEPTED' | 'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  amount: string;
  currency: string;
  correspondent?: string;
  recipient?: { type: string; address: { value: string } };
  created?: string;
}

class PawapayClient {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private logger?: { debug: (msg: string, data?: unknown) => void; error: (msg: string, err?: unknown) => void }
  ) {}

  private async request<T>(method: 'POST' | 'GET', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    this.logger?.debug('pawapay_request', { method, path });

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      this.logger?.error('pawapay_network_error', err);
      throw AppError.paymentFailed('Network error communicating with pawaPay');
    }

    if (!response.ok) {
      const text = await response.text();
      this.logger?.error(`pawapay_${response.status}`, { path, body: text });
      throw AppError.paymentFailed(`pawaPay returned ${response.status}: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    this.logger?.debug('pawapay_response', { method, path, status: response.status });

    return data as T;
  }

  async initiateDeposit(req: PawapayDepositRequest): Promise<PawapayDepositResponse> {
    const body = {
      depositId: req.depositId,
      amount: {
        value: req.amount,
        currency: 'XAF',
      },
      payer: {
        type: 'MSISDN',
        address: req.msisdn,
      },
      correspondent: req.correspondent,
      statementDescription: req.statementDescription || undefined,
    };

    return this.request<PawapayDepositResponse>('POST', '/v1/deposits', body);
  }

  async getDepositStatus(depositId: string): Promise<PawapayDepositStatusResponse> {
    return this.request<PawapayDepositStatusResponse>('GET', `/v1/deposits/${depositId}`);
  }

  async initiatePayout(req: PawapayPayoutRequest): Promise<PawapayPayoutResponse> {
    const body = {
      payoutId: req.payoutId,
      amount: {
        value: req.amount,
        currency: 'XAF',
      },
      recipient: {
        type: 'MSISDN',
        address: req.msisdn,
      },
      correspondent: req.correspondent,
      statementDescription: req.statementDescription || undefined,
    };

    return this.request<PawapayPayoutResponse>('POST', '/v1/payouts', body);
  }

  async getPayoutStatus(payoutId: string): Promise<PawapayPayoutStatusResponse> {
    return this.request<PawapayPayoutStatusResponse>('GET', `/v1/payouts/${payoutId}`);
  }
}

export function createPawapayClient(
  apiKey: string,
  baseUrl: string,
  logger?: { debug: (msg: string, data?: unknown) => void; error: (msg: string, err?: unknown) => void }
): PawapayClient {
  return new PawapayClient(apiKey, baseUrl, logger);
}

// ────────────────────────────────────────────────────────────────────────────
// RFC 9421 Webhook Signature Verification
// ────────────────────────────────────────────────────────────────────────────

export interface PawapayPublicKey {
  id: string;
  key: string;
}

/**
 * Fetch PawaPay's public key for webhook signature verification
 * Uses the Public Keys endpoint to retrieve the signing key by ID
 */
export async function fetchPawapayPublicKey(
  client: PawapayClient,
  keyId: string,
  logger?: { debug: (msg: string, data?: unknown) => void }
): Promise<string> {
  // Access the private request method through any type
  const privateClient = client as any;
  const response = await privateClient.request('GET', `/v1/public-keys/${keyId}`);
  logger?.debug('fetched_pawapay_public_key', { keyId });
  return response.key;
}

/**
 * Verify RFC 9421 signature from PawaPay webhook
 * Constructs the signature base string and verifies using ECDSA-P256-SHA256
 */
export function verifyPawapaySignature(
  method: string,
  authority: string,
  path: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
  signatureValue: string,
  signatureInputHeader: string,
  publicKeyPem: string,
  logger?: { debug: (msg: string, data?: unknown) => void; error: (msg: string, err?: unknown) => void }
): boolean {
  try {
    // Extract signature components from Signature-Input
    // Format: sig-pp=("@method" "@authority" "@path" ...);alg="...";keyid="...";...
    const componentsList = signatureInputHeader.match(/sig-pp=\("([^"]+)"\)/)?.[1] || '';
    const components = componentsList.split('" "').map((c) => c.replace(/"/g, ''));

    // Build signature base string per RFC 9421
    let signatureBase = '';
    for (const component of components) {
      if (component === '@method') {
        signatureBase += `"@method": ${method}\n`;
      } else if (component === '@authority') {
        signatureBase += `"@authority": ${authority}\n`;
      } else if (component === '@path') {
        signatureBase += `"@path": ${path}\n`;
      } else if (component === 'signature-date') {
        signatureBase += `"signature-date": ${headers['signature-date']}\n`;
      } else if (component === 'content-digest') {
        signatureBase += `"content-digest": ${headers['content-digest']}\n`;
      } else if (component === 'content-type') {
        signatureBase += `"content-type": ${headers['content-type']}\n`;
      }
    }

    // Remove trailing newline and add signature params
    signatureBase = signatureBase.slice(0, -1) + '\n';
    signatureBase += `"@signature-params": ${signatureInputHeader}`;

    logger?.debug('verifying_pawapay_signature', { signatureBase: signatureBase.slice(0, 100) });

    // Extract signature value (remove base64url colons)
    const sigBytes = Buffer.from(signatureValue.replace(/:/g, ''), 'base64');

    // Verify ECDSA-P256-SHA256 signature
    const verifier = crypto.createVerify('SHA256');
    verifier.update(signatureBase);

    const isValid = verifier.verify(publicKeyPem, sigBytes);
    logger?.debug('pawapay_signature_verification_result', { isValid });
    return isValid;
  } catch (err) {
    logger?.error('pawapay_signature_verification_error', err);
    return false;
  }
}

/**
 * Verify Content-Digest header matches the SHA-512 hash of the body
 */
export function verifyContentDigest(
  digestHeader: string,
  rawBody: string,
  logger?: { debug: (msg: string, data?: unknown) => void; error: (msg: string, err?: unknown) => void }
): boolean {
  try {
    // Format: sha-512=:base64url_value:
    const [algo, value] = digestHeader.split('=');
    if (!algo || !value) {
      return false;
    }

    const expectedHash = crypto
      .createHash(algo.toLowerCase().replace('-', ''))
      .update(rawBody)
      .digest('base64');

    // Compare base64url (colons are used as padding in the header)
    const actualValue = value.replace(/:/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const expectedValue = expectedHash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const isValid = actualValue === expectedValue;
    logger?.debug('content_digest_verification', { isValid });
    return isValid;
  } catch (err) {
    logger?.error('content_digest_verification_error', err);
    return false;
  }
}

export type { PawapayClient };
