import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const fuente = fs.readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/import\.meta\.env/g, '__env')
  .replace(/export \{[^}]+\};/g, '')
  .replace(/export const /g, 'const ');
const nombres = [
  'loginUsuario', 'solicitarRecuperacionPassword', 'restablecerPassword', 'aceptarInvitacionNueva',
  'obtenerPerfilUsuario', 'obtenerAnimales', 'actualizarPerfilUsuario', 'completarTarea', 'obtenerOrganizacionesSaas'
];
const sesion = (extra = {}) => ({
  token: 'token-fixture', usuario: { _id: 'usuario-1' }, organizacion: { _id: 'org-1' }, fincaId: 'finca-1', ...extra
});

const preparar = ({ inicial = null, responder = () => ({ status: 200, data: { ok: true } }) } = {}) => {
  const almacen = new Map();
  const peticiones = [];
  const eventos = [];
  let consultasOffline = 0;
  const localStorage = {
    getItem: clave => almacen.get(clave) || null,
    setItem: (clave, valor) => almacen.set(clave, String(valor)),
    removeItem: clave => almacen.delete(clave)
  };
  const guardarSesion = valor => {
    if (valor === null) localStorage.removeItem('ganaderiaSesion');
    else localStorage.setItem('ganaderiaSesion', typeof valor === 'string' ? valor : JSON.stringify(valor));
  };
  guardarSesion(inicial);
  class Evento {
    constructor(tipo, opciones = {}) { this.type = tipo; this.detail = opciones.detail; }
  }
  const api = vm.runInNewContext(fuente + `\n({${nombres.join(',')}})`, {
    __env: { VITE_API_URL: 'https://api.example.test/api', DEV: false },
    FormData, URLSearchParams, Event: Evento, CustomEvent: Evento,
    localStorage, window: { dispatchEvent: evento => eventos.push(evento) },
    obtenerContextoOffline: () => {
      consultasOffline += 1;
      const actual = JSON.parse(localStorage.getItem('ganaderiaSesion') || 'null');
      if (!actual?.organizacion?._id || !actual?.usuario?._id) {
        throw new Error('No existe un contexto seguro para utilizar datos offline.');
      }
      return { clave: `${actual.organizacion._id}:${actual.fincaId}:${actual.usuario._id}` };
    },
    fetch: async (url, opciones) => {
      peticiones.push({ url, opciones });
      const { status, data, antesJson } = await responder({ url, opciones, guardarSesion });
      return { status, ok: status >= 200 && status < 300, json: async () => {
        await antesJson?.();
        return data;
      } };
    }
  });
  return { api, localStorage, peticiones, eventos, guardarSesion, consultasOffline: () => consultasOffline };
};

test('login con almacenamiento vacio llega al backend sin exigir contexto offline', async () => {
  const escenario = preparar();
  await escenario.api.loginUsuario({ correo: 'prueba@example.test', contrasena: 'fixture' });
  assert.equal(escenario.peticiones.length, 1);
  const { url, opciones } = escenario.peticiones[0];
  assert.equal(url, 'https://api.example.test/api/usuarios/login');
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers.Authorization, undefined);
  assert.equal(opciones.headers['X-Finca-Id'], undefined);
  assert.equal(opciones.autenticada, undefined);
  assert.equal(escenario.consultasOffline(), 0);
  assert.equal(escenario.eventos.length, 0);
});

test('login funciona con sesion local corrupta o anterior al cambio de JWT_SECRET', async () => {
  for (const inicial of ['JSON roto', { token: 'token-anterior-sin-contexto' }, sesion({ token: 'token-anterior' })]) {
    const escenario = preparar({ inicial });
    await escenario.api.loginUsuario({ correo: 'prueba@example.test', contrasena: 'fixture' });
    assert.equal(escenario.peticiones.length, 1);
    assert.equal(escenario.peticiones[0].opciones.headers.Authorization, undefined);
    assert.equal(escenario.consultasOffline(), 0);
  }
});

test('recuperacion, restablecimiento e invitacion nueva son peticiones publicas', async () => {
  const escenario = preparar();
  await escenario.api.solicitarRecuperacionPassword('prueba@example.test');
  await escenario.api.restablecerPassword({ token: 'fixture', password: 'fixture' });
  await escenario.api.aceptarInvitacionNueva('fixture', 'fixture');
  assert.equal(escenario.peticiones.length, 3);
  assert.equal(escenario.consultasOffline(), 0);
  assert.ok(escenario.peticiones.every(peticion => !peticion.opciones.headers.Authorization));
  assert.equal(escenario.eventos.length, 0);
});

test('un login rechazado muestra el error HTTP sin emitir expiracion de otra sesion', async () => {
  const escenario = preparar({ inicial: sesion(), responder: () => ({ status: 401, data: { mensaje: 'Credenciales incorrectas' } }) });
  await assert.rejects(() => escenario.api.loginUsuario({ correo: 'prueba@example.test', contrasena: 'fixture' }),
    error => error.status === 401 && error.message === 'Credenciales incorrectas');
  assert.ok(escenario.localStorage.getItem('ganaderiaSesion'));
  assert.equal(escenario.eventos.length, 0);
});

