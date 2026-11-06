const memoriaMb = () => {
    const uso = process.memoryUsage();
    return Object.fromEntries(['rss', 'heapUsed', 'heapTotal'].map((campo) => [campo, Math.round(uso[campo] / 10485.76) / 100]));
};
const medirCron = () => {
    const inicioMs = Date.now(), inicio = memoriaMb(), pico = { ...inicio };
    const muestrear = () => {
        const actual = memoriaMb();
        Object.keys(pico).forEach((campo) => { pico[campo] = Math.max(pico[campo], actual[campo]); });
        return actual;
    };
    return { muestrear, terminar: () => ({ duracionMs: Date.now() - inicioMs, memoriaMb: { inicio, pico, fin: muestrear() } }) };
};
module.exports = { medirCron };
