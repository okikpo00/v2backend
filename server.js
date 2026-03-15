'use strict';

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const adminAuthRoutes = require('./routes/admin.auth.routes');
const adminWalletRoutes = require('./routes/admin.wallet.routes');
const adminSystemRoutes = require('./routes/admin.system.routes');
const adminWalletTxRoutes = require('./routes/admin.wallet.transactions.routes');
const walletDepositRoutes = require('./routes/wallet.deposit.routes');
const flutterwaveWebhookRoutes = require('./routes/flutterwave.webhook.routes');
const withdrawalRoutes = require('./routes/withdrawal.routes');
 const adminWithdrawalRoutes =  require('./routes/admin.withdrawal.routes');
const adminDepositRoutes = require('./routes/admin.deposit.routes');
const adminUserRoutes = require('./routes/admin.user.routes');
const userProfileRoutes = require('./routes/user.profile.routes');
const walletTransactionRoutes = require('./routes/wallet.transaction.routes')
 const notificationRoutes = require('./routes/notification.routes')
const adminCuratedQuestionsRoutes = require('./routes/admin.curated.questions.routes');
const curatedEntryRoutes = require('./routes/curated.entry.routes');
const curatedQuestionsRoutes = require('./routes/curated.questions.routes');
const betsRoutes = require('./routes/bets.routes');
const adminCuratedSettlementRoutes = require('./routes/admin.curated.settlement.routes');
 const headtoheadUserRoutes = require('./routes/head_to_head.user.routes');
const headtoheadQuestionRoutes = require('./routes/admin.head_to_head.question.routes');
const adminCuratedQuestionsDetailsRoutes = require('./routes/admin.curated.question.details.routes');
const adminCuratedSlipRoutes = require('./routes/admin.curated.slip.routes');
const adminCuratedSlipDetailsRoutes = require('./routes/admin.curated.slip.details.routes');
const titleTemplateRoutes = require('./routes/admin.curated.title.template.routes');
const homepageRoutes = require('./routes/homepage.routes');
const adminBillboardRoutes = require('./routes/admin.billboard.routes');
const adminFakeActivityRoutes = require('./routes/admin.fake.activity.routes');
const adminFakeWinnerRoutes = require('./routes/admin.fake.winner.routes');
const adminDashboardRoutes  =   require('./routes/admin.dashboard.routes')
const financeRoutes =  require('./routes/admin.finance.routes')
/* =========================
   APP INIT
========================= */

const app = express();

/* =========================
   GLOBAL MIDDLEWARE
========================= */
/* =========================
   CORS CONFIG
========================= */

const allowedOrigins = [
  'https://trebetta.com',
  'https://www.trebetta.com',
  'https://admin.trebetta.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.options(/.*/, cors());
// ONLY for webhooks
app.use(
  '/webhooks',
  express.raw({ type: 'application/json' })
);


// Security headers
app.use(helmet());

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Cookies (future-safe)
app.use(cookieParser());

/* =========================
   HEALTH CHECK
========================= */

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    env: env.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* =========================
   ROUTES
========================= */

app.use('/auth', authRoutes);
app.use('/admin/auth', adminAuthRoutes);
app.use('/admin/wallet', adminWalletRoutes);
app.use('/admin/system', adminSystemRoutes);
app.use('/admin/wallet/transactions', adminWalletTxRoutes);
app.use('/wallet', walletDepositRoutes);
app.use('/webhooks', flutterwaveWebhookRoutes);
app.use('/withdraw', withdrawalRoutes);
app.use('/admin/withdrawals',  adminWithdrawalRoutes);
app.use('/admin/deposits', adminDepositRoutes);
app.use('/admin/users', adminUserRoutes);
app.use('/user', userProfileRoutes);
app.use('/wallet', walletTransactionRoutes);
app.use('/notifications', notificationRoutes);
app.use( '/admin/curated-questions', adminCuratedQuestionsRoutes);
app.use('/', curatedEntryRoutes);
app.use('/', curatedQuestionsRoutes);
app.use('/', betsRoutes); 
app.use('/admin/curated/settlement', adminCuratedSettlementRoutes);
app.use('/user/head-to-head', headtoheadUserRoutes);
app.use('/admin/head-to-head/questions', headtoheadQuestionRoutes);
app.use('/admin/curated-questions', adminCuratedQuestionsDetailsRoutes);
app.use('/admin/curated/slips',  adminCuratedSlipRoutes);
app.use('/admin/curated/slips/',  adminCuratedSlipDetailsRoutes);
app.use('/admin/curated/title-templates', titleTemplateRoutes);
app.use('/homepage', homepageRoutes); 
app.use('/admin/homepage/billboards', adminBillboardRoutes);
app.use('/admin/homepage/activity/fake', adminFakeActivityRoutes);
app.use('/admin/homepage/winners/fake',adminFakeWinnerRoutes);
app.use('/admin/dashboard', adminDashboardRoutes);
app.use('/admin/finance',  financeRoutes); 



/* =========================
   404 HANDLER
========================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  // Never leak internals
  console.error('🔥 Unhandled error:', err);

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

/* =========================
   START SERVER
========================= */

app.listen(env.PORT, () => {
  console.log(
    `🚀 Trebetta backend running on port ${env.PORT} (${env.NODE_ENV})`
  );
});
const cron = require('node-cron');
const autoLockJob = require('./jobs/curated.autoLock.job');

cron.schedule('* * * * *', async () => {
  await autoLockJob.run();
});
const h2hExpiryCron =
require('./jobs/head_to_head.expiry.cron');

setInterval(() => {

  h2hExpiryCron.run();

}, 10000);


const statsCron =
require('./jobs/homepage.stats.cron');

cron.schedule('*/1 * * * *', ()=>{

  statsCron.refreshStats();

});


/* =========================
   PROCESS SAFETY
========================= */

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});
