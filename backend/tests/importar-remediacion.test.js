const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const XLSX = require('xlsx');
const {
    COLUMNAS,
    generarPlantillaExcel,
    procesarExcelPreview
} = require('../services/importarExcel-service');
const { excluirControl } = require('../services/importarExcel-confirmacion-service');

const DIR = path.join(__dirname, 'fixtures', 'importaciones');
const cargarFixture = (nombre) => JSON.parse(fs.readFileSync(path.join(DIR, nombre), 'utf8'));
const crearLibro = (hojas, opciones = {}) => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    Object.entries(hojas).forEach(([nombre, filas]) => XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombre));
    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', ...opciones });
};
const opciones = {
    organizacionId: '111111111111111111111111',
    fincaId: '222222222222222222222222',
    catalogosFinancieros: { categorias: ['Alimentación'], destinosUso: [] }
};

test('fixture válido conserva moneda y convierte peso inicial en un dato de pesaje', async () => {
    const resultado = await procesarExcelPreview(crearLibro(cargarFixture('valido.json')), opciones);
    assert.equal(resultado.valido, true);
    assert.equal(resultado.registros.MovimientoFinanciero[0].moneda, 'CRC');
    assert.equal(resultado.registros.Animal[0].pesoActual, 420);
    assert.equal(resultado.registros.Animal[0].fechaPesaje.toISOString(), '2026-10-20T00:00:00.000Z');
});

test('encabezados tenant, operadores y prototipo se ignoran', async () => {
    const resultado = await procesarExcelPreview(crearLibro(cargarFixture('encabezados-maliciosos.json')), opciones);
    assert.equal(resultado.valido, true);
    const animal = resultado.registros.Animal[0];
    assert.equal(animal.organizacionId, undefined);
    assert.equal(animal.fincaId, undefined);
    assert.equal(animal.$set, undefined);
    assert.equal({}.x, undefined);
});

test('filas financieras idénticas se marcan y se omiten por defecto', async () => {
    const resultado = await procesarExcelPreview(crearLibro(cargarFixture('filas-duplicadas.json')), opciones);
    assert.equal(resultado.valido, true);
    assert.equal(resultado.duplicados.length, 1);
    assert.equal(resultado.registros.MovimientoFinanciero[1].omitirPorDuplicado, true);
});

test('la vista previa bloquea 300 bovinos cuando el plan solo admite 210', async () => {
    const filas = [['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA']];
    for (let indice = 1; indice <= 300; indice += 1) filas.push([`B-${indice}`, 'Bovino', 'Hembra', 'Vaca']);
    let cantidadValidada = 0;
    const resultado = await procesarExcelPreview(crearLibro({ INVENTARIO: filas }), {
        ...opciones,
        validarCupo: async (animales) => {
            cantidadValidada = animales.length;
            return {
                permitido: false,
                cantidadSolicitada: animales.length,
                mensaje: 'Su plan permite 210 animales activos; esta importación dejaría 300.'
            };
        }
    });
    assert.equal(cantidadValidada, 300);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'CUPO_INSUFICIENTE'));
});

test('actualización mínima no materializa defaults ni cambia campos no presentes', async () => {
    const existente = {
        _id: 'animal-existente', diio: 'B-300', identificadorFinca: 'B-300', especie: 'Bovino', sexo: 'Hembra',
        categoria: 'Vaca', estado: 'Vendido', estadoSanitario: 'Enfermo', objetivoProductivo: 'REPRODUCCION',
        etapaProductiva: undefined, potreroActual: 'potrero-1'
    };
    const resultado = await procesarExcelPreview(crearLibro(cargarFixture('actualizacion-minima.json')), {
        ...opciones, animalesExistentes: [existente], diiosExistentes: ['B-300']
    });
    assert.equal(resultado.valido, true);
    const fila = resultado.registros.Animal[0];
    assert.equal(fila.estado, undefined);
    assert.equal(fila.estadoSanitario, undefined);
    assert.equal(fila.objetivoProductivo, undefined);
    assert.deepEqual(fila.cambios, []);
});

test('una actualización usa DIIO para buscar pero nunca reemplaza identidades', () => {
    assert.deepEqual(excluirControl({
        diio: 'NUEVO', identificadorFinca: 'INTERNO', nombre: 'Luna', estadoSanitario: 'Sano'
    }), { nombre: 'Luna', estadoSanitario: 'Sano' });
});

