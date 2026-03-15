'use strict';

const pool = require('../config/db');
const { redis, isRedisAvailable } = require('../config/redis');

const CACHE_KEY = 'homepage:v1';
const CACHE_TTL = 30; // seconds

/* =========================================================
   SAFE REDIS GET
========================================================= */
async function cacheGet(key) {

  try {

    if (!isRedisAvailable()) return null;

    const data = await redis.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (parseErr) {
      console.error('[REDIS PARSE ERROR]', parseErr.message);
      return null;
    }

  }
  catch (err) {

    console.error('[REDIS GET ERROR]', err.message);
    return null;

  }

}

/* =========================================================
   SAFE REDIS SET
========================================================= */
async function cacheSet(key, value, ttl) {

  try {

    if (!isRedisAvailable()) return;

    await redis.set(
      key,
      JSON.stringify(value),
      'EX',
      ttl
    );

  }
  catch (err) {

    console.error('[REDIS SET ERROR]', err.message);

  }

}

/* =========================================================
   USERNAME MASKING
========================================================= */
function maskUsername(username) {

  if (!username) return 'User';

  const len = username.length;

  if (len <= 2) return username;

  return (
    username.slice(0, 2)
    + '****' +
    username.slice(-2)
  );

}

/* =========================================================
   BILLBOARDS
========================================================= */
async function getBillboards() {

  const [rows] = await pool.query(`
    SELECT
      id,
      image_url,
      action_type,
      action_value,
      priority
    FROM homepage_billboards
    WHERE is_active = TRUE
    ORDER BY priority DESC, id DESC
  `);

  return rows;

}

/* =========================================================
   QUICK STATS
========================================================= */
async function getStats() {

  const [[row]] = await pool.query(`
    SELECT
      total_users,
      total_calls,
      total_volume,
      total_paid_out,
      active_questions
    FROM homepage_stats_cache
    WHERE id = 1
    LIMIT 1
  `);

  return {

    total_users: Number(row?.total_users || 0),

    total_calls: Number(row?.total_calls || 0),

    total_volume: Number(row?.total_volume || 0),

    total_paid_out: Number(row?.total_paid_out || 0),

    active_questions: Number(row?.active_questions || 0)

  };

}

/* =========================================================
   CURATED QUESTIONS (COUNTDOWN READY)
========================================================= */
async function getCategoryQuestions() {

  const [rows] = await pool.query(`
    SELECT
      q.id,
      q.uuid,
      q.title,
      q.category,
      q.yes_odds,
      q.no_odds,
      q.status,
      q.lock_time,
      UNIX_TIMESTAMP(q.lock_time) AS closes_at_unix,
      UNIX_TIMESTAMP(NOW()) AS server_time,
      COALESCE(e.yes_liability,0) AS yes_liability,
      COALESCE(e.no_liability,0) AS no_liability
    FROM curated_questions q
    LEFT JOIN curated_question_exposure e
      ON e.question_id = q.id
    WHERE
      q.status IN ('published','locked')
    ORDER BY q.lock_time ASC
    LIMIT 100
  `);

  const grouped = {
    sports: [],
    finance: [],
    entertainment: [],
    politics: []
  };

  for (const r of rows) {

    const item = {

      id: r.id,

      uuid: r.uuid,

      title: r.title,

      status: r.status,

      yes_odds: Number(r.yes_odds),

      no_odds: Number(r.no_odds),

      total_yes_amount: Number(r.yes_liability),

      total_no_amount: Number(r.no_liability),

      /* RAW LOCK TIME */
      lock_time: new Date(r.lock_time).toISOString(),

      /* PRIMARY COUNTDOWN FIELD */
      closes_at: new Date(r.lock_time).toISOString(),

      /* FAST COUNTDOWN */
      closes_at_unix: Number(r.closes_at_unix),

      /* SERVER SYNC TIME */
      server_time: Number(r.server_time)

    };

    if (grouped[r.category]) {
      grouped[r.category].push(item);
    }

  }

  return grouped;

}

