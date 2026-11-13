// Una sola solicitud en curso; los eventos de regreso comparten el mismo plazo.
export const iniciarPollingVisible = (ejecutar, {
  intervaloMs = 120_000,
  eventos = [],
  alError = () => {},
  ventana = window,
  documento = document,
  conexion = navigator,
  ahora = Date.now
} = {}) => {
  let detenido = false;
  let enCurso = false;
  let ultimaEjecucion = -Infinity;
  let temporizador;

  const disponible = () => !detenido && documento.visibilityState !== 'hidden' && conexion.onLine !== false;
  const programar = () => {
    ventana.clearTimeout(temporizador);
    if (disponible()) temporizador = ventana.setTimeout(() => revisar(), intervaloMs);
  };
  const revisar = async (forzar = false) => {
    if (!disponible() || enCurso) return;
    if (!forzar && ahora() - ultimaEjecucion < intervaloMs) return;
    enCurso = true;
    ultimaEjecucion = ahora();
    try { await ejecutar(); } catch (error) { alError(error); }
    finally { enCurso = false; programar(); }
  };
  const alRegresar = () => { programar(); void revisar(); };
  const alRecuperarConexion = () => { programar(); void revisar(true); };
  const alOcultar = () => {
    ventana.clearTimeout(temporizador);
    if (disponible()) alRegresar();
  };
  const alCambio = () => { void revisar(true); };
  ventana.addEventListener('focus', alRegresar);
  ventana.addEventListener('online', alRecuperarConexion);
  ventana.addEventListener('offline', alOcultar);
  documento.addEventListener('visibilitychange', alOcultar);
  eventos.forEach((evento) => ventana.addEventListener(evento, alCambio));
  void revisar();
  return () => {
    detenido = true;
    ventana.clearTimeout(temporizador);
    ventana.removeEventListener('focus', alRegresar);
    ventana.removeEventListener('online', alRecuperarConexion);
    ventana.removeEventListener('offline', alOcultar);
    documento.removeEventListener('visibilitychange', alOcultar);
    eventos.forEach((evento) => ventana.removeEventListener(evento, alCambio));
  };
};
