import { eq, and, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { payments, trips, wallets, type DbClient } from '@hellodriver/db';
import { OPERATOR_LIMITS } from '@hellodriver/validators';
import { AppError, ErrorCode } from '../errors.js';
import type { PawapayOperator } from './pawapay.js';
import crypto from 'crypto';

/**
 * Map PawapayOperator to payment_method enum value
 */
function mapOperatorToPaymentMethod(operator: PawapayOperator): string {
  return operator === 'AIRTEL_GABON' ? 'airtel_money' : 'moov_money';
}

/**
 * Enforce daily operator limits (transaction amount, daily total, daily count)
 * Throws AppError.paymentFailed() if any limit exceeded
 */
export async function enforceOperatorLimits(
  db: DbClient,
  userId: string,
  operator: PawapayOperator,
  amountXaf: number
): Promise<void> {
  const limits = OPERATOR_LIMITS[operator];

  // Check single transaction limit
  if (amountXaf > limits.max_per_tx) {
    throw AppError.paymentFailed(
      `Amount exceeds operator maximum per transaction: ${limits.max_per_tx} XAF (${operator})`
    );
  }

  // Get today's date range (WAT timezone: UTC+1)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  // Map operator to payment_method enum value
  const paymentMethod = mapOperatorToPaymentMethod(operator);

  // Count today's payments with active status
  const todayPayments = await (db as any).execute(sql`
    SELECT
      COALESCE(SUM(amount_xaf), 0) as total_amount,
      COUNT(*) as tx_count
    FROM payments
    WHERE user_id = ${userId}
      AND payment_method = ${paymentMethod}
      AND status IN ('pending_user_approval', 'processing', 'confirmed')
      AND created_at >= ${todayStart.toISOString()}
      AND created_at < ${tomorrowStart.toISOString()}
  `);

  const stats = todayPayments[0] as { total_amount: string; tx_count: string };
  const todayTotal = parseInt(stats?.total_amount ?? '0', 10);
  const todayCount = parseInt(stats?.tx_count ?? '0', 10);

  // Check daily total limit
  if (todayTotal + amountXaf > limits.max_daily) {
    const remaining = Math.max(0, limits.max_daily - todayTotal);
    throw AppError.paymentFailed(
      `Daily limit exceeded for ${operator}. Remaining today: ${remaining} XAF`
    );
  }

  // Check daily transaction count limit
  if (todayCount >= limits.max_tx_per_day) {
    throw AppError.paymentFailed(
      `Daily transaction limit exceeded for ${operator} (${limits.max_tx_per_day} per day)`
    );
  }
}

/**
 * Initiate a mobile money deposit (wallet top-up or trip-linked payment)
 * Sequence:
 *   1. enforceOperatorLimits()
 *   2. Generate UUID for idempotency
 *   3. INSERT payment row with status='initiated'
 *   4. Call pawaPay API
 *   5. UPDATE payment status and pawapay_deposit_id
 *   6. Enqueue polling job
 *   7. Return payment row
 *
 * On pawaPay API failure: marks payment as 'failed' and throws, but payment row persists
 */
export async function initiateDeposit(
  app: FastifyInstance,
  userId: string,
  amountXaf: number,
  msisdn: string,
  operator: PawapayOperator,
  tripId?: string
): Promise<(typeof payments.$inferSelect)> {
  // Validate and enforce limits
  await enforceOperatorLimits(app.db, userId, operator, amountXaf);

  // Generate idempotency key (same UUID used as depositId for pawaPay)
  const id = crypto.randomUUID();

  // INSERT payment row with status='initiated'
  let [payment] = await app.db
    .insert(payments)
    .values({
      id,
      user_id: userId,
      trip_id: tripId,
      amount_xaf: amountXaf.toString(),
      payment_method: operator === 'AIRTEL_GABON' ? 'airtel_money' : 'moov_money',
      payment_type: 'deposit',
      status: 'initiated',
      idempotency_key: id,
      msisdn,
    })
    .returning();

  try {
    // Call pawaPay API
    const pawapayRes = await app.pawapay!.initiateDeposit({
      depositId: id,
      amount: String(amountXaf),
      msisdn,
      correspondent: operator,
      statementDescription: `Hello Driver wallet top-up`,
    });

    // UPDATE payment with pawaPay response
    if (pawapayRes.status === 'ACCEPTED') {
      [payment] = await app.db
        .update(payments)
        .set({
          status: 'pending_user_approval',
          pawapay_deposit_id: pawapayRes.depositId,
          updated_at: new Date(),
        })
        .where(eq(payments.id, id))
        .returning();
    } else {
      // pawaPay rejected the request
      await app.db
        .update(payments)
        .set({
          status: 'failed',
          failure_reason: `pawaPay rejected: ${pawapayRes.status}`,
          updated_at: new Date(),
        })
        .where(eq(payments.id, id));

      throw AppError.paymentFailed('Payment request rejected by operator');
    }

    // Enqueue polling job to detect stuck payments (retry every 30s for 24h)
    await app.queues.payments.add(
      'payment:poll',
      { payment_id: id, deposit_id: id, attempt: 0 },
      {
        delay: 30_000,
        attempts: 48,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
        removeOnFail: false,
        removeOnComplete: false,
      }
    );

    return payment;
  } catch (err) {
    // If pawaPay call fails (network error), mark payment as failed and re-throw
    if (!(err instanceof AppError)) {
      await app.db
        .update(payments)
        .set({
          status: 'failed',
          failure_reason: `System error: ${(err as Error).message}`,
          updated_at: new Date(),
        })
        .where(eq(payments.id, id));

      throw AppError.paymentFailed((err as Error).message);
    }

    // If AppError, re-throw (already updated)
    throw err;
  }
}

/**
 * Initiate a driver payout (wallet → mobile money)
 * Critical: wallet is DEBITED FIRST, then pawaPay call happens.
 * If pawaPay fails, we immediately reverse the debit.
 */
export async function initiatePayout(
  app: FastifyInstance,
  driverId: string,
  amountXaf: number,
  msisdn: string,
  operator: PawapayOperator
): Promise<(typeof payments.$inferSelect)> {
  // Validate limits
  await enforceOperatorLimits(app.db, driverId, operator, amountXaf);

  // Check wallet balance
  const [wallet] = await app.db
    .select()
    .from(wallets)
    .where(eq(wallets.user_id, driverId));

  const walletBalance = wallet ? parseFloat(wallet.balance_xaf as any) : 0;
  if (!wallet || walletBalance < amountXaf) {
    throw AppError.insufficientBalance(
      `Insufficient balance for payout. Available: ${walletBalance} XAF`
    );
  }

  const id = crypto.randomUUID();

  // BEGIN transaction: debit wallet + create payment row
  let payment: typeof payments.$inferSelect;

  try {
    await app.db.transaction(async (tx) => {
      // Debit wallet (reserve funds)
      await tx.execute(sql`
        SELECT post_wallet_transaction(
          ${driverId}::UUID,
          ${amountXaf}::NUMERIC(14,2),
          'debit'::TEXT,
          ${id}::UUID,
          'payment'::TEXT
        )
      `);

      // INSERT payment row
      const [p] = await tx
        .insert(payments)
        .values({
          id,
          user_id: driverId,
          amount_xaf: amountXaf.toString(),
          payment_method: operator === 'AIRTEL_GABON' ? 'airtel_money' : 'moov_money',
          payment_type: 'payout',
          status: 'processing',
          idempotency_key: id,
          msisdn,
        })
        .returning();

      payment = p;
    });
  } catch (err: any) {
    // Catch overdraft and wallet-not-found errors
    if (err.code === 'P0001') {
      throw AppError.insufficientBalance('Insufficient wallet balance');
    }
    if (err.code === 'P0002') {
      throw AppError.notFound('Wallet not found');
    }
    throw err;
  }

  // Call pawaPay (outside transaction, so if it fails we don't rollback the debit)
  try {
    const pawapayRes = await app.pawapay!.initiatePayout({
      payoutId: id,
      amount: String(amountXaf),
      msisdn,
      correspondent: operator,
      statementDescription: 'Hello Driver earnings payout',
    });

    if (pawapayRes.status === 'ACCEPTED') {
      // UPDATE payment with pawaPay ID
      const [updated] = await app.db
        .update(payments)
        .set({
          status: 'pending_user_approval',
          pawapay_payout_id: pawapayRes.payoutId,
          updated_at: new Date(),
        })
        .where(eq(payments.id, id))
        .returning();

      payment = updated;
    } else {
      // pawaPay rejected — debit is already posted, mark payment failed
      await app.db
        .update(payments)
        .set({
          status: 'failed',
          failure_reason: `pawaPay rejected: ${pawapayRes.status}`,
          updated_at: new Date(),
        })
        .where(eq(payments.id, id));

      throw AppError.paymentFailed('Payout request rejected by operator');
    }

    // Enqueue polling job
    await app.queues.payouts.add(
      'payout:poll',
      { payment_id: id, payout_id: id, attempt: 0 },
      {
        delay: 30_000,
        attempts: 48,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnFail: false,
        removeOnComplete: false,
      }
    );

    return payment;
  } catch (err) {
    // pawaPay call failed — REVERSE the wallet debit
    try {
      await app.db.transaction(async (tx) => {
        // Credit back the reserved amount
        await tx.execute(sql`
          SELECT post_wallet_transaction(
            ${driverId}::UUID,
            ${amountXaf}::NUMERIC(14,2),
            'credit'::TEXT,
            ${id}::UUID,
            'payment_reversal'::TEXT
          )
        `);

        // Mark payment as failed
        await tx
          .update(payments)
          .set({
            status: 'failed',
            failure_reason: `System error: ${(err as Error).message}`,
            updated_at: new Date(),
          })
          .where(eq(payments.id, id));
      });
    } catch (reverseErr) {
      app.log.error({ driverId, id, err: reverseErr }, 'Failed to reverse payout debit');
    }

    throw AppError.paymentFailed((err as Error).message);
  }
}

/**
 * Process a confirmed deposit webhook from pawaPay
 * Credits user wallet and updates payment status
 */
export async function processDepositWebhook(
  app: FastifyInstance,
  depositId: string,
  status: 'COMPLETED' | 'FAILED' | 'EXPIRED',
  webhookPayload: unknown
): Promise<void> {
  // Find payment by depositId
  const [payment] = await app.db
    .select()
    .from(payments)
    .where(eq(payments.pawapay_deposit_id, depositId));

  if (!payment) {
    app.log.warn({ depositId }, 'Received webhook for unknown deposit');
    return;
  }

  // Idempotency: if already confirmed, skip
  if (payment.status === 'confirmed') {
    app.log.debug({ depositId }, 'Deposit already confirmed, skipping reprocessing');
    return;
  }

  if (status === 'COMPLETED') {
    // BEGIN transaction: credit wallet + update payment
    try {
      await app.db.transaction(async (tx) => {
        // Credit wallet
        await tx.execute(sql`
          SELECT post_wallet_transaction(
            ${payment.user_id}::UUID,
            ${payment.amount_xaf}::NUMERIC(14,2),
            'credit'::TEXT,
            ${payment.id}::UUID,
            'payment'::TEXT
          )
        `);

        // Update payment
        await tx
          .update(payments)
          .set({
            status: 'confirmed',
            webhook_payload: webhookPayload as any,
            updated_at: new Date(),
          })
          .where(eq(payments.id, payment.id));
      });

      // Emit Socket.io event
      app.io.to(`user:${payment.user_id}`).emit('payment:deposit_confirmed', {
        payment_id: payment.id,
        amount_xaf: payment.amount_xaf,
      });
    } catch (err: any) {
      if (err.code === 'P0001') {
        app.log.error({ depositId }, 'Overdraft on deposit confirmation (impossible scenario)');
      }
      throw err;
    }
  } else {
    // FAILED or EXPIRED
    await app.db
      .update(payments)
      .set({
        status: 'failed',
        failure_reason: status,
        webhook_payload: webhookPayload as any,
        updated_at: new Date(),
      })
      .where(eq(payments.id, payment.id));

    // Emit failure event
    app.io.to(`user:${payment.user_id}`).emit('payment:deposit_failed', {
      payment_id: payment.id,
      failure_reason: status,
    });
  }
}

/**
 * Process a confirmed payout webhook from pawaPay
 * On success: mark confirmed. On failure: reverse the wallet debit
 */
export async function processPayoutWebhook(
  app: FastifyInstance,
  payoutId: string,
  status: 'COMPLETED' | 'FAILED' | 'EXPIRED',
  webhookPayload: unknown
): Promise<void> {
  // Find payment by payoutId
  const [payment] = await app.db
    .select()
    .from(payments)
    .where(eq(payments.pawapay_payout_id, payoutId));

  if (!payment) {
    app.log.warn({ payoutId }, 'Received webhook for unknown payout');
    return;
  }

  // Idempotency
  if (payment.status === 'confirmed') {
    return;
  }

  if (status === 'COMPLETED') {
    // Mark payout as confirmed
    await app.db
      .update(payments)
      .set({
        status: 'confirmed',
        webhook_payload: webhookPayload as any,
        updated_at: new Date(),
      })
      .where(eq(payments.id, payment.id));

    app.io.to(`driver:${payment.user_id}`).emit('payment:payout_confirmed', {
      payment_id: payment.id,
      amount_xaf: payment.amount_xaf,
    });
  } else {
    // FAILED or EXPIRED — reverse the debit
    try {
      await app.db.transaction(async (tx) => {
        // Credit back the reserved amount
        await tx.execute(sql`
          SELECT post_wallet_transaction(
            ${payment.user_id}::UUID,
            ${payment.amount_xaf}::NUMERIC(14,2),
            'credit'::TEXT,
            ${payment.id}::UUID,
            'payment_reversal'::TEXT
          )
        `);

        // Mark payment as failed
        await tx
          .update(payments)
          .set({
            status: 'failed',
            failure_reason: status,
            webhook_payload: webhookPayload as any,
            updated_at: new Date(),
          })
          .where(eq(payments.id, payment.id));
      });

      app.io.to(`driver:${payment.user_id}`).emit('payment:payout_failed', {
        payment_id: payment.id,
        failure_reason: status,
        refunded: true,
      });
    } catch (err: any) {
      app.log.error({ payoutId, err }, 'Failed to reverse payout on webhook failure');
    }
  }
}

/**
 * Process trip completion payment
 * Returns the new trip status: 'paid' | 'payment_pending'
 *
 * - cash: no wallet interaction, return 'paid'
 * - hello_monnaie: sync wallet debit/credit, return 'paid'
 * - airtel_money|moov_money: enqueue async deposit payment, return 'payment_pending'
 */
export async function processTripCompletion(
  app: FastifyInstance,
  trip: any
): Promise<'paid' | 'payment_pending'> {
  if (trip.payment_method === 'cash') {
    // Cash payment: no wallet interaction
    return 'paid';
  }

  if (trip.payment_method === 'hello_monnaie') {
    // Sync payment: debit client, credit driver
    await app.db.transaction(async (tx) => {
      // Debit client wallet for fare + commission
      const totalCharge = trip.fare_xaf! + trip.commission_xaf!;
      await tx.execute(sql`
        SELECT post_wallet_transaction(
          ${trip.client_id}::UUID,
          ${totalCharge}::NUMERIC(14,2),
          'debit'::TEXT,
          ${trip.id}::UUID,
          'trip'::TEXT
        )
      `);

      // Credit driver wallet
      await tx.execute(sql`
        SELECT post_wallet_transaction(
          ${trip.driver_id}::UUID,
          ${trip.driver_amount_xaf}::NUMERIC(14,2),
          'credit'::TEXT,
          ${trip.id}::UUID,
          'trip'::TEXT
        )
      `);

      // Create confirmed payment record
      await tx.insert(payments).values({
        id: crypto.randomUUID(),
        trip_id: trip.id,
        user_id: trip.client_id,
        amount_xaf: trip.fare_xaf!.toString(),
        payment_method: 'hello_monnaie',
        payment_type: 'deposit',
        status: 'confirmed',
        idempotency_key: trip.id, // Use trip ID for idempotency
      });
    });

    app.io.to(`trip:${trip.id}`).emit('trip:payment_confirmed', {
      trip_id: trip.id,
      new_status: 'paid',
    });

    return 'paid';
  }

  // airtel_money or moov_money: async payment flow
  // Enqueue a job to initiate deposit (user must complete USSD)
  const depositOperator = trip.payment_method === 'airtel_money' ? 'AIRTEL_GABON' : 'MOOV_GABON';

  await app.queues.payments.add(
    'payment:initiate_deposit',
    {
      trip_id: trip.id,
      user_id: trip.client_id,
      amount_xaf: trip.fare_xaf!,
      msisdn: trip.client_id, // Will need to look up actual phone from users table in the job
      operator: depositOperator,
    },
    { attempts: 3, removeOnFail: false }
  );

  return 'payment_pending';
}
