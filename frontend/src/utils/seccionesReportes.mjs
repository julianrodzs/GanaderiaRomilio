export const SECCIONES_REPORTES = [
  { id: 'inventario', nombre: 'Inventario y Movimiento de Hato', corto: 'Inventario', resumen: 'Existencias, distribución del hato y conteos.' },
  { id: 'reproduccion', nombre: 'Reproducción, Gestación y Genética', corto: 'Reproducción', resumen: 'Partos, gestación, métodos reproductivos, razas y descendencia.' },
  { id: 'produccion', nombre: 'Producción, Pesajes, Engorde y Potreros', corto: 'Producción', resumen: 'Crecimiento, destete, lotes y rendimiento de potreros.' },
  { id: 'sanidad', nombre: 'Sanidad y Períodos de Retiro', corto: 'Sanidad', resumen: 'Aplicaciones reales, tratamientos y seguimiento sanitario.' },
  { id: 'comercializacion', nombre: 'Comercialización: Compras y Ventas', corto: 'Comercialización', resumen: 'Compras de animales e insumos, ventas y proveedores.' },
  { id: 'finanzas', nombre: 'Finanzas, Caja y Rentabilidad', corto: 'Finanzas', resumen: 'Ingresos, egresos, costos y consolidación por moneda.' }
];
const ids = new Set(SECCIONES_REPORTES.map((s) => s.id));
export const preferenciasIniciales = () => ({ seleccion: 'todas', abiertas: ['inventario'] });
export const leerPreferenciasReportes = (storage, clave) => {
  try {
    const datos = JSON.parse(storage.getItem(clave));
    if (datos?.version !== 1 || !Array.isArray(datos.abiertas)) return preferenciasIniciales();
    return { seleccion: ids.has(datos.seleccion) ? datos.seleccion : 'todas', abiertas: [...new Set(datos.abiertas.filter((id) => ids.has(id)))] };
  } catch { return preferenciasIniciales(); }
};
export const clavePreferenciasReportes = () => {
  try {
    const s = JSON.parse(window.localStorage.getItem('ganaderiaSesion') || 'null');
    const org = s?.organizacion?._id || s?.usuario?.organizacionId || 'sin-organizacion';
    const finca = s?.fincaActiva?._id || s?.finca?._id || s?.fincaId || s?.organizacion?.fincaPrincipal?._id || s?.organizacion?.fincaPrincipal || 'principal';
    return `cir:reportes:secciones:${org}:${finca}:${s?.usuario?._id || s?.usuario?.id || 'sin-usuario'}`;
  } catch { return 'cir:reportes:secciones:sin-sesion'; }
};
export const contarReportes = (bloques) => bloques.reduce((t, b) => ({ disponibles: t.disponibles + (b.disponibles ?? 1), total: t.total + (b.cantidad ?? 1) }), { disponibles: 0, total: 0 });
