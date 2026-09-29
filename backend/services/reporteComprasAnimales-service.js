const MS_DIA = 1000 * 60 * 60 * 24;

const redondear = (valor, decimales = 2) => {
    const numero = Number(valor || 0);
    if (!Number.isFinite(numero)) return 0;
    return Number(numero.toFixed(decimales));
};

const dividir = (numerador, denominador) => denominador ? numerador / denominador : 0;
const idTexto = (valor) => String(valor?._id || valor || '');
const textoComparable = (valor) => String(valor || '').trim().toLocaleLowerCase('es');

const diasEntre = (inicio, fin) => {
    const fechaInicio = new Date(inicio);
    const fechaFin = new Date(fin);
    if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) return null;
    return Math.max(Math.round((fechaFin - fechaInicio) / MS_DIA), 0);
};

const obtenerEspecieCompra = (compra) => compra.especie || 'Bovino';

const obtenerRangoPeso = (especie, peso) => {
    if (especie === 'Porcino') {
        if (peso < 25) return { orden: 1, etiqueta: 'Menos de 25 kg' };
        if (peso < 60) return { orden: 2, etiqueta: '25 a 59 kg' };
        if (peso < 100) return { orden: 3, etiqueta: '60 a 99 kg' };
        return { orden: 4, etiqueta: '100 kg o más' };
    }

    if (peso < 200) return { orden: 1, etiqueta: 'Menos de 200 kg' };
    if (peso < 300) return { orden: 2, etiqueta: '200 a 299 kg' };
    if (peso < 400) return { orden: 3, etiqueta: '300 a 399 kg' };
    return { orden: 4, etiqueta: '400 kg o más' };
};

const agruparRegistros = (registros, obtenerClave, crearBase) => {
    const grupos = new Map();

    registros.forEach((registro) => {
        const clave = obtenerClave(registro);
        if (!grupos.has(clave)) grupos.set(clave, crearBase(registro, clave));
        const grupo = grupos.get(clave);

        grupo.idsCompras.add(registro.compraId);
        grupo.animales += 1;
        grupo.pesoTotalKg += registro.pesoCompraKg;
        grupo.montoCalculado += registro.subtotalCalculado;
        grupo.montoTotal += registro.montoAsignado;
        grupo.ajusteMonto += registro.ajusteAsignado;
        grupo.machos += registro.sexo === 'Macho' ? 1 : 0;
        grupo.hembras += registro.sexo === 'Hembra' ? 1 : 0;
        grupo.activos += registro.estado === 'Activo' ? 1 : 0;
        grupo.vendidos += registro.estado === 'Vendido' ? 1 : 0;
        grupo.muertos += registro.estado === 'Muerto' ? 1 : 0;
        grupo.tratadosPrimeros60Dias += registro.tratadoPrimeros60Dias ? 1 : 0;

        if (registro.gananciaDiaria !== null) {
            grupo.sumaGananciaDiaria += registro.gananciaDiaria;
            grupo.animalesConGanancia += 1;
        }

        if (registro.margenBruto !== null) {
            grupo.margenBruto += registro.margenBruto;
            grupo.animalesConMargen += 1;
        }
    });

    return [...grupos.values()].map((grupo) => ({
        ...grupo,
        compras: grupo.idsCompras.size,
        pesoTotalKg: redondear(grupo.pesoTotalKg),
        montoCalculado: redondear(grupo.montoCalculado),
        montoTotal: redondear(grupo.montoTotal),
        ajusteMonto: redondear(grupo.ajusteMonto),
        pesoPromedio: redondear(dividir(grupo.pesoTotalKg, grupo.animales)),
        precioEfectivoKg: redondear(dividir(grupo.montoTotal, grupo.pesoTotalKg)),
        costoPromedioAnimal: redondear(dividir(grupo.montoTotal, grupo.animales)),
        tasaMortalidad: redondear(dividir(grupo.muertos * 100, grupo.animales)),
        tasaTratamientoTemprano: redondear(dividir(grupo.tratadosPrimeros60Dias * 100, grupo.animales)),
        gananciaDiariaPromedio: redondear(dividir(grupo.sumaGananciaDiaria, grupo.animalesConGanancia), 3),
        margenBruto: redondear(grupo.margenBruto),
        idsCompras: undefined,
        sumaGananciaDiaria: undefined
    }));
};

