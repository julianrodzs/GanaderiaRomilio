const XLSX = require('xlsx');
const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const Pesaje = require('../models/Pesaje');
const RotacionPotrero = require('../models/RotacionPotrero');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');

const LIMITE_PREVIEW = 20;

const limpiarTexto = (valor) => {
    if (valor === null || valor === undefined) return '';
    return String(valor).trim();
};

const normalizar = (valor) => {
    return limpiarTexto(valor)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toUpperCase();
};

const esVacio = (valor) => limpiarTexto(valor) === '';

const tieneDatos = (fila) => fila.some((valor) => !esVacio(valor));

const aNumero = (valor) => {
    if (valor === null || valor === undefined || valor === '') return undefined;
    if (typeof valor === 'number' && Number.isFinite(valor)) return valor;

    const texto = limpiarTexto(valor)
        .replace(/[₡$,\s]/g, '')
        .replace(/[^\d.-]/g, '');
    const numero = Number(texto);

    return Number.isFinite(numero) ? numero : undefined;
};

const detectarMoneda = (valor) => {
    const texto = limpiarTexto(valor);
    if (texto.includes('$')) return 'USD';
    if (texto.includes('₡')) return 'CRC';
    return undefined;
};

const aFecha = (valor) => {
    if (!valor) return undefined;
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;

    if (typeof valor === 'number') {
        const fecha = XLSX.SSF.parse_date_code(valor);
        if (!fecha) return undefined;
        return new Date(Date.UTC(fecha.y, fecha.m - 1, fecha.d));
    }

    const texto = limpiarTexto(valor);
    if (!texto || texto === '-') return undefined;

    const fechaCompacta = texto.match(/^(\d{1,2})[/-](\d{1,2})(\d{4})$/);
    if (fechaCompacta) {
        const fecha = new Date(Date.UTC(Number(fechaCompacta[3]), Number(fechaCompacta[2]) - 1, Number(fechaCompacta[1])));
        return Number.isNaN(fecha.getTime()) ? undefined : fecha;
    }

    const partes = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (partes) {
        let primero = Number(partes[1]);
        let segundo = Number(partes[2]);
        let anio = Number(partes[3]);

        if (anio < 100) anio += 2000;

        const diaPrimero = primero > 12;
        const dia = diaPrimero ? primero : segundo;
        const mes = diaPrimero ? segundo : primero;
        if (anio < 1900) return undefined;

        const fecha = new Date(Date.UTC(anio, mes - 1, dia));

        return Number.isNaN(fecha.getTime()) ? undefined : fecha;
    }

    const fecha = new Date(texto);
    return Number.isNaN(fecha.getTime()) ? undefined : fecha;
};

const serializarFecha = (fecha) => {
    if (!fecha) return undefined;
    return fecha.toISOString().slice(0, 10);
};

const mapearSexo = (valor) => {
    const texto = normalizar(valor);
    if (texto === 'H' || texto === 'HEMBRA') return 'Hembra';
    if (texto === 'M' || texto === 'MACHO') return 'Macho';
    return undefined;
};

const buscarIndice = (fila, opciones) => {
    const normalizadas = opciones.map(normalizar);
    return fila.findIndex((celda) => normalizadas.includes(normalizar(celda)));
};

const buscarFilaEncabezado = (filas, columnasRequeridas) => {
    return filas.findIndex((fila) => {
        const textoFila = fila.map(normalizar);
        return columnasRequeridas.every((columna) => textoFila.includes(normalizar(columna)));
    });
};

const crearAcumulador = () => ({
    Animal: [],
    Potrero: [],
    Pesaje: [],
    RegistroSanitario: [],
    Costo: [],
    MovimientoFinanciero: [],
    RotacionPotrero: []
});

const agregar = (acumulador, modelo, datos, meta) => {
    acumulador[modelo].push({
        modelo,
        datos,
        meta
    });
};

const agregarAdvertencia = (advertencias, hoja, mensaje) => {
    advertencias.push({ hoja, mensaje });
};