/* =========================================================
   RECENT ACTIVITY (REAL + FAKE)
========================================================= */
async function getRecentActivity() {

  const [fake] = await pool.query(`
    SELECT
      display_name,
      action_type,
      amount,
      question_title,
      created_at,
      'admin_generated' as source
    FROM homepage_recent_activity_fake
    ORDER BY created_at DESC
    LIMIT 20
  `);

  const [real] = await pool.query(`
    SELECT
      u.username,
      e.stake as amount,
      q.title as question_title,
      e.created_at,
      'placed_call' as action_type,
      'real' as source
    FROM curated_question_entries e
    JOIN users u ON u.id = e.user_id
    JOIN curated_questions q ON q.id = e.question_id
    ORDER BY e.created_at DESC
    LIMIT 20
  `);

  const realMasked = real.map(r => ({

    display_name: maskUsername(r.username),

    action_type: r.action_type,

    amount: Number(r.amount),

    question_title: r.question_title,

    created_at: r.created_at,

    source: r.source

  }));

  return [...fake, ...realMasked]
    .sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )
    .slice(0, 20);

}

/* =========================================================
   H2H QUESTIONS (TRENDING)
========================================================= */
async function getH2HQuestions() {

  const [rows] = await pool.query(`
    SELECT
      id,
      uuid,
      title,
      description,
      category,
      created_at
    FROM head_to_head_questions
    WHERE status = 'published'
    ORDER BY created_at DESC
    LIMIT 20
  `);

  return rows;

}

/* =========================================================
   H2H OPEN CHALLENGES
========================================================= */
async function getH2HChallenges() {

  const [rows] = await pool.query(`
    SELECT
      uuid,
      stake,
      created_at
    FROM head_to_head_challenges
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT 20
  `);

  return rows.map(r => ({

    challenge_id: r.uuid,

    stake: Number(r.stake),

    created_at: r.created_at

  }));

}

/* =========================================================
   WINNERS (REAL + FAKE)
========================================================= */
async function getWinners() {

  const [fake] = await pool.query(`
    SELECT
      display_name,
      amount_won,
      question_title,
      created_at,
      'admin_generated' as source
    FROM homepage_winner_fake
    ORDER BY created_at DESC
    LIMIT 20
  `);

  const [real] = await pool.query(`
    SELECT
      u.username,
      e.payout as amount_won,
      q.title as question_title,
      e.created_at,
      'real' as source
    FROM curated_question_entries e
    JOIN users u ON u.id = e.user_id
    JOIN curated_questions q ON q.id = e.question_id
    WHERE e.status = 'won'
    ORDER BY e.created_at DESC
    LIMIT 20
  `);

  const realMasked = real.map(r => ({

    display_name: maskUsername(r.username),

    amount_won: Number(r.amount_won),

    question_title: r.question_title,

    created_at: r.created_at,

    source: r.source

  }));

  return [...fake, ...realMasked]
    .sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )
    .slice(0, 20);

}

/* =========================================================
   MAIN HOMEPAGE SERVICE
========================================================= */
exports.getHomepage = async () => {

  /* =============================
     TRY CACHE FIRST
  ============================= */
  const cached = await cacheGet(CACHE_KEY);

  if (cached) {
    return cached;
  }

  /* =============================
     LOAD FROM DATABASE
  ============================= */
  const [
    billboards,
    stats,
    recent_activity,
    h2h_questions,
    h2h_challenges,
    categories,
    winner_ticker
  ] = await Promise.all([
    getBillboards(),
    getStats(),
    getRecentActivity(),
    getH2HQuestions(),
    getH2HChallenges(),
    getCategoryQuestions(),
    getWinners()
  ]);

  const result = {

    billboards,

    stats,

    recent_activity,

    trending_1v1_questions: h2h_questions,

    h2h_challenges,

    categories,

    winner_ticker,

    server_time: new Date().toISOString()

  };

  /* =============================
     SAVE CACHE
  ============================= */
  await cacheSet(
    CACHE_KEY,
    result,
    CACHE_TTL
  );

  return result;

};