test('genealogía inválida detecta especie, sexo y autoparentesco aunque el padre aparezca después', async () => {
    const resultado = await procesarExcelPreview(crearLibro(cargarFixture('genealogia-invalida.json')), opciones);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'ESPECIE_PROGENITOR_INVALIDA'));
    assert.ok(resultado.errores.some((item) => item.codigo === 'AUTOPARENTESCO'));
});

test('categoría incompatible con sexo se rechaza sin requerir fecha de nacimiento', async () => {
    const resultado = await procesarExcelPreview(crearLibro({ INVENTARIO: [
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA'], ['B-500', 'Bovino', 'Macho', 'Vaca']
    ] }), opciones);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'CATEGORIA_SEXO_INCOMPATIBLE'));
});

test('DIIO numérico se rechaza para evitar pérdida de ceros o precisión de Excel', async () => {
    const resultado = await procesarExcelPreview(crearLibro({ INVENTARIO: [
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA'], [188000123456789, 'Bovino', 'Hembra', 'Vaca']
    ] }), opciones);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'IDENTIFICADOR_NUMERICO'));
});

test('pesajes validan cronología y etapa según la especie durante la vista previa', async () => {
    const animal = {
        _id: 'animal-bovino', diio: 'B-600', identificadorFinca: 'B-600', especie: 'Bovino',
        sexo: 'Hembra', categoria: 'Vaca', fechaNacimiento: new Date('2020-01-01T00:00:00.000Z')
    };
    const resultado = await procesarExcelPreview(crearLibro({ PESAJES: [
        ['DIIO', 'FECHA', 'PESO_KG', 'ETAPA_PRODUCTIVA'],
        ['B-600', '01/01/2099', 450, 'Engorde']
    ] }), { ...opciones, animalesExistentes: [animal], diiosExistentes: ['B-600'] });
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'FECHA_FUTURA'));
    assert.ok(resultado.errores.some((item) => item.codigo === 'ETAPA_ESPECIE_INCOMPATIBLE'));
});

test('texto numérico ambiguo se rechaza con explicación', async () => {
    const resultado = await procesarExcelPreview(crearLibro({ FINANZAS: [
        COLUMNAS.FINANZAS.requeridas,
        ['20/10/2026', 'Egreso', 'Compra', 'Alimentación', 'Prueba', '1,234', 'CRC']
    ] }), opciones);
    assert.equal(resultado.valido, false);
    assert.match(resultado.errores[0].mensaje, /Valor ambiguo/);
});

test('fecha Excel y texto representan el mismo día civil de Costa Rica', async () => {
    const resultado = await procesarExcelPreview(crearLibro({ FINANZAS: [
        COLUMNAS.FINANZAS.requeridas,
        [new Date(2020, 0, 15), 'Egreso', 'Compra', 'Alimentación', 'Excel', 1, 'CRC'],
        ['15/01/2020', 'Egreso', 'Compra', 'Alimentación', 'Texto', 1, 'CRC']
    ] }), opciones);
    assert.equal(resultado.valido, true);
    assert.deepEqual(resultado.registros.MovimientoFinanciero.map((item) => item.fecha.toISOString()), [
        '2020-01-15T00:00:00.000Z', '2020-01-15T00:00:00.000Z'
    ]);
});

test('rango declarado gigante se rechaza rápido sin bloquear el event loop', async () => {
    const normal = crearLibro({ POTREROS: [['CODIGO', 'NOMBRE'], ['P-1', 'Potrero']] });
    const zip = XLSX.CFB.read(normal, { type: 'buffer' });
    const indice = zip.FullPaths.findIndex((nombre) => nombre.endsWith('/xl/worksheets/sheet1.xml'));
    const entrada = zip.FileIndex[indice];
    entrada.content = Buffer.from(entrada.content.toString().replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A1:XFD1048576"/>'));
    entrada.size = entrada.content.length;
    const hostil = XLSX.CFB.write(zip, { type: 'buffer', fileType: 'zip', compression: true });
    let atendioOtraTarea = false;
    const latido = new Promise((resolve) => setTimeout(() => { atendioOtraTarea = true; resolve(); }, 0));
    const inicio = Date.now();
    await assert.rejects(() => procesarExcelPreview(hostil, opciones), /declara .* máximo permitido|supera el máximo/);
    await latido;
    assert.equal(atendioOtraTarea, true);
    assert.ok(Date.now() - inicio < 2000);
});

test('fórmulas y libros que no son ZIP/XLSX se rechazan', async () => {
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet([['CODIGO', 'NOMBRE'], ['P-1', 'Potrero']]);
    hoja.B2 = { t: 'n', f: '1+1', v: 2 };
    XLSX.utils.book_append_sheet(libro, hoja, 'POTREROS');
    await assert.rejects(() => procesarExcelPreview(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }), opciones), /contiene una fórmula/);
    await assert.rejects(() => procesarExcelPreview(Buffer.from('DIIO,ESPECIE'), opciones), /no es un libro XLSX válido/);
});

