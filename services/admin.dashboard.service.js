'use strict';

const pool = require('../config/db');
const FinanceService = require('../services/finance.service');

exports.getSummary = async () => {

  const conn = await pool.getConnection();

  try {

    /* =====================================================
       KPI QUERIES
    ===================================================== */

    const [
      [[totalUsers]],
      [[activeToday]],
      [[platformVolume]],
      [[totalDeposits]],
      [[totalWithdrawals]]
    ] = await Promise.all([

      conn.query(`SELECT COUNT(*) AS total FROM users`),

      conn.query(`
        SELECT COUNT(DISTINCT user_id) AS total
        FROM homepage_activity
        WHERE DATE(created_at) = CURDATE()
      `),

      conn.query(`
        SELECT
          (SELECT IFNULL(SUM(total_stake),0) FROM curated_entry_slips)
          +
          (SELECT IFNULL(SUM(stake),0) FROM head_to_head_challenges)
        AS volume
      `),

      conn.query(`
        SELECT IFNULL(SUM(amount),0) AS total
        FROM wallet_transactions
        WHERE source_type = 'deposit'
      `),

      conn.query(`
        SELECT IFNULL(SUM(amount),0) AS total
        FROM wallet_transactions
        WHERE source_type = 'withdrawal'
      `)
    ]);


    /* =====================================================
       FINANCIAL
    ===================================================== */

    const [
      [[depositsToday]],
      [[withdrawalsToday]],
      [[lockedFunds]],
      [[walletBalance]]
    ] = await Promise.all([

      conn.query(`
        SELECT IFNULL(SUM(amount),0) AS total
        FROM wallet_transactions
        WHERE source_type='deposit'
        AND DATE(created_at)=CURDATE()
      `),

      conn.query(`
        SELECT IFNULL(SUM(amount),0) AS total
        FROM wallet_transactions
        WHERE source_type='withdrawal'
        AND DATE(created_at)=CURDATE()
      `),

      conn.query(`
        SELECT IFNULL(SUM(locked_balance),0) AS total
        FROM wallets
      `),

      conn.query(`
        SELECT IFNULL(SUM(balance),0) AS total
        FROM wallets
      `)

    ]);


    /* =====================================================
       USER METRICS
    ===================================================== */

    const [
      [[newUsersToday]],
      [[newUsersWeek]],
      [[callsToday]]
    ] = await Promise.all([

      conn.query(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE DATE(created_at)=CURDATE()
      `),

      conn.query(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `),

      conn.query(`
        SELECT COUNT(*) AS total
        FROM curated_entry_slips
        WHERE DATE(created_at)=CURDATE()
      `)

    ]);



    /* =====================================================
       MARKET ACTIVITY
    ===================================================== */

    const [
      [[curatedActive]],
      [[h2hActiveQuestions]],
      [[h2hActiveChallenges]],
      [[openCalls]],
      [[callsSettledToday]]
    ] = await Promise.all([

      conn.query(`
        SELECT COUNT(*) AS total
        FROM curated_questions
        WHERE status='published'
      `),

      conn.query(`
        SELECT COUNT(*) AS total
        FROM head_to_head_questions
        WHERE status='published'
      `),

      conn.query(`
        SELECT COUNT(*) AS total
        FROM head_to_head_challenges
        WHERE status IN ('pending','accepted')
      `),

      conn.query(`
        SELECT COUNT(*) AS total
        FROM curated_question_entries
        WHERE status='open'
      `),

      conn.query(`
        SELECT COUNT(*) AS total
        FROM curated_entry_slips
        WHERE status='settled'
        AND DATE(updated_at)=CURDATE()
      `)

    ]);


    /* =====================================================
       RISK METRICS
    ===================================================== */

    const [[highestExposure]] = await conn.query(`
      SELECT
        q.id,
        q.title,
        GREATEST(e.yes_liability,e.no_liability) AS exposure
      FROM curated_question_exposure e
      JOIN curated_questions q
        ON q.id = e.question_id
      ORDER BY exposure DESC
      LIMIT 1
    `);


    const [[largestCall]] = await conn.query(`
      SELECT
        u.username AS user,
        e.stake AS amount,
        q.title AS question_title
      FROM curated_question_entries e
      JOIN users u ON u.id = e.user_id
      JOIN curated_questions q ON q.id = e.question_id
      ORDER BY e.stake DESC
      LIMIT 1
    `);


    const [[highestH2H]] = await conn.query(`
      SELECT
        q.title AS question_title,
        SUM(c.stake) AS total_staked
      FROM head_to_head_challenges c
      JOIN head_to_head_questions q
        ON q.id = c.question_id
      GROUP BY q.id
      ORDER BY total_staked DESC
      LIMIT 1
    `);



    /* =====================================================
       TOP USERS TODAY
    ===================================================== */

    const [topUsers] = await conn.query(`
      SELECT
        u.id AS user_id,
        u.username,
        COUNT(s.id) AS calls_today,
        SUM(s.total_stake) AS volume_today
      FROM curated_entry_slips s
      JOIN users u ON u.id = s.user_id
      WHERE DATE(s.created_at)=CURDATE()
      GROUP BY u.id
      ORDER BY volume_today DESC
      LIMIT 10
    `);



    /* =====================================================
       RECENT ACTIVITY
    ===================================================== */

    const [recentActivity] = await conn.query(`
      SELECT
        action_type AS type,
        username,
        amount,
        question_title,
        created_at AS time
      FROM homepage_activity
      ORDER BY created_at DESC
      LIMIT 20
    `);

/* =====================================================
   LOAD NET PROFIT FROM FINANCE ENGINE
===================================================== */

const finance = await FinanceService.getSummary();
const netProfit = Number(finance.profit.net_profit || 0);

    return {

      kpis: {
        total_users: Number(totalUsers.total || 0),
        active_today: Number(activeToday.total || 0),
        platform_volume: Number(platformVolume.volume || 0),
        platform_profit: netProfit,
        total_deposits: Number(totalDeposits.total || 0),
        total_withdrawals: Number(totalWithdrawals.total || 0)
      },

      financial: {
        deposits_today: Number(depositsToday.total || 0),
        withdrawals_today: Number(withdrawalsToday.total || 0),
        pending_withdrawals: 0,
        locked_user_funds: Number(lockedFunds.total || 0),
        wallet_system_balance: Number(walletBalance.total || 0)
      },

      users: {
        new_users_today: Number(newUsersToday.total || 0),
        new_users_week: Number(newUsersWeek.total || 0),
        calls_today: Number(callsToday.total || 0),
        avg_calls_per_user: Number(callsToday.total || 0) / (Number(activeToday.total || 0) || 1),
        retention_7d: 0
      },

      markets: {
        curated_active: Number(curatedActive.total || 0),
        h2h_active_questions: Number(h2hActiveQuestions.total || 0),
        h2h_active_challenges: Number(h2hActiveChallenges.total || 0),
        open_calls: Number(openCalls.total || 0),
        calls_settled_today: Number(callsSettledToday.total || 0)
      },

      risk: {
        highest_exposure_question: highestExposure
          ? {
              id: Number(highestExposure.id || 0),
              title: highestExposure.title,
              exposure: Number(highestExposure.exposure || 0)
            }
          : { id: 0, title: '', exposure: 0 },

        largest_single_call: largestCall
          ? {
              user: largestCall.user,
              amount: Number(largestCall.amount || 0),
              question_title: largestCall.question_title
            }
          : { user: '', amount: 0, question_title: '' },

        highest_h2h_pool: highestH2H
          ? {
              question_title: highestH2H.question_title,
              total_staked: Number(highestH2H.total_staked || 0)
            }
          : { question_title: '', total_staked: 0 }
      },

      top_users: topUsers.map(u => ({
        user_id: Number(u.user_id),
        username: u.username,
        calls_today: Number(u.calls_today || 0),
        volume_today: Number(u.volume_today || 0)
      })),

      recent_activity: recentActivity.map(a => {

        let display = '';

        if (a.type === 'placed_call')
          display = `${a.username} placed call ₦${Number(a.amount || 0)}`;

        else if (a.type === 'won_call')
          display = `${a.username} won ₦${Number(a.amount || 0)}`;

        else if (a.type === 'funded_wallet')
          display = `${a.username} funded wallet ₦${Number(a.amount || 0)}`;

        else if (a.type === 'withdrew')
          display = `${a.username} withdrew ₦${Number(a.amount || 0)}`;

        else if (a.type === 'created_1v1')
          display = `${a.username} created a duel`;

        return {
          type: a.type,
          display,
          time: new Date(a.time).toISOString()
        };

      }),

      system: {
        api_latency_ms: 0,
        db_connections: 0,
        redis_status: 0,
        queue_jobs_pending: 0
      }

    };

  }
  finally {
    conn.release();
  }

};