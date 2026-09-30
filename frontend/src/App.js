
import './App.css';
import { useEffect, useState } from 'react';
import IniciarSesion from './Components/IniciarSesion';
import ListaUsuario from './Components/ListaUsuario';
import OlvideContrasena from './Components/OlvideContrasena';
import RestablecerContrasena from './Components/RestablecerContrasena';
import { obtenerPerfilUsuario } from './services/api';
import { PlanProvider } from './context/PlanContext';
import {
  limpiarCacheApiLegado,
  limpiarDatosOfflineContexto,
  obtenerCambiosPendientes
} from './services/offlineStorage';

const obtenerTokenRestablecimiento = () => {
  const partes = window.location.pathname.split('/').filter(Boolean);
  return partes[0] === 'restablecer-contrasena' ? partes[1] || '' : '';
};

const tokenOfflineVigente = (token) => {
  try {
    const payloadBase = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = payloadBase.padEnd(Math.ceil(payloadBase.length / 4) * 4, '=');
    const datos = JSON.parse(atob(payload));
    return Boolean(datos.exp && Date.now() < datos.exp * 1000);
  } catch (error) {
    return false;
  }
};

function App() {
  const [vista, setVista] = useState(obtenerTokenRestablecimiento() ? 'restablecer-contrasena' : 'login');
  const [tokenRestablecimiento, setTokenRestablecimiento] = useState(obtenerTokenRestablecimiento());
  const [sesion, setSesion] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [validandoSesion, setValidandoSesion] = useState(true);

  useEffect(() => {
    const validarSesion = async () => {
      limpiarCacheApiLegado().catch(() => {});
      const tokenRuta = obtenerTokenRestablecimiento();

      if (tokenRuta) {
        setTokenRestablecimiento(tokenRuta);
        setVista('restablecer-contrasena');
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
          validadaEn: new Date().toISOString()
        };

        localStorage.setItem('ganaderiaSesion', JSON.stringify(sesionValidada));
        setSesion(sesionValidada);
        setVista('dashboard');
      } catch (error) {
        localStorage.removeItem('ganaderiaSesion');
        setSesion(null);
        setVista('login');
        setMensaje('Tu sesion expiro o no es valida. Inicia sesion nuevamente.');
      } finally {
        setValidandoSesion(false);
      }
    };

    const manejarSesionExpirada = () => {
      setSesion(null);
      setVista('login');
      setMensaje('Tu sesion expiro o no es valida. Inicia sesion nuevamente.');
    };

    window.addEventListener('ganaderiaSesionExpirada', manejarSesionExpirada);
    validarSesion();

    return () => window.removeEventListener('ganaderiaSesionExpirada', manejarSesionExpirada);
  }, []);

  const iniciarSesion = (data) => {
    const sesionNueva = { ...data, validadaEn: new Date().toISOString() };
    localStorage.setItem('ganaderiaSesion', JSON.stringify(sesionNueva));
    setSesion(sesionNueva);
    setVista('dashboard');
    setMensaje('');
  };

  const cerrarSesion = async () => {
    const pendientes = await obtenerCambiosPendientes().catch(() => []);
    if (pendientes.length > 0) {
      const confirmar = window.confirm(
        `Hay ${pendientes.length} cambio(s) sin sincronizar. Cerrar sesion los descartara de este dispositivo. ¿Deseas continuar?`
      );
      if (!confirmar) return;
    }
    await limpiarDatosOfflineContexto(sesion).catch(() => {});
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
    return (
      <PlanProvider>
        <ListaUsuario usuario={sesion?.usuario} onLogout={cerrarSesion} />
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
      ) : (
        <IniciarSesion onLogin={iniciarSesion} onOlvideContrasena={() => setVista('olvide-contrasena')} />
      )}
    </div>
  );
}

export default App;
