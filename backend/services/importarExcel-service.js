const XLSX = require('xlsx');
const crypto = require('node:crypto');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const {
    CATEGORIAS_FINANCIERAS,
    DESTINOS_USO_FINANCIERO,
    METODOS_PAGO_FINANCIERO,
    MONEDAS_FINANCIERAS,
    NATURALEZAS_FINANCIERAS,
    TIPOS_MOVIMIENTO_FINANCIERO
} = require('../config/catalogosFinancieros');
const { normalizarFraccionRacial, obtenerCatalogoRacial } = require('./raza-service');
const { CATALOGO_PASTOS_BASE } = require('../config/catalogoPastos');
const { resolverPastoPorTexto } = require('./potreroCobertura-service');
const { PROPOSITOS_LOTE, normalizarPropositoLote, propositoCompatibleConObjetivo } = require('../config/lotes');
const { CATEGORIAS_POR_ESPECIE, obtenerCategoriaAnimal } = require('./categoriaAnimal-service');
const { OBJETIVOS_PRODUCTIVOS, normalizarObjetivoProductivo } = require('../config/objetivosProductivos');
const { claveDiaEnZona } = require('./fechaZonaHoraria-service');
const { confirmarImportacionExcelAtomica } = require('./importarExcel-confirmacion-service');

const VERSION_PLANTILLA = '1';
const TIPOS_IMPORTACION_FINANCIERA = TIPOS_MOVIMIENTO_FINANCIERO.filter((item) => !['Planilla', 'Inversion'].includes(item));
const HOJAS_DATOS = ['POTREROS', 'INVENTARIO', 'FINANZAS', 'PESAJES'];
const HOJAS_AUXILIARES = ['INSTRUCCIONES', 'CATALOGOS'];
const LIMITES_IMPORTACION = Object.freeze({
    filas: Number(process.env.IMPORT_MAX_ROWS_PER_SHEET || 5000),
    columnas: Number(process.env.IMPORT_MAX_COLUMNS_PER_SHEET || 60),
    longitudCelda: Number(process.env.IMPORT_MAX_CELL_LENGTH || 1000),
    hojas: Number(process.env.IMPORT_MAX_SHEETS || 8),
    timeoutMs: Number(process.env.IMPORT_PARSE_TIMEOUT_MS || 15000)
});

const parsearExcelAislado = (buffer, limites = LIMITES_IMPORTACION) => new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '..', 'workers', 'importarExcel-parser-worker.js'), {
        workerData: { buffer, limites },
        resourceLimits: { maxOldGenerationSizeMb: Number(process.env.IMPORT_WORKER_MEMORY_MB || 128) }
    });
    let terminado = false;
    const finalizar = (callback) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timeout);
        callback();
    };
    const timeout = setTimeout(() => {
        finalizar(() => {
            worker.terminate();
            reject(Object.assign(new Error('El archivo tardó demasiado en procesarse y fue rechazado.'), { codigo: 'IMPORT_TIMEOUT' }));
        });
    }, limites.timeoutMs);
    worker.once('message', (mensaje) => finalizar(() => {
        worker.terminate();
        if (mensaje.ok) resolve(mensaje.workbook);
        else reject(Object.assign(new Error(mensaje.error.mensaje), { codigo: mensaje.error.codigo }));
    }));
    worker.once('error', (error) => finalizar(() => reject(error)));
    worker.once('exit', (codigo) => {
        if (!terminado && codigo !== 0) finalizar(() => reject(new Error('El lector XLSX terminó inesperadamente.')));
    });
});

const COLUMNAS = {
    POTREROS: {
        requeridas: ['CODIGO', 'NOMBRE'],
        opcionales: [
            'AREA_HECTAREAS', 'CAPACIDAD_MAXIMA', 'UBICACION', 'ESTADO',
            'TIPO_AREA',
            'PASTO', 'PASTO_PRINCIPAL', 'TIPO_PASTO', 'FECHA_ESTABLECIMIENTO_PASTO',
            'DIAS_DESCANSO_OBJETIVO', 'INTERVALO_CORTE_OBJETIVO_DIAS', 'OBSERVACION_COBERTURA', 'OBSERVACIONES'
        ]
    },
    INVENTARIO: {
        requeridas: ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA'],
        opcionales: [
            'NOMBRE', 'RAZA', 'RAZA_PRINCIPAL', 'RAZA_SECUNDARIA', 'DESCRIPCION_RACIAL',
            'GRADO_RACIAL', 'VARIEDAD_RACIAL', 'COMPOSICION_RACIAL',
            'FRACCION_RAZA_PRINCIPAL', 'FRACCION_RAZA_SECUNDARIA',
            'FECHA_NACIMIENTO', 'MADRE_DIIO', 'PADRE_DIIO',
            'PESO_ACTUAL_KG', 'FECHA_PESAJE', 'OBJETIVO_PRODUCTIVO', 'ETAPA_PRODUCTIVA', 'ESTADO',
            'ESTADO_SANITARIO', 'POTRERO_CODIGO', 'CODIGO_LOTE', 'NOMBRE_LOTE', 'PROPOSITO_LOTE', 'OBSERVACIONES'
        ]
    },
    FINANZAS: {
        requeridas: ['FECHA', 'NATURALEZA', 'TIPO_MOVIMIENTO', 'CATEGORIA', 'DESCRIPCION', 'MONTO', 'MONEDA'],
        opcionales: [
            'PRODUCTO', 'CANTIDAD', 'UNIDAD', 'PRECIO_UNITARIO', 'PROVEEDOR', 'DESTINO_USO',
            'METODO_PAGO', 'FINCA', 'OBSERVACIONES'
        ]
    },
    PESAJES: {
        requeridas: ['DIIO', 'FECHA', 'PESO_KG'],
        opcionales: ['ETAPA_PRODUCTIVA', 'OBSERVACIONES']
    }
};

const PROPIEDAD_POR_COLUMNA = Object.freeze({
    NOMBRE: 'nombre', RAZA: 'raza', RAZA_PRINCIPAL: 'razaPrincipal', RAZA_SECUNDARIA: 'razaSecundaria',
    DESCRIPCION_RACIAL: 'descripcionRacial', GRADO_RACIAL: 'gradoRacial', VARIEDAD_RACIAL: 'variedadRacial',
    COMPOSICION_RACIAL: 'composicionRacial', FRACCION_RAZA_PRINCIPAL: 'fraccionRazaPrincipal',
    FRACCION_RAZA_SECUNDARIA: 'fraccionRazaSecundaria', FECHA_NACIMIENTO: 'fechaNacimiento',
    OBJETIVO_PRODUCTIVO: 'objetivoProductivo', ETAPA_PRODUCTIVA: 'etapaProductiva', ESTADO: 'estado',
    ESTADO_SANITARIO: 'estadoSanitario', OBSERVACIONES: 'observaciones', AREA_HECTAREAS: 'area',
    CAPACIDAD_MAXIMA: 'capacidadMaxima', UBICACION: 'ubicacion', TIPO_AREA: 'tipoArea'
});

const valorComparable = (valor) => {
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    if (valor?._id) return String(valor._id);
    return valor ?? null;
};

const serializarEstable = (valor) => {
    if (valor instanceof Date) return valor.toISOString();
    if (Array.isArray(valor)) return valor.map(serializarEstable);
    if (valor && typeof valor === 'object') {
        return Object.fromEntries(Object.keys(valor).sort().map((clave) => [clave, serializarEstable(valor[clave])]));
    }
    return valor;
};

