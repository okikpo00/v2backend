'use strict';

const AdminDepositService = require('../services/admin.deposit.service');

exports.list = async (req, res) => {
  try {
    const {
      status,
      email,
      user_id,
      tx_ref,
      provider_tx_id,
      cursor,
      limit
    } = req.query;

    const result = await AdminDepositService.fetchDeposits({
      status,
      email,
      user_id,
      tx_ref,
      provider_tx_id,
      cursor,
      limit
    });

    return res.json({
      success: true,
      data: {
        items: result.items,
        pagination: {
          next_cursor: result.next_cursor,
          limit: Number(limit) || 50
        }
      }
    });
  } catch (err) {
    console.error('[ADMIN_DEPOSIT_LIST_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to load deposits'
    });
  }
};
