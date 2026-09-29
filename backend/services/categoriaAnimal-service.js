const calcularEdadMeses = (fechaNacimiento, fechaReferencia = new Date()) => {
    if (!fechaNacimiento) return null;
    const nacimiento = new Date(fechaNacimiento);
    const referencia = new Date(fechaReferencia);
    if (Number.isNaN(nacimiento.getTime()) || Number.isNaN(referencia.getTime()) || nacimiento > referencia) return null;

    let meses = (referencia.getUTCFullYear() - nacimiento.getUTCFullYear()) * 12;
    meses += referencia.getUTCMonth() - nacimiento.getUTCMonth();
    if (referencia.getUTCDate() < nacimiento.getUTCDate()) meses -= 1;
    return Math.max(meses, 0);
};

const obtenerCategoriaBovinaPorEdad = ({ sexo, fechaNacimiento }, fechaReferencia = new Date()) => {
    const edadMeses = calcularEdadMeses(fechaNacimiento, fechaReferencia);
    if (edadMeses === null || !['Hembra', 'Macho'].includes(sexo)) return null;
    if (edadMeses < 12) return 'Ternero';
    if (sexo === 'Hembra') return edadMeses >= 24 ? 'Vaca' : 'Novilla';
    return edadMeses >= 24 ? 'Toro' : 'Novillo';
};

module.exports = {
    calcularEdadMeses,
    obtenerCategoriaBovinaPorEdad
};