const crearClaveImportacion = ({ organizacionId, fincaId, hoja, registro }) => {
    const datos = Object.fromEntries(Object.entries(registro).filter(([clave]) => ![
        'filaOrigen', 'camposProporcionados', 'cambios', 'operacion', 'existenteId', 'posibleDuplicado',
        'omitirPorDuplicado', 'claveImportacion'
    ].includes(clave)));
    return crypto.createHash('sha256').update(JSON.stringify(serializarEstable({
        organizacionId: String(organizacionId || ''), fincaId: String(fincaId || ''), hoja, datos
    }))).digest('hex');
};

const validarYEnriquecerAnimales = ({ registros, animalesExistentes = [], errores, advertencias }) => {
    const porClave = new Map();
    const registrar = (animal, origen) => {
        [animal.diio, animal.identificadorFinca].filter(Boolean).forEach((valor) => {
            const clave = normalizarTexto(valor);
            const actuales = porClave.get(clave) || [];
            if (!actuales.some((item) => String(item.animal._id || item.animal.diio) === String(animal._id || animal.diio))) {
                actuales.push({ animal, origen });
            }
            porClave.set(clave, actuales);
        });
    };
    animalesExistentes.forEach((animal) => registrar(animal, 'base'));
    registros.forEach((animal) => registrar(animal, 'archivo'));

    const grafo = new Map();
    registros.forEach((registro) => {
        const coincidencias = porClave.get(normalizarTexto(registro.diio)) || [];
        const existentes = coincidencias.filter((item) => item.origen === 'base');
        if (new Set(existentes.map((item) => String(item.animal._id))).size > 1) {
            agregarError(errores, 'INVENTARIO', registro.filaOrigen, 'DIIO', registro.diio, 'El DIIO coincide con animales diferentes por DIIO e identificador interno.', 'IDENTIDAD_AMBIGUA');
            return;
        }
        const existente = existentes[0]?.animal;
        registro.operacion = existente ? 'actualizar' : 'crear';
        registro.existenteId = existente?._id;
        registro.cambios = existente ? (registro.camposProporcionados || []).map((columna) => {
            if (columna === 'DIIO') return null;
            const propiedad = PROPIEDAD_POR_COLUMNA[columna];
            if (!propiedad || valorComparable(registro[propiedad]) === valorComparable(existente[propiedad])) return null;
            return { campo: propiedad, anterior: valorComparable(existente[propiedad]), nuevo: valorComparable(registro[propiedad]) };
        }).filter(Boolean) : [];
        if (registro.codigoLote) {
            const objetivoFinal = registro.objetivoProductivo || existente?.objetivoProductivo;
            if (!objetivoFinal) {
                agregarError(errores, 'INVENTARIO', registro.filaOrigen, 'OBJETIVO_PRODUCTIVO', '', 'El objetivo productivo es obligatorio al asignar un animal nuevo a un lote.', 'OBJETIVO_REQUERIDO');
            } else if (registro.loteProposito && !propositoCompatibleConObjetivo(registro.loteProposito, objetivoFinal)) {
                agregarError(errores, 'INVENTARIO', registro.filaOrigen, 'OBJETIVO_PRODUCTIVO', objetivoFinal, 'El objetivo productivo no es compatible con el propósito del lote.', 'OBJETIVO_LOTE_INCOMPATIBLE');
            }
        }

        const padres = [];
        for (const [campo, sexoEsperado] of [['madreDiio', 'Hembra'], ['padreDiio', 'Macho']]) {
            const referencia = registro[campo];
            if (!referencia) continue;
            if (normalizarTexto(referencia) === normalizarTexto(registro.diio)) {
                agregarError(errores, 'INVENTARIO', registro.filaOrigen, campo === 'madreDiio' ? 'MADRE_DIIO' : 'PADRE_DIIO', referencia, 'Un animal no puede ser su propio progenitor.', 'AUTOPARENTESCO');
                continue;
            }
            const candidatos = porClave.get(normalizarTexto(referencia)) || [];
            const unicos = [...new Map(candidatos.map((item) => [String(item.animal._id || item.animal.diio), item.animal])).values()];
            if (unicos.length !== 1) {
                if (unicos.length > 1) agregarError(errores, 'INVENTARIO', registro.filaOrigen, campo === 'madreDiio' ? 'MADRE_DIIO' : 'PADRE_DIIO', referencia, 'La referencia genealógica es ambigua.', 'IDENTIDAD_AMBIGUA');
                else {
                    advertencias.push({ hoja: 'INVENTARIO', mensaje: `Fila ${registro.filaOrigen}: no se encontró ${referencia}; la relación genealógica quedará vacía.` });
                    registro[campo] = undefined;
                }
                continue;
            }
            const progenitor = unicos[0];
            if (progenitor.sexo !== sexoEsperado) agregarError(errores, 'INVENTARIO', registro.filaOrigen, campo === 'madreDiio' ? 'MADRE_DIIO' : 'PADRE_DIIO', referencia, `El progenitor debe ser ${sexoEsperado}.`, 'SEXO_PROGENITOR_INVALIDO');
            if (progenitor.especie !== registro.especie) agregarError(errores, 'INVENTARIO', registro.filaOrigen, campo === 'madreDiio' ? 'MADRE_DIIO' : 'PADRE_DIIO', referencia, 'El progenitor debe pertenecer a la misma especie.', 'ESPECIE_PROGENITOR_INVALIDA');
            if (progenitor.fechaNacimiento && registro.fechaNacimiento && new Date(progenitor.fechaNacimiento) >= new Date(registro.fechaNacimiento)) {
                agregarError(errores, 'INVENTARIO', registro.filaOrigen, campo === 'madreDiio' ? 'MADRE_DIIO' : 'PADRE_DIIO', referencia, 'El progenitor debe ser mayor que la cría.', 'EDAD_PROGENITOR_INVALIDA');
            }
            padres.push(normalizarTexto(referencia));
        }
        grafo.set(normalizarTexto(registro.diio), padres);
    });

    const visitando = new Set();
    const visitados = new Set();
    const recorrer = (clave) => {
        if (visitando.has(clave)) return true;
        if (visitados.has(clave)) return false;
        visitando.add(clave);
        const ciclo = (grafo.get(clave) || []).some((padre) => grafo.has(padre) && recorrer(padre));
        visitando.delete(clave);
        visitados.add(clave);
        return ciclo;
    };
    for (const registro of registros) {
        if (recorrer(normalizarTexto(registro.diio))) {
            agregarError(errores, 'INVENTARIO', registro.filaOrigen, 'MADRE_DIIO/PADRE_DIIO', '', 'La relación genealógica genera un ciclo.', 'CICLO_GENEALOGICO');
            break;
        }
    }
};

const limpiarTexto = (valor) => {
    if (valor === undefined || valor === null) return '';
    return String(valor).trim();
};

const normalizarTexto = (valor) => limpiarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const normalizarEncabezado = (valor) => normalizarTexto(valor)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const valorCanonico = (valor, opciones) => {
    const buscado = normalizarTexto(valor);
    return opciones.find((opcion) => normalizarTexto(opcion) === buscado);
};

const esNumeroTextoAmbiguo = (valor) => {
    if (typeof valor !== 'string') return false;
    const texto = limpiarTexto(valor).replace(/[₡$\s]/g, '');
    return /^[+-]?\d+[.,]\d{3}$/.test(texto);
};

