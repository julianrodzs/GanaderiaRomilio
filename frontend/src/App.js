
import './App.css';
import { useEffect, useState } from 'react';
import Crearusuario from './Components/Crearusuario';
import IniciarSesion from './Components/IniciarSesion';
import ListaUsuario from './Components/ListaUsuario';

function App() {
  const [vista, setVista] = useState('login');
  const [sesion, setSesion] = useState(null);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    const sesionGuardada = localStorage.getItem('ganaderiaSesion');

    if (sesionGuardada) {
      setSesion(JSON.parse(sesionGuardada));
      setVista('dashboard');
    }
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

  const usuarioCreado = (usuario) => {
    const correo = usuario?.correo ? ` (${usuario.correo})` : '';
    setMensaje(`Usuario creado correctamente${correo}. Ahora puedes iniciar sesion.`);
    setVista('login');
  };

  if (vista === 'dashboard') {
    return <ListaUsuario usuario={sesion?.usuario} onLogout={cerrarSesion} />;
  }

  return (
    <div className="auth-page">
      {mensaje && <div className="toast">{mensaje}</div>}

      {vista === 'login' ? (
        <IniciarSesion
          onLogin={iniciarSesion}
          onCambiarVista={() => {
            setMensaje('');
            setVista('registro');
          }}
        />
      ) : (
        <Crearusuario
          onUsuarioCreado={usuarioCreado}
          onCambiarVista={() => {
            setMensaje('');
            setVista('login');
          }}
        />
      )}
    </div>
  );
}

export default App;