const baseGrupo = () => ({
    idsCompras: new Set(),
    animales: 0,
    pesoTotalKg: 0,
    montoCalculado: 0,
    montoTotal: 0,
    ajusteMonto: 0,
    machos: 0,
    hembras: 0,
    activos: 0,
    vendidos: 0,
    muertos: 0,
    tratadosPrimeros60Dias: 0,
    sumaGananciaDiaria: 0,
    animalesConGanancia: 0,
    margenBruto: 0,
    animalesConMargen: 0
});

const construirReporteCompras = ({
    compras = [],
    animales = [],
    pesajes = [],
    tratamientos = [],
    filtros = {},
    hoy = new Date()
} = {}) => {
    const animalesPorId = new Map(animales.map((animal) => [idTexto(animal), animal]));
    const pesajesPorAnimal = new Map();
    const tratamientosPorAnimal = new Map();

    pesajes.forEach((pesaje) => {
        const animalId = idTexto(pesaje.animal);
        if (!pesajesPorAnimal.has(animalId)) pesajesPorAnimal.set(animalId, []);
        pesajesPorAnimal.get(animalId).push(pesaje);
    });
    pesajesPorAnimal.forEach((items) => items.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));

    tratamientos.forEach((tratamiento) => {
        (tratamiento.animales || []).forEach((animalId) => {
            const clave = idTexto(animalId);
            if (!tratamientosPorAnimal.has(clave)) tratamientosPorAnimal.set(clave, []);
            tratamientosPorAnimal.get(clave).push(tratamiento);
        });
    });

    const registrosSinFiltrar = compras.flatMap((compra) => {
        const especie = obtenerEspecieCompra(compra);
        const cantidadDetalles = (compra.animales || []).length;
        const montoCalculadoCompra = Number(compra.montoCalculado || 0);
        const montoTotalCompra = Number(compra.montoTotal || 0);

        return (compra.animales || []).map((detalle) => {
            const animalId = idTexto(detalle.animal);
            const animal = animalesPorId.get(animalId);
            const subtotalCalculado = Number(detalle.subtotal ?? (Number(detalle.pesoCompraKg || 0) * Number(detalle.precioKg || 0)));
            const proporcion = montoCalculadoCompra > 0
                ? subtotalCalculado / montoCalculadoCompra
                : dividir(1, cantidadDetalles);
            const montoAsignado = montoTotalCompra * proporcion;
            const fechaCompra = new Date(compra.fechaCompra);
            const fechaLimiteTratamiento = new Date(fechaCompra.getTime() + (60 * MS_DIA));
            const tratadoPrimeros60Dias = (tratamientosPorAnimal.get(animalId) || []).some((tratamiento) => {
                const fecha = new Date(tratamiento.fechaInicio);
                return fecha >= fechaCompra && fecha <= fechaLimiteTratamiento;
            });

            let fechaMedicion = null;
            let pesoFinal = null;
            if (animal?.estado === 'Vendido' && animal.fechaVenta && Number(animal.pesoVenta) > 0) {
                fechaMedicion = animal.fechaVenta;
                pesoFinal = Number(animal.pesoVenta);
            } else {
                const fechaTope = animal?.fechaMuerte ? new Date(animal.fechaMuerte) : new Date(hoy);
                const pesajesValidos = (pesajesPorAnimal.get(animalId) || []).filter((pesaje) => {
                    const fecha = new Date(pesaje.fecha);
                    return fecha >= fechaCompra && fecha <= fechaTope;
                });
                const ultimoPesaje = pesajesValidos[pesajesValidos.length - 1];
                if (ultimoPesaje) {
                    fechaMedicion = ultimoPesaje.fecha;
                    pesoFinal = Number(ultimoPesaje.peso);
                }
            }

            const diasSeguimiento = fechaMedicion ? diasEntre(fechaCompra, fechaMedicion) : null;
            const gananciaKg = pesoFinal !== null ? pesoFinal - Number(detalle.pesoCompraKg || 0) : null;
            const gananciaDiaria = diasSeguimiento > 0 ? gananciaKg / diasSeguimiento : null;
            const tieneMontoVenta = animal?.montoVenta !== undefined
                && animal?.montoVenta !== null
                && Number.isFinite(Number(animal.montoVenta));
            const margenBruto = animal?.estado === 'Vendido' && tieneMontoVenta
                ? Number(animal.montoVenta) - montoAsignado
                : null;

            return {
                compraId: idTexto(compra),
                fechaCompra: compra.fechaCompra,
                especie,
                proveedor: compra.proveedor || 'Sin proveedor',
                animalId,
                identificador: detalle.diio || detalle.identificadorFinca || animal?.diio || animal?.identificadorFinca || '--',
                nombre: detalle.nombre || animal?.nombre || '',
                sexo: detalle.sexo || animal?.sexo || 'Sin definir',
                raza: detalle.raza || animal?.raza || 'Sin definir',
                categoria: animal?.categoria || 'Sin categoría',
                pesoCompraKg: Number(detalle.pesoCompraKg || 0),
                precioRegistradoKg: Number(detalle.precioKg || 0),
                subtotalCalculado,
                montoAsignado,
                ajusteAsignado: montoAsignado - subtotalCalculado,
                precioEfectivoKg: dividir(montoAsignado, Number(detalle.pesoCompraKg || 0)),
                estado: animal?.estado || 'Sin registro',
                fechaMedicion,
                pesoFinal,
                diasSeguimiento,
                gananciaKg,
                gananciaDiaria,
                tratadoPrimeros60Dias,
                montoVenta: animal?.estado === 'Vendido' ? Number(animal.montoVenta || 0) : null,
                margenBruto
            };
        });
    });

    const proveedoresDisponibles = [...new Set(registrosSinFiltrar.map((item) => item.proveedor).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es'));
    const razasDisponibles = [...new Set(registrosSinFiltrar.map((item) => item.raza).filter((raza) => raza && raza !== 'Sin definir'))]
        .sort((a, b) => a.localeCompare(b, 'es'));

    const registros = registrosSinFiltrar.filter((registro) => {
        if (['Bovino', 'Porcino'].includes(filtros.especie) && registro.especie !== filtros.especie) return false;
        if (filtros.sexo && registro.sexo !== filtros.sexo) return false;
        if (filtros.proveedor && !textoComparable(registro.proveedor).includes(textoComparable(filtros.proveedor))) return false;
        if (filtros.raza && !textoComparable(registro.raza).includes(textoComparable(filtros.raza))) return false;
        return true;
    });

    const totalInvertido = registros.reduce((total, item) => total + item.montoAsignado, 0);
    const montoCalculado = registros.reduce((total, item) => total + item.subtotalCalculado, 0);
    const totalKg = registros.reduce((total, item) => total + item.pesoCompraKg, 0);
    const ajusteMonto = totalInvertido - montoCalculado;
    const idsCompras = new Set(registros.map((item) => item.compraId));
    const animalesConGanancia = registros.filter((item) => item.gananciaDiaria !== null);
    const animalesVendidos = registros.filter((item) => item.estado === 'Vendido');
    const animalesMuertos = registros.filter((item) => item.estado === 'Muerto');
    const animalesActivos = registros.filter((item) => item.estado === 'Activo');
    const tratadosPrimeros60Dias = registros.filter((item) => item.tratadoPrimeros60Dias);
    const animalesConMargen = registros.filter((item) => item.margenBruto !== null);

    const porMes = agruparRegistros(
        registros,
        (item) => {
            const fecha = new Date(item.fechaCompra);
            return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
        },
        (item, clave) => {
            const fecha = new Date(item.fechaCompra);
            return { ...baseGrupo(), clave, anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 };
        }
    ).sort((a, b) => a.clave.localeCompare(b.clave));

    const porSexo = agruparRegistros(
        registros,
        (item) => item.sexo,
        (item, sexo) => ({ ...baseGrupo(), sexo })
    ).map((grupo) => ({
        ...grupo,
        porcentajeAnimales: redondear(dividir(grupo.animales * 100, registros.length))
    })).sort((a, b) => b.animales - a.animales);

    const porEspecie = agruparRegistros(
        registros,
        (item) => item.especie,
        (item, especie) => ({ ...baseGrupo(), especie })
    ).sort((a, b) => a.especie.localeCompare(b.especie));

    const proveedores = agruparRegistros(
        registros,
        (item) => item.proveedor,
        (item, proveedor) => ({ ...baseGrupo(), proveedor })
    ).sort((a, b) => b.montoTotal - a.montoTotal);

    const rangosPeso = agruparRegistros(
        registros,
        (item) => {
            const rango = obtenerRangoPeso(item.especie, item.pesoCompraKg);
            return `${item.especie}-${rango.orden}`;
        },
        (item, clave) => {
            const rango = obtenerRangoPeso(item.especie, item.pesoCompraKg);
            return { ...baseGrupo(), clave, especie: item.especie, orden: rango.orden, rango: rango.etiqueta };
        }
    ).sort((a, b) => a.especie.localeCompare(b.especie) || a.orden - b.orden);

    const comprasDetalle = agruparRegistros(
        registros,
        (item) => item.compraId,
        (item, compraId) => ({
            ...baseGrupo(),
            compraId,
            fechaCompra: item.fechaCompra,
            especie: item.especie,
            proveedor: item.proveedor
        })
    ).sort((a, b) => new Date(b.fechaCompra) - new Date(a.fechaCompra));

    const puntosPesoPrecio = registros
        .filter((item) => item.pesoCompraKg > 0 && item.precioEfectivoKg > 0)
        .slice(0, 400)
        .map((item) => ({
            animalId: item.animalId,
            identificador: item.identificador,
            especie: item.especie,
            sexo: item.sexo,
            proveedor: item.proveedor,
            pesoCompraKg: redondear(item.pesoCompraKg),
            precioEfectivoKg: redondear(item.precioEfectivoKg)
        }));

    return {
        filtros: {
            especie: filtros.especie || 'Todos',
            sexo: filtros.sexo || '',
            proveedor: filtros.proveedor || '',
            raza: filtros.raza || ''
        },
        opcionesFiltros: {
            proveedores: proveedoresDisponibles,
            razas: razasDisponibles
        },
        resumen: {
            totalInvertido: redondear(totalInvertido),
            montoCalculado: redondear(montoCalculado),
            ajusteMonto: redondear(ajusteMonto),
            porcentajeAjuste: redondear(dividir(ajusteMonto * 100, montoCalculado)),
            totalCompras: idsCompras.size,
            totalAnimales: registros.length,
            totalKg: redondear(totalKg),
            precioEfectivoKg: redondear(dividir(totalInvertido, totalKg)),
            costoPromedioAnimal: redondear(dividir(totalInvertido, registros.length)),
            pesoPromedioEntrada: redondear(dividir(totalKg, registros.length)),
            activos: animalesActivos.length,
            vendidos: animalesVendidos.length,
            muertos: animalesMuertos.length,
            tasaMortalidad: redondear(dividir(animalesMuertos.length * 100, registros.length)),
            animalesConSeguimientoPeso: animalesConGanancia.length,
            gananciaDiariaPromedio: redondear(dividir(
                animalesConGanancia.reduce((total, item) => total + item.gananciaDiaria, 0),
                animalesConGanancia.length
            ), 3),
            tratadosPrimeros60Dias: tratadosPrimeros60Dias.length,
            tasaTratamientoTemprano: redondear(dividir(tratadosPrimeros60Dias.length * 100, registros.length)),
            animalesVendidosConMargen: animalesConMargen.length,
            margenBrutoVendidos: redondear(animalesConMargen.reduce((total, item) => total + item.margenBruto, 0))
        },
        porMes,
        porEspecie,
        porSexo,
        proveedores,
        rangosPeso,
        puntosPesoPrecio,
        compras: comprasDetalle
    };
};

module.exports = {
    construirReporteCompras,
    obtenerRangoPeso
};