const numero = (valor) => {
    if (valor === undefined || valor === null || valor === '') return undefined;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;

    if (esNumeroTextoAmbiguo(valor)) return undefined;
    let texto = limpiarTexto(valor).replace(/[₡$\s]/g, '');
    const ultimaComa = texto.lastIndexOf(',');
    const ultimoPunto = texto.lastIndexOf('.');

    if (ultimaComa >= 0 && ultimoPunto >= 0) {
        const separadorDecimal = ultimaComa > ultimoPunto ? ',' : '.';
        const separadorMiles = separadorDecimal === ',' ? /\./g : /,/g;
        texto = texto.replace(separadorMiles, '').replace(separadorDecimal, '.');
    } else if (ultimaComa >= 0) {
        texto = texto.replace(',', '.');
    }

    const resultado = Number(texto);
    return Number.isFinite(resultado) ? resultado : undefined;
};

const mensajeNumero = (valor, mensajeBase) => (esNumeroTextoAmbiguo(valor)
    ? 'Valor ambiguo: use una celda numérica o escriba 1234 / 1.23.'
    : mensajeBase);

const campoConValor = (leer, columna) => limpiarTexto(leer(columna)) !== '';

const categoriasCompatiblesSexo = ({ especie, sexo }) => {
    if (especie === 'Bovino' && sexo === 'Macho') return ['Ternero', 'Novillo', 'Toro', 'Otro'];
    if (especie === 'Bovino' && sexo === 'Hembra') return ['Ternera', 'Novilla', 'Vaca', 'Otro'];
    if (especie === 'Porcino' && sexo === 'Macho') return ['Lechón', 'Cerdo joven', 'Cerdo adulto', 'Otro'];
    if (especie === 'Porcino' && sexo === 'Hembra') return ['Lechona', 'Cerda joven', 'Chancha', 'Otro'];
    return [];
};

const fecha = (valor) => {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
    }

    if (typeof valor === 'number') {
        const partes = XLSX.SSF.parse_date_code(valor);
        if (partes) return new Date(Date.UTC(partes.y, partes.m - 1, partes.d));
    }

    const texto = limpiarTexto(valor);
    let coincidencia = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (coincidencia) {
        const [, dia, mes, anio] = coincidencia;
        const resultado = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
        if (resultado.getUTCFullYear() === Number(anio)
            && resultado.getUTCMonth() === Number(mes) - 1
            && resultado.getUTCDate() === Number(dia)) return resultado;
        return undefined;
    }

    coincidencia = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (coincidencia) {
        const [, anio, mes, dia] = coincidencia;
        const resultado = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
        if (resultado.getUTCFullYear() === Number(anio)
            && resultado.getUTCMonth() === Number(mes) - 1
            && resultado.getUTCDate() === Number(dia)) return resultado;
    }

    return undefined;
};

const claveFecha = (valor) => {
    const anio = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(valor.getUTCDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
};

const fechaCivilHoy = () => new Date(`${claveDiaEnZona(new Date(), 'America/Costa_Rica')}T00:00:00.000Z`);

const validarIdentificadorTexto = (errores, hoja, fila, campo, valor) => {
    if (typeof valor !== 'number') return;
    agregarError(
        errores,
        hoja,
        fila,
        campo,
        valor,
        'El identificador debe estar en una celda de tipo Texto para conservar ceros iniciales y todos sus dígitos.',
        'IDENTIFICADOR_NUMERICO'
    );
};

const filaVacia = (fila = []) => fila.every((valor) => limpiarTexto(valor) === '');

const agregarError = (errores, hoja, fila, campo, valor, mensaje, codigo = 'VALOR_INVALIDO') => {
    errores.push({ hoja, fila, campo, valor: limpiarTexto(valor), mensaje, codigo });
};

const crearLectorFila = (encabezados, fila) => {
    const indice = new Map(encabezados.map((encabezado, posicion) => [encabezado, posicion]));
    return (columna) => fila[indice.get(columna)];
};

const prepararHoja = (workbook, nombreHoja, errores, advertencias) => {
    const nombreReal = workbook.SheetNames.find((nombre) => normalizarTexto(nombre) === nombreHoja);
    if (!nombreReal) return null;

    const matriz = workbook.Sheets[nombreReal] || [];
    const encabezados = (matriz[0] || []).map(normalizarEncabezado);
    const duplicados = encabezados.filter((encabezado, indice) => encabezado && encabezados.indexOf(encabezado) !== indice);
    const configuracion = COLUMNAS[nombreHoja];

    if (duplicados.length) {
        agregarError(errores, nombreHoja, 1, duplicados.join(', '), '', 'Hay encabezados duplicados.', 'ENCABEZADO_DUPLICADO');
    }

    configuracion.requeridas.forEach((columna) => {
        if (!encabezados.includes(columna)) {
            agregarError(errores, nombreHoja, 1, columna, '', `Falta la columna obligatoria ${columna}.`, 'COLUMNA_FALTANTE');
        }
    });

    const permitidas = new Set([...configuracion.requeridas, ...configuracion.opcionales]);
    const desconocidas = encabezados.filter((encabezado) => encabezado && !permitidas.has(encabezado));
    if (desconocidas.length) {
        advertencias.push({
            hoja: nombreHoja,
            mensaje: `Se ignorarán columnas fuera del estándar: ${desconocidas.join(', ')}.`
        });
    }

    return {
        nombreReal,
        encabezados,
        filas: matriz.slice(1),
        columnasValidas: configuracion.requeridas.every((columna) => encabezados.includes(columna)) && !duplicados.length
    };
};

const mapearPotreros = (hoja, errores) => {
    const registros = [];
    const codigos = new Set();

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const codigo = limpiarTexto(leer('CODIGO'));
        const nombre = limpiarTexto(leer('NOMBRE'));
        const area = numero(leer('AREA_HECTAREAS'));
        const capacidadMaxima = numero(leer('CAPACIDAD_MAXIMA'));
        const tipoAreaTexto = limpiarTexto(leer('TIPO_AREA'));
        const tipoArea = tipoAreaTexto ? valorCanonico(tipoAreaTexto, ['PASTOREO', 'BANCO_FORRAJERO']) : undefined;
        const pastoTexto = limpiarTexto(leer('PASTO_PRINCIPAL') || leer('PASTO') || leer('TIPO_PASTO'));
        const fechaEstablecimientoPastoTexto = limpiarTexto(leer('FECHA_ESTABLECIMIENTO_PASTO'));
        const fechaEstablecimientoPasto = fechaEstablecimientoPastoTexto ? fecha(leer('FECHA_ESTABLECIMIENTO_PASTO')) : undefined;
        const diasDescansoObjetivoTexto = limpiarTexto(leer('DIAS_DESCANSO_OBJETIVO'));
        const diasDescansoObjetivo = numero(leer('DIAS_DESCANSO_OBJETIVO'));
        const intervaloCorteTexto = limpiarTexto(leer('INTERVALO_CORTE_OBJETIVO_DIAS'));
        const intervaloCorteObjetivoDias = numero(leer('INTERVALO_CORTE_OBJETIVO_DIAS'));
        const estadoTexto = limpiarTexto(leer('ESTADO'));
        const estado = estadoTexto ? valorCanonico(estadoTexto, ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento']) : undefined;

        if (!codigo) agregarError(errores, 'POTREROS', numeroFila, 'CODIGO', '', 'El código es obligatorio.', 'CAMPO_REQUERIDO');
        if (!nombre) agregarError(errores, 'POTREROS', numeroFila, 'NOMBRE', '', 'El nombre es obligatorio.', 'CAMPO_REQUERIDO');
        if (codigo && codigos.has(normalizarTexto(codigo))) agregarError(errores, 'POTREROS', numeroFila, 'CODIGO', codigo, 'El código está repetido dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (limpiarTexto(leer('AREA_HECTAREAS')) && (area === undefined || area < 0)) agregarError(errores, 'POTREROS', numeroFila, 'AREA_HECTAREAS', leer('AREA_HECTAREAS'), mensajeNumero(leer('AREA_HECTAREAS'), 'Debe ser un número mayor o igual a cero.'));
        if (limpiarTexto(leer('CAPACIDAD_MAXIMA')) && (capacidadMaxima === undefined || capacidadMaxima < 0)) agregarError(errores, 'POTREROS', numeroFila, 'CAPACIDAD_MAXIMA', leer('CAPACIDAD_MAXIMA'), mensajeNumero(leer('CAPACIDAD_MAXIMA'), 'Debe ser un número mayor o igual a cero.'));
        if (fechaEstablecimientoPastoTexto && !fechaEstablecimientoPasto) agregarError(errores, 'POTREROS', numeroFila, 'FECHA_ESTABLECIMIENTO_PASTO', leer('FECHA_ESTABLECIMIENTO_PASTO'), 'Fecha inválida. Use DD/MM/AAAA.');
        if (diasDescansoObjetivoTexto && (diasDescansoObjetivo === undefined || diasDescansoObjetivo < 0)) agregarError(errores, 'POTREROS', numeroFila, 'DIAS_DESCANSO_OBJETIVO', leer('DIAS_DESCANSO_OBJETIVO'), 'Debe ser un número mayor o igual a cero.');
        if (estadoTexto && !estado) agregarError(errores, 'POTREROS', numeroFila, 'ESTADO', estadoTexto, 'Estado de potrero no permitido.');
        if (tipoAreaTexto && !tipoArea) agregarError(errores, 'POTREROS', numeroFila, 'TIPO_AREA', tipoAreaTexto, 'Use PASTOREO o BANCO_FORRAJERO.');
        if (intervaloCorteTexto && (intervaloCorteObjetivoDias === undefined || intervaloCorteObjetivoDias < 1)) agregarError(errores, 'POTREROS', numeroFila, 'INTERVALO_CORTE_OBJETIVO_DIAS', leer('INTERVALO_CORTE_OBJETIVO_DIAS'), 'Debe ser un número mayor o igual a uno.');

        if (codigo) codigos.add(normalizarTexto(codigo));
        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            codigo,
            nombre,
            tipoArea,
            area,
            capacidadMaxima,
            ubicacion: limpiarTexto(leer('UBICACION')) || undefined,
            estado,
            pastoTexto: pastoTexto || undefined,
            fechaEstablecimientoPasto,
            diasDescansoObjetivo,
            intervaloCorteObjetivoDias,
            observacionCobertura: limpiarTexto(leer('OBSERVACION_COBERTURA')) || undefined,
            observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined,
            camposProporcionados: hoja.encabezados.filter((columna) => columna && campoConValor(leer, columna))
        });
    });

    return registros;
};

