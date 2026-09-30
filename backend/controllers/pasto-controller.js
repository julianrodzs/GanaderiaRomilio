const { listarCatalogoPastos } = require('../services/potreroCobertura-service');

exports.getPastos = async (req, res) => {
    try {
        const elementos = await listarCatalogoPastos({
            categoria: req.query.categoria,
            uso: req.query.uso,
            buscar: req.query.buscar,
            incluirInactivos: req.query.incluirInactivos === 'true'
        });
        res.json(elementos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener el catálogo de coberturas', error: error.message });
    }
};