const mapearControlPesoDiio = ({ hoja, filas, acumulador, advertencias }) => {
    const indiceEncabezado = buscarFilaEncabezado(filas, ['DIIO', 'Sexo']);

    if (indiceEncabezado === -1) return false;

    const encabezado = filas[indiceEncabezado];
    const idx = {
        numero: buscarIndice(encabezado, ['No.']),
        diio: buscarIndice(encabezado, ['DIIO']),
        identificadorFinca: buscarIndice(encabezado, ['ID de finca']),
        fechaNacimiento: buscarIndice(encabezado, ['Fecha de Nacimiento']),
        sexo: buscarIndice(encabezado, ['Sexo']),
        peso1: buscarIndice(encabezado, ['Pesa #1']),
        fecha1: buscarIndice(encabezado, ['Fecha']),
        peso2: buscarIndice(encabezado.slice(buscarIndice(encabezado, ['Pesa #2'])), ['Pesa #2'])
    };
    const idxPesa2 = buscarIndice(encabezado, ['Pesa #2']);
    const idxFecha2 = idxPesa2 >= 0 ? buscarIndice(encabezado.slice(idxPesa2 + 1), ['Fecha']) + idxPesa2 + 1 : -1;

    filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
        if (!tieneDatos(fila)) return;

        const diio = limpiarTexto(fila[idx.diio]);
        const sexo = mapearSexo(fila[idx.sexo]);

        if (!diio || !sexo) return;

        const peso1 = aNumero(fila[idx.peso1]);
        const peso2 = idxPesa2 >= 0 ? aNumero(fila[idxPesa2]) : undefined;
        const fecha1 = aFecha(fila[idx.fecha1]);
        const fecha2 = idxFecha2 >= 0 ? aFecha(fila[idxFecha2]) : undefined;

        agregar(acumulador, 'Animal', {
            identificadorFinca: diio,
            diio,
            nombre: limpiarTexto(fila[idx.identificadorFinca]) || undefined,
            sexo,
            fechaNacimiento: serializarFecha(aFecha(fila[idx.fechaNacimiento])),
            pesoActual: peso2 || peso1,
            estado: 'Activo',
            observaciones: `Importado desde hoja ${hoja}`
        }, { hoja, fila: indiceEncabezado + offset + 2 });

        if (peso1) {
            agregar(acumulador, 'Pesaje', {
                animal: diio,
                fecha: serializarFecha(fecha1),
                peso: peso1,
                observaciones: `Pesa #1 importada desde ${hoja}`
            }, { hoja, fila: indiceEncabezado + offset + 2, referenciaAnimal: 'diio' });
        }

        if (peso2) {
            agregar(acumulador, 'Pesaje', {
                animal: diio,
                fecha: serializarFecha(fecha2),
                peso: peso2,
                observaciones: `Pesa #2 importada desde ${hoja}`
            }, { hoja, fila: indiceEncabezado + offset + 2, referenciaAnimal: 'diio' });
        }
    });

    agregarAdvertencia(advertencias, hoja, 'Los pesajes referencian animales por DIIO en la vista previa; al insertar se deberan resolver a ObjectId.');
    return true;
};

const mapearControlPesoArete = ({ hoja, filas, acumulador, advertencias }) => {
    const indiceEncabezado = buscarFilaEncabezado(filas, ['# Arete', 'Subasta']);

    if (indiceEncabezado === -1) return false;

    const encabezado = filas[indiceEncabezado];
    const idx = {
        nacimiento: buscarIndice(encabezado, ['NACIMIENTO']),
        cantidad: buscarIndice(encabezado, ['CANTIDAD']),
        subasta: buscarIndice(encabezado, ['Subasta']),
        arete: buscarIndice(encabezado, ['# Arete']),
        pesoSubasta: buscarIndice(encabezado, ['Peso Subasta kg']),
        fechaCompra: buscarIndice(encabezado, ['Fecha']),
        peso1: buscarIndice(encabezado, ['Pesa #1'])
    };
    const idxFecha1 = idx.peso1 >= 0 ? buscarIndice(encabezado.slice(idx.peso1 + 1), ['Fecha']) + idx.peso1 + 1 : -1;
    const idxPesa2 = buscarIndice(encabezado, ['Pesa #2']);
    const idxFecha2 = idxPesa2 >= 0 ? buscarIndice(encabezado.slice(idxPesa2 + 1), ['Fecha']) + idxPesa2 + 1 : -1;

    filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
        if (!tieneDatos(fila)) return;

        const arete = limpiarTexto(fila[idx.arete]);
        if (!arete || normalizar(arete).includes('TOTAL')) return;

        const pesoSubasta = aNumero(fila[idx.pesoSubasta]);
        const peso1 = aNumero(fila[idx.peso1]);
        const peso2 = idxPesa2 >= 0 ? aNumero(fila[idxPesa2]) : undefined;

        agregar(acumulador, 'Animal', {
            identificadorFinca: arete,
            nombre: limpiarTexto(fila[idx.subasta]),
            sexo: 'Macho',
            fechaNacimiento: serializarFecha(aFecha(fila[idx.nacimiento])),
            pesoActual: peso2 || peso1 || pesoSubasta,
            estado: 'Activo',
            observaciones: `Importado desde hoja ${hoja}; sexo inferido como Macho por falta de columna sexo`
        }, { hoja, fila: indiceEncabezado + offset + 2 });

        [
            { peso: pesoSubasta, fecha: aFecha(fila[idx.fechaCompra]), nombre: 'Peso de subasta' },
            { peso: peso1, fecha: aFecha(fila[idxFecha1]), nombre: 'Pesa #1' },
            { peso: peso2, fecha: aFecha(fila[idxFecha2]), nombre: 'Pesa #2' }
        ].forEach((pesaje) => {
            if (!pesaje.peso) return;
            agregar(acumulador, 'Pesaje', {
                animal: arete,
                fecha: serializarFecha(pesaje.fecha),
                peso: pesaje.peso,
                observaciones: `${pesaje.nombre} importado desde ${hoja}`
            }, { hoja, fila: indiceEncabezado + offset + 2, referenciaAnimal: 'identificadorFinca' });
        });
    });

    agregarAdvertencia(advertencias, hoja, 'La hoja con # Arete no trae sexo; se deja Macho como valor temporal para cumplir el modelo actual.');
    return true;
};

