'use strict';

const pool = require('../config/db');
const System = require('./system.service');
const Escrow = require('./head_to_head.escrow.service');
const Util = require('../utils/head_to_head.util');
const { v4: uuidv4 } = require('uuid');

function serviceError(message) {
  const err = new Error(message);
  err.code = message;
  return err;
}

'use strict';

const pool = require('../config/db');
const System = require('./system.service');
const WalletService = require('./wallet.service');
const Util = require('../utils/head_to_head.util');
const { v4: uuidv4 } = require('uuid');

function serviceError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

/* =========================================================
   CREATE CHALLENGE
========================================================= */
exports.createChallenge = async ({
  userId,
  questionId,
  stake,
  side
}) => {

  if (!['yes', 'no'].includes(side))
    throw serviceError('INVALID_SIDE');

  if (!stake || isNaN(stake) || stake <= 0)
    throw serviceError('INVALID_STAKE');

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* ---------- SETTINGS ---------- */
    const [
      minStake,
      maxStake,
      feePercent
    ] = await Promise.all([
      System.getDecimal('H2H_MIN_STAKE'),
      System.getDecimal('H2H_MAX_STAKE'),
      System.getDecimal('H2H_FEE_PERCENT')
    ]);

    if (stake < minStake) throw serviceError('STAKE_BELOW_MINIMUM');
    if (stake > maxStake) throw serviceError('STAKE_ABOVE_MAXIMUM');

    /* ---------- LOCK QUESTION ---------- */
    const [[question]] = await conn.query(
      `SELECT id, status
       FROM head_to_head_questions
       WHERE id = ?
       FOR UPDATE`,
      [questionId]
    );

    if (!question) throw serviceError('QUESTION_NOT_FOUND');
    if (question.status !== 'published')
      throw serviceError('QUESTION_NOT_AVAILABLE');

    /* ---------- GET WALLET ---------- */
    const [[wallet]] = await conn.query(
      `SELECT id FROM wallets
       WHERE user_id = ?
       AND currency = 'NGN'
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw serviceError('WALLET_NOT_FOUND');

    /* ---------- LOCK FUNDS (LEDGERED) ---------- */
    const lockId = await WalletService.lock({
      walletId: wallet.id,
      userId,
      amount: stake,
      reference_type: 'h2h_create',
      reference_id: `${questionId}:${userId}`,
      idempotency_key: `h2h_create:${questionId}:${userId}`,
      conn
    });

    /* ---------- CREATE CHALLENGE ---------- */
    const uuid = uuidv4();
    const inviteCode = Util.generateInviteCode();

    await conn.query(
      `INSERT INTO head_to_head_challenges
       (uuid, question_id, creator_user_id, creator_wallet_id,
        stake, creator_side, invite_code, status, creator_lock_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [uuid, questionId, userId, wallet.id, stake, side, inviteCode, lockId]
    );

    const totalPot = stake * 2;
    const fee = (totalPot * feePercent) / 100;

    await conn.commit();

    return {
      uuid,
      invite_code: inviteCode,
      stake,
      total_pot: totalPot,
      platform_fee: Number(fee.toFixed(2)),
      potential_win: Number((totalPot - fee).toFixed(2)),
      status: 'pending',
      creator_side: side
    };

  } catch (err) {
    await conn.rollback();
    throw err.code ? err : serviceError('CREATE_CHALLENGE_FAILED');
  } finally {
    conn.release();
  }
};