const mapearInventario = (hoja, errores, lotesExistentes = []) => {
    const registros = [];
    const diios = new Set();

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const diio = limpiarTexto(leer('DIIO'));
        const especie = valorCanonico(leer('ESPECIE'), ['Bovino', 'Porcino']);
        const sexo = valorCanonico(leer('SEXO'), ['Macho', 'Hembra']);
        const categoriaTexto = limpiarTexto(leer('CATEGORIA'));
        const categoria = especie ? valorCanonico(categoriaTexto, CATEGORIAS_POR_ESPECIE[especie]) : undefined;
        const nacimiento = fecha(leer('FECHA_NACIMIENTO'));
        const categoriaCalculada = especie && sexo && nacimiento
            ? obtenerCategoriaAnimal({ especie, sexo, fechaNacimiento: nacimiento })
            : null;
        const pesoActual = numero(leer('PESO_ACTUAL_KG'));
        const estadoTexto = limpiarTexto(leer('ESTADO'));
        const estado = estadoTexto ? valorCanonico(estadoTexto, ['Activo', 'Vendido', 'Muerto']) : undefined;
        const sanitarioTexto = limpiarTexto(leer('ESTADO_SANITARIO'));
        const estadoSanitario = sanitarioTexto ? valorCanonico(sanitarioTexto, ['Sano', 'En observación', 'Enfermo', 'Recuperación']) : undefined;
        const objetivoTexto = limpiarTexto(leer('OBJETIVO_PRODUCTIVO'));
        const objetivoProductivo = objetivoTexto ? normalizarObjetivoProductivo(objetivoTexto) : undefined;
        const etapaTexto = limpiarTexto(leer('ETAPA_PRODUCTIVA'));
        const etapaProductiva = etapaTexto ? valorCanonico(etapaTexto, ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde']) : undefined;
        const fechaPesajeTexto = limpiarTexto(leer('FECHA_PESAJE'));
        const fechaPesaje = fechaPesajeTexto ? fecha(leer('FECHA_PESAJE')) : undefined;
        const fraccionPrincipalTexto = limpiarTexto(leer('FRACCION_RAZA_PRINCIPAL'));
        const fraccionSecundariaTexto = limpiarTexto(leer('FRACCION_RAZA_SECUNDARIA'));
        let fraccionRazaPrincipal;
        let fraccionRazaSecundaria;
        try {
            fraccionRazaPrincipal = normalizarFraccionRacial(fraccionPrincipalTexto) || undefined;
        } catch (error) {
            agregarError(errores, 'INVENTARIO', numeroFila, 'FRACCION_RAZA_PRINCIPAL', fraccionPrincipalTexto, error.message);
        }
        try {
            fraccionRazaSecundaria = normalizarFraccionRacial(fraccionSecundariaTexto) || undefined;
        } catch (error) {
            agregarError(errores, 'INVENTARIO', numeroFila, 'FRACCION_RAZA_SECUNDARIA', fraccionSecundariaTexto, error.message);
        }
        const codigoLote = limpiarTexto(leer('CODIGO_LOTE'));
        const nombreLote = limpiarTexto(leer('NOMBRE_LOTE'));
        const propositoLoteTexto = limpiarTexto(leer('PROPOSITO_LOTE'));
        const propositoLote = propositoLoteTexto ? normalizarPropositoLote(propositoLoteTexto) : undefined;
        const loteExistente = codigoLote
            ? lotesExistentes.find((item) => normalizarTexto(item.codigo) === normalizarTexto(codigoLote))
            : null;

        validarIdentificadorTexto(errores, 'INVENTARIO', numeroFila, 'DIIO', leer('DIIO'));
        validarIdentificadorTexto(errores, 'INVENTARIO', numeroFila, 'MADRE_DIIO', leer('MADRE_DIIO'));
        validarIdentificadorTexto(errores, 'INVENTARIO', numeroFila, 'PADRE_DIIO', leer('PADRE_DIIO'));
        if (!diio) agregarError(errores, 'INVENTARIO', numeroFila, 'DIIO', '', 'El DIIO es obligatorio.', 'CAMPO_REQUERIDO');
        if (!especie) agregarError(errores, 'INVENTARIO', numeroFila, 'ESPECIE', leer('ESPECIE'), 'Usa Bovino o Porcino.');
        if (!sexo) agregarError(errores, 'INVENTARIO', numeroFila, 'SEXO', leer('SEXO'), 'Usa Macho o Hembra.');
        if (!categoria) agregarError(errores, 'INVENTARIO', numeroFila, 'CATEGORIA', categoriaTexto, especie ? `La categoría no corresponde a ${especie}. Opciones: ${CATEGORIAS_POR_ESPECIE[especie].join(', ')}.` : 'La categoría no se puede validar sin una especie válida.');
        if (categoria && especie && sexo && !categoriasCompatiblesSexo({ especie, sexo }).includes(categoria)) agregarError(errores, 'INVENTARIO', numeroFila, 'CATEGORIA', categoriaTexto, `La categoría ${categoria} no corresponde al sexo ${sexo}.`, 'CATEGORIA_SEXO_INCOMPATIBLE');
        if (categoria && categoriaCalculada && categoria !== categoriaCalculada) agregarError(errores, 'INVENTARIO', numeroFila, 'CATEGORIA', categoriaTexto, `Por edad y sexo corresponde ${categoriaCalculada}.`, 'CATEGORIA_EDAD_SEXO_INCOMPATIBLE');
        if (diio && diios.has(normalizarTexto(diio))) agregarError(errores, 'INVENTARIO', numeroFila, 'DIIO', diio, 'El DIIO está repetido dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (limpiarTexto(leer('FECHA_NACIMIENTO')) && !nacimiento) agregarError(errores, 'INVENTARIO', numeroFila, 'FECHA_NACIMIENTO', leer('FECHA_NACIMIENTO'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (nacimiento && nacimiento > fechaCivilHoy()) agregarError(errores, 'INVENTARIO', numeroFila, 'FECHA_NACIMIENTO', leer('FECHA_NACIMIENTO'), 'La fecha de nacimiento no puede estar en el futuro.', 'FECHA_FUTURA');
        if (fechaPesajeTexto && !fechaPesaje) agregarError(errores, 'INVENTARIO', numeroFila, 'FECHA_PESAJE', leer('FECHA_PESAJE'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (fechaPesaje && fechaPesaje > fechaCivilHoy()) agregarError(errores, 'INVENTARIO', numeroFila, 'FECHA_PESAJE', leer('FECHA_PESAJE'), 'La fecha del pesaje no puede estar en el futuro.', 'FECHA_FUTURA');
        if (fechaPesaje && nacimiento && fechaPesaje < nacimiento) agregarError(errores, 'INVENTARIO', numeroFila, 'FECHA_PESAJE', leer('FECHA_PESAJE'), 'La fecha del pesaje no puede ser anterior al nacimiento.');
        if (limpiarTexto(leer('PESO_ACTUAL_KG')) && (pesoActual === undefined || pesoActual <= 0)) agregarError(errores, 'INVENTARIO', numeroFila, 'PESO_ACTUAL_KG', leer('PESO_ACTUAL_KG'), mensajeNumero(leer('PESO_ACTUAL_KG'), 'Debe ser un número mayor que cero.'));
        if (estadoTexto && !estado) agregarError(errores, 'INVENTARIO', numeroFila, 'ESTADO', estadoTexto, 'Estado general no permitido.');
        if (estado && estado !== 'Activo') agregarError(errores, 'INVENTARIO', numeroFila, 'ESTADO', estadoTexto, 'Vendido y Muerto deben registrarse mediante sus flujos operativos, no por importación.', 'ESTADO_FINAL_NO_PERMITIDO');
        if (sanitarioTexto && !estadoSanitario) agregarError(errores, 'INVENTARIO', numeroFila, 'ESTADO_SANITARIO', sanitarioTexto, 'Estado sanitario no permitido.');
        if (objetivoTexto && !objetivoProductivo) agregarError(errores, 'INVENTARIO', numeroFila, 'OBJETIVO_PRODUCTIVO', objetivoTexto, 'Objetivo productivo no permitido.');
        if (etapaTexto && !etapaProductiva) agregarError(errores, 'INVENTARIO', numeroFila, 'ETAPA_PRODUCTIVA', etapaTexto, 'Etapa productiva no permitida.');
        if (etapaProductiva && especie !== 'Porcino') agregarError(errores, 'INVENTARIO', numeroFila, 'ETAPA_PRODUCTIVA', etapaTexto, 'La etapa productiva por fases aplica únicamente a porcinos.');
        if (propositoLoteTexto && !propositoLote) agregarError(errores, 'INVENTARIO', numeroFila, 'PROPOSITO_LOTE', propositoLoteTexto, `Opciones: ${PROPOSITOS_LOTE.join(', ')}.`);
        if (codigoLote && !loteExistente) agregarError(errores, 'INVENTARIO', numeroFila, 'CODIGO_LOTE', codigoLote, 'El lote no existe. Créalo antes de importar; el importador no crea lotes silenciosamente.', 'REFERENCIA_NO_ENCONTRADA');
        if (loteExistente && loteExistente.estado !== 'ACTIVO') agregarError(errores, 'INVENTARIO', numeroFila, 'CODIGO_LOTE', codigoLote, 'El lote indicado no está activo.');
        if (loteExistente && especie && loteExistente.especie !== especie) agregarError(errores, 'INVENTARIO', numeroFila, 'CODIGO_LOTE', codigoLote, 'La especie del lote no coincide con la del animal.');
        if (loteExistente && propositoLote && loteExistente.proposito !== propositoLote) agregarError(errores, 'INVENTARIO', numeroFila, 'PROPOSITO_LOTE', propositoLote, 'El propósito indicado no coincide con el lote existente.');
        if (loteExistente && objetivoProductivo && !propositoCompatibleConObjetivo(loteExistente.proposito, objetivoProductivo)) agregarError(errores, 'INVENTARIO', numeroFila, 'OBJETIVO_PRODUCTIVO', objetivoTexto, 'El objetivo productivo no es compatible con el propósito del lote.');

        if (diio) diios.add(normalizarTexto(diio));
        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            identificadorFinca: diio,
            diio,
            especie,
            sexo,
            categoria,
            objetivoProductivo,
            etapaProductiva,
            nombre: limpiarTexto(leer('NOMBRE')) || undefined,
            raza: limpiarTexto(leer('RAZA')) || undefined,
            razaPrincipal: limpiarTexto(leer('RAZA_PRINCIPAL')) || undefined,
            razaSecundaria: limpiarTexto(leer('RAZA_SECUNDARIA')) || undefined,
            descripcionRacial: limpiarTexto(leer('DESCRIPCION_RACIAL')) || undefined,
            gradoRacial: limpiarTexto(leer('GRADO_RACIAL')) || undefined,
            variedadRacial: limpiarTexto(leer('VARIEDAD_RACIAL')) || undefined,
            composicionRacial: limpiarTexto(leer('COMPOSICION_RACIAL')) || undefined,
            fraccionRazaPrincipal,
            fraccionRazaSecundaria,
            fechaNacimiento: nacimiento,
            madreDiio: limpiarTexto(leer('MADRE_DIIO')) || undefined,
            padreDiio: limpiarTexto(leer('PADRE_DIIO')) || undefined,
            pesoActual,
            fechaPesaje,
            estado,
            estadoSanitario,
            potreroCodigo: limpiarTexto(leer('POTRERO_CODIGO')) || undefined,
            codigoLote: codigoLote || undefined,
            nombreLote: nombreLote || undefined,
            propositoLote,
            loteProposito: loteExistente?.proposito,
            observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined,
            camposProporcionados: hoja.encabezados.filter((columna) => columna && campoConValor(leer, columna))
        });
    });

    return registros;
};