const mapearRotaciones = ({ hoja, filas, acumulador }) => {
    const indiceEncabezado = buscarFilaEncabezado(filas, ['NÚMERO', 'FECHA DE ENTRADA', 'FECHA DE SALIDA']);
    if (indiceEncabezado === -1) return false;

    const potreros = new Set();

    filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
        const numero = limpiarTexto(fila[0]);
        if (!numero || normalizar(numero).includes('TOTAL')) return;

        const codigo = `POT-${numero.padStart(2, '0')}`;
        potreros.add(numero);

        const entradaActual = aFecha(fila[1]);
        const salidaActual = aFecha(fila[2]);
        const proximoIngreso = aFecha(fila[4]);
        const entradaProxima = aFecha(fila[5]) || proximoIngreso;
        const salidaProxima = aFecha(fila[6]);

        if (entradaActual || salidaActual) {
            agregar(acumulador, 'RotacionPotrero', {
                potrero: codigo,
                lote: codigo,
                fechaEntrada: serializarFecha(entradaActual),
                fechaSalida: serializarFecha(salidaActual),
                estado: salidaActual ? 'Finalizada' : 'Activa',
                observaciones: `Rotacion actual importada desde ${hoja}`
            }, { hoja, fila: indiceEncabezado + offset + 2, referenciaPotrero: 'codigo' });
        }

        if (entradaProxima || salidaProxima) {
            agregar(acumulador, 'RotacionPotrero', {
                potrero: codigo,
                lote: codigo,
                fechaEntrada: serializarFecha(entradaProxima),
                fechaSalida: serializarFecha(salidaProxima),
                estado: 'Planificada',
                observaciones: `Proxima rotacion importada desde ${hoja}`
            }, { hoja, fila: indiceEncabezado + offset + 2, referenciaPotrero: 'codigo' });
        }
    });

    potreros.forEach((numero) => {
        const codigo = `POT-${numero.padStart(2, '0')}`;
        agregar(acumulador, 'Potrero', {
            codigo,
            nombre: `Potrero ${numero}`,
            estado: 'Disponible',
            observaciones: `Potrero inferido desde hoja ${hoja}`
        }, { hoja, fila: null, inferido: true });
    });

    return true;
};

const mapearSanidad = ({ hoja, filas, acumulador, advertencias }) => {
    const indiceEncabezado = filas.findIndex((fila) => normalizar(fila[0]).includes('OBSERVACIONES') && normalizar(fila[1]).includes('ACTIVIDAD'));
    if (indiceEncabezado === -1) return false;

    const fechas = filas[indiceEncabezado + 1] || [];
    const columnasFecha = fechas
        .map((valor, indice) => ({ valor, indice, fecha: aFecha(valor) }))
        .filter((columna) => columna.indice >= 2 && columna.fecha);

    filas.slice(indiceEncabezado + 2).forEach((fila, offset) => {
        const producto = limpiarTexto(fila[0]);
        const tipo = limpiarTexto(fila[1]);

        if (!producto || !tipo || normalizar(producto).includes('PRODUCTO')) return;

        columnasFecha.forEach((columna) => {
            const marca = limpiarTexto(fila[columna.indice]);
            if (!marca || marca === '0') return;

            agregar(acumulador, 'RegistroSanitario', {
                animal: null,
                fecha: serializarFecha(columna.fecha),
                tipo,
                producto,
                dosis: limpiarTexto(fila[19]) || undefined,
                observaciones: `Marca detectada: ${marca}. Importado desde ${hoja}`
            }, { hoja, fila: indiceEncabezado + offset + 3 });
        });
    });

    agregarAdvertencia(advertencias, hoja, 'La hoja sanitaria no identifica animales individuales; los registros quedan sin animal hasta definir regla de asignacion.');
    return true;
};

