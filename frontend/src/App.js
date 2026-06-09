
import './App.css';
import { useEffect, useState } from 'react';
import IniciarSesion from './Components/IniciarSesion';
import ListaUsuario from './Components/ListaUsuario';
import { obtenerPerfilUsuario } from './services/api';

function App() {
  const [vista, setVista] = useState('login');
  const [sesion, setSesion] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [validandoSesion, setValidandoSesion] = useState(true);

  useEffect(() => {
    const validarSesion = async () => {
      const sesionGuardada = localStorage.getItem('ganaderiaSesion');

      if (!sesionGuardada) {
        setValidandoSesion(false);
        return;
      }

      try {
        if (!navigator.onLine) {
          const sesionLocal = JSON.parse(sesionGuardada);
          setSesion(sesionLocal);
          setVista('dashboard');
          setMensaje('Sin conexion. Usando datos guardados en este dispositivo.');
          setValidandoSesion(false);
          return;
        }

        const data = await obtenerPerfilUsuario();
        const sesionLocal = JSON.parse(sesionGuardada);
        const sesionValidada = {
          ...sesionLocal,
          usuario: data.usuario
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
    localStorage.setItem('ganaderiaSesion', JSON.stringify(data));
    setSesion(data);
    setVista('dashboard');
    setMensaje('');
  };

  const cerrarSesion = () => {
    localStorage.removeItem('ganaderiaSesion');
    setSesion(null);
    setVista('login');
  };

  if (validandoSesion) {
    return (
      <div className="auth-page">
        <div className="estado-importacion">Validando sesion...</div>
      </div>
    );
  }

  if (vista === 'dashboard') {
    return <ListaUsuario usuario={sesion?.usuario} onLogout={cerrarSesion} />;
  }

  return (
    <div className="auth-page">
      {mensaje && <div className="toast">{mensaje}</div>}

      {vista === 'login' ? (
        <IniciarSesion
          onLogin={iniciarSesion}
        />
      ) : (
        <IniciarSesion onLogin={iniciarSesion} />
      )}
    </div>
  );
}

export default App;