/* =========================================================
   ACCEPT CHALLENGE
========================================================= */
exports.acceptChallenge = async ({
  userId,
  inviteCode
}) => {

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[challenge]] = await conn.query(
      `SELECT *
       FROM head_to_head_challenges
       WHERE invite_code = ?
       FOR UPDATE`,
      [inviteCode]
    );

    if (!challenge) throw serviceError('CHALLENGE_NOT_FOUND');
    if (challenge.status !== 'pending')
      throw serviceError('CHALLENGE_NOT_AVAILABLE');

    if (challenge.creator_user_id === userId)
      throw serviceError('CANNOT_ACCEPT_OWN_CHALLENGE');

    /* ---------- LOCK USER WALLET ---------- */
    const [[wallet]] = await conn.query(
      `SELECT id FROM wallets
       WHERE user_id = ?
       AND currency = 'NGN'
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw serviceError('WALLET_NOT_FOUND');

    const lockId = await WalletService.lock({
      walletId: wallet.id,
      userId,
      amount: challenge.stake,
      reference_type: 'h2h_accept',
      reference_id: challenge.uuid,
      idempotency_key: `h2h_accept:${challenge.uuid}:${userId}`,
      conn
    });

    const opponentSide =
      challenge.creator_side === 'yes' ? 'no' : 'yes';

    await conn.query(
      `UPDATE head_to_head_challenges
       SET opponent_user_id = ?,
           opponent_wallet_id = ?,
           opponent_side = ?,
           opponent_lock_id = ?,
           status = 'accepted',
           accepted_at = NOW()
       WHERE id = ?`,
      [userId, wallet.id, opponentSide, lockId, challenge.id]
    );

    await conn.commit();

    return {
      uuid: challenge.uuid,
      stake: Number(challenge.stake),
      total_pot: Number(challenge.stake) * 2
    };

  } catch (err) {
    await conn.rollback();
    throw err.code ? err : serviceError('ACCEPT_CHALLENGE_FAILED');
  } finally {
    conn.release();
  }
};

/* =========================================================
   CANCEL CHALLENGE
========================================================= */
exports.cancelChallenge = async ({
  userId,
  inviteCode
}) => {

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[challenge]] = await conn.query(
      `SELECT *
       FROM head_to_head_challenges
       WHERE invite_code = ?
       FOR UPDATE`,
      [inviteCode]
    );

    if (!challenge) throw serviceError('CHALLENGE_NOT_FOUND');
    if (challenge.status !== 'pending')
      throw serviceError('CANNOT_CANCEL');

    if (challenge.creator_user_id !== userId)
      throw serviceError('NOT_CHALLENGE_OWNER');

    /* ---------- RELEASE LOCK ---------- */
    await WalletService.unlock({
      walletId: challenge.creator_wallet_id,
      lockId: challenge.creator_lock_id,
      conn
    });

    await conn.query(
      `UPDATE head_to_head_challenges
       SET status = 'cancelled',
           cancelled_at = NOW()
       WHERE id = ?`,
      [challenge.id]
    );

    await conn.commit();

    return { cancelled: true };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* =========================================================
   GET CHALLENGE DETAILS
========================================================= */
exports.getChallenge = async ({ inviteCode }) => {

  const [[row]] =
    await pool.query(
      `
      SELECT
        c.uuid,
        c.invite_code,
        c.stake,
        c.status,
        c.creator_side,
        c.opponent_side,
        c.created_at,

        q.title,
        q.category,

        u1.username AS creator_username,
        u2.username AS opponent_username

      FROM head_to_head_challenges c

      JOIN head_to_head_questions q
        ON q.id = c.question_id

      JOIN users u1
        ON u1.id = c.creator_user_id

      LEFT JOIN users u2
        ON u2.id = c.opponent_user_id

      WHERE c.invite_code = ?
      `,
      [inviteCode]
    );

  if (!row)
    throw serviceError('NOT_FOUND');

  /* ===============================
     LOAD PLATFORM FEE
  =============================== */
  const [[feeRow]] = await pool.query(
    `
    SELECT value
    FROM system_settings
    WHERE \`key\` = 'H2H_FEE_PERCENT'
    LIMIT 1
    `
  );

  const feePercent = Number(feeRow?.value || 0);

  const stake = Number(row.stake);
  const totalPot = stake * 2;
  const platformFee = (totalPot * feePercent) / 100;
  const potentialWin = totalPot - platformFee;

  return {

    uuid: row.uuid,
    invite_code: row.invite_code,

    stake,
    total_pot: totalPot,
    platform_fee: Number(platformFee.toFixed(2)),
    potential_win: Number(potentialWin.toFixed(2)),

    status: row.status,
    creator_side: row.creator_side,
    opponent_side: row.opponent_side,
    created_at: row.created_at,

    title: row.title,
    category: row.category,

    creator_username: row.creator_username,
    opponent_username: row.opponent_username

  };

};
/* =========================================================
   LIST USER CHALLENGES
========================================================= */
/* =========================================================
   LIST USER CHALLENGES
========================================================= */
exports.listChallenges = async ({
  userId,
  page = 1,
  limit = 20
}) => {

  page = Number(page) || 1;
  limit = Number(limit) || 20;

  const offset = (page - 1) * limit;

  /* ===============================
     LOAD PLATFORM FEE
  =============================== */
  const [[feeRow]] = await pool.query(
    `
    SELECT value
    FROM system_settings
    WHERE \`key\` = 'H2H_FEE_PERCENT'
    LIMIT 1
    `
  );

  const feePercent = Number(feeRow?.value || 0);

  /* ===============================
     LOAD CHALLENGES
  =============================== */
  const [rows] =
    await pool.query(
      `
      SELECT
        c.uuid,
        c.invite_code,
        c.stake,
        c.status,
        c.creator_side,
        c.opponent_side,
        c.created_at,
        c.winner_user_id,
        c.payout,

        q.title,
        q.category,

        u1.username AS creator_username,
        u2.username AS opponent_username

      FROM head_to_head_challenges c

      JOIN head_to_head_questions q
        ON q.id = c.question_id

      JOIN users u1
        ON u1.id = c.creator_user_id

      LEFT JOIN users u2
        ON u2.id = c.opponent_user_id

      WHERE c.creator_user_id = ?
         OR c.opponent_user_id = ?

      ORDER BY c.created_at DESC

      LIMIT ? OFFSET ?
      `,
      [userId, userId, limit, offset]
    );

  /* ===============================
     ENRICH DATA
  =============================== */
  const enriched = rows.map(row => {

    const stake = Number(row.stake);
    const totalPot = stake * 2;

    let platformFee = (totalPot * feePercent) / 100;
    let potentialWin = totalPot - platformFee;

    let userResult;

    /* ===============================
       HANDLE VOID / CANCEL / EXPIRED
    =============================== */
    if (['voided', 'cancelled', 'expired'].includes(row.status)) {

      platformFee = 0;
      potentialWin = 0;
      userResult = row.status;

    }

  /* ===============================
   HANDLE SETTLED / VOIDED
=============================== */
else if (['settled', 'voided'].includes(row.status)) {

  if (row.status === 'voided') {

    userResult = 'voided';

  } else if (row.winner_user_id === userId) {

    userResult = 'won';

  } else {

    userResult = 'lost';

  }

}

    /* ===============================
       HANDLE ACTIVE STATES
    =============================== */
    else if (row.status === 'accepted') {
      userResult = 'accepted';
    }
    else if (row.status === 'pending') {
      userResult = 'pending';
    }
    else {
      userResult = row.status;
    }

    /* ===============================
       RETURN CLEAN OBJECT
    =============================== */
    return {

      uuid: row.uuid,

      invite_code: row.invite_code,

      stake,

      total_pot: totalPot,

      platform_fee: Number(platformFee.toFixed(2)),

      potential_win: Number(potentialWin.toFixed(2)),

      payout: Number(row.payout || 0),

      status: row.status,

      result: userResult,
      user_result: userResult,

      creator_side: row.creator_side,

      opponent_side: row.opponent_side,

      created_at: row.created_at,

      title: row.title,

      category: row.category,

      creator_username: row.creator_username,

      opponent_username: row.opponent_username

    };

  });

  return enriched;

};