const categoriaCosto = (texto) => {
    const valor = normalizar(texto);
    if (valor.includes('ALIMENT')) return 'Alimentacion';
    if (valor.includes('VACUNA') || valor.includes('VITAMINA') || valor.includes('MEDICAMENTO') || valor.includes('DESPAR')) return 'Sanidad';
    if (valor.includes('CHANCH')) return 'Chanchos';
    if (valor.includes('GANADO') || valor.includes('TERNER') || valor.includes('NOVILL') || valor.includes('VACA')) return 'Ganado';
    if (valor.includes('MAQUINARIA') || valor.includes('DRAGA')) return 'Maquinaria';
    if (valor.includes('POTRERO') || valor.includes('MATERIAL') || valor.includes('INSUMO')) return 'Potreros';
    if (valor.includes('PLANILLA') || valor.includes('MANO DE OBRA')) return 'Mano de obra';
    if (valor.includes('FINCA')) return 'Fincas';
    return 'General';
};

const MESES = {
    ENERO: 0,
    FEBRERO: 1,
    MARZO: 2,
    ABRIL: 3,
    MAYO: 4,
    JUNIO: 5,
    JULIO: 6,
    AGOSTO: 7,
    SEPTIEMBRE: 8,
    SETIEMBRE: 8,
    OCTUBRE: 9,
    NOVIEMBRE: 10,
    DICIEMBRE: 11
};

const fechaDesdeCorte = (texto) => {
    const valor = normalizar(texto);
    const mes = Object.keys(MESES).find((nombreMes) => valor.includes(nombreMes));
    const anio = valor.match(/20\d{2}/)?.[0];

    if (!mes || !anio) return undefined;
    return new Date(Date.UTC(Number(anio), MESES[mes], 1));
};

const fechaHoyImportacion = () => new Date();

const crearMovimiento = ({ fecha, tipoMovimiento, naturaleza = 'Egreso', categoria, descripcion, monto, moneda, proveedor, empleado, finca, observaciones }) => ({
    fecha: serializarFecha(fecha || fechaHoyImportacion()),
    tipoMovimiento,
    naturaleza,
    categoria,
    descripcion,
    monto,
    moneda: moneda || 'CRC',
    proveedor: proveedor || undefined,
    empleado: empleado || undefined,
    finca: finca || undefined,
    observaciones
});

const mapearPlanillasFinancieras = ({ hoja, filas, acumulador }) => {
    let detectada = false;

    filas.forEach((fila, indice) => {
        const columnaCorte = fila.findIndex((celda) => normalizar(celda).includes('CORTE'));
        if (columnaCorte === -1) return;

        const descripcion = limpiarTexto(fila[columnaCorte]);
        const fecha = fechaDesdeCorte(descripcion) || fechaHoyImportacion();
        const monto = aNumero(fila[10]) || aNumero(fila[columnaCorte + 8]);

        if (!monto) return;

        detectada = true;
        agregar(acumulador, 'MovimientoFinanciero', crearMovimiento({
            fecha,
            tipoMovimiento: 'Planilla',
            categoria: 'Mano de obra',
            descripcion,
            monto,
            moneda: detectarMoneda(fila[10]) || 'CRC',
            observaciones: `Importado desde ${hoja}; total del corte de planilla`
        }), { hoja, fila: indice + 1 });
    });

    return detectada;
};

const indicesCompraDesdeEncabezado = (fila, columna) => {
    const encabezados = fila.slice(columna, columna + 8).map(normalizar);
    const indiceRelativo = (opciones) => encabezados.findIndex((celda) => opciones.some((opcion) => celda.includes(normalizar(opcion))));

    const fecha = indiceRelativo(['FECHA']);
    const item = indiceRelativo(['FUNCIÓN-ITEM', 'FUNCION-ITEM', 'ITEM']);
    const lugar = indiceRelativo(['LUGAR']);
    const precio = indiceRelativo(['PRECIO']);
    const cantidad = indiceRelativo(['CANTIDAD']);
    const unidad = indiceRelativo(['UNIDAD']);
    const total = indiceRelativo(['PRECIO TOTAL']);

    if (fecha === -1 || item === -1 || total === -1) return null;

    return {
        fecha: columna + fecha,
        item: columna + item,
        lugar: lugar === -1 ? -1 : columna + lugar,
        precio: precio === -1 ? -1 : columna + precio,
        cantidad: cantidad === -1 ? -1 : columna + cantidad,
        unidad: unidad === -1 ? -1 : columna + unidad,
        total: columna + total
    };
};

