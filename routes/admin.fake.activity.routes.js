'use strict';

const router = require('express').Router();

const C =
require('../controllers/admin.fake.activity.controller');

const requireAdminAuth =
require('../middlewares/admin.auth.guard');

router.post('/', requireAdminAuth, C.create);

router.get(
  '/',
  requireAdminAuth,
  C.list
);

router.delete(
  '/:id',
  requireAdminAuth,
  C.delete
);


module.exports = router;
