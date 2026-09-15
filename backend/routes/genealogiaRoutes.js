const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const {
    getArbolGenealogico,
    getDescendencia,
    getParentesco,
    getRiesgoCruce
} = require('../controllers/genealogiaController');

const router = Router();
const puedeVer = autorizarPermiso('inventario.ver');

router.get('/animal/:animalId/arbol', puedeVer, getArbolGenealogico);
router.get('/animal/:animalId/descendencia', puedeVer, getDescendencia);
router.get('/parentesco', puedeVer, getParentesco);
router.get('/riesgo-cruce', puedeVer, getRiesgoCruce);

module.exports = router;