const buscarTituloBloque = (filas, indiceFila, columna) => {
    for (let fila = indiceFila - 1; fila >= Math.max(0, indiceFila - 4); fila -= 1) {
        const titulo = limpiarTexto((filas[fila] || [])[columna]);
        if (titulo && !normalizar(titulo).includes('FECHA')) return titulo;
    }

    return 'Compra importada';
};

const mapearComprasFinancieras = ({ hoja, filas, acumulador }) => {
    let detectada = false;

    filas.forEach((fila, indice) => {
        fila.forEach((celda, columna) => {
            if (normalizar(celda) !== 'FECHA' && normalizar(celda) !== 'CONTENIDO') return;

            const idx = normalizar(celda) === 'CONTENIDO'
                ? {
                    fecha: columna + 2,
                    item: columna + 3,
                    lugar: columna + 1,
                    precio: columna + 4,
                    cantidad: columna + 5,
                    unidad: columna + 6,
                    total: columna + 7
                }
                : indicesCompraDesdeEncabezado(fila, columna);

            if (!idx) return;

            const titulo = buscarTituloBloque(filas, indice, columna);
            const categoria = categoriaCosto(titulo);

            for (let filaIndice = indice + 1; filaIndice < filas.length; filaIndice += 1) {
                const filaDatos = filas[filaIndice];
                const fechaDetectada = aFecha(filaDatos[idx.fecha]);
                const fecha = fechaDetectada || fechaHoyImportacion();
                const descripcion = limpiarTexto(filaDatos[idx.item]);
                const monto = aNumero(filaDatos[idx.total]);
                const marcador = normalizar(filaDatos[idx.fecha]);

                if (marcador === 'FECHA' || marcador === 'CONTENIDO') break;
                if (!fechaDetectada && !descripcion && !monto) break;
                if (!descripcion || !monto || normalizar(descripcion).includes('TOTAL')) continue;

                detectada = true;
                agregar(acumulador, 'MovimientoFinanciero', crearMovimiento({
                    fecha,
                    tipoMovimiento: 'Compra',
                    categoria,
                    descripcion,
                    monto,
                    moneda: detectarMoneda(filaDatos[idx.total]) || detectarMoneda(filaDatos[idx.precio]) || 'CRC',
                    proveedor: limpiarTexto(filaDatos[idx.lugar]),
                    observaciones: [
                        `Importado desde ${hoja} - ${titulo}`,
                        idx.cantidad >= 0 && limpiarTexto(filaDatos[idx.cantidad]) ? `Cantidad: ${limpiarTexto(filaDatos[idx.cantidad])}` : '',
                        idx.unidad >= 0 && limpiarTexto(filaDatos[idx.unidad]) ? `Unidad: ${limpiarTexto(filaDatos[idx.unidad])}` : '',
                        idx.precio >= 0 && limpiarTexto(filaDatos[idx.precio]) ? `Precio unitario: ${limpiarTexto(filaDatos[idx.precio])}` : ''
                    ].filter(Boolean).join('. ')
                }), { hoja, fila: filaIndice + 1 });
            }
        });
    });

    return detectada;
};

