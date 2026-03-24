'use strict';

const Service = require('../services/curated.entry.service');

/* =========================================================
   HELPERS
========================================================= */
function fail(res, code, message = code, status = 400) {
  return res.status(status).json({
    success: false,
    code,
    message
  });
}

function ok(res, data = null) {
  return res.json({
    success: true,
    data
  });
}

/* =========================================================
   PLACE ENTRY (SLIP)
========================================================= */
exports.place = async (req, res) => {
  try {
    const { stake, entries } = req.body || {};

    /* -------------------------
       HARD VALIDATION (FAST FAIL)
    ------------------------- */

    if (
      stake === undefined ||
      stake === null ||
      isNaN(Number(stake))
    ) {
      return fail(res, 'INVALID_STAKE', 'Stake must be a valid number');
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return fail(res, 'INVALID_ENTRIES', 'Entries must be a non-empty array');
    }

    /* Validate each entry shape */
    for (const e of entries) {
      if (
        !e ||
        typeof e.question_id !== 'number' ||
        !['yes', 'no'].includes(e.side)
      ) {
        return fail(res, 'INVALID_ENTRY_FORMAT');
      }
    }

    /* -------------------------
       SERVICE CALL
    ------------------------- */
    const result = await Service.place({
      userId: req.auth.userId,
      stake: Number(stake),
      entries,
      ip: req.ip || null,
      user_agent: req.headers['user-agent'] || null
    });

    return ok(res, result);

  } catch (err) {

    console.error('[ENTRY_PLACE_ERROR]', {
      code: err.code,
      message: err.message,
      userId: req.auth?.userId
    });

    return fail(
      res,
      err.code || 'ENTRY_FAILED',
      err.message
    );
  }
};