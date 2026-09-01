const CatalogoFinanciero = require('../models/CatalogoFinanciero');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const {
    CATEGORIAS_FINANCIERAS,
    DESTINOS_USO_FINANCIERO,
    obtenerCatalogosFinancieros
} = require('../config/catalogosFinancieros');

const catalogoFinancieroCtrl = {};

const normalizarTexto = (valor = '') => String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const tiposValidos = ['categoria', 'destinoUso'];

const baseCatalogos = [
    ...CATEGORIAS_FINANCIERAS.map((nombre) => ({ tipo: 'categoria', nombre })),
    ...DESTINOS_USO_FINANCIERO.map((nombre) => ({ tipo: 'destinoUso', nombre }))
];

const asegurarCatalogosBase = async () => {
    await Promise.all(baseCatalogos.map((item) => CatalogoFinanciero.findOneAndUpdate(
        { tipo: item.tipo, nombreNormalizado: normalizarTexto(item.nombre) },
        {
            $setOnInsert: {
                tipo: item.tipo,
                nombre: item.nombre,
                nombreNormalizado: normalizarTexto(item.nombre),
                activo: true,
                protegido: true
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )));
};

const filtroUsoPorCatalogo = (catalogo) => {
    if (catalogo.tipo === 'categoria') {
        return {
            $or: [
                { categoria: catalogo.nombre },
                { categoriaNormalizada: catalogo.nombre }
            ]
        };
    }

    return { destinoUso: catalogo.nombre };
};

const contarUsos = async (catalogos) => {
    const conteos = await Promise.all(
        catalogos.map((catalogo) => MovimientoFinanciero.countDocuments(filtroUsoPorCatalogo(catalogo)))
    );

    return catalogos.map((catalogo, index) => ({
        ...catalogo.toObject(),
        usos: conteos[index],
        puedeEliminar: conteos[index] === 0
    }));
};

catalogoFinancieroCtrl.getCatalogosPublicos = async (req, res) => {
    try {
        await asegurarCatalogosBase();

        const catalogos = await CatalogoFinanciero.find({ activo: true }).sort({ tipo: 1, nombre: 1 }).lean();
        const categorias = catalogos.filter((item) => item.tipo === 'categoria').map((item) => item.nombre);
        const destinosUso = catalogos.filter((item) => item.tipo === 'destinoUso').map((item) => item.nombre);

        res.json({
            ...obtenerCatalogosFinancieros(),
            categorias,
            destinosUso
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener catálogos financieros', error: error.message });
    }
};

catalogoFinancieroCtrl.getCatalogosAdmin = async (req, res) => {
    try {
        await asegurarCatalogosBase();

        const filtro = {};
        if (tiposValidos.includes(req.query.tipo)) filtro.tipo = req.query.tipo;

        const catalogos = await CatalogoFinanciero.find(filtro).sort({ tipo: 1, activo: -1, nombre: 1 });
        const catalogosConUsos = await contarUsos(catalogos);

        res.json(catalogosConUsos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al listar catálogos financieros', error: error.message });
    }
};

catalogoFinancieroCtrl.crearCatalogo = async (req, res) => {
    try {
        const { tipo, nombre, descripcion } = req.body;

        if (!tiposValidos.includes(tipo)) {
            return res.status(400).json({ mensaje: 'Tipo de catálogo inválido' });
        }

        if (!String(nombre || '').trim()) {
            return res.status(400).json({ mensaje: 'El nombre del catálogo es requerido' });
        }

        const catalogo = new CatalogoFinanciero({
            tipo,
            nombre: String(nombre).trim(),
            descripcion,
            activo: true,
            protegido: false
        });

        const catalogoGuardado = await catalogo.save();
        const [catalogoConUsos] = await contarUsos([catalogoGuardado]);
        res.status(201).json(catalogoConUsos);
    } catch (error) {
        const status = error.code === 11000 ? 409 : 400;
        const mensaje = error.code === 11000 ? 'Ya existe un catálogo con ese nombre' : 'Error al crear catálogo financiero';
        res.status(status).json({ mensaje, error: error.message });
    }
};

catalogoFinancieroCtrl.actualizarCatalogo = async (req, res) => {
    try {
        const catalogo = await CatalogoFinanciero.findById(req.params.id);
        if (!catalogo) return res.status(404).json({ mensaje: 'Catálogo financiero no encontrado' });

        const nombreAnterior = catalogo.nombre;
        const nuevoNombre = String(req.body.nombre || catalogo.nombre).trim();
        if (!nuevoNombre) return res.status(400).json({ mensaje: 'El nombre del catálogo es requerido' });

        catalogo.nombre = nuevoNombre;
        if (typeof req.body.activo === 'boolean') catalogo.activo = req.body.activo;
        if (req.body.descripcion !== undefined) catalogo.descripcion = req.body.descripcion;
        await catalogo.save();

        if (req.body.actualizarMovimientos === true && nombreAnterior !== catalogo.nombre) {
            if (catalogo.tipo === 'categoria') {
                await MovimientoFinanciero.updateMany(
                    {
                        $or: [
                            { categoria: nombreAnterior },
                            { categoriaNormalizada: nombreAnterior }
                        ]
                    },
                    {
                        $set: {
                            categoria: catalogo.nombre,
                            categoriaNormalizada: catalogo.nombre
                        }
                    }
                );
            } else {
                await MovimientoFinanciero.updateMany(
                    { destinoUso: nombreAnterior },
                    { $set: { destinoUso: catalogo.nombre } }
                );
            }
        }

        const [catalogoConUsos] = await contarUsos([catalogo]);
        res.json(catalogoConUsos);
    } catch (error) {
        const status = error.code === 11000 ? 409 : 400;
        const mensaje = error.code === 11000 ? 'Ya existe un catálogo con ese nombre' : 'Error al actualizar catálogo financiero';
        res.status(status).json({ mensaje, error: error.message });
    }
};

catalogoFinancieroCtrl.desactivarCatalogo = async (req, res) => {
    try {
        const catalogo = await CatalogoFinanciero.findById(req.params.id);
        if (!catalogo) return res.status(404).json({ mensaje: 'Catálogo financiero no encontrado' });

        catalogo.activo = false;
        await catalogo.save();

        const [catalogoConUsos] = await contarUsos([catalogo]);
        res.json(catalogoConUsos);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al desactivar catálogo financiero', error: error.message });
    }
};

catalogoFinancieroCtrl.activarCatalogo = async (req, res) => {
    try {
        const catalogo = await CatalogoFinanciero.findById(req.params.id);
        if (!catalogo) return res.status(404).json({ mensaje: 'Catálogo financiero no encontrado' });

        catalogo.activo = true;
        await catalogo.save();

        const [catalogoConUsos] = await contarUsos([catalogo]);
        res.json(catalogoConUsos);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al activar catálogo financiero', error: error.message });
    }
};

catalogoFinancieroCtrl.eliminarCatalogo = async (req, res) => {
    try {
        const catalogo = await CatalogoFinanciero.findById(req.params.id);
        if (!catalogo) return res.status(404).json({ mensaje: 'Catálogo financiero no encontrado' });

        const usos = await MovimientoFinanciero.countDocuments(filtroUsoPorCatalogo(catalogo));
        if (usos > 0) {
            return res.status(409).json({
                mensaje: `No se puede eliminar porque hay ${usos} movimiento(s) usando este catálogo. Puedes desactivarlo.`
            });
        }

        await CatalogoFinanciero.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Catálogo financiero eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar catálogo financiero', error: error.message });
    }
};

module.exports = catalogoFinancieroCtrl;
