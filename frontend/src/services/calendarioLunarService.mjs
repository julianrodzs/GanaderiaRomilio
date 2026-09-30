import {
  Body,
  Illumination,
  MoonPhase,
  NextMoonQuarter,
  SearchMoonQuarter
} from 'astronomy-engine';

export const ZONA_HORARIA_FALLBACK = 'America/Costa_Rica';

const FASES_DIARIAS = [
  { fase: 'Luna nueva', faseCodigo: 'NUEVA', icono: '🌑', creciente: false },
  { fase: 'Creciente', faseCodigo: 'CRECIENTE', icono: '🌒', creciente: true },
  { fase: 'Cuarto creciente', faseCodigo: 'CUARTO_CRECIENTE', icono: '🌓', creciente: true },
  { fase: 'Gibosa creciente', faseCodigo: 'GIBOSA_CRECIENTE', icono: '🌔', creciente: true },
  { fase: 'Luna llena', faseCodigo: 'LLENA', icono: '🌕', creciente: false },
  { fase: 'Gibosa menguante', faseCodigo: 'GIBOSA_MENGUANTE', icono: '🌖', creciente: false },
  { fase: 'Cuarto menguante', faseCodigo: 'CUARTO_MENGUANTE', icono: '🌗', creciente: false },
  { fase: 'Menguante', faseCodigo: 'MENGUANTE', icono: '🌘', creciente: false }
];

const FASES_PRINCIPALES = [
  { fase: 'Luna nueva', faseCodigo: 'NUEVA', icono: '🌑', creciente: false },
  { fase: 'Cuarto creciente', faseCodigo: 'CUARTO_CRECIENTE', icono: '🌓', creciente: true },
  { fase: 'Luna llena', faseCodigo: 'LLENA', icono: '🌕', creciente: false },
  { fase: 'Cuarto menguante', faseCodigo: 'CUARTO_MENGUANTE', icono: '🌗', creciente: false }
];

const leerSesion = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('ganaderiaSesion') || 'null');
  } catch (error) {
    return null;
  }
};

export const obtenerZonaHorariaActual = () => (
  leerSesion()?.organizacion?.zonaHoraria || ZONA_HORARIA_FALLBACK
);

export const mostrarInformacionLunarActual = () => (
  leerSesion()?.organizacion?.configuracion?.mostrarInformacionLunar !== false
);

const validarZonaHoraria = (zonaHoraria) => {
  try {
    new Intl.DateTimeFormat('es-CR', { timeZone: zonaHoraria }).format(new Date());
    return zonaHoraria;
  } catch (error) {
    return ZONA_HORARIA_FALLBACK;
  }
};

const partesEnZona = (fecha, zonaHoraria) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(fecha);
  return Object.fromEntries(partes.filter((item) => item.type !== 'literal').map((item) => [item.type, Number(item.value)]));
};

const fechaLocalAInstante = ({ year, month, day, hour = 12, minute = 0, second = 0 }, zonaHoraria) => {
  const objetivoUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instante = new Date(objetivoUtc);

  for (let intento = 0; intento < 2; intento += 1) {
    const local = partesEnZona(instante, zonaHoraria);
    const localInterpretadoUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    instante = new Date(instante.getTime() + (objetivoUtc - localInterpretadoUtc));
  }

  return instante;
};

const resolverFechaRepresentativa = (fecha, zonaHoraria) => {
  if (!fecha) return null;
  const coincidencia = typeof fecha === 'string' && fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (coincidencia) {
    return fechaLocalAInstante({
      year: Number(coincidencia[1]),
      month: Number(coincidencia[2]),
      day: Number(coincidencia[3])
    }, zonaHoraria);
  }

  const instante = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(instante.getTime())) return null;
  const partes = partesEnZona(instante, zonaHoraria);
  return fechaLocalAInstante(partes, zonaHoraria);
};

export const formatearFechaISOEnZona = (fecha, zonaHoraria = obtenerZonaHorariaActual()) => {
  const zona = validarZonaHoraria(zonaHoraria);
  const instante = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(instante.getTime())) return '';
  const partes = partesEnZona(instante, zona);
  return `${partes.year}-${String(partes.month).padStart(2, '0')}-${String(partes.day).padStart(2, '0')}`;
};

export const obtenerInfoLunar = (fecha, zonaHoraria = obtenerZonaHorariaActual()) => {
  const zona = validarZonaHoraria(zonaHoraria);
  const instante = resolverFechaRepresentativa(fecha, zona);
  if (!instante) return null;
  const angulo = MoonPhase(instante);
  const indice = Math.floor((angulo + 22.5) / 45) % 8;
  const fase = FASES_DIARIAS[indice];
  const iluminacion = Illumination(Body.Moon, instante).phase_fraction * 100;

  return {
    fecha: instante,
    ...fase,
    iluminacionPorcentaje: Number(iluminacion.toFixed(1)),
    anguloFase: Number(angulo.toFixed(3)),
    zonaHoraria: zona
  };
};

export const obtenerFaseLunar = (fecha, zonaHoraria) => obtenerInfoLunar(fecha, zonaHoraria)?.fase || null;

export const obtenerProximasFases = (fechaBase = new Date(), zonaHoraria = obtenerZonaHorariaActual()) => {
  const zona = validarZonaHoraria(zonaHoraria);
  const inicio = resolverFechaRepresentativa(fechaBase, zona) || new Date();
  const fases = [];
  let cuarto = SearchMoonQuarter(inicio);

  for (let indice = 0; indice < 4; indice += 1) {
    const fase = FASES_PRINCIPALES[cuarto.quarter];
    fases.push({
      fecha: cuarto.time.date,
      fechaLocal: formatearFechaISOEnZona(cuarto.time.date, zona),
      ...fase,
      zonaHoraria: zona
    });
    cuarto = NextMoonQuarter(cuarto);
  }

  return fases;
};

const obtenerProximaFase = (codigo, fechaBase, zonaHoraria) => {
  let fecha = fechaBase || new Date();
  for (let intento = 0; intento < 3; intento += 1) {
    const fases = obtenerProximasFases(fecha, zonaHoraria);
    const encontrada = fases.find((fase) => fase.faseCodigo === codigo);
    if (encontrada) return encontrada;
    fecha = new Date(fases[fases.length - 1].fecha.getTime() + 1000);
  }
  return null;
};

export const obtenerProximaLunaNueva = (fechaBase, zonaHoraria) => obtenerProximaFase('NUEVA', fechaBase, zonaHoraria);
export const obtenerProximoCuartoCreciente = (fechaBase, zonaHoraria) => obtenerProximaFase('CUARTO_CRECIENTE', fechaBase, zonaHoraria);
export const obtenerProximaLunaLlena = (fechaBase, zonaHoraria) => obtenerProximaFase('LLENA', fechaBase, zonaHoraria);
export const obtenerProximoCuartoMenguante = (fechaBase, zonaHoraria) => obtenerProximaFase('CUARTO_MENGUANTE', fechaBase, zonaHoraria);
