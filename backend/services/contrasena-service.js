const fs = require('fs');
const path = require('path');

const normalizar = (valor = '') => String(valor).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const rutaCatalogo = path.join(__dirname, '..', 'config', 'contrasenas-comunes-10000.txt');
const entradasCatalogo = fs.readFileSync(rutaCatalogo, 'utf8').split(/\r?\n/);
if (entradasCatalogo.at(-1) === '') entradasCatalogo.pop();
const CONTRASENAS_COMUNES = new Set(entradasCatalogo.map(normalizar).filter(Boolean));

const esPatronComun = (valor) => {
    const clave = normalizar(valor);
    return CONTRASENAS_COMUNES.has(clave)
        || /^(.)\1{9,}$/.test(clave)
        || /^(0123456789|1234567890|0987654321|9876543210)/.test(clave)
        || /^(qwerty|asdfgh|zxcvbn)/.test(clave);
};

const validarContrasena = (contrasena) => {
    if (typeof contrasena !== 'string' || contrasena.length < 10) {
        const error = new Error('La contraseña debe tener al menos 10 caracteres.');
        error.status = 400;
        error.code = 'PASSWORD_TOO_SHORT';
        throw error;
    }
    if (esPatronComun(contrasena)) {
        const error = new Error('La contraseña es demasiado común. Elige una frase más difícil de adivinar.');
        error.status = 400;
        error.code = 'PASSWORD_TOO_COMMON';
        throw error;
    }
    return true;
};

module.exports = {
    validarContrasena,
    cantidadContrasenasComunes: entradasCatalogo.length
};