const mapearFinanzas = (hoja, errores, catalogos) => {
    const registros = [];
    const categorias = catalogos.categorias?.length ? catalogos.categorias : CATEGORIAS_FINANCIERAS;
    const destinos = catalogos.destinosUso?.length ? catalogos.destinosUso : DESTINOS_USO_FINANCIERO;

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const fechaMovimiento = fecha(leer('FECHA'));
        const naturaleza = valorCanonico(leer('NATURALEZA'), NATURALEZAS_FINANCIERAS);
        const tipoMovimiento = valorCanonico(leer('TIPO_MOVIMIENTO'), TIPOS_IMPORTACION_FINANCIERA);
        const categoria = valorCanonico(leer('CATEGORIA'), categorias);
        const descripcion = limpiarTexto(leer('DESCRIPCION'));
        const monto = numero(leer('MONTO'));
        const moneda = valorCanonico(leer('MONEDA'), MONEDAS_FINANCIERAS);
        const cantidad = numero(leer('CANTIDAD'));
        const precioUnitario = numero(leer('PRECIO_UNITARIO'));
        const destinoTexto = limpiarTexto(leer('DESTINO_USO'));
        const destinoUso = destinoTexto ? valorCanonico(destinoTexto, destinos) : undefined;
        const metodoTexto = limpiarTexto(leer('METODO_PAGO'));
        const metodoPago = metodoTexto ? valorCanonico(metodoTexto, METODOS_PAGO_FINANCIERO) : undefined;

        if (!fechaMovimiento) agregarError(errores, 'FINANZAS', numeroFila, 'FECHA', leer('FECHA'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (!naturaleza) agregarError(errores, 'FINANZAS', numeroFila, 'NATURALEZA', leer('NATURALEZA'), 'Usa Ingreso o Egreso.');
        if (!tipoMovimiento) agregarError(errores, 'FINANZAS', numeroFila, 'TIPO_MOVIMIENTO', leer('TIPO_MOVIMIENTO'), `Opciones: ${TIPOS_IMPORTACION_FINANCIERA.join(', ')}.`);
        if (!categoria) agregarError(errores, 'FINANZAS', numeroFila, 'CATEGORIA', leer('CATEGORIA'), 'La categoría no está activa en el catálogo financiero.');
        if (!descripcion) agregarError(errores, 'FINANZAS', numeroFila, 'DESCRIPCION', '', 'La descripción es obligatoria.', 'CAMPO_REQUERIDO');
        if (monto === undefined || monto < 0) agregarError(errores, 'FINANZAS', numeroFila, 'MONTO', leer('MONTO'), mensajeNumero(leer('MONTO'), 'Debe ser un número mayor o igual a cero.'));
        if (!moneda) agregarError(errores, 'FINANZAS', numeroFila, 'MONEDA', leer('MONEDA'), 'Usa CRC o USD.');
        if (limpiarTexto(leer('CANTIDAD')) && (cantidad === undefined || cantidad < 0)) agregarError(errores, 'FINANZAS', numeroFila, 'CANTIDAD', leer('CANTIDAD'), 'Debe ser un número mayor o igual a cero.');
        if (limpiarTexto(leer('PRECIO_UNITARIO')) && (precioUnitario === undefined || precioUnitario < 0)) agregarError(errores, 'FINANZAS', numeroFila, 'PRECIO_UNITARIO', leer('PRECIO_UNITARIO'), 'Debe ser un número mayor o igual a cero.');
        if (destinoTexto && !destinoUso) agregarError(errores, 'FINANZAS', numeroFila, 'DESTINO_USO', destinoTexto, 'El destino no está activo en el catálogo financiero.');
        if (metodoTexto && !metodoPago) agregarError(errores, 'FINANZAS', numeroFila, 'METODO_PAGO', metodoTexto, `Opciones: ${METODOS_PAGO_FINANCIERO.join(', ')}.`);
        if (['PLANILLA', 'INVERSION', 'INVERSIONES'].includes(normalizarTexto(categoria)) && naturaleza !== 'Egreso') agregarError(errores, 'FINANZAS', numeroFila, 'NATURALEZA', naturaleza, `${categoria} solo puede registrarse como Egreso.`, 'NATURALEZA_INCOMPATIBLE');

        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            fecha: fechaMovimiento,
            naturaleza,
            tipoMovimiento,
            categoria,
            categoriaNormalizada: categoria,
            descripcion,
            monto,
            moneda,
            producto: limpiarTexto(leer('PRODUCTO')) || undefined,
            cantidad,
            unidad: limpiarTexto(leer('UNIDAD')) || undefined,
            precioUnitario,
            proveedor: limpiarTexto(leer('PROVEEDOR')) || undefined,
            destinoUso,
            metodoPago,
            finca: limpiarTexto(leer('FINCA')) || undefined,
            observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined
        });
    });

    return registros;
};

