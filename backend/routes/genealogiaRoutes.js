const { Router } = require('express');
const { autorizarRoles } = require('../middleware/auth');
const {
    getArbolGenealogico,
    getDescendencia,
    getParentesco,
    getRiesgoCruce
} = require('../controllers/genealogiaController');

const router = Router();
const puedeVer = autorizarRoles('Administrador', 'Encargado');

router.get('/animal/:animalId/arbol', puedeVer, getArbolGenealogico);
router.get('/animal/:animalId/descendencia', puedeVer, getDescendencia);
router.get('/parentesco', puedeVer, getParentesco);
router.get('/riesgo-cruce', puedeVer, getRiesgoCruce);

module.exports = router;
