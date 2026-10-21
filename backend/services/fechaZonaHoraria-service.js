const obtenerPartes = (fecha, zonaHoraria = 'America/Costa_Rica') => Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
        timeZone: zonaHoraria,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(fecha)
        .filter((parte) => parte.type !== 'literal')
        .map((parte) => [parte.type, Number(parte.value)])
);

const offsetZonaMs = (fecha, zonaHoraria) => {
    const p = obtenerPartes(fecha, zonaHoraria);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - fecha.getTime();
};

const fechaCivilEnZonaAUTC = ({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, zonaHoraria) => {
    const civilUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    let resultado = new Date(civilUtc - offsetZonaMs(new Date(civilUtc), zonaHoraria));
    resultado = new Date(civilUtc - offsetZonaMs(resultado, zonaHoraria));
    return resultado;
};

const limitesDiaEnZona = (fecha = new Date(), zonaHoraria = 'America/Costa_Rica') => {
    const partes = obtenerPartes(fecha, zonaHoraria);
    const inicio = fechaCivilEnZonaAUTC({ year: partes.year, month: partes.month, day: partes.day }, zonaHoraria);
    const siguienteCivil = new Date(Date.UTC(partes.year, partes.month - 1, partes.day + 1));
    const siguiente = fechaCivilEnZonaAUTC({
        year: siguienteCivil.getUTCFullYear(),
        month: siguienteCivil.getUTCMonth() + 1,
        day: siguienteCivil.getUTCDate()
    }, zonaHoraria);
    return { inicio, finExclusivo: siguiente };
};

const claveDiaEnZona = (fecha = new Date(), zonaHoraria = 'America/Costa_Rica') => {
    const p = obtenerPartes(fecha, zonaHoraria);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

module.exports = { claveDiaEnZona, fechaCivilEnZonaAUTC, limitesDiaEnZona, obtenerPartes };
