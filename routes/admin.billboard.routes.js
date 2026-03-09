'use strict';

const router = require('express').Router();

const C =
require('../controllers/admin.billboard.controller');

const requireAdminAuth =
require('../middlewares/admin.auth.guard');

router.get('/', requireAdminAuth, C.list);

router.post('/', requireAdminAuth, C.create);

router.patch('/:id/toggle', requireAdminAuth, C.toggle);

router.delete('/:id', requireAdminAuth, C.delete);

module.exports = router;
