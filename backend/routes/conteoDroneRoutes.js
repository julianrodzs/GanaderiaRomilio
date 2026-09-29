const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { crearUploadOrganizacion } = require('../middleware/uploadOrganizacion');

const {
    getConteos,
    procesarConteo,
    getConteo,
    deleteConteo
} = require('../controllers/conteoDroneController');

const router = Router();
const puedeVer = autorizarPermiso('drone.ver');
const puedeGestionar = autorizarPermiso('drone.gestionar');
const puedeEliminar = autorizarPermiso('drone.eliminar');

const upload = crearUploadOrganizacion({
    categoria: 'conteo-drone',
    limiteMb: 12,
    tiposPermitidos: (file) => file.mimetype.startsWith('image/')
});

router.get('/', puedeVer, getConteos);
router.post('/procesar', puedeGestionar, upload.single('imagen'), procesarConteo);
router.get('/:id', puedeVer, getConteo);
router.delete('/:id', puedeEliminar, deleteConteo);

module.exports = router;