const mapearInversionesFinancieras = ({ hoja, filas, acumulador, advertencias }) => {
    let detectada = false;

    filas.forEach((fila, indice) => {
        const encabezado = fila.map(normalizar);
        const esTablaCompraAnimal = encabezado.includes('FECHA')
            && encabezado.includes('CANTIDAD')
            && (encabezado.includes('CATEGORIA DEL ANIMAL') || encabezado.includes('MAQUINARIA'))
            && encabezado.includes('COSTO');

        if (!esTablaCompraAnimal) return;

        const idxFecha = buscarIndice(fila, ['FECHA']);
        const idxCantidad = buscarIndice(fila, ['CANTIDAD']);
        const idxCategoriaAnimal = buscarIndice(fila, ['CATEGORIA DEL ANIMAL']);
        const idxMaquinaria = buscarIndice(fila, ['MAQUINARIA']);
        const idxCosto = buscarIndice(fila, ['COSTO']);
        const idxTransporte = buscarIndice(fila, ['COSTO DE TRASPORTE ', 'COSTO DE TRANSPORTE']);
        const idxProveedor = buscarIndice(fila, ['LUGAR DE COMPRA']);
        const categoriaTabla = idxMaquinaria >= 0 ? 'Maquinaria' : 'Ganado';

        for (let filaIndice = indice + 1; filaIndice < filas.length; filaIndice += 1) {
            const filaDatos = filas[filaIndice];
            const fechaDetectada = aFecha(filaDatos[idxFecha]);
            const fecha = fechaDetectada || fechaHoyImportacion();
            const descripcionBase = limpiarTexto(filaDatos[idxCategoriaAnimal >= 0 ? idxCategoriaAnimal : idxMaquinaria]);
            const cantidad = limpiarTexto(filaDatos[idxCantidad]);
            const costo = aNumero(filaDatos[idxCosto]);
            const transporte = idxTransporte >= 0 ? aNumero(filaDatos[idxTransporte]) || 0 : 0;
            const monto = costo ? costo + transporte : undefined;
            const marcador = normalizar(filaDatos[idxFecha]);

            if (marcador === 'FECHA') break;
            if (marcador.includes('TOTAL')) break;
            if (!fechaDetectada && !descripcionBase && !monto) break;
            if (!descripcionBase || !monto) continue;

            detectada = true;
            agregar(acumulador, 'MovimientoFinanciero', crearMovimiento({
                fecha,
                tipoMovimiento: 'Inversion',
                categoria: categoriaTabla,
                descripcion: cantidad ? `${cantidad} - ${descripcionBase}` : descripcionBase,
                monto,
                moneda: detectarMoneda(filaDatos[idxCosto]) || 'CRC',
                proveedor: limpiarTexto(filaDatos[idxProveedor]),
                observaciones: `Importado desde ${hoja}. Costo: ${limpiarTexto(filaDatos[idxCosto]) || '0'}. Transporte: ${limpiarTexto(filaDatos[idxTransporte]) || '0'}`
            }), { hoja, fila: filaIndice + 1 });
        }
    });

    filas.forEach((fila, indice) => {
        const fecha = aFecha(fila[12]) || fechaHoyImportacion();
        const monto = aNumero(fila[13]);
        const inversionista = limpiarTexto(fila[14]);

        if (!monto || !inversionista) return;

        detectada = true;
        agregar(acumulador, 'MovimientoFinanciero', crearMovimiento({
            fecha,
            tipoMovimiento: 'Inversion',
            naturaleza: 'Ingreso',
            categoria: 'Aporte de inversionistas',
            descripcion: `Aporte de ${inversionista}`,
            monto,
            moneda: detectarMoneda(fila[13]) || 'USD',
            observaciones: `Importado desde ${hoja} - aportes de inversionistas`
        }), { hoja, fila: indice + 1 });
    });

    if (normalizar(hoja).includes('INVERSION')) {
        agregarAdvertencia(advertencias, hoja, 'Los movimientos financieros sin fecha se importan con la fecha actual para que el cliente los edite despues.');
    }

    return detectada;
};

const mapearCostosCompras = ({ hoja, filas, acumulador }) => {
    let detectada = false;

    filas.forEach((fila, indice) => {
        fila.forEach((celda, columna) => {
            if (normalizar(celda) !== 'FECHA') return;

            const idxFecha = columna;
            const idxDescripcion = columna + 1;
            const idxProveedor = columna + 2;
            const idxTotal = columna + 6;
            const titulo = limpiarTexto((filas[indice - 1] || [])[columna]) || 'Costo importado';

            for (let filaIndice = indice + 1; filaIndice < filas.length; filaIndice += 1) {
                const filaDatos = filas[filaIndice];
                const marcadorInicio = normalizar(filaDatos[idxFecha]);
                const descripcionMarcador = normalizar(filaDatos[idxDescripcion]);

                if (
                    marcadorInicio === 'FECHA'
                    || marcadorInicio === 'TOTAL'
                    || marcadorInicio.includes('TOTAL')
                    || descripcionMarcador.includes('RESUMEN COSTOS')
                    || descripcionMarcador.includes('COSTOS ALIMENTACION')
                    || descripcionMarcador.includes('COSTOS VACUNAS')
                    || descripcionMarcador.includes('COSTOS INSUMOS')
                ) {
                    break;
                }

                const fecha = aFecha(filaDatos[idxFecha]);
                const descripcion = limpiarTexto(filaDatos[idxDescripcion]);
                const monto = aNumero(filaDatos[idxTotal]);

                if (!fecha && !descripcion && !monto) {
                    break;
                }

                if (!fecha || !descripcion || !monto || normalizar(descripcion).includes('TOTAL')) {
                    continue;
                }

                detectada = true;
                agregar(acumulador, 'Costo', {
                    fecha: serializarFecha(fecha),
                    categoria: categoriaCosto(titulo),
                    descripcion,
                    monto,
                    proveedor: limpiarTexto(filaDatos[idxProveedor]) || undefined,
                    observaciones: `Importado desde ${hoja} - ${titulo}`
                }, { hoja, fila: filaIndice + 1 });
            }
        });
    });

    return detectada;
};

