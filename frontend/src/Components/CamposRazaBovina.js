import React, { useEffect, useMemo, useState } from 'react';
import { obtenerCatalogoRacial } from '../services/api';

const CamposRazaBovina = ({ formulario, setFormulario, especie = 'Bovino' }) => {
  const [catalogo, setCatalogo] = useState({
    razas: [],
    gradosRaciales: [],
    variedadesPorRaza: {},
    composicionesRaciales: [],
    fraccionesRaciales: []
  });
  const [error, setError] = useState('');

  const tipoCruce = useMemo(() => {
    if (formulario.razaSecundaria) return 'Si';
    if (formulario.gradoRacial === 'Cruce conocido') return 'Si';
    if (formulario.gradoRacial === 'Cruce no definido') return 'No se';
    return 'No';
  }, [formulario.gradoRacial, formulario.razaSecundaria]);

  useEffect(() => {
    setError('');
    obtenerCatalogoRacial(especie)
      .then(setCatalogo)
      .catch((err) => setError(err.message));
  }, [especie]);

  const actualizar = (cambios) => setFormulario((actual) => ({ ...actual, ...cambios }));

  const cambiarPrincipal = (evento) => {
    const razaPrincipal = evento.target.value;
    actualizar({
      razaPrincipal,
      raza: formulario.descripcionRacial || razaPrincipal,
      variedadRacial: ''
    });
  };

  const cambiarCruce = (valor) => {
    if (valor === 'No') actualizar({ razaSecundaria: '', gradoRacial: 'Predominante', composicionRacial: '', fraccionRazaPrincipal: '', fraccionRazaSecundaria: '' });
    if (valor === 'Si') actualizar({ razaSecundaria: '', gradoRacial: 'Cruce conocido' });
    if (valor === 'No se') actualizar({ razaSecundaria: '', gradoRacial: 'Cruce no definido', composicionRacial: '', fraccionRazaPrincipal: '', fraccionRazaSecundaria: '' });
  };

  const variedades = catalogo.variedadesPorRaza?.[formulario.razaPrincipal] || [];

  return (
    <section className="form-section raza-bovina-form">
      <div>
        <p className="eyebrow">Raza {especie === 'Porcino' ? 'porcina' : 'bovina'}</p>
        <h3>Clasificación racial</h3>
      </div>

      {error && <p className="form-help">No se pudo cargar el catálogo: {error}</p>}

      <div className="form-grid">
        <label>
          Raza o tipo racial
          <select name="razaPrincipal" value={formulario.razaPrincipal || ''} onChange={cambiarPrincipal}>
            <option value="">Sin definir</option>
            {catalogo.razas.map((raza) => <option key={raza} value={raza}>{raza}</option>)}
          </select>
        </label>

        <fieldset className="selector-cruce">
          <legend>¿Es cruzado?</legend>
          <div>
            {['No', 'Si', 'No se'].map((opcion) => (
              <button
                className={tipoCruce === opcion ? 'activo' : ''}
                key={opcion}
                type="button"
                onClick={() => cambiarCruce(opcion)}
              >
                {opcion === 'Si' ? 'Sí' : opcion === 'No se' ? 'No sé' : opcion}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {tipoCruce === 'Si' && (
        <label>
          Otra raza conocida
          <select
            name="razaSecundaria"
            value={formulario.razaSecundaria || ''}
            onChange={(evento) => actualizar({
              razaSecundaria: evento.target.value,
              fraccionRazaSecundaria: evento.target.value ? formulario.fraccionRazaSecundaria : ''
            })}
            required
          >
            <option value="">Seleccionar raza</option>
            {catalogo.razas.filter((raza) => raza !== formulario.razaPrincipal).map((raza) => (
              <option key={raza} value={raza}>{raza}</option>
            ))}
          </select>
        </label>
      )}

      <label>
        Descripción usada en la finca
        <input
          name="descripcionRacial"
          value={formulario.descripcionRacial || ''}
          onChange={(evento) => actualizar({ descripcionRacial: evento.target.value, raza: evento.target.value })}
          placeholder={especie === 'Porcino' ? 'Ej. Duroc con Landrace' : 'Ej. Brahman cruzado'}
        />
      </label>

      <details className="detalles-raciales-opcionales">
        <summary>Detalles opcionales</summary>
        <div className="form-grid">
          <label>
            Grado racial
            <select name="gradoRacial" value={formulario.gradoRacial || 'Predominante'} onChange={(evento) => actualizar({ gradoRacial: evento.target.value })}>
              {catalogo.gradosRaciales.map((grado) => <option key={grado} value={grado}>{grado}</option>)}
            </select>
          </label>

          <label>
            Variedad
            {variedades.length ? (
              <select name="variedadRacial" value={formulario.variedadRacial || ''} onChange={(evento) => actualizar({ variedadRacial: evento.target.value })}>
                <option value="">Sin definir</option>
                {variedades.map((variedad) => <option key={variedad} value={variedad}>{variedad}</option>)}
              </select>
            ) : (
              <input name="variedadRacial" value={formulario.variedadRacial || ''} onChange={(evento) => actualizar({ variedadRacial: evento.target.value })} />
            )}
          </label>
        </div>

        {tipoCruce === 'Si' && (
          <div className="form-grid">
            <label>
              Fracción de la raza principal
              <input
                name="fraccionRazaPrincipal"
                value={formulario.fraccionRazaPrincipal || ''}
                onChange={(evento) => actualizar({ fraccionRazaPrincipal: evento.target.value })}
                list={`fracciones-raciales-${especie}-principal`}
                placeholder="Ej. 3/8"
                pattern="[0-9]+\s*/\s*[0-9]+"
              />
              <small>Opcional e informativa.</small>
              <datalist id={`fracciones-raciales-${especie}-principal`}>
                {catalogo.fraccionesRaciales.map((fraccion) => <option key={fraccion} value={fraccion} />)}
              </datalist>
            </label>

            <label>
              Fracción de la otra raza
              <input
                name="fraccionRazaSecundaria"
                value={formulario.fraccionRazaSecundaria || ''}
                onChange={(evento) => actualizar({ fraccionRazaSecundaria: evento.target.value })}
                list={`fracciones-raciales-${especie}-secundaria`}
                placeholder="Ej. 5/8"
                pattern="[0-9]+\s*/\s*[0-9]+"
              />
              <small>La app no deduce ni completa la fracción faltante.</small>
              <datalist id={`fracciones-raciales-${especie}-secundaria`}>
                {catalogo.fraccionesRaciales.map((fraccion) => <option key={fraccion} value={fraccion} />)}
              </datalist>
            </label>
          </div>
        )}

        {formulario.composicionRacial && !formulario.fraccionRazaPrincipal && !formulario.fraccionRazaSecundaria && (
          <p className="form-help">Composición histórica registrada: {formulario.composicionRacial}</p>
        )}
      </details>
    </section>
  );
};

export default CamposRazaBovina;
