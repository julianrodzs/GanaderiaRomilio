const test = require('node:test');
const assert = require('node:assert/strict');

const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { Membresia } = require('../models/Membresia');
const {
    listarUsuariosAsignables,
    validarUsuarioAsignable
} = require('../services/usuarioAsignable-service');

test('los usuarios asignables se limitan a quienes tienen acceso a la finca activa', async () => {
    const findOriginal = Membresia.find;
    let filtroRecibido;

    Membresia.find = (filtro) => {
        filtroRecibido = filtro;
        return { populate: async () => [] };
    };

    try {
        await ejecutarConOrganizacion('organizacion-1', () => listarUsuariosAsignables('Sanidad'), 'finca-1');

        assert.equal(filtroRecibido.organizacionId, 'organizacion-1');
        assert.deepEqual(filtroRecibido.$or, [
            { accesoTodasFincas: true },
            { fincas: 'finca-1' }
        ]);
    } finally {
        Membresia.find = findOriginal;
    }
});

test('la validacion del responsable exige acceso a la finca activa', async () => {
    const findOneOriginal = Membresia.findOne;
    let filtroRecibido;

    Membresia.findOne = (filtro) => {
        filtroRecibido = filtro;
        return {
            populate: async () => ({
                rol: 'Encargado',
                estado: 'Activo',
                usuario: {
                    toObject: () => ({ _id: 'usuario-1', nombre: 'Responsable' })
                }
            })
        };
    };

    try {
        const responsable = await ejecutarConOrganizacion(
            'organizacion-1',
            () => validarUsuarioAsignable('usuario-1', 'Sanidad'),
            'finca-1'
        );

        assert.equal(responsable.rol, 'Encargado');
        assert.deepEqual(filtroRecibido.$or, [
            { accesoTodasFincas: true },
            { fincas: 'finca-1' }
        ]);
    } finally {
        Membresia.findOne = findOneOriginal;
    }
});
