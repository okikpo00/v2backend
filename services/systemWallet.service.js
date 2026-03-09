'use strict';

const WalletService = require('./wallet.service');
const SystemService = require('./system.service');
const audit = require('../utils/audit');
const pool = require('../config/db');

/* =========================
   ERROR HELPER
========================= */
function systemWalletError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================
   VALIDATION
========================= */
function validateAmount(amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw systemWalletError('INVALID_AMOUNT', 'Amount must be greater than zero');
  }
}

function validateReason(reason) {
  if (!reason || typeof reason !== 'string' || reason.length < 3) {
    throw systemWalletError('INVALID_REASON', 'Reason is required');
  }
}

function validateIdempotency(key) {
  if (!key || typeof key !== 'string') {
    throw systemWalletError('IDEMPOTENCY_REQUIRED');
  }
}

/* =========================
   MANUAL CREDIT (SYSTEM)
========================= */
exports.systemCreditWallet = async ({
  userId,
  amount,
  reason,
  reference = null,
  idempotency_key,
  currency = 'NGN'
}) => {
  console.log('[SYSTEM_WALLET_CREDIT] start', {
    userId,
    amount,
    reason,
    reference
  });

  validateAmount(amount);
  validateReason(reason);
  validateIdempotency(idempotency_key);

  // 🔒 system rule
  await SystemService.assertDepositsEnabled();

  // Ensure wallet exists
  const walletId = await WalletService.createWalletIfNotExists({
    userId,
    currency
  });

  const txId = await WalletService.creditWallet({
    walletId,
    userId,
    amount,
    source_type: 'system_credit',
    source_id: reference,
    idempotency_key,
    metadata: { reason }
  });

  await audit({
    actor_type: 'system',
    action: 'SYSTEM_WALLET_CREDIT',
    target_type: 'wallet',
    target_id: String(walletId),
    user_id: userId,
    metadata: {
      amount,
      reason,
      reference,
      txId
    }
  });

  console.log('[SYSTEM_WALLET_CREDIT] success', {
    walletId,
    txId
  });

  return {
    walletId,
    transactionId: txId
  };
};

/* =========================
   MANUAL DEBIT (SYSTEM)
========================= */
exports.systemDebitWallet = async ({
  userId,
  amount,
  reason,
  reference = null,
  idempotency_key,
  currency = 'NGN'
}) => {
  console.log('[SYSTEM_WALLET_DEBIT] start', {
    userId,
    amount,
    reason,
    reference
  });

  validateAmount(amount);
  validateReason(reason);
  validateIdempotency(idempotency_key);

  // 🔒 system rule
  await SystemService.assertWithdrawalsEnabled();

  const wallet = await WalletService.getWalletByUser({
    userId,
    currency
  });

  const txId = await WalletService.debitWallet({
    walletId: wallet.id,
    userId,
    amount,
    source_type: 'system_debit',
    source_id: reference,
    idempotency_key,
    metadata: { reason }
  });

  await audit({
    actor_type: 'system',
    action: 'SYSTEM_WALLET_DEBIT',
    target_type: 'wallet',
    target_id: String(wallet.id),
    user_id: userId,
    metadata: {
      amount,
      reason,
      reference,
      txId
    }
  });

  console.log('[SYSTEM_WALLET_DEBIT] success', {
    walletId: wallet.id,
    txId
  });

  return {
    walletId: wallet.id,
    transactionId: txId
  };
};
