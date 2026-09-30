const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const entrada = process.argv[2]
    || 'C:/Users/julil/Downloads/plantilla-importacion-ganaderia.xlsx';
const salida = process.argv[3]
    || path.join(__dirname, '..', '..', 'pruebas', 'plantilla-importacion-ganaderia-datos-prueba.xlsx');

const datos = {
    POTREROS: [
        ['SIM-P01', 'Potrero simulación norte', 8.5, 24, 'Sector norte', 'Ocupado', 'Datos sintéticos para probar el importador'],
        ['SIM-P02', 'Potrero simulación río', 6.2, 18, 'Sector río', 'Disponible', 'Pastura mejorada'],
        ['SIM-P03', 'Potrero simulación descanso', 5.4, 16, 'Sector este', 'Descanso', 'Descanso posterior a rotación'],
        ['SIM-P04', 'Área porcina simulación', 1.8, 30, 'Cerca de la galera', 'Ocupado', 'Área usada únicamente para esta prueba']
    ],
    INVENTARIO: [
        ['990001000001', 'Bovino', 'Macho', 'Toro', 'Centinela', 'Brahman', '15/03/2021', '', '', 645, 'Reproducción', '', 'Activo', 'Sano', 'SIM-P01', 'Toro reproductor de prueba'],
        ['990001000002', 'Bovino', 'Hembra', 'Vaca', 'Aurora', 'Brahman', '10/05/2020', '', '', 480, 'Cría', '', 'Activo', 'Sano', 'SIM-P01', 'Vaca de cría con genealogía de prueba'],
        ['990001000003', 'Bovino', 'Hembra', 'Vaca', 'Canela', 'Brahman cruzado', '22/08/2021', '', '', 455, 'Cría', '', 'Activo', 'Sano', 'SIM-P01', 'Vaca de cría'],
        ['990001000004', 'Bovino', 'Hembra', 'Vaca', 'Estrella', 'Brahman', '17/01/2019', '', '', 510, 'Cría', '', 'Activo', 'Recuperación', 'SIM-P02', 'Seguimiento posterior a tratamiento'],
        ['990001000005', 'Bovino', 'Hembra', 'Vaca', 'Luna', 'Brahman cruzado', '04/04/2022', '', '', 445, 'Cría', '', 'Activo', 'Sano', 'SIM-P02', 'Vaca de cría'],
        ['990001000006', 'Bovino', 'Hembra', 'Novilla', 'Nube', 'Brahman', '11/02/2025', '', '', 285, 'Cría', '', 'Activo', 'Sano', 'SIM-P03', 'Novilla próxima a edad reproductiva'],
        ['990001000007', 'Bovino', 'Hembra', 'Novilla', 'Mora', 'Brahman cruzado', '26/06/2025', '', '', 245, 'Reemplazo', '', 'Activo', 'En observación', 'SIM-P03', 'Animal de reemplazo'],
        ['990001000008', 'Bovino', 'Macho', 'Novillo', 'Relámpago', 'Brahman', '08/04/2025', '', '', 315, 'Engorde', '', 'Activo', 'Sano', 'SIM-P02', 'Novillo de engorde'],
        ['990001000009', 'Bovino', 'Macho', 'Novillo', 'Colorado', 'Brahman cruzado', '18/12/2024', '', '', 355, 'Engorde', '', 'Activo', 'Sano', 'SIM-P02', 'Novillo de engorde'],
        ['990001000010', 'Bovino', 'Hembra', 'Ternero', 'Lucero', 'Brahman', '10/04/2026', '990001000002', '990001000001', 165, 'Cría', '', 'Activo', 'Sano', 'SIM-P01', 'Cría de Aurora y Centinela'],
        ['990001000011', 'Porcino', 'Hembra', 'Chancha', 'Cachita', 'Duroc x Landrace', '13/06/2024', '', '', 185, 'Reproducción', '', 'Activo', 'Sano', 'SIM-P04', 'Chancha reproductora de prueba'],
        ['990001000012', 'Porcino', 'Hembra', 'Chancha', 'Rosada', 'Landrace', '05/11/2024', '', '', 172, 'Reproducción', '', 'Activo', 'Sano', 'SIM-P04', 'Chancha reproductora de prueba'],
        ['990001000013', 'Porcino', 'Macho', 'Verraco', 'Bruno', 'Pietrain', '08/02/2024', '', '', 225, 'Reproducción', '', 'Activo', 'Sano', 'SIM-P04', 'Verraco reproductor de prueba'],
        ['990001000014', 'Porcino', 'Macho', 'Engorde', 'P-014', 'Duroc x Landrace', '15/03/2026', '', '', 82, 'Engorde', 'Engorde', 'Activo', 'Sano', 'SIM-P04', 'Porcino con serie de pesajes'],
        ['990001000015', 'Porcino', 'Hembra', 'Engorde', 'P-015', 'Landrace', '20/04/2026', '', '', 68, 'Engorde', 'Desarrollo', 'Activo', 'Sano', 'SIM-P04', 'Porcino con cambio de etapa'],
        ['990001000016', 'Porcino', 'Hembra', 'Reemplazo', 'P-016', 'Yorkshire', '25/05/2026', '', '', 48, 'Reemplazo', 'Fase 3', 'Activo', 'Sano', 'SIM-P04', 'Hembra seleccionada como reemplazo']
    ],
    FINANZAS: [
        ['02/07/2026', 'Egreso', 'Compra', 'Alimentación', 'Compra de alimento para bovinos', 412500, 'CRC', 'Concentrado engorde', 25, 'SACO', 16500, 'Agroservicios del Norte', 'Animal', 'Transferencia', 'SIM-FAC-001', '', 'Finca principal', 'Movimiento sintético'],
        ['08/07/2026', 'Egreso', 'Compra', 'Combustible', 'Combustible para tractor', 87600, 'CRC', 'Diésel', 120, 'L', 730, 'Estación de servicio', 'Tractor', 'Tarjeta', 'SIM-FAC-002', '', 'Finca principal', 'Movimiento sintético'],
        ['15/07/2026', 'Egreso', 'Planilla', 'Mano de obra', 'Pago de labores de chapia', 420000, 'CRC', 'Servicio de chapia', 12, 'UNIDAD', 35000, '', 'Chapia', 'Transferencia', 'SIM-PLA-001', 'Carlos Méndez', 'Finca principal', 'Doce jornadas'],
        ['22/07/2026', 'Egreso', 'Compra', 'Sanidad', 'Vitaminas y desparasitante', 135000, 'CRC', 'Insumos veterinarios', 15, 'DOSIS', 9000, 'Veterinaria Central', 'Animal', 'SINPE', 'SIM-FAC-003', '', 'Finca principal', 'Aplicación preventiva'],
        ['05/08/2026', 'Egreso', 'Inversion', 'Potreros', 'Mejora de cerca del potrero norte', 285000, 'CRC', 'Postes y alambre', 1, 'UNIDAD', 285000, 'Ferretería Rural', 'Cerca', 'Transferencia', 'SIM-INV-001', '', 'Finca principal', 'Mejora productiva'],
        ['12/08/2026', 'Egreso', 'Compra', 'Alimentación', 'Alimento para desarrollo porcino', 272000, 'CRC', 'Concentrado porcino', 16, 'SACO', 17000, 'Nutrición Animal CR', 'Galera', 'Crédito', 'SIM-FAC-004', '', 'Finca principal', 'Movimiento sintético'],
        ['24/08/2026', 'Ingreso', 'Venta de animales', 'Ventas', 'Venta simulada de novillos', 1185000, 'CRC', 'Animales vendidos', 3, 'UNIDAD', 395000, 'Subasta de prueba', 'Finca', 'Transferencia', 'SIM-VEN-001', '', 'Finca principal', 'No corresponde a los animales de inventario de esta plantilla'],
        ['03/09/2026', 'Egreso', 'Compra', 'Mantenimiento', 'Mantenimiento preventivo de tractor', 168500, 'CRC', 'Aceite y filtros', 1, 'UNIDAD', 168500, 'Taller Agrícola', 'Mantenimiento', 'Efectivo', 'SIM-FAC-005', '', 'Finca principal', 'Servicio preventivo'],
        ['09/09/2026', 'Egreso', 'Compra', 'Herramientas', 'Compra de herramientas menores', 94500, 'CRC', 'Palas y machetes', 7, 'UNIDAD', 13500, 'Ferretería Rural', 'Finca', 'SINPE', 'SIM-FAC-006', '', 'Finca principal', 'Movimiento sintético'],
        ['16/09/2026', 'Egreso', 'Planilla', 'Mano de obra', 'Pago de mantenimiento de galera', 210000, 'CRC', 'Servicio de mantenimiento', 6, 'UNIDAD', 35000, '', 'Galera', 'Transferencia', 'SIM-PLA-002', 'José Vargas', 'Finca principal', 'Seis jornadas'],
        ['21/09/2026', 'Egreso', 'Compra', 'Porcinos', 'Compra de suplemento porcino', 126000, 'CRC', 'Suplemento mineral', 6, 'SACO', 21000, 'Nutrición Animal CR', 'Animal', 'Crédito', 'SIM-FAC-007', '', 'Finca principal', 'Movimiento sintético'],
        ['26/09/2026', 'Egreso', 'Compra', 'Infraestructura', 'Reparación del sistema de aguas', 185000, 'CRC', 'Tubería y accesorios', 1, 'UNIDAD', 185000, 'Aguas y Riego CR', 'Aguas', 'Transferencia', 'SIM-FAC-008', '', 'Finca principal', 'Reparación general']
    ],
    PESAJES: [
        ['990001000001', '01/07/2026', 626, '', 'Pesaje inicial de prueba'],
        ['990001000001', '01/08/2026', 635, '', 'Control mensual'],
        ['990001000001', '01/09/2026', 645, '', 'Control mensual'],
        ['990001000002', '01/07/2026', 468, '', 'Pesaje inicial de prueba'],
        ['990001000002', '01/08/2026', 474, '', 'Control mensual'],
        ['990001000002', '01/09/2026', 480, '', 'Control mensual'],
        ['990001000003', '01/07/2026', 444, '', 'Pesaje inicial de prueba'],
        ['990001000003', '01/08/2026', 449, '', 'Control mensual'],
        ['990001000003', '01/09/2026', 455, '', 'Control mensual'],
        ['990001000004', '01/07/2026', 502, '', 'Pesaje inicial de prueba'],
        ['990001000004', '01/08/2026', 506, '', 'Control mensual'],
        ['990001000004', '01/09/2026', 510, '', 'Control mensual'],
        ['990001000006', '01/07/2026', 249, '', 'Pesaje inicial de prueba'],
        ['990001000006', '01/08/2026', 267, '', 'Control mensual'],
        ['990001000006', '01/09/2026', 285, '', 'Control mensual'],
        ['990001000007', '01/07/2026', 216, '', 'Pesaje inicial de prueba'],
        ['990001000007', '01/08/2026', 230, '', 'Control mensual'],
        ['990001000007', '01/09/2026', 245, '', 'Control mensual'],
        ['990001000008', '01/07/2026', 261, '', 'Pesaje inicial de engorde'],
        ['990001000008', '01/08/2026', 288, '', 'Control mensual'],
        ['990001000008', '01/09/2026', 315, '', 'Control mensual'],
        ['990001000009', '01/07/2026', 298, '', 'Pesaje inicial de engorde'],
        ['990001000009', '01/08/2026', 326, '', 'Control mensual'],
        ['990001000009', '01/09/2026', 355, '', 'Control mensual'],
        ['990001000010', '01/07/2026', 112, '', 'Pesaje de ternero'],
        ['990001000010', '01/08/2026', 138, '', 'Control mensual'],
        ['990001000010', '01/09/2026', 165, '', 'Control mensual'],
        ['990001000011', '01/07/2026', 179, '', 'Control de condición corporal'],
        ['990001000011', '01/09/2026', 185, '', 'Control de condición corporal'],
        ['990001000012', '01/07/2026', 166, '', 'Control de condición corporal'],
        ['990001000012', '01/09/2026', 172, '', 'Control de condición corporal'],
        ['990001000013', '01/07/2026', 216, '', 'Control de verraco'],
        ['990001000013', '01/09/2026', 225, '', 'Control de verraco'],
        ['990001000014', '20/07/2026', 50, 'Desarrollo', 'Inicio del período evaluado'],
        ['990001000014', '20/08/2026', 68, 'Desarrollo', 'Control mensual'],
        ['990001000014', '20/09/2026', 82, 'Engorde', 'Cambio a engorde'],
        ['990001000015', '20/07/2026', 31, 'Fase 3', 'Inicio del período evaluado'],
        ['990001000015', '20/08/2026', 49, 'Desarrollo', 'Cambio a desarrollo'],
        ['990001000015', '20/09/2026', 68, 'Desarrollo', 'Control mensual'],
        ['990001000016', '20/07/2026', 20, 'Fase 2', 'Inicio del período evaluado'],
        ['990001000016', '20/08/2026', 34, 'Fase 3', 'Cambio a fase 3'],
        ['990001000016', '20/09/2026', 48, 'Fase 3', 'Control mensual']
    ]
};

const libro = XLSX.readFile(entrada, { cellStyles: true, cellDates: true });

Object.entries(datos).forEach(([nombreHoja, filas]) => {
    const hoja = libro.Sheets[nombreHoja];
    if (!hoja) throw new Error(`La plantilla no contiene la hoja ${nombreHoja}.`);
    XLSX.utils.sheet_add_aoa(hoja, filas, { origin: 'A2' });
    const ultimaColumna = XLSX.utils.decode_range(hoja['!ref']).e.c;
    hoja['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(ultimaColumna)}${filas.length + 1}` };
});

const instrucciones = libro.Sheets.INSTRUCCIONES;
XLSX.utils.sheet_add_aoa(instrucciones, [[
    'DATOS_PRUEBA',
    'Datos sintéticos. Los DIIO 990001xxxxxx y códigos SIM-* fueron creados para validar el importador.'
]], { origin: 'A9' });

fs.mkdirSync(path.dirname(salida), { recursive: true });
XLSX.writeFile(libro, salida, { bookType: 'xlsx', cellStyles: true, compression: true });

console.log(JSON.stringify({
    salida,
    registros: Object.fromEntries(Object.entries(datos).map(([hoja, filas]) => [hoja, filas.length]))
}, null, 2));