const mapearCostosPlanilla = ({ hoja, filas, acumulador }) => {
    let detectada = false;

    filas.forEach((fila, indice) => {
        const columnaCorte = fila.findIndex((celda) => normalizar(celda).includes('CORTE'));
        if (columnaCorte === -1) return;

        const montoColones = aNumero((filas[indice] || [])[columnaCorte + 2]);
        const montoDolares = aNumero((filas[indice + 1] || [])[columnaCorte + 2]);
        const monto = montoColones || montoDolares;

        if (!monto) return;

        detectada = true;
        agregar(acumulador, 'Costo', {
            fecha: undefined,
            categoria: 'Mano de obra',
            descripcion: limpiarTexto(fila[columnaCorte]),
            monto,
            observaciones: `Costo de planilla importado desde ${hoja}`
        }, { hoja, fila: indice + 1 });
    });

    return detectada;
};

const crearPreview = (acumulador) => {
    return Object.fromEntries(
        Object.entries(acumulador).map(([modelo, registros]) => [
            modelo,
            {
                totalDetectado: registros.length,
                muestra: registros.slice(0, LIMITE_PREVIEW)
            }
        ])
    );
};

const obtenerResumen = (acumulador) => {
    return Object.fromEntries(
        Object.entries(acumulador).map(([modelo, registros]) => [modelo, registros.length])
    );
};

const procesarExcelPreview = (buffer) => {
    const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true
    });
    const acumulador = crearAcumulador();
    const advertencias = [];
    const hojasDetectadas = [];

    workbook.SheetNames.forEach((hoja) => {
        const worksheet = workbook.Sheets[hoja];
        const filas = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: false,
            blankrows: false
        });
        const nombre = normalizar(hoja);
        const modelosAntes = obtenerResumen(acumulador);
        let reconocida = false;

        if (nombre.includes('CONTROL DE PESO')) {
            reconocida = mapearControlPesoDiio({ hoja, filas, acumulador, advertencias });

            if (!reconocida) {
                agregarAdvertencia(advertencias, hoja, 'Hoja de peso omitida porque no trae columna DIIO. Se importaran solo animales con DIIO.');
            }
        } else if (nombre.includes('ROTACION') || nombre.includes('ROTACIÓN')) {
            reconocida = mapearRotaciones({ hoja, filas, acumulador, advertencias });
        } else if (nombre.includes('REGISTRO SANITARIO')) {
            reconocida = false;
            agregarAdvertencia(advertencias, hoja, 'Hoja de sanidad omitida por ahora a solicitud del flujo actual.');
        } else if (nombre.includes('CONTROL DE COMPRAS')) {
            reconocida = mapearComprasFinancieras({ hoja, filas, acumulador, advertencias });
        } else if (nombre.includes('PLANILLA')) {
            reconocida = mapearPlanillasFinancieras({ hoja, filas, acumulador, advertencias });
        } else if (nombre.includes('INVERSION')) {
            reconocida = mapearInversionesFinancieras({ hoja, filas, acumulador, advertencias });
        }

        const modelosDespues = obtenerResumen(acumulador);
        const detectados = Object.fromEntries(
            Object.keys(modelosDespues)
                .map((modelo) => [modelo, modelosDespues[modelo] - modelosAntes[modelo]])
                .filter(([, total]) => total > 0)
        );

        hojasDetectadas.push({
            nombre: hoja,
            rango: worksheet['!ref'],
            reconocida,
            registrosDetectados: detectados
        });

        const yaTieneAdvertencia = advertencias.some((advertencia) => advertencia.hoja === hoja);

        if (!reconocida && !yaTieneAdvertencia) {
            agregarAdvertencia(advertencias, hoja, 'No se encontro un mapeo confiable para esta hoja.');
        }
    });

    return {
        mensaje: 'Vista previa generada. No se inserto ningun dato en la base de datos.',
        resumen: obtenerResumen(acumulador),
        hojasDetectadas,
        preview: crearPreview(acumulador),
        registros: acumulador,
        advertencias
    };
};

const obtenerRegistrosConfirmacion = (payload) => {
    if (payload.registros) return payload.registros;
    if (payload.preview) {
        return Object.fromEntries(
            Object.entries(payload.preview).map(([modelo, valor]) => [modelo, valor.muestra || []])
        );
    }

    return payload;
};

