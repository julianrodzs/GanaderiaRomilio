import React, { useEffect, useState } from 'react';
import UpgradeMessage from '../Components/UpgradeMessage';
import { usePlan } from '../context/PlanContext';
import { actualizarConfiguracionEmails, obtenerConfiguracionEmails } from '../services/api';

const opcionesModulos = [
  ['resumenGanadero', 'Resumen ganadero'],
  ['finanzas', 'Finanzas'],
  ['tareasPendientes', 'Tareas pendientes']
];

const ConfiguracionCuenta = ({ usuario }) => {
  const { tieneFeature } = usePlan();
  const disponible = tieneFeature('configuracionEmailAvanzada');
  const [formulario, setFormulario] = useState({
    frecuencia: 'Desactivado', horaPreferida: '06:00', diaSemana: 1,
    modulos: { resumenGanadero: true, finanzas: true, tareasPendientes: true }
  });
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!disponible) return;
    obtenerConfiguracionEmails().then((datos) => setFormulario((actual) => ({ ...actual, ...datos })))
      .catch((error) => setMensaje(error.message));
  }, [disponible]);

  const guardar = async (evento) => {
    evento.preventDefault(); setGuardando(true); setMensaje('');
    try {
      const respuesta = await actualizarConfiguracionEmails(formulario);
      setFormulario(respuesta.configuracion);
      setMensaje('Preferencias de correo actualizadas.');
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="vista-tabla configuracion-cuenta">
      <p className="eyebrow">Cuenta</p>
      <h1>Configuración</h1>
      <p className="configuracion-identidad">{usuario?.nombre} {usuario?.apellido || ''} · {usuario?.rol}</p>
      <section className="configuracion-email">
        <h2>Notificaciones y resumen</h2>
        {!disponible ? (
          <UpgradeMessage feature="configuracionEmailAvanzada" titulo="Resumen personalizado por correo" pregunta="¿Qué ocurrió en la finca sin abrir la aplicación?" etiqueta="Disponible en Premium" />
        ) : (
          <form onSubmit={guardar} className="configuracion-email-form">
            <label>Frecuencia<select value={formulario.frecuencia} onChange={(e) => setFormulario((actual) => ({ ...actual, frecuencia: e.target.value }))}><option>Desactivado</option><option>Diario</option><option>Semanal</option></select></label>
            <label>Hora preferida<input type="time" value={formulario.horaPreferida} onChange={(e) => setFormulario((actual) => ({ ...actual, horaPreferida: e.target.value }))} /></label>
            {formulario.frecuencia === 'Semanal' && <label>Día de envío<select value={formulario.diaSemana} onChange={(e) => setFormulario((actual) => ({ ...actual, diaSemana: Number(e.target.value) }))}><option value="1">Lunes</option><option value="2">Martes</option><option value="3">Miércoles</option><option value="4">Jueves</option><option value="5">Viernes</option><option value="6">Sábado</option><option value="0">Domingo</option></select></label>}
            <fieldset><legend>Contenido</legend>{opcionesModulos.map(([clave, etiqueta]) => <label key={clave} className="checkbox-line"><input type="checkbox" checked={Boolean(formulario.modulos?.[clave])} onChange={(e) => setFormulario((actual) => ({ ...actual, modulos: { ...actual.modulos, [clave]: e.target.checked } }))} />{etiqueta}</label>)}</fieldset>
            {mensaje && <p className="form-message">{mensaje}</p>}
            <button className="boton-primario" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar preferencias'}</button>
          </form>
        )}
      </section>
    </section>
  );
};

export default ConfiguracionCuenta;
