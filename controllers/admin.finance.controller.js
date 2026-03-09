'use strict';

const FinanceService = require('../services/finance.service');
const ExpenseService = require('../services/finance.expense.service');

exports.summary = async (req, res) => {

  const data = await FinanceService.getSummary();

  res.json({
    success: true,
    data
  });

};

exports.createExpense = async (req, res) => {

  const { category, description, amount } = req.body;

  const result = await ExpenseService.createExpense({
    category,
    description,
    amount,
    adminId:req.admin.adminId
  });

  res.json({
    success: true,
    data: result
  });

};

exports.listExpenses = async (req, res) => {

  const data = await ExpenseService.listExpenses();

  res.json({
    success: true,
    data
  });

};

exports.deleteExpense = async (req, res) => {

  await ExpenseService.deleteExpense({
    id: req.params.id
  });

  res.json({ success: true });

};