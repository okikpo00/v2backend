'use strict';

module.exports = {

  ENTRY_STATUS: {
    OPEN: 'open',
    WON: 'won',
    LOST: 'lost',
    VOIDED: 'voided',      // ✅ ADD THIS
    REFUNDED: 'refunded'
  },

  SLIP_STATUS: {
    OPEN: 'open',
    SETTLED: 'settled',
    VOIDED: 'voided'
  },

  QUESTION_STATUS: {
    SETTLED: 'settled',
    VOIDED: 'voided'
  },

  VOID_ODDS: 1

};