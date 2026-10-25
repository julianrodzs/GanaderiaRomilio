
import './App.css';
import { lazy, Suspense, useEffect, useState } from 'react';
import IniciarSesion from './Components/IniciarSesion';
import OlvideContrasena from './Components/OlvideContrasena';
import RestablecerContrasena from './Components/RestablecerContrasena';
import AceptarInvitacion from './Components/AceptarInvitacion';
import { aceptarInvitacionExistente, cambiarOrganizacionActiva, obtenerPerfilUsuario } from './services/api';
import { PlanProvider } from './context/PlanContext';
import { AparienciaProvider } from './context/AparienciaContext';
import {
  limpiarCacheApiLegado,
  limpiarDatosOfflineUsuario,
  limpiarTodosDatosOffline,
  obtenerCambiosPendientes,
  obtenerCambiosPendientesUsuario
} from './services/offlineStorage';
import { sincronizarCambiosOffline } from './services/offlineSync';

const ListaUsuario = lazy(() => import('./Components/ListaUsuario'));

const obtenerTokenRestablecimiento = () => {
  const partes = window.location.pathname.split('/').filter(Boolean);
  return partes[0] === 'restablecer-contrasena' ? partes[1] || '' : '';
};
const obtenerTokenInvitacion = () => {
  const partes = window.location.pathname.split('/').filter(Boolean);
  return partes[0] === 'aceptar-invitacion' ? partes[1] || '' : '';
};

const tokenOfflineVigente = (token) => {
  try {
    const payloadBase = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = payloadBase.padEnd(Math.ceil(payloadBase.length / 4) * 4, '=');
    const datos = JSON.parse(atob(payload));
    return Boolean(datos.exp && datos.authTime && Date.now() < datos.exp * 1000);
  } catch (error) {
    return false;
  }
};

const limpiarAlmacenUsuario = async (sesion) => {
  try {
    await limpiarDatosOfflineUsuario(sesion);
  } catch (error) {
    await limpiarTodosDatosOffline();
  }
};

