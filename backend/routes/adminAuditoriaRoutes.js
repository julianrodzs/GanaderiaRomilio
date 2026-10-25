const { Router } = require('express');
const { getAuditoriasPlataforma } = require('../controllers/auditoria-controller');

const router = Router();

router.get('/', getAuditoriasPlataforma);

module.exports = router;