test('plantilla y backend comparten columnas y eliminan EMPLEADO', () => {
    const libro = XLSX.read(generarPlantillaExcel({ categorias: ['Alimentación'] }), { type: 'buffer' });
    const encabezados = XLSX.utils.sheet_to_json(libro.Sheets.FINANZAS, { header: 1 })[0];
    assert.equal(encabezados.includes('EMPLEADO'), false);
    assert.equal(COLUMNAS.FINANZAS.opcionales.includes('EMPLEADO'), false);
    assert.ok(COLUMNAS.INVENTARIO.opcionales.includes('FECHA_PESAJE'));
});

const cargarModuloConMocks = (archivo, mocks) => {
    const codigo = fs.readFileSync(archivo, 'utf8');
    const modulo = { exports: {} };
    const requerirReal = createRequire(archivo);
    const requerir = (solicitud) => (Object.hasOwn(mocks, solicitud) ? mocks[solicitud] : requerirReal(solicitud));
    const envoltura = `(function (require, module, exports, __filename, __dirname) { ${codigo}\n})`;
    vm.runInThisContext(envoltura, { filename: archivo })(requerir, modulo, modulo.exports, archivo, path.dirname(archivo));
    return modulo.exports;
};

const respuestaHttp = () => {
    const respuesta = { statusCode: 200, body: null };
    respuesta.status = (codigo) => { respuesta.statusCode = codigo; return respuesta; };
    respuesta.json = (body) => { respuesta.body = body; return respuesta; };
    return respuesta;
};

test('dos confirmaciones simultáneas aplican una sola vez y la segunda recibe 409', async () => {
    let reclamos = 0;
    let aplicaciones = 0;
    const importacion = {
        _id: 'importacion-1', registros: {}, hojasDetectadas: [], resumenDetectado: {}, advertencias: []
    };
    const ImportacionExcel = {
        updateMany: async () => ({}),
        findOneAndUpdate: async () => (++reclamos === 1 ? importacion : null),
        findOne: () => ({ select: async () => ({ estado: 'Procesando' }) }),
        updateOne: async () => ({})
    };
    const vacio = {};
    const controlador = cargarModuloConMocks(path.join(__dirname, '..', 'controllers', 'importar-controller.js'), {
        '../services/importarExcel-service': {
            confirmarImportacionExcel: async () => {
                aplicaciones += 1;
                await new Promise((resolve) => setTimeout(resolve, 15));
                return { mensaje: 'Aplicada', resultado: {} };
            },
            generarPlantillaExcel: () => Buffer.alloc(0),
            procesarExcelPreview: async () => ({})
        },
        '../models/Animal': vacio,
        '../models/CatalogoFinanciero': vacio,
        '../models/ImportacionExcel': ImportacionExcel,
        '../models/Lote': vacio,
        '../models/Potrero': vacio,
        '../models/Pesaje': vacio,
        '../models/MovimientoFinanciero': vacio,
        '../services/plan-service': {
            asegurarPlanVigente: () => true,
            obtenerPlanActual: async () => ({ vigente: true }),
            puedeCrearAnimal: async () => ({ permitido: true }),
            puedeUsarEspecie: async () => ({ permitido: true })
        },
        '../services/importacionExcel-lock-service': {
            adquirirBloqueoImportacion: async () => ({ organizacionId: 'org-1', token: 'token' }),
            liberarBloqueoImportacion: async () => true
        }
    });
    const solicitud = {
        body: { importacionId: 'importacion-1', modo: 'crear_actualizar' },
        usuario: { id: 'usuario-1' }, organizacionId: 'org-1', fincaId: 'finca-1'
    };
    const respuestas = [respuestaHttp(), respuestaHttp()];
    await Promise.all(respuestas.map((res) => controlador.confirmarExcel(solicitud, res)));
    assert.equal(aplicaciones, 1);
    assert.deepEqual(respuestas.map((res) => res.statusCode).sort(), [201, 409]);
});

