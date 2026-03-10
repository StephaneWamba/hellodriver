import { AppError, ErrorCode } from '../errors.js';

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

export type { PawapayClient };