/* =========================================================
   LIST AVAILABLE 1V1 QUESTIONS (USER APP)
   Shows questions user can create challenge on
========================================================= */
exports.listAvailableQuestions = async ({
  status = 'published',
  category,
  page = 1,
  limit = 20
}) => {

  page = Number(page) || 1;
  limit = Number(limit) || 20;

  if (page < 1) page = 1;
  if (limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const filters = [];
  const params = [];

  /* =========================
     STATUS FILTER
     Only published questions are playable
  ========================= */
  filters.push('status = ?');
  params.push(status);

  /* =========================
     CATEGORY FILTER (optional)
  ========================= */
  if (category) {
    filters.push('category = ?');
    params.push(category);
  }

  const whereClause =
    filters.length > 0
      ? `WHERE ${filters.join(' AND ')}`
      : '';

  /* =========================
     MAIN QUERY
  ========================= */
  const [rows] = await pool.query(
    `
    SELECT
      id,
      uuid,
      title,
      description,
      category,
      status,
      created_at
    FROM head_to_head_questions
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  /* =========================
     COUNT QUERY
  ========================= */
  const [[countRow]] = await pool.query(
    `
    SELECT COUNT(*) as total
    FROM head_to_head_questions
    ${whereClause}
    `,
    params
  );

  const total = Number(countRow.total);

  return {

    items: rows.map(q => ({
      id: q.id,
      uuid: q.uuid,
      title: q.title,
      description: q.description,
      category: q.category,
      status: q.status,
      created_at: q.created_at
    })),

    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }

  };

};