test('el bloqueo de importación es único por organización y libera solo su propio token', async () => {
    let ocupado = false;
    let tokenActivo = null;
    const eliminaciones = [];
    const servicio = cargarModuloConMocks(path.join(__dirname, '..', 'services', 'importacionExcel-lock-service.js'), {
        '../models/BloqueoImportacion': {
            findOneAndUpdate: async (filtro, actualizacion) => {
                if (ocupado) throw Object.assign(new Error('duplicado'), { code: 11000 });
                ocupado = true;
                tokenActivo = actualizacion.$set.token;
                return { token: tokenActivo };
            },
            deleteOne: async (filtro) => {
                eliminaciones.push(filtro);
                if (filtro.token === tokenActivo) ocupado = false;
            }
        }
    });
    const bloqueo = await servicio.adquirirBloqueoImportacion({ organizacionId: 'org-1', operacion: 'Vista previa' });
    await assert.rejects(
        () => servicio.adquirirBloqueoImportacion({ organizacionId: 'org-1', operacion: 'Confirmacion' }),
        (error) => error.status === 409 && error.codigo === 'IMPORTACION_EN_PROCESO'
    );
    await servicio.liberarBloqueoImportacion(bloqueo);
    assert.equal(eliminaciones.length, 1);
    assert.equal(eliminaciones[0].token, bloqueo.token);
});

test('un error en la fila 150 revierte 300 movimientos y el reintento guarda exactamente 300', async () => {
    const guardados = [];
    let fallarFila = 150;
    const sesion = {
        withTransaction: async (operacion) => {
            const respaldo = guardados.slice();
            try { await operacion(); } catch (error) {
                guardados.splice(0, guardados.length, ...respaldo);
                throw error;
            }
        },
        endSession: async () => {}
    };
    const cadenaCatalogos = {
        select() { return this; },
        session() { return this; },
        lean: async () => [{ tipo: 'categoria', nombre: 'Alimentación' }]
    };
    const servicio = cargarModuloConMocks(path.join(__dirname, '..', 'services', 'importarExcel-confirmacion-service.js'), {
        mongoose: { startSession: async () => sesion },
        '../models/Animal': {},
        '../models/Potrero': {},
        '../models/Pesaje': {},
        '../models/MovimientoFinanciero': {
            create: async ([movimiento]) => {
                if (movimiento.descripcion === `Movimiento ${fallarFila}`) throw new Error('Fallo provocado');
                guardados.push(movimiento);
                return [movimiento];
            }
        },
        '../models/CatalogoFinanciero': { find: () => cadenaCatalogos },
        '../models/HistorialCoberturaPotrero': {},
        '../models/RotacionPotrero': {},
        '../models/Lote': {},
        '../models/PertenenciaLote': {},
        './plan-service': {
            asegurarPuedeCrearAnimal: async () => null,
            asegurarPlanVigente: () => true,
            ejecutarConReservaCuota: async ({ operacion }) => operacion(),
            obtenerPlanActual: async () => ({ vigente: true }),
            puedeUsarEspecie: async () => ({ permitido: true })
        },
        './finca-service': { validarObjetivoProductivoFinca: async () => true },
        '../context/organizacion-context': { obtenerFincaActual: () => 'finca-1', obtenerOrganizacionActual: () => 'org-1' },
        './raza-service': { prepararDatosRaciales: (datos) => datos },
        './potreroCobertura-service': { guardarCobertura: async () => ({}) },
        './lote-service': { agregarAnimalesAlLote: async () => ({}), validarAnimalParaLote: () => true },
        './genealogiaService': { validarRelacionGenealogica: async () => true },
        './pesaje-integridad-service': {
            actualizarPesoActualAnimal: async () => true,
            registrarEventoPesaje: async () => true,
            validarDatosPesaje: async (datos) => datos
        },
        './eventoAnimal-service': { upsertEventoAnimal: async () => ({}) }
    });
    const movimientos = Array.from({ length: 300 }, (_, indice) => ({
        filaOrigen: indice + 1,
        fecha: new Date('2026-10-20T00:00:00.000Z'),
        naturaleza: 'Egreso', tipoMovimiento: 'Compra', categoria: 'Alimentación',
        descripcion: `Movimiento ${indice + 1}`, monto: indice + 1, moneda: 'CRC',
        claveImportacion: `clave-${indice + 1}`
    }));
    const ejecutar = () => servicio.confirmarImportacionExcelAtomica(
        { registros: { MovimientoFinanciero: movimientos } },
        { importacionId: 'importacion-1', usuarioId: 'usuario-1' }
    );
    await assert.rejects(ejecutar, /FINANZAS, fila 150: Fallo provocado/);
    assert.equal(guardados.length, 0);
    fallarFila = null;
    await ejecutar();
    assert.equal(guardados.length, 300);
});
