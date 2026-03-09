'use strict';

const pool = require('../config/db');

exports.createExpense = async ({ category, description, amount, adminId }) => {

  const [result] = await pool.query(
    `
    INSERT INTO company_expenses
    (category, description, amount, created_by)
    VALUES (?, ?, ?, ?)
    `,
    [
      category,
      description || null,
      Number(amount),
      adminId
    ]
  );

  return { id: result.insertId };

};

exports.listExpenses = async () => {

  const [rows] = await pool.query(`
    SELECT
      id,
      category,
      description,
      amount,
      created_by,
      created_at
    FROM company_expenses
    ORDER BY created_at DESC
  `);

  return rows;

};

exports.deleteExpense = async ({ id }) => {

  await pool.query(
    `DELETE FROM company_expenses WHERE id=?`,
    [id]
  );

};