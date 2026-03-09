'use strict';

const { CATEGORIES } = require('../constants/curatedQuestion.constants');

exports.validateCreate = (payload) => {
  if (!payload.title || !payload.category) {
    throw new Error('MISSING_REQUIRED_FIELDS');
  }

  if (!CATEGORIES.includes(payload.category)) {
    throw new Error('INVALID_CATEGORY');
  }

  if (!payload.yes_odds || !payload.no_odds) {
    throw new Error('ODDS_REQUIRED');
  }

  if (Number(payload.yes_odds) <= 1 || Number(payload.no_odds) <= 1) {
    throw new Error('INVALID_ODDS');
  }

  if (!payload.lock_time || new Date(payload.lock_time) <= new Date()) {
    throw new Error('INVALID_LOCK_TIME');
  }
};
