const AlertaCorreo = require('../models/AlertaCorreo');
const { PlanSanitario } = require('../models/PlanSanitario');
const { RegistroReproductivo, completarFechasYEstado } = require('../models/RegistroReproductivo');
const { Tarea } = require('../models/Tarea');
const { enviarCorreoAdministradores } = require('./correoElectronico-service');

const MS_DIA = 1000 * 60 * 60 * 24;
const FRECUENCIA_PROXIMA_DIAS = 6;
const FRECUENCIA_VENCIDA_DIAS = 2;
const FRECUENCIA_CRITICA_DIAS = 1;
const DIAS_SANIDAD_CRITICA = 15;
const DIAS_PARTO_CRITICO = 3;

const normalizarDia = (fecha = new Date()) => {
    const dia = new Date(fecha);
    dia.setHours(0, 0, 0, 0);
    return dia;
};

const formatearFechaKey = (fecha) => {
    if (!fecha) return '';
    return normalizarDia(fecha).toISOString().slice(0, 10);
};

const formatearFecha = (fecha) => {
    if (!fecha) return '--';
    return new Date(fecha).toLocaleDateString('es-CR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
};

const diasHasta = (fecha) => {
    if (!fecha) return null;
    const hoy = normalizarDia();
    const objetivo = normalizarDia(fecha);
    return Math.ceil((objetivo.getTime() - hoy.getTime()) / MS_DIA);
};

const diasDesde = (fecha) => {
    if (!fecha) return Infinity;
    const hoy = normalizarDia();
    const enviada = normalizarDia(fecha);
    return Math.floor((hoy.getTime() - enviada.getTime()) / MS_DIA);
};

const obtenerNombreAnimal = (animal) => {
    if (!animal) return 'DIIO no disponible';
    return animal.diio || animal.identificadorFinca || 'DIIO no disponible';
};

const debeEnviarAlerta = async ({
    clave,
    tipo,
    referenciaModelo,
    referenciaId,
    fechaObjetivo,
    frecuenciaDias,
    enviarEnDiaObjetivo = false
}) => {
    const fechaObjetivoKey = formatearFechaKey(fechaObjetivo);
    const estado = await AlertaCorreo.findOne({ clave });
    const diasObjetivo = diasHasta(fechaObjetivo);

    if (!estado) {
        return {
            enviar: true,
            datosEstado: { clave, tipo, referenciaModelo, referenciaId, fechaObjetivoKey }
        };
    }

    if (estado.fechaObjetivoKey !== fechaObjetivoKey) {
        return {
            enviar: true,
            datosEstado: { clave, tipo, referenciaModelo, referenciaId, fechaObjetivoKey }
        };
    }

    if (enviarEnDiaObjetivo && diasObjetivo === 0 && diasDesde(estado.ultimoEnvio) >= 1) {
        return {
            enviar: true,
            datosEstado: { clave, tipo, referenciaModelo, referenciaId, fechaObjetivoKey }
        };
    }

    return {
        enviar: diasDesde(estado.ultimoEnvio) >= frecuenciaDias,
        datosEstado: { clave, tipo, referenciaModelo, referenciaId, fechaObjetivoKey }
    };
};

const registrarEnvioAlerta = async ({ clave, tipo, referenciaModelo, referenciaId, fechaObjetivoKey }) => {
    await AlertaCorreo.findOneAndUpdate(
        { clave },
        {
            $set: {
                tipo,
                referenciaModelo,
                referenciaId,
                fechaObjetivoKey,
                ultimoEnvio: new Date()
            },
            $inc: { vecesEnviada: 1 }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const obtenerAlertasSanidad = async () => {
    const planes = await PlanSanitario.find({
        estado: { $ne: 'Aplicado' },
        proximaAplicacion: { $exists: true, $ne: null }
    }).lean();

    const alertas = [];

    for (const plan of planes) {
        const dias = diasHasta(plan.proximaAplicacion);
        if (dias === null) continue;

        if (dias >= 0 && dias <= 7) {
            const clave = `sanidad-proxima:${plan._id}`;
            const revision = await debeEnviarAlerta({
                clave,
                tipo: 'Sanidad próxima',
                referenciaModelo: 'PlanSanitario',
                referenciaId: plan._id,
                fechaObjetivo: plan.proximaAplicacion,
                frecuenciaDias: FRECUENCIA_PROXIMA_DIAS,
                enviarEnDiaObjetivo: true
            });

            if (revision.enviar) {
                alertas.push({
                    ...revision.datosEstado,
                    categoria: 'Sanidad',
                    estadoAlerta: 'Próxima',
                    asunto: 'Alertas de sanidad próximas',
                    detalle: `${plan.grupoGanado}${plan.animalDiio ? ` - DIIO ${plan.animalDiio}` : ''}: ${plan.actividad} / ${plan.producto}`,
                    fecha: plan.proximaAplicacion,
                    dias
                });
            }
        }

        if (dias < 0) {
            const diasVencida = Math.abs(dias);
            const esCritica = diasVencida >= DIAS_SANIDAD_CRITICA;
            const clave = `${esCritica ? 'sanidad-critica' : 'sanidad-vencida'}:${plan._id}`;
            const revision = await debeEnviarAlerta({
                clave,
                tipo: esCritica ? 'Sanidad crítica' : 'Sanidad vencida',
                referenciaModelo: 'PlanSanitario',
                referenciaId: plan._id,
                fechaObjetivo: plan.proximaAplicacion,
                frecuenciaDias: esCritica ? FRECUENCIA_CRITICA_DIAS : FRECUENCIA_VENCIDA_DIAS
            });

            if (revision.enviar) {
                alertas.push({
                    ...revision.datosEstado,
                    categoria: 'Sanidad',
                    estadoAlerta: esCritica ? 'Crítica' : 'Vencida',
                    asunto: esCritica ? 'Alertas críticas de sanidad' : 'Alertas de sanidad vencidas',
                    detalle: `${plan.grupoGanado}${plan.animalDiio ? ` - DIIO ${plan.animalDiio}` : ''}: ${plan.actividad} / ${plan.producto}`,
                    fecha: plan.proximaAplicacion,
                    dias
                });
            }
        }
    }

    return alertas;
};

const obtenerAlertasReproduccion = async () => {
    const registros = await RegistroReproductivo.find().populate('animal').lean();
    const alertas = [];

    for (const registro of registros) {
        const datos = { ...registro };
        completarFechasYEstado(datos);
        const animal = registro.animal;
        const animalNombre = obtenerNombreAnimal(animal);

        const fechaProximoCelo = datos.fechaProximoCelo;
        const diasProximoCelo = diasHasta(fechaProximoCelo);
        if (fechaProximoCelo && diasProximoCelo !== null && diasProximoCelo >= 0 && diasProximoCelo <= 7) {
            const clave = `reproduccion-proximo-celo:${registro._id}`;
            const revision = await debeEnviarAlerta({
                clave,
                tipo: 'Próximo celo estimado',
                referenciaModelo: 'RegistroReproductivo',
                referenciaId: registro._id,
                fechaObjetivo: fechaProximoCelo,
                frecuenciaDias: FRECUENCIA_PROXIMA_DIAS,
                enviarEnDiaObjetivo: true
            });

            if (revision.enviar) {
                alertas.push({
                    ...revision.datosEstado,
                    categoria: 'Reproducción',
                    estadoAlerta: 'Próximo celo estimado',
                    asunto: 'Alertas de reproducción: próximo celo estimado',
                    detalle: `${animalNombre} tiene próximo celo estimado`,
                    fecha: fechaProximoCelo,
                    dias: diasProximoCelo
                });
            }
        }

        const fechaPartoEstimada = datos.fechaPartoEstimada;
        const diasParto = diasHasta(fechaPartoEstimada);
        if (!datos.fechaPartoReal && fechaPartoEstimada && diasParto !== null && diasParto <= 15) {
            const esCritica = diasParto <= DIAS_PARTO_CRITICO;
            const clave = `${esCritica ? 'reproduccion-parto-critico' : 'reproduccion-parto-estimado'}:${registro._id}`;
            const revision = await debeEnviarAlerta({
                clave,
                tipo: esCritica ? 'Parto crítico' : 'Parto estimado',
                referenciaModelo: 'RegistroReproductivo',
                referenciaId: registro._id,
                fechaObjetivo: fechaPartoEstimada,
                frecuenciaDias: esCritica ? FRECUENCIA_CRITICA_DIAS : FRECUENCIA_PROXIMA_DIAS,
                enviarEnDiaObjetivo: true
            });

            if (revision.enviar) {
                alertas.push({
                    ...revision.datosEstado,
                    categoria: 'Reproducción',
                    estadoAlerta: esCritica ? 'Crítica' : 'Parto próximo',
                    asunto: esCritica ? 'Alertas críticas de reproducción' : 'Alertas de reproducción: parto próximo',
                    detalle: `${animalNombre} tiene parto estimado cercano`,
                    fecha: fechaPartoEstimada,
                    dias: diasParto
                });
            }
        }

        const fechaDestete = datos.fechaDestete;
        const diasDestete = diasHasta(fechaDestete);
        if (fechaDestete && diasDestete !== null && diasDestete <= 15) {
            const esVencida = diasDestete < 0;
            const clave = `${esVencida ? 'reproduccion-destete-vencido' : 'reproduccion-destete-proximo'}:${registro._id}`;
            const revision = await debeEnviarAlerta({
                clave,
                tipo: esVencida ? 'Destete vencido' : 'Destete próximo',
                referenciaModelo: 'RegistroReproductivo',
                referenciaId: registro._id,
                fechaObjetivo: fechaDestete,
                frecuenciaDias: esVencida ? FRECUENCIA_VENCIDA_DIAS : FRECUENCIA_PROXIMA_DIAS,
                enviarEnDiaObjetivo: true
            });

            if (revision.enviar) {
                alertas.push({
                    ...revision.datosEstado,
                    categoria: 'Reproducción',
                    estadoAlerta: esVencida ? 'Vencida' : 'Destete próximo',
                    asunto: esVencida ? 'Alertas de reproducción vencidas' : 'Alertas de reproducción: destete próximo',
                    detalle: `${animalNombre} tiene ${esVencida ? 'destete vencido' : 'destete próximo'}`,
                    fecha: fechaDestete,
                    dias: diasDestete
                });
            }
        }
    }

    return alertas;
};

const obtenerAlertasTareas = async () => {
    const tareas = await Tarea.find({
        estado: { $nin: ['Completada', 'Cancelada'] },
        fechaLimite: { $exists: true, $ne: null }
    }).populate('asignadoA', 'nombre apellido correo rol').lean();
    const alertas = [];

    for (const tarea of tareas) {
        const dias = diasHasta(tarea.fechaLimite);
        if (dias === null || dias >= 0) continue;

        const esCritica = tarea.prioridad === 'Urgente';
        const clave = `${esCritica ? 'tarea-critica' : 'tarea-vencida'}:${tarea._id}`;
        const responsable = tarea.asignadoA
            ? `${tarea.asignadoA.nombre || ''} ${tarea.asignadoA.apellido || ''}`.trim()
            : 'Sin responsable';
        const revision = await debeEnviarAlerta({
            clave,
            tipo: esCritica ? 'Tarea crítica' : 'Tarea vencida',
            referenciaModelo: 'Tarea',
            referenciaId: tarea._id,
            fechaObjetivo: tarea.fechaLimite,
            frecuenciaDias: esCritica ? FRECUENCIA_CRITICA_DIAS : FRECUENCIA_VENCIDA_DIAS
        });

        if (revision.enviar) {
            alertas.push({
                ...revision.datosEstado,
                categoria: 'Tareas',
                estadoAlerta: esCritica ? 'Crítica' : 'Vencida',
                asunto: esCritica ? 'Alertas críticas de tareas' : 'Alertas de tareas vencidas',
                detalle: `${tarea.titulo} (${tarea.prioridad}) - Responsable: ${responsable || 'Sin responsable'}`,
                fecha: tarea.fechaLimite,
                dias
            });
        }
    }

    return alertas;
};

const agruparPorAsunto = (alertas) => alertas.reduce((grupos, alerta) => {
    if (!grupos[alerta.asunto]) {
        grupos[alerta.asunto] = [];
    }
    grupos[alerta.asunto].push(alerta);
    return grupos;
}, {});

const crearHtmlAlertas = (titulo, alertas) => {
    const filas = alertas.map((alerta) => `
        <li>
            <strong>${alerta.detalle}</strong><br>
            Categoría: ${alerta.categoria}<br>
            Estado: ${alerta.estadoAlerta}<br>
            Fecha objetivo: ${formatearFecha(alerta.fecha)}<br>
            ${alerta.dias < 0 ? `Días vencida: ${Math.abs(alerta.dias)}` : `Días restantes: ${alerta.dias}`}
        </li>
    `).join('');

    return `
        <h2>${titulo}</h2>
        <p>Estas alertas requieren seguimiento en Ganadería Romilio.</p>
        <ul>${filas}</ul>
    `;
};

const crearTextoAlertas = (titulo, alertas) => {
    const filas = alertas
        .map((alerta) => {
            const dias = alerta.dias < 0 ? `Dias vencida: ${Math.abs(alerta.dias)}` : `Dias restantes: ${alerta.dias}`;
            return `- ${alerta.detalle}. Categoria: ${alerta.categoria}. Estado: ${alerta.estadoAlerta}. Fecha: ${formatearFecha(alerta.fecha)}. ${dias}.`;
        })
        .join('\n');

    return `${titulo}\n\n${filas}`;
};

const enviarAlertasCorreo = async () => {
    const alertas = [
        ...(await obtenerAlertasSanidad()),
        ...(await obtenerAlertasReproduccion()),
        ...(await obtenerAlertasTareas())
    ];

    if (alertas.length === 0) {
        return { enviadas: 0, grupos: 0 };
    }

    const grupos = agruparPorAsunto(alertas);
    let enviadas = 0;

    for (const [asunto, alertasGrupo] of Object.entries(grupos)) {
        const resultadoEnvio = await enviarCorreoAdministradores({
            subject: `${asunto} - Ganadería Romilio`,
            html: crearHtmlAlertas(asunto, alertasGrupo),
            text: crearTextoAlertas(asunto, alertasGrupo)
        });

        if (!resultadoEnvio.enviado) {
            continue;
        }

        for (const alerta of alertasGrupo) {
            await registrarEnvioAlerta(alerta);
            enviadas += 1;
        }
    }

    return {
        enviadas,
        grupos: Object.keys(grupos).length
    };
};

let intervaloAlertas = null;

const iniciarProgramadorAlertasCorreo = () => {
    if (process.env.EMAIL_ALERTS_ENABLED === 'false') {
        console.log('Alertas por correo desactivadas por EMAIL_ALERTS_ENABLED=false');
        return;
    }

    const intervaloMs = Number(process.env.EMAIL_ALERTS_INTERVAL_MS) || MS_DIA;

    const ejecutar = async () => {
        try {
            const resultado = await enviarAlertasCorreo();
            console.log('Revision de alertas por correo completada:', resultado);
        } catch (error) {
            console.error('Error revisando alertas por correo:', error.message);
        }
    };

    ejecutar();
    intervaloAlertas = setInterval(ejecutar, intervaloMs);
};

module.exports = {
    enviarAlertasCorreo,
    iniciarProgramadorAlertasCorreo,
    obtenerAlertasReproduccion,
    obtenerAlertasSanidad,
    obtenerAlertasTareas
};
