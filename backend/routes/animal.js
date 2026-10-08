const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan');
const { recibirImagenApariencia } = require('../middleware/uploadApariencia');
const fotoAnimalCtrl = require('../controllers/fotoAnimal-controller');
const puedeVer = autorizarPermiso('inventario.ver');
const puedeGestionar = autorizarPermiso('inventario.gestionar');

const {
    getAnimales,
    createAnimal,
    getAnimal,
    updateAnimal,
    deleteAnimal,
    getCatalogoRacial,
    updateEstadoSanitario,
    updateEstadoSanitarioLote
} = require('../controllers/animal-controller');
const { getDescendenciaDirecta, updateGenealogiaAnimal } = require('../controllers/genealogiaController');

router.route('/')
    .get(puedeVer, getAnimales)
    .post(puedeGestionar, createAnimal);

router.patch('/estado-sanitario', autorizarPermiso('sanidad.gestionar'), updateEstadoSanitarioLote);
router.get('/catalogos/razas', puedeVer, getCatalogoRacial);
router.get('/:id/descendencia', puedeVer, getDescendenciaDirecta);
router.patch('/:id/estado-sanitario', autorizarPermiso('sanidad.gestionar'), updateEstadoSanitario);
router.post('/:id/foto', puedeGestionar, requireFeature('fotosAnimales'), recibirImagenApariencia, fotoAnimalCtrl.subir);
router.delete('/:id/foto', puedeGestionar, fotoAnimalCtrl.eliminar);

router.route('/:id')
    .get(puedeVer, getAnimal)
    .put(puedeGestionar, updateAnimal)
    .delete(puedeGestionar, deleteAnimal);

router.put('/:id/genealogia', puedeGestionar, updateGenealogiaAnimal);

module.exports = router;
