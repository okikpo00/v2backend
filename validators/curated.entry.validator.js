'use strict';

function validationError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

exports.validateEntryPayload = ({ stake, entries }) => {

  if (!stake || Number(stake) <= 0) {
    throw validationError('INVALID_STAKE');
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    throw validationError('INVALID_ENTRIES');
  }

  const unique = new Set();

  for (const e of entries) {

    if (!e.question_id) {
      throw validationError('QUESTION_ID_REQUIRED');
    }

    if (!['yes','no'].includes(e.side)) {
      throw validationError('INVALID_SIDE');
    }

    if (unique.has(e.question_id)) {
      throw validationError('DUPLICATE_QUESTION_IN_SLIP');
    }

    unique.add(e.question_id);
  }
};