function App() {
  const [vista, setVista] = useState(obtenerTokenRestablecimiento() ? 'restablecer-contrasena' : (obtenerTokenInvitacion() ? 'aceptar-invitacion' : 'login'));
  const [tokenRestablecimiento, setTokenRestablecimiento] = useState(obtenerTokenRestablecimiento());
  const [tokenInvitacion, setTokenInvitacion] = useState(obtenerTokenInvitacion());
  const [sesion, setSesion] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [validandoSesion, setValidandoSesion] = useState(true);

  useEffect(() => {
    const validarSesion = async () => {
      limpiarCacheApiLegado().catch(() => {});
      const tokenRuta = obtenerTokenRestablecimiento();
      const invitacionRuta = obtenerTokenInvitacion();

      if (tokenRuta) {
        setTokenRestablecimiento(tokenRuta);
        setVista('restablecer-contrasena');
        setValidandoSesion(false);
        return;
      }

      if (invitacionRuta) {
        setTokenInvitacion(invitacionRuta);
        const guardada = localStorage.getItem('ganaderiaSesion');
        if (guardada) {
          try { setSesion(JSON.parse(guardada)); } catch (error) { localStorage.removeItem('ganaderiaSesion'); }
        }
        setVista('aceptar-invitacion');
        setValidandoSesion(false);
        return;
      }

      const sesionGuardada = localStorage.getItem('ganaderiaSesion');

      if (!sesionGuardada) {
        setValidandoSesion(false);
        return;
      }

      try {
        const sesionLocal = JSON.parse(sesionGuardada);
        if (!navigator.onLine) {
          if (!tokenOfflineVigente(sesionLocal?.token || '')) {
            await limpiarAlmacenUsuario(sesionLocal).catch(() => {});
            localStorage.removeItem('ganaderiaSesion');
            setMensaje('La sesion offline expiro. Conectate a internet para iniciar sesion nuevamente.');
            setValidandoSesion(false);
            return;
          }
          setSesion(sesionLocal);
          setVista('dashboard');
          setMensaje('Sin conexion. Usando datos guardados en este dispositivo.');
          setValidandoSesion(false);
          return;
        }

        const data = await obtenerPerfilUsuario();
        const sesionValidada = {
          ...sesionLocal,
          usuario: data.usuario,
          organizacion: data.organizacion || sesionLocal.organizacion,
          finca: data.finca || sesionLocal.finca,
          fincaActiva: data.finca || sesionLocal.fincaActiva || sesionLocal.finca,
          fincaId: data.fincaId || data.finca?._id || sesionLocal.fincaId,
          fincas: data.fincas || sesionLocal.fincas || [],
          organizaciones: data.organizaciones || sesionLocal.organizaciones || [],
          validadaEn: new Date().toISOString()
        };

        localStorage.setItem('ganaderiaSesion', JSON.stringify(sesionValidada));
        setSesion(sesionValidada);
        setVista('dashboard');
      } catch (error) {
        try {
          const sesionAnterior = JSON.parse(sesionGuardada);
          await limpiarAlmacenUsuario(sesionAnterior).catch(() => {});
        } catch (errorSesion) {
          // La sesión corrupta no contiene un contexto reutilizable.
        }
        localStorage.removeItem('ganaderiaSesion');
        setSesion(null);
        setVista('login');
        setMensaje('Tu sesion expiro o no es valida. Inicia sesion nuevamente.');
      } finally {
        setValidandoSesion(false);
      }
    };

    const manejarSesionExpirada = async (evento) => {
      await limpiarAlmacenUsuario(evento.detail?.sesion).catch(() => {});
      localStorage.removeItem('ganaderiaSesion');
      setSesion(null);
      setVista('login');
      setMensaje('Tu sesion expiro o no es valida. Inicia sesion nuevamente.');
    };

    window.addEventListener('ganaderiaSesionExpirada', manejarSesionExpirada);
    validarSesion();

    return () => window.removeEventListener('ganaderiaSesionExpirada', manejarSesionExpirada);
  }, []);

  useEffect(() => {
    if (!sesion?.token) return undefined;
    const revisar = () => {
      if (!tokenOfflineVigente(sesion.token)) {
        window.dispatchEvent(new CustomEvent('ganaderiaSesionExpirada', { detail: { sesion } }));
      }
    };
    const intervalo = window.setInterval(revisar, 60000);
    window.addEventListener('focus', revisar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', revisar);
    };
  }, [sesion]);

  useEffect(() => {
    const actualizarFincasSesion = (evento) => {
      const fincas = evento.detail?.fincas;
      if (!Array.isArray(fincas)) return;
      setSesion((actual) => {
        if (!actual) return actual;
        const fincaActivaId = actual.fincaActiva?._id || actual.finca?._id || actual.fincaId;
        const fincaActiva = fincas.find((finca) => finca._id === fincaActivaId) || actual.fincaActiva || actual.finca;
        const principal = fincas.find((finca) => finca.esPrincipal);
        const siguiente = {
          ...actual,
          fincas,
          finca: fincaActiva,
          fincaActiva,
          organizacion: principal
            ? { ...actual.organizacion, fincaPrincipal: principal._id }
            : actual.organizacion
        };
        localStorage.setItem('ganaderiaSesion', JSON.stringify(siguiente));
        return siguiente;
      });
    };
    window.addEventListener('ganaderiaFincasActualizadas', actualizarFincasSesion);
    return () => window.removeEventListener('ganaderiaFincasActualizadas', actualizarFincasSesion);
  }, []);

  const iniciarSesion = async (data) => {
    const sesionNueva = {
      ...data,
      fincaActiva: data.finca,
      fincaId: data.finca?._id || data.fincaId,
      validadaEn: new Date().toISOString()
    };
    localStorage.setItem('ganaderiaSesion', JSON.stringify(sesionNueva));
    const invitacionPendiente = localStorage.getItem('ganaderiaInvitacionPendiente');
    if (invitacionPendiente) {
      try {
        await aceptarInvitacionExistente(invitacionPendiente);
        localStorage.removeItem('ganaderiaInvitacionPendiente');
      } catch (error) {
        setMensaje(error.message);
      }
    }
    setSesion(sesionNueva);
    setVista('dashboard');
    setMensaje('');
  };

  const cambiarFincaActiva = async (fincaId) => {
    const finca = (sesion?.fincas || []).find((item) => item._id === fincaId);
    if (!finca || finca.estado !== 'Activa') return;
    const pendientes = await obtenerCambiosPendientes().catch(() => []);
    if (pendientes.length > 0) {
      const continuar = window.confirm(
        `Hay ${pendientes.length} cambio(s) pendiente(s) en ${sesion?.fincaActiva?.nombre || sesion?.finca?.nombre || 'la finca actual'}. Se conservarán separados. ¿Cambiar de finca?`
      );
      if (!continuar) return;
    }
    const actualizada = { ...sesion, finca, fincaActiva: finca, fincaId: finca._id };
    localStorage.setItem('ganaderiaSesion', JSON.stringify(actualizada));
    setSesion(actualizada);
    window.dispatchEvent(new CustomEvent('ganaderiaFincaCambiada', { detail: { finca } }));
  };

  const cambiarOrganizacion = async (organizacionId) => {
    if (!organizacionId || organizacionId === String(sesion?.organizacion?._id || '')) return;
    const pendientes = await obtenerCambiosPendientes().catch(() => []);
    if (pendientes.length > 0 && !window.confirm(
      `Hay ${pendientes.length} cambio(s) pendiente(s) en la organización actual. Se conservarán separados. ¿Cambiar de organización?`
    )) return;
    try {
      const data = await cambiarOrganizacionActiva(organizacionId);
      const siguiente = {
        ...data,
        fincaActiva: data.finca,
        fincaId: data.finca?._id || data.fincaId,
        validadaEn: new Date().toISOString()
      };
      localStorage.setItem('ganaderiaSesion', JSON.stringify(siguiente));
      setSesion(siguiente);
      window.dispatchEvent(new CustomEvent('ganaderiaOrganizacionCambiada', { detail: { organizacion: data.organizacion } }));
    } catch (error) {
      window.alert(error.message);
    }
  };

  const cerrarSesion = async () => {
    let pendientes = await obtenerCambiosPendientesUsuario(sesion).catch(() => []);
    if (pendientes.length > 0) {
      const sincronizar = window.confirm(
        `Tiene ${pendientes.length} registro(s) sin sincronizar. Aceptar intentará sincronizarlos ahora; Cancelar permite decidir si desea descartarlos.`
      );
      if (sincronizar && navigator.onLine) {
        await sincronizarCambiosOffline().catch(() => {});
        pendientes = await obtenerCambiosPendientesUsuario(sesion).catch(() => pendientes);
      }
      if (pendientes.length > 0 && !window.confirm(
        `Aún hay ${pendientes.length} registro(s) sin sincronizar. ¿Descartarlos y cerrar sesión?`
      )) return;
    }
    try {
      await limpiarAlmacenUsuario(sesion);
    } catch (error) {
      window.alert('No se pudo limpiar el almacenamiento local. Cierra las otras pestañas de la aplicación e intenta nuevamente.');
      return;
    }
    localStorage.removeItem('ganaderiaSesion');
    setSesion(null);
    setVista('login');
  };

  const irLogin = () => {
    window.history.pushState({}, '', '/');
    setTokenRestablecimiento('');
    setVista('login');
    setMensaje('');
  };

  if (validandoSesion) {
    return (
      <div className="auth-page">
        <div className="estado-importacion">Validando sesion...</div>
      </div>
    );
  }

  if (vista === 'dashboard') {
    const claveFinca = `${sesion?.organizacion?._id || 'organizacion'}:${sesion?.fincaActiva?._id || sesion?.finca?._id || sesion?.fincaId || 'principal'}`;
    return (
      <PlanProvider key={claveFinca}>
        <AparienciaProvider key={claveFinca} contextoId={claveFinca}>
          <Suspense fallback={<div className="estado-importacion">Cargando aplicación...</div>}>
            <ListaUsuario
              key={claveFinca}
              usuario={sesion?.usuario}
              sesion={sesion}
              onCambiarFinca={cambiarFincaActiva}
              onCambiarOrganizacion={cambiarOrganizacion}
              onLogout={cerrarSesion}
            />
          </Suspense>
        </AparienciaProvider>
      </PlanProvider>
    );
  }

  return (
    <div className="auth-page">
      {mensaje && <div className="toast">{mensaje}</div>}

      {vista === 'login' ? (
        <IniciarSesion
          onLogin={iniciarSesion}
          onOlvideContrasena={() => setVista('olvide-contrasena')}
        />
      ) : vista === 'olvide-contrasena' ? (
        <OlvideContrasena onVolver={irLogin} />
      ) : vista === 'restablecer-contrasena' ? (
        <RestablecerContrasena token={tokenRestablecimiento} onVolver={irLogin} />
      ) : vista === 'aceptar-invitacion' ? (
        <AceptarInvitacion token={tokenInvitacion} sesion={sesion} onVolver={irLogin} />
      ) : (
        <IniciarSesion onLogin={iniciarSesion} onOlvideContrasena={() => setVista('olvide-contrasena')} />
      )}
    </div>
  );
}

export default App;