test('la verificacion online de perfil no exige datos offline de una sesion antigua', async () => {
  const escenario = preparar({ inicial: { token: 'token-anterior' }, responder: () => ({ status: 401, data: { mensaje: 'No autorizado' } }) });
  await assert.rejects(() => escenario.api.obtenerPerfilUsuario(), error => error.status === 401 && error.message === 'No autorizado');
  assert.equal(escenario.peticiones[0].opciones.headers.Authorization, 'Bearer token-anterior');
  assert.equal(escenario.localStorage.getItem('ganaderiaSesion'), null);
  assert.equal(escenario.eventos[0].type, 'ganaderiaSesionExpirada');
  assert.equal(escenario.consultasOffline(), 0);
});

test('las peticiones privadas conservan el token y la finca de origen', async () => {
  const escenario = preparar({ inicial: sesion() });
  await escenario.api.obtenerAnimales();
  const headers = escenario.peticiones[0].opciones.headers;
  assert.equal(headers.Authorization, 'Bearer token-fixture');
  assert.equal(headers['X-Finca-Id'], 'finca-1');
  assert.equal(escenario.consultasOffline(), 0);
});

test('una lectura tardia se descarta al cambiar finca, organizacion, usuario o token', async () => {
  for (const siguiente of [
    sesion({ fincaId: 'finca-2' }), sesion({ organizacion: { _id: 'org-2' } }),
    sesion({ usuario: { _id: 'usuario-2' } }), sesion({ token: 'token-nuevo' }), null
  ]) {
    const escenario = preparar({ inicial: sesion(), responder: ({ guardarSesion }) => {
      guardarSesion(siguiente);
      return { status: 200, data: [{ _id: 'dato-contexto-anterior' }] };
    } });
    await assert.rejects(() => escenario.api.obtenerAnimales(), error => error.code === 'REQUEST_CONTEXT_CHANGED');
    assert.equal(escenario.eventos.length, 0);
  }
});

test('un 401 privado limpia su sesion y conserva el error de autenticacion', async () => {
  const escenario = preparar({ inicial: sesion(), responder: () => ({ status: 401, data: { mensaje: 'Sesion revocada', code: 'SESSION_REVOKED' } }) });
  await assert.rejects(() => escenario.api.obtenerAnimales(), error => error.status === 401 && error.data.code === 'SESSION_REVOKED');
  assert.equal(escenario.localStorage.getItem('ganaderiaSesion'), null);
  assert.equal(escenario.eventos.length, 1);
  assert.equal(escenario.eventos[0].detail.sesion.token, 'token-fixture');
});

test('el cambio de finca durante la descarga del JSON tambien descarta la respuesta', async () => {
  const escenario = preparar({ inicial: sesion(), responder: ({ guardarSesion }) => ({
    status: 200, data: [{ _id: 'dato-contexto-anterior' }],
    antesJson: () => guardarSesion(sesion({ fincaId: 'finca-2' }))
  }) });
  await assert.rejects(() => escenario.api.obtenerAnimales(), error => error.code === 'REQUEST_CONTEXT_CHANGED');
});

test('un 401 tardio de una escritura anterior no borra la sesion nueva', async () => {
  const escenario = preparar({ inicial: sesion(), responder: ({ guardarSesion }) => {
    guardarSesion(sesion({ token: 'token-nuevo' }));
    return { status: 401, data: { mensaje: 'Sesion anterior revocada' } };
  } });
  await assert.rejects(() => escenario.api.actualizarPerfilUsuario({ nombre: 'Prueba' }), error => error.status === 401);
  assert.equal(JSON.parse(escenario.localStorage.getItem('ganaderiaSesion')).token, 'token-nuevo');
  assert.equal(escenario.eventos.length, 0);
});

test('las operaciones offline siguen exigiendo su contexto de origen antes de enviar', async () => {
  const escenario = preparar({ inicial: sesion() });
  await assert.rejects(() => escenario.api.completarTarea({ id: 'tarea', contextoEsperado: { clave: 'org-2:finca-2:usuario-2' } }), /contexto de origen/);
  assert.equal(escenario.peticiones.length, 0);
  await escenario.api.completarTarea({ id: 'tarea', contextoEsperado: { clave: 'org-1:finca-1:usuario-1' } });
  assert.equal(escenario.peticiones.length, 1);
  assert.equal(escenario.consultasOffline(), 2);
});

test('administracion de plataforma admite token sin contexto offline de finca', async () => {
  const escenario = preparar({ inicial: { token: 'token-plataforma', usuario: { _id: 'superadmin' } } });
  await escenario.api.obtenerOrganizacionesSaas();
  assert.equal(escenario.peticiones[0].opciones.headers.Authorization, 'Bearer token-plataforma');
  assert.equal(escenario.peticiones[0].opciones.headers['X-Finca-Id'], undefined);
  assert.equal(escenario.consultasOffline(), 0);
});