const mapearPesajes = (hoja, errores, animalesDisponibles) => {
    const registros = [];
    const claves = new Set();

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const diio = limpiarTexto(leer('DIIO'));
        const fechaPesaje = fecha(leer('FECHA'));
        const peso = numero(leer('PESO_KG'));
        const etapaTexto = limpiarTexto(leer('ETAPA_PRODUCTIVA'));
        const etapaProductiva = etapaTexto ? valorCanonico(etapaTexto, ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde']) : undefined;
        const animal = animalesDisponibles.get(normalizarTexto(diio));
        const clave = diio && fechaPesaje ? `${normalizarTexto(diio)}|${claveFecha(fechaPesaje)}` : '';

        validarIdentificadorTexto(errores, 'PESAJES', numeroFila, 'DIIO', leer('DIIO'));
        if (!diio) agregarError(errores, 'PESAJES', numeroFila, 'DIIO', '', 'El DIIO es obligatorio.', 'CAMPO_REQUERIDO');
        if (diio && !animal) agregarError(errores, 'PESAJES', numeroFila, 'DIIO', diio, 'El animal no existe ni está incluido en la hoja INVENTARIO.', 'REFERENCIA_NO_ENCONTRADA');
        if (!fechaPesaje) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (fechaPesaje && fechaPesaje > fechaCivilHoy()) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'La fecha del pesaje no puede estar en el futuro.', 'FECHA_FUTURA');
        if (fechaPesaje && animal?.fechaNacimiento && fechaPesaje < new Date(animal.fechaNacimiento)) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'La fecha del pesaje no puede ser anterior al nacimiento.', 'FECHA_ANTERIOR_NACIMIENTO');
        if (peso === undefined || peso <= 0) agregarError(errores, 'PESAJES', numeroFila, 'PESO_KG', leer('PESO_KG'), mensajeNumero(leer('PESO_KG'), 'Debe ser un número mayor que cero.'));
        if (clave && claves.has(clave)) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'Ya existe otro pesaje para el mismo DIIO y fecha dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (etapaTexto && !etapaProductiva) agregarError(errores, 'PESAJES', numeroFila, 'ETAPA_PRODUCTIVA', etapaTexto, 'Etapa productiva no permitida.');
        if (etapaProductiva && animal?.especie && animal.especie !== 'Porcino') agregarError(errores, 'PESAJES', numeroFila, 'ETAPA_PRODUCTIVA', etapaTexto, 'La etapa productiva por fases aplica únicamente a porcinos.', 'ETAPA_ESPECIE_INCOMPATIBLE');

        if (clave) claves.add(clave);
        if (errores.length !== inicioErrores) return;

        registros.push({ filaOrigen: numeroFila, diio, fecha: fechaPesaje, peso, etapaProductiva, observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined });
    });

    return registros;
};

const leerVersion = (workbook) => {
    const nombre = workbook.SheetNames.find((item) => normalizarTexto(item) === 'INSTRUCCIONES');
    if (!nombre) return null;
    const matriz = workbook.Sheets[nombre] || [];
    const fila = matriz.find((item) => normalizarTexto(item[0]) === 'VERSION_PLANTILLA');
    return fila ? limpiarTexto(fila[1]) : null;
};