const confirmarImportacionExcel = async (payload) => {
    const registros = obtenerRegistrosConfirmacion(payload || {});
    const resultado = {
        Animal: { creados: 0, duplicados: 0, errores: [] },
        Potrero: { creados: 0, duplicados: 0, errores: [] },
        Pesaje: { creados: 0, omitidos: 0, errores: [] },
        RotacionPotrero: { creados: 0, omitidos: 0, errores: [] },
        MovimientoFinanciero: { creados: 0, duplicados: 0, omitidos: 0, errores: [] }
    };
    const animalesPorDiio = new Map();
    const potrerosPorCodigo = new Map();

    for (const registro of registros.Animal || []) {
        try {
            const datos = registro.datos || registro;
            if (!datos.identificadorFinca || !datos.diio) {
                resultado.Animal.errores.push({ datos, mensaje: 'Animal omitido por falta de DIIO o identificadorFinca' });
                continue;
            }

            const existente = await Animal.findOne({ identificadorFinca: datos.identificadorFinca });

            if (existente) {
                resultado.Animal.duplicados += 1;
                animalesPorDiio.set(datos.diio, existente);
                continue;
            }

            const creado = await Animal.create(datos);
            resultado.Animal.creados += 1;
            animalesPorDiio.set(datos.diio, creado);
        } catch (error) {
            resultado.Animal.errores.push({ meta: registro.meta, mensaje: error.message });
        }
    }

    for (const registro of registros.Potrero || []) {
        try {
            const datos = registro.datos || registro;
            if (!datos.codigo) {
                resultado.Potrero.errores.push({ datos, mensaje: 'Potrero omitido por falta de codigo' });
                continue;
            }

            const existente = await Potrero.findOne({ codigo: datos.codigo });

            if (existente) {
                resultado.Potrero.duplicados += 1;
                potrerosPorCodigo.set(datos.codigo, existente);
                continue;
            }

            const creado = await Potrero.create(datos);
            resultado.Potrero.creados += 1;
            potrerosPorCodigo.set(datos.codigo, creado);
        } catch (error) {
            resultado.Potrero.errores.push({ meta: registro.meta, mensaje: error.message });
        }
    }

    for (const registro of registros.Pesaje || []) {
        try {
            const datos = registro.datos || registro;
            const animal = animalesPorDiio.get(datos.animal) || await Animal.findOne({ diio: datos.animal });

            if (!animal || !datos.peso) {
                resultado.Pesaje.omitidos += 1;
                continue;
            }

            const existente = await Pesaje.findOne({
                animal: animal._id,
                fecha: datos.fecha ? new Date(datos.fecha) : undefined,
                peso: datos.peso
            });

            if (existente) {
                resultado.Pesaje.omitidos += 1;
                continue;
            }

            await Pesaje.create({
                ...datos,
                animal: animal._id
            });
            resultado.Pesaje.creados += 1;
        } catch (error) {
            resultado.Pesaje.errores.push({ meta: registro.meta, mensaje: error.message });
        }
    }

    for (const registro of registros.RotacionPotrero || []) {
        try {
            const datos = registro.datos || registro;
            const potrero = potrerosPorCodigo.get(datos.potrero) || await Potrero.findOne({ codigo: datos.potrero });

            if (!potrero || !datos.fechaEntrada) {
                resultado.RotacionPotrero.omitidos += 1;
                continue;
            }

            const existente = await RotacionPotrero.findOne({
                potrero: potrero._id,
                fechaEntrada: new Date(datos.fechaEntrada),
                fechaSalida: datos.fechaSalida ? new Date(datos.fechaSalida) : undefined
            });

            if (existente) {
                resultado.RotacionPotrero.omitidos += 1;
                continue;
            }

            await RotacionPotrero.create({
                ...datos,
                potrero: potrero._id
            });
            resultado.RotacionPotrero.creados += 1;
        } catch (error) {
            resultado.RotacionPotrero.errores.push({ meta: registro.meta, mensaje: error.message });
        }
    }

    for (const registro of registros.MovimientoFinanciero || []) {
        try {
            const datos = registro.datos || registro;

            if (!datos.fecha || !datos.tipoMovimiento || !datos.categoria || !datos.descripcion || !datos.monto) {
                resultado.MovimientoFinanciero.omitidos += 1;
                continue;
            }

            const existente = await MovimientoFinanciero.findOne({
                fecha: new Date(datos.fecha),
                tipoMovimiento: datos.tipoMovimiento,
                naturaleza: datos.naturaleza || 'Egreso',
                categoria: datos.categoria,
                descripcion: datos.descripcion,
                monto: datos.monto,
                moneda: datos.moneda || 'CRC'
            });

            if (existente) {
                resultado.MovimientoFinanciero.duplicados += 1;
                continue;
            }

            await MovimientoFinanciero.create(datos);
            resultado.MovimientoFinanciero.creados += 1;
        } catch (error) {
            resultado.MovimientoFinanciero.errores.push({ meta: registro.meta, mensaje: error.message });
        }
    }

    return {
        mensaje: 'Importacion confirmada',
        resultado
    };
};

module.exports = {
    confirmarImportacionExcel,
    procesarExcelPreview
};
