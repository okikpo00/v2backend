'use strict';

const pool = require('../config/db');


exports.getSummary = async () => {

  const conn = await pool.getConnection();

  try {

    /* =====================================================
       REVENUE — CURATED EDGE
    ===================================================== */

    const [[curatedEdgeRow]] = await conn.query(`
      SELECT
        IFNULL(SUM(total_stake - potential_payout),0) AS edge
      FROM curated_entry_slips
      WHERE status='settled'
    `);

    const curatedEdge = Number(curatedEdgeRow.edge || 0);

    /* =====================================================
       REVENUE — H2H FEES
    ===================================================== */

    const [[h2hFeesRow]] = await conn.query(`
      SELECT
        IFNULL(SUM(company_commission),0) AS fees
      FROM head_to_head_challenges
      WHERE status='settled'
    `);

    const h2hFees = Number(h2hFeesRow.fees || 0);

    const totalRevenue = curatedEdge + h2hFees;

    /* =====================================================
       EXPENSES
    ===================================================== */

    const [[expenseRow]] = await conn.query(`
      SELECT IFNULL(SUM(amount),0) AS total
      FROM company_expenses
    `);

    const totalExpenses = Number(expenseRow.total || 0);

    /* =====================================================
       NET PROFIT
    ===================================================== */

    const netProfit = totalRevenue - totalExpenses;

    const profitMargin =
      totalRevenue > 0
        ? Number(((netProfit / totalRevenue) * 100).toFixed(2))
        : 0;

    /* =====================================================
       DAILY PROFIT
    ===================================================== */

    const [[todayProfitRow]] = await conn.query(`
      SELECT
      (
        SELECT IFNULL(SUM(total_stake - potential_payout),0)
        FROM curated_entry_slips
        WHERE status='settled'
        AND DATE(updated_at)=CURDATE()
      )
      +
      (
        SELECT IFNULL(SUM(company_commission),0)
        FROM head_to_head_challenges
        WHERE status='settled'
        AND DATE(updated_at)=CURDATE()
      ) AS profit
    `);

    const todayProfit = Number(todayProfitRow.profit || 0);

    /* =====================================================
       WEEKLY PROFIT
    ===================================================== */

    const [[weekProfitRow]] = await conn.query(`
      SELECT
      (
        SELECT IFNULL(SUM(total_stake - potential_payout),0)
        FROM curated_entry_slips
        WHERE status='settled'
        AND YEARWEEK(updated_at)=YEARWEEK(NOW())
      )
      +
      (
        SELECT IFNULL(SUM(company_commission),0)
        FROM head_to_head_challenges
        WHERE status='settled'
        AND YEARWEEK(updated_at)=YEARWEEK(NOW())
      ) AS profit
    `);

    const weeklyProfit = Number(weekProfitRow.profit || 0);

    /* =====================================================
       MONTHLY PROFIT
    ===================================================== */

    const [[monthProfitRow]] = await conn.query(`
      SELECT
      (
        SELECT IFNULL(SUM(total_stake - potential_payout),0)
        FROM curated_entry_slips
        WHERE status='settled'
        AND MONTH(updated_at)=MONTH(NOW())
      )
      +
      (
        SELECT IFNULL(SUM(company_commission),0)
        FROM head_to_head_challenges
        WHERE status='settled'
        AND MONTH(updated_at)=MONTH(NOW())
      ) AS profit
    `);

    const monthlyProfit = Number(monthProfitRow.profit || 0);

    /* =====================================================
       EXPOSURE RISK
    ===================================================== */

    const [[exposureRow]] = await conn.query(`
      SELECT
        IFNULL(SUM(GREATEST(yes_liability,no_liability)),0) AS exposure
      FROM curated_question_exposure
    `);

    const totalExposure = Number(exposureRow.exposure || 0);

    const [[treasuryRow]] = await conn.query(`
      SELECT IFNULL(SUM(balance),0) AS balance
      FROM wallets
      WHERE status='active'
    `);

    const treasuryBalance = Number(treasuryRow.balance || 0);

    const exposureRatio =
      treasuryBalance > 0
        ? Number((totalExposure / treasuryBalance).toFixed(4))
        : 0;

    /* =====================================================
       HIGHEST EXPOSURE QUESTION
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

    /* =====================================================
   DAILY PERFORMANCE
===================================================== */

const [[dailyMetrics]] = await conn.query(`
  SELECT
    IFNULL(SUM(total_stake),0) AS total_stake_today,
    IFNULL(SUM(potential_payout),0) AS total_payout_today,
    IFNULL(SUM(total_stake - potential_payout),0) AS platform_result_today,
    SUM(CASE WHEN potential_payout > 0 THEN 1 ELSE 0 END) AS winning_calls_today,
    SUM(CASE WHEN potential_payout = 0 THEN 1 ELSE 0 END) AS losing_calls_today
  FROM curated_entry_slips
WHERE DATE(created_at)=CURDATE()
`);

/* =====================================================
   WEEKLY PERFORMANCE
===================================================== */

const [[weeklyMetrics]] = await conn.query(`
  SELECT
    IFNULL(SUM(total_stake),0) AS total_stake_week,
    IFNULL(SUM(potential_payout),0) AS total_payout_week,
    IFNULL(SUM(total_stake - potential_payout),0) AS platform_result_week,
    SUM(CASE WHEN potential_payout > 0 THEN 1 ELSE 0 END) AS winning_calls_week,
    SUM(CASE WHEN potential_payout = 0 THEN 1 ELSE 0 END) AS losing_calls_week
  FROM curated_entry_slips

  WHERE YEARWEEK(created_at)=YEARWEEK(NOW())
`);

/* =====================================================
   MONTHLY PERFORMANCE
===================================================== */

const [[monthlyMetrics]] = await conn.query(`
  SELECT
    IFNULL(SUM(total_stake),0) AS total_stake_month,
    IFNULL(SUM(potential_payout),0) AS total_payout_month,
    IFNULL(SUM(total_stake - potential_payout),0) AS platform_result_month,
    SUM(CASE WHEN potential_payout > 0 THEN 1 ELSE 0 END) AS winning_calls_month,
    SUM(CASE WHEN potential_payout = 0 THEN 1 ELSE 0 END) AS losing_calls_month
  FROM curated_entry_slips

   WHERE MONTH(created_at)=MONTH(NOW())
`);
/* =====================================================
   PROFIT CALCULATIONS
===================================================== */

const today_profit = Number(dailyMetrics.platform_result_today || 0);
const weekly_profit = Number(weeklyMetrics.platform_result_week || 0);
const monthly_profit = Number(monthlyMetrics.platform_result_month || 0);

/* =====================================================
   PREVIOUS PERIOD PROFITS
===================================================== */

const [[yesterdayProfitRow]] = await conn.query(`
  SELECT IFNULL(SUM(total_stake - potential_payout),0) AS profit
  FROM curated_entry_slips
  WHERE status='settled'
  AND DATE(updated_at)=CURDATE() - INTERVAL 1 DAY
`);

const [[lastWeekProfitRow]] = await conn.query(`
  SELECT IFNULL(SUM(total_stake - potential_payout),0) AS profit
  FROM curated_entry_slips
  WHERE status='settled'
  AND YEARWEEK(updated_at) = YEARWEEK(NOW()) - 1
`);

const [[lastMonthProfitRow]] = await conn.query(`
  SELECT IFNULL(SUM(total_stake - potential_payout),0) AS profit
  FROM curated_entry_slips
  WHERE status='settled'
  AND DATE_FORMAT(updated_at,'%Y-%m')
      = DATE_FORMAT(NOW() - INTERVAL 1 MONTH,'%Y-%m')
`);

const yesterday_profit = Number(yesterdayProfitRow.profit || 0);
const last_week_profit = Number(lastWeekProfitRow.profit || 0);
const last_month_profit = Number(lastMonthProfitRow.profit || 0);

/* =====================================================
   GROWTH CALCULATIONS
===================================================== */

const daily_growth =
  yesterday_profit === 0
    ? 0
    : ((today_profit - yesterday_profit) / yesterday_profit) * 100;

const weekly_growth =
  last_week_profit === 0
    ? 0
    : ((weekly_profit - last_week_profit) / last_week_profit) * 100;

const monthly_growth =
  last_month_profit === 0
    ? 0
    : ((monthly_profit - last_month_profit) / last_month_profit) * 100;

    /* =====================================================
   TOTAL PLATFORM PAYOUT
===================================================== */

const [[totalPayoutRow]] = await conn.query(`
  SELECT
  IFNULL(SUM(potential_payout),0) AS total_payout
  FROM curated_entry_slips
  WHERE status='settled'
`);

const total_payout = Number(totalPayoutRow.total_payout || 0);
    return {

      revenue: {
        curated_edge: curatedEdge,
        h2h_fees: h2hFees,
        total: totalRevenue
      },

payouts: {
  total_payout
},
      expenses: {
        total: totalExpenses
      },

      profit: {
        net_profit: netProfit,
        profit_margin: profitMargin
      },

performance: {

  total_stake_today: Number(dailyMetrics.total_stake_today || 0),
  total_payout_today: Number(dailyMetrics.total_payout_today || 0),
  platform_result_today: Number(dailyMetrics.platform_result_today || 0),
  winning_calls_today: Number(dailyMetrics.winning_calls_today || 0),
  losing_calls_today: Number(dailyMetrics.losing_calls_today || 0),

  total_stake_week: Number(weeklyMetrics.total_stake_week || 0),
  total_payout_week: Number(weeklyMetrics.total_payout_week || 0),
  platform_result_week: Number(weeklyMetrics.platform_result_week || 0),
  winning_calls_week: Number(weeklyMetrics.winning_calls_week || 0),
  losing_calls_week: Number(weeklyMetrics.losing_calls_week || 0),

  total_stake_month: Number(monthlyMetrics.total_stake_month || 0),
  total_payout_month: Number(monthlyMetrics.total_payout_month || 0),
  platform_result_month: Number(monthlyMetrics.platform_result_month || 0),
  winning_calls_month: Number(monthlyMetrics.winning_calls_month || 0),
  losing_calls_month: Number(monthlyMetrics.losing_calls_month || 0),

  today_profit,
  weekly_profit,
  monthly_profit
},
  growth: {
  daily_growth: Number(daily_growth.toFixed(2)),
  weekly_growth: Number(weekly_growth.toFixed(2)),
  monthly_growth: Number(monthly_growth.toFixed(2))
},

      risk: {
        total_exposure: totalExposure,
        treasury_balance: treasuryBalance,
        exposure_ratio: exposureRatio,
        highest_exposure_question: highestExposure || {
          id: null,
          title: null,
          exposure: 0
        }
      }

    };

  } finally {
    conn.release();
  }

};