const procesarExcelPreview = async (buffer, opciones = {}) => {
    const workbook = await parsearExcelAislado(buffer, opciones.limites || LIMITES_IMPORTACION);
    const errores = [];
    const advertencias = [];
    const catalogos = opciones.catalogosFinancieros || {};
    const nombresNormalizados = new Set(workbook.SheetNames.map(normalizarTexto));
    const hojasPresentes = HOJAS_DATOS.filter((nombre) => nombresNormalizados.has(nombre));

    if (!hojasPresentes.length) agregarError(errores, 'ARCHIVO', 0, 'HOJAS', workbook.SheetNames.join(', '), `El libro debe contener al menos una hoja estándar: ${HOJAS_DATOS.join(', ')}.`, 'SIN_HOJAS_ESTANDAR');

    const version = leerVersion(workbook);
    if (!version) advertencias.push({ hoja: 'INSTRUCCIONES', mensaje: 'El archivo no declara VERSION_PLANTILLA. Se validará con la versión actual.' });
    else if (version !== VERSION_PLANTILLA) agregarError(errores, 'INSTRUCCIONES', 1, 'VERSION_PLANTILLA', version, `La versión compatible es ${VERSION_PLANTILLA}.`, 'VERSION_NO_COMPATIBLE');

    workbook.SheetNames.forEach((nombre) => {
        const normalizado = normalizarTexto(nombre);
        if (![...HOJAS_DATOS, ...HOJAS_AUXILIARES].includes(normalizado)) advertencias.push({ hoja: nombre, mensaje: 'Hoja fuera del estándar. No será importada.' });
    });

    const preparadas = {};
    hojasPresentes.forEach((nombre) => { preparadas[nombre] = prepararHoja(workbook, nombre, errores, advertencias); });

    const registros = {
        Potrero: preparadas.POTREROS?.columnasValidas ? mapearPotreros(preparadas.POTREROS, errores) : [],
        Animal: preparadas.INVENTARIO?.columnasValidas ? mapearInventario(preparadas.INVENTARIO, errores, opciones.lotesExistentes || []) : [],
        MovimientoFinanciero: preparadas.FINANZAS?.columnasValidas ? mapearFinanzas(preparadas.FINANZAS, errores, catalogos) : [],
        Pesaje: []
    };
    validarYEnriquecerAnimales({
        registros: registros.Animal,
        animalesExistentes: opciones.animalesExistentes || [],
        errores,
        advertencias
    });
    const resolverCobertura = opciones.resolverPasto || resolverPastoPorTexto;
    for (const potrero of registros.Potrero) {
        if (!potrero.pastoTexto) continue;
        const categoria = potrero.tipoArea === 'BANCO_FORRAJERO' ? 'Pasto de corte' : 'Pasto';
        const uso = potrero.tipoArea === 'BANCO_FORRAJERO' ? 'CORTE' : 'PASTOREO';
        const catalogado = await resolverCobertura(potrero.pastoTexto, categoria, uso);
        if (catalogado) {
            potrero.pastoPrincipal = catalogado._id;
        } else {
            potrero.descripcionCobertura = potrero.pastoTexto;
            advertencias.push({
                hoja: 'POTREROS',
                mensaje: `Fila ${potrero.filaOrigen}: el pasto "${potrero.pastoTexto}" no está en el catálogo y quedará pendiente de revisión.`
            });
        }
    }
    const animalesDisponibles = new Map();
    (opciones.diiosExistentes || []).forEach((diio) => animalesDisponibles.set(normalizarTexto(diio), { diio }));
    [...(opciones.animalesExistentes || []), ...registros.Animal].forEach((animal) => {
        [animal.diio, animal.identificadorFinca].filter(Boolean).forEach((identificador) => {
            animalesDisponibles.set(normalizarTexto(identificador), animal);
        });
    });
    if (preparadas.PESAJES?.columnasValidas) registros.Pesaje = mapearPesajes(preparadas.PESAJES, errores, animalesDisponibles);

    const hojasPorModelo = { Potrero: 'POTREROS', Animal: 'INVENTARIO', MovimientoFinanciero: 'FINANZAS', Pesaje: 'PESAJES' };
    const clavesVistas = new Set();
    Object.entries(registros).forEach(([modelo, filas]) => filas.forEach((registro) => {
        registro.claveImportacion = crearClaveImportacion({
            organizacionId: opciones.organizacionId,
            fincaId: opciones.fincaId,
            hoja: hojasPorModelo[modelo],
            registro
        });
        if (clavesVistas.has(`${modelo}:${registro.claveImportacion}`)) {
            registro.posibleDuplicado = true;
            registro.omitirPorDuplicado = true;
            advertencias.push({ hoja: hojasPorModelo[modelo], mensaje: `Fila ${registro.filaOrigen}: posible duplicado dentro del archivo; se omitirá salvo confirmación explícita.` });
        }
        clavesVistas.add(`${modelo}:${registro.claveImportacion}`);
    }));
    if (opciones.resolverDuplicados) {
        const duplicados = await opciones.resolverDuplicados(registros);
        Object.entries(registros).forEach(([modelo, filas]) => filas.forEach((registro) => {
            if (!duplicados?.[modelo]?.has(registro.claveImportacion)) return;
            registro.posibleDuplicado = true;
            registro.omitirPorDuplicado = true;
            advertencias.push({ hoja: hojasPorModelo[modelo], mensaje: `Fila ${registro.filaOrigen}: coincide con una fila importada anteriormente; se omitirá salvo confirmación explícita.` });
        }));
    }
    if (opciones.validarCupo) {
        const resultadoCupo = await opciones.validarCupo(registros.Animal);
        if (!resultadoCupo?.permitido) {
            agregarError(errores, 'INVENTARIO', 0, 'CUPO', resultadoCupo?.cantidadSolicitada || '', resultadoCupo?.mensaje || 'El archivo supera el cupo disponible del plan.', 'CUPO_INSUFICIENTE');
        }
    }

    const resumen = {
        Potrero: registros.Potrero.length,
        Animal: registros.Animal.length,
        MovimientoFinanciero: registros.MovimientoFinanciero.length,
        Pesaje: registros.Pesaje.length,
        filasInvalidas: new Set(errores.filter((item) => item.fila > 1).map((item) => `${item.hoja}:${item.fila}`)).size
    };
    const totalRegistros = resumen.Potrero + resumen.Animal + resumen.MovimientoFinanciero + resumen.Pesaje;
    if (hojasPresentes.length && totalRegistros === 0 && errores.length === 0) {
        agregarError(errores, 'ARCHIVO', 0, 'FILAS', '', 'El archivo no contiene filas de datos para importar.', 'SIN_REGISTROS');
    }

    return {
        versionPlantilla: VERSION_PLANTILLA,
        versionArchivo: version,
        valido: errores.length === 0 && hojasPresentes.length > 0 && totalRegistros > 0,
        hojasDetectadas: workbook.SheetNames.map((nombre) => ({ nombre, reconocida: HOJAS_DATOS.includes(normalizarTexto(nombre)), auxiliar: HOJAS_AUXILIARES.includes(normalizarTexto(nombre)) })),
        resumen,
        registros,
        muestras: Object.fromEntries(Object.entries(registros).map(([modelo, items]) => [modelo, items.slice(0, 5)])),
        duplicados: Object.entries(registros).flatMap(([modelo, items]) => items
            .filter((item) => item.posibleDuplicado)
            .map((item) => ({ modelo, fila: item.filaOrigen, clave: item.claveImportacion, descripcion: item.diio || item.codigo || item.descripcion || 'Registro' }))),
        errores,
        advertencias
    };
};

