export const ESTADOS_SUSCRIPCION = { PRUEBA: 'En prueba', ACTIVA: 'Activa', POR_VENCER: 'Próxima a vencer', EN_GRACIA: 'En período de gracia', VENCIDA: 'Vencida', SUSPENDIDA: 'Suspendida', CANCELADA: 'Cancelada' };
export const METODOS_PAGO = { SINPE_MOVIL: 'SINPE Móvil', TRANSFERENCIA_IBAN: 'Transferencia IBAN', EFECTIVO: 'Efectivo', TARJETA_MANUAL: 'Tarjeta manual', STRIPE: 'Stripe', OTRO: 'Otro' };
export const PLANES_SUSCRIPCION = { ESENCIAL: 'Esencial', GESTION: 'Gestión', PRO: 'Pro', PREMIUM: 'Premium' };
export const fechaSuscripcion = (v) => v ? new Date(v).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : 'Por configurar';
export const fechaCampo = (v) => v ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(v)) : '';
export const montoSuscripcion = (monto, moneda = 'CRC') => moneda === 'USD'
  ? `$${Number(monto).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : `₡${Number(monto).toLocaleString('es-CR', { maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, ' ')}`;
export const enlaceRenovacion = ({ telefono, organizacion, actual, destino }) => {
  let numero = String(telefono || '').replace(/[\s()+-]/g, '');
  if (/^\d{8}$/.test(numero)) numero = `506${numero}`;
  if (!/^\d{10,15}$/.test(numero)) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(`Hola, soy de ${organizacion}. Nuestro plan actual es ${PLANES_SUSCRIPCION[actual] || actual}. Quiero ${destino ? `solicitar el cambio al plan ${PLANES_SUSCRIPCION[destino] || destino}` : 'coordinar la renovación por SINPE o transferencia'}.`)}`;
};
export const previsualizarVencimiento = (org, meses, personalizado, ahora = new Date()) => {
  if (personalizado) return new Date(`${personalizado}T23:59:59-06:00`);
  const vigente = org.suscripcion?.fechaProximoVencimiento || org.fechaProximoVencimiento;
  const base = org.plan?.estado !== 'Prueba' && vigente && new Date(vigente) > ahora ? new Date(vigente) : new Date(ahora);
  const zona = org.zonaHoraria || 'America/Costa_Rica';
  const partes = (fecha) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(fecha).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  const p = partes(base), f = new Date(Date.UTC(p.year, p.month - 1 + Number(meses || 1), 1));
  const dia = Math.min(p.day, new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate());
  const civil = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), dia, p.hour, p.minute, p.second, base.getUTCMilliseconds());
  let resultado = new Date(civil);
  for (let i = 0; i < 2; i++) {
    const local = partes(resultado);
    const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, resultado.getUTCMilliseconds()) - +resultado;
    resultado = new Date(civil - offset);
  }
  return resultado;
};
