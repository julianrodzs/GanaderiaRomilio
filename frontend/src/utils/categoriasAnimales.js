export const calcularEdadMeses = (fechaNacimiento, fechaReferencia = new Date()) => {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  const referencia = new Date(fechaReferencia);
  if (Number.isNaN(nacimiento.getTime()) || Number.isNaN(referencia.getTime()) || nacimiento > referencia) return null;
  let meses = (referencia.getUTCFullYear() - nacimiento.getUTCFullYear()) * 12;
  meses += referencia.getUTCMonth() - nacimiento.getUTCMonth();
  if (referencia.getUTCDate() < nacimiento.getUTCDate()) meses -= 1;
  return Math.max(meses, 0);
};

export const EDADES_REPRODUCTIVAS_MESES = Object.freeze({
  Bovino: Object.freeze({ Hembra: 24, Macho: 12 }),
  Porcino: Object.freeze({ Hembra: 7, Macho: 8 })
});

export const obtenerAptitudReproductivaPorEdad = (animal, fechaReferencia = new Date()) => {
  const edadMeses = calcularEdadMeses(animal?.fechaNacimiento, fechaReferencia);
  const edadMinima = EDADES_REPRODUCTIVAS_MESES[animal?.especie]?.[animal?.sexo];
  if (edadMeses === null || edadMinima === undefined) {
    return { calculable: false, listo: false, etiqueta: 'Sin fecha', edadMinimaMeses: edadMinima ?? null };
  }

  const listo = edadMeses >= edadMinima;
  const femenino = animal.sexo === 'Hembra';
  return {
    calculable: true,
    listo,
    etiqueta: listo ? (femenino ? 'Lista' : 'Listo') : (femenino ? 'No lista' : 'No listo'),
    edadMinimaMeses: edadMinima
  };
};

export const obtenerCategoriaAnimal = ({ especie = 'Bovino', sexo, fechaNacimiento }, fechaReferencia = new Date()) => {
  const meses = calcularEdadMeses(fechaNacimiento, fechaReferencia);
  if (meses === null || !['Macho', 'Hembra'].includes(sexo)) return '';
  if (especie === 'Porcino') {
    if (meses < 3) return sexo === 'Hembra' ? 'Lechona' : 'Lechón';
    if (meses < 7) return sexo === 'Hembra' ? 'Cerda joven' : 'Cerdo joven';
    return sexo === 'Hembra' ? 'Chancha' : 'Cerdo adulto';
  }
  if (meses < 12) return sexo === 'Hembra' ? 'Ternera' : 'Ternero';
  if (meses < 24) return sexo === 'Hembra' ? 'Novilla' : 'Novillo';
  return sexo === 'Hembra' ? 'Vaca' : 'Toro';
};

export const obtenerCategoriaVisible = (animal) => obtenerCategoriaAnimal(animal) || animal?.categoria || '—';