const hojaConColumnas = (columnas, anchos) => {
    const hoja = XLSX.utils.aoa_to_sheet([columnas]);
    hoja['!cols'] = anchos.map((wch) => ({ wch }));
    hoja['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(columnas.length - 1)}1` };
    return hoja;
};

const generarPlantillaExcel = (catalogos = {}) => {
    const categorias = catalogos.categorias?.length ? catalogos.categorias : CATEGORIAS_FINANCIERAS;
    const destinos = catalogos.destinosUso?.length ? catalogos.destinosUso : DESTINOS_USO_FINANCIERO;
    const libro = XLSX.utils.book_new();
    const instrucciones = [
        ['VERSION_PLANTILLA', VERSION_PLANTILLA],
        ['IMPORTADOR', 'GanaderiaRomilio - formato estándar'],
        ['USO', 'Conserve los nombres de hojas y columnas. Puede eliminar hojas que no vaya a importar.'],
        ['FECHAS', 'Use DD/MM/AAAA.'],
        ['INVENTARIO', 'DIIO, ESPECIE, SEXO y CATEGORIA son obligatorios. DIIO, MADRE_DIIO y PADRE_DIIO deben ser celdas de tipo Texto. Si incluye FECHA_NACIMIENTO, la categoría debe coincidir con edad y sexo. Cría se acepta como formato antiguo y se normaliza a REPRODUCCION.'],
        ['RAZAS', 'RAZA conserva la descripción libre. RAZA_PRINCIPAL y RAZA_SECUNDARIA normalizan bovinos y porcinos. Las fracciones son opcionales e informativas.'],
        ['GENEALOGIA', 'MADRE_DIIO y PADRE_DIIO se enlazan si existen; si no, se conservan para resolverlos después.'],
        ['FINANZAS', 'Las categorías y destinos deben existir y estar activos en Catálogos de Finanzas.'],
        ['PESAJES', 'Hoja opcional. El DIIO debe existir o venir en INVENTARIO.'],
        ['PASTOS', 'En POTREROS use TIPO_AREA y PASTO_PRINCIPAL. BANCO_FORRAJERO acepta forrajes de corte.'],
        ['ROTACIONES', 'No forman parte del importador estándar. Se gestionan dentro de la aplicación.']
    ];
    const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
    hojaInstrucciones['!cols'] = [{ wch: 24 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'INSTRUCCIONES');

    XLSX.utils.book_append_sheet(libro, hojaConColumnas(
        ['CODIGO', 'NOMBRE', 'TIPO_AREA', 'AREA_HECTAREAS', 'CAPACIDAD_MAXIMA', 'UBICACION', 'ESTADO', 'PASTO_PRINCIPAL', 'FECHA_ESTABLECIMIENTO_PASTO', 'DIAS_DESCANSO_OBJETIVO', 'INTERVALO_CORTE_OBJETIVO_DIAS', 'OBSERVACION_COBERTURA', 'OBSERVACIONES'],
        [18, 28, 22, 18, 20, 28, 18, 28, 24, 24, 28, 38, 45]
    ), 'POTREROS');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.INVENTARIO.requeridas, ...COLUMNAS.INVENTARIO.opcionales], [18, 14, 12, 18, 24, 20, 20, 18, 18, 18, 16, 22, 20, 18, 22, 20, 45]), 'INVENTARIO');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.FINANZAS.requeridas, ...COLUMNAS.FINANZAS.opcionales], [16, 14, 24, 22, 42, 16, 12, 28, 14, 14, 18, 26, 22, 20, 22, 22, 45]), 'FINANZAS');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.PESAJES.requeridas, ...COLUMNAS.PESAJES.opcionales], [18, 16, 14, 45]), 'PESAJES');

    const catalogoRacialBovino = obtenerCatalogoRacial('Bovino');
    const catalogoRacialPorcino = obtenerCatalogoRacial('Porcino');
    const pastos = CATALOGO_PASTOS_BASE.filter((item) => item.categoria === 'Pasto').map((item) => item.nombre);
    const forrajesCorte = CATALOGO_PASTOS_BASE.filter((item) => item.categoria === 'Pasto de corte').map((item) => item.nombre);
    const leguminosas = CATALOGO_PASTOS_BASE.filter((item) => item.categoria === 'Leguminosa/Forraje').map((item) => item.nombre);
    const largo = Math.max(categorias.length, destinos.length, TIPOS_IMPORTACION_FINANCIERA.length, catalogoRacialBovino.razas.length, catalogoRacialPorcino.razas.length, pastos.length, forrajesCorte.length, CATEGORIAS_POR_ESPECIE.Bovino.length, CATEGORIAS_POR_ESPECIE.Porcino.length, OBJETIVOS_PRODUCTIVOS.length, PROPOSITOS_LOTE.length, 8);
    const filasCatalogos = [['CATEGORIAS_FINANCIERAS', 'DESTINOS_USO', 'TIPOS_MOVIMIENTO', 'NATURALEZAS', 'MONEDAS', 'ESPECIES', 'SEXOS', 'CATEGORIAS_BOVINOS', 'CATEGORIAS_PORCINOS', 'OBJETIVOS_PRODUCTIVOS', 'PROPOSITOS_LOTE', 'ESTADOS_POTRERO', 'TIPOS_AREA', 'RAZAS_BOVINAS', 'RAZAS_PORCINAS', 'GRADOS_RACIALES', 'FRACCIONES_RACIALES', 'COMPOSICIONES_RACIALES', 'PASTOS', 'FORRAJES_CORTE', 'LEGUMINOSAS_FORRAJES']];
    for (let indice = 0; indice < largo; indice += 1) {
        filasCatalogos.push([
            categorias[indice] || '',
            destinos[indice] || '',
            TIPOS_IMPORTACION_FINANCIERA[indice] || '',
            NATURALEZAS_FINANCIERAS[indice] || '',
            MONEDAS_FINANCIERAS[indice] || '',
            ['Bovino', 'Porcino'][indice] || '',
            ['Macho', 'Hembra'][indice] || '',
            CATEGORIAS_POR_ESPECIE.Bovino[indice] || '',
            CATEGORIAS_POR_ESPECIE.Porcino[indice] || '',
            OBJETIVOS_PRODUCTIVOS[indice] || '',
            PROPOSITOS_LOTE[indice] || '',
            ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento'][indice] || '',
            ['PASTOREO', 'BANCO_FORRAJERO'][indice] || '',
            catalogoRacialBovino.razas[indice] || '',
            catalogoRacialPorcino.razas[indice] || '',
            catalogoRacialBovino.gradosRaciales[indice] || '',
            catalogoRacialBovino.fraccionesRaciales[indice] || '',
            catalogoRacialBovino.composicionesRaciales[indice] || '',
            pastos[indice] || '',
            forrajesCorte[indice] || '',
            leguminosas[indice] || ''
        ]);
    }
    const hojaCatalogos = XLSX.utils.aoa_to_sheet(filasCatalogos);
    hojaCatalogos['!cols'] = Array.from({ length: 21 }, () => ({ wch: 26 }));
    XLSX.utils.book_append_sheet(libro, hojaCatalogos, 'CATALOGOS');

    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
    COLUMNAS,
    HOJAS_DATOS,
    LIMITES_IMPORTACION,
    VERSION_PLANTILLA,
    crearClaveImportacion,
    confirmarImportacionExcel: confirmarImportacionExcelAtomica,
    generarPlantillaExcel,
    procesarExcelPreview
};
