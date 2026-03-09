'use strict';

/**
 * =========================================================
 * CURATED QUESTION LIFECYCLE GUARD
 * =========================================================
 * Enforces allowed status transitions.
 * Prevents illegal backward or skipped transitions.
 *
 * This is the single source of truth
 * for curated question state movement.
 * =========================================================
 */

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: ['published'],
  published: ['locked'],
  locked: ['settled', 'voided'],
  settled: [],
  voided: [],
  archived: []
});

function lifecycleError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/**
 * Assert that a status transition is valid.
 *
 * @param {string} currentStatus
 * @param {string} nextStatus
 */
function assertCuratedTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) {
    throw lifecycleError('INVALID_STATUS_INPUT');
  }

  if (currentStatus === nextStatus) {
    throw lifecycleError('NO_STATUS_CHANGE');
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus];

  if (!allowed) {
    throw lifecycleError(
      'UNKNOWN_CURRENT_STATUS',
      `Unknown status: ${currentStatus}`
    );
  }

  if (!allowed.includes(nextStatus)) {
    throw lifecycleError(
      'INVALID_STATUS_TRANSITION',
      `Cannot move from ${currentStatus} to ${nextStatus}`
    );
  }

  return true;
}

module.exports = {
  assertCuratedTransition,
  ALLOWED_TRANSITIONS
};
