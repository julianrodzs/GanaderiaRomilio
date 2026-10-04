const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const generarDeteccionesSimuladas = (cantidad) => {
    return Array.from({ length: cantidad }, (_, indice) => {
        const confianza = Number((0.72 + Math.random() * 0.24).toFixed(2));

        return {
            x: 40 + (indice % 6) * 95,
            y: 50 + Math.floor(indice / 6) * 80,
            width: 58,
            height: 42,
            confianza
        };
    });
};

const calcularConfianzaPromedio = (detecciones) => {
    if (!detecciones.length) {
        return 0;
    }

    const total = detecciones.reduce((suma, deteccion) => suma + deteccion.confianza, 0);
    return Number((total / detecciones.length).toFixed(2));
};

const solicitarBuffer = (url) => new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const cliente = endpoint.protocol === 'https:' ? https : http;
    const req = cliente.get(endpoint, {
        headers: { 'X-Internal-Token': process.env.IA_INTERNAL_TOKEN || '' }
    }, (res) => {
        const partes = [];
        res.on('data', (chunk) => partes.push(chunk));
        res.on('end', () => {
            if (res.statusCode >= 400) return reject(new Error(`No se pudo descargar la imagen procesada (${res.statusCode})`));
            resolve(Buffer.concat(partes));
        });
    });
    req.on('error', reject);
});

const guardarImagenProcesada = async ({ imagenProcesadaUrl, imagenPath, imagenUrl }) => {
    const baseServicio = new URL(process.env.IA_SERVICE_URL);
    const salida = new URL(imagenProcesadaUrl, baseServicio);
    if (salida.origin !== baseServicio.origin) throw new Error('El servicio IA devolvió una URL de salida no permitida.');
    const extension = path.extname(imagenPath) || '.jpg';
    const nombre = `${path.basename(imagenPath, extension)}-procesada${extension}`;
    const destino = path.join(path.dirname(imagenPath), nombre);
    fs.writeFileSync(destino, await solicitarBuffer(salida));
    return `${imagenUrl.slice(0, imagenUrl.lastIndexOf('/') + 1)}${nombre}`;
};

const llamarServicioFastAPI = ({ imagenPath }) => {
    return new Promise((resolve, reject) => {
        const baseUrl = process.env.IA_SERVICE_URL;

        if (!baseUrl) {
            return reject(new Error('IA_SERVICE_URL no configurado'));
        }

        const endpoint = new URL('/detectar-vacas', baseUrl);
        const boundary = `----GanaderiaRomilio${Date.now()}`;
        const imagenBuffer = fs.readFileSync(imagenPath);
        const filename = path.basename(imagenPath);
        const header = Buffer.from(
            `--${boundary}\r\n`
            + `Content-Disposition: form-data; name="imagen"; filename="${filename}"\r\n`
            + 'Content-Type: image/jpeg\r\n\r\n'
        );
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([header, imagenBuffer, footer]);
        const cliente = endpoint.protocol === 'https:' ? https : http;

        const req = cliente.request(
            {
                method: 'POST',
                hostname: endpoint.hostname,
                port: endpoint.port,
                path: endpoint.pathname,
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                    'X-Internal-Token': process.env.IA_INTERNAL_TOKEN || ''
                }
            },
            (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);

                        if (res.statusCode >= 400) {
                            return reject(new Error(json.detail || json.mensaje || 'Error del servicio IA'));
                        }

                        resolve(json);
                    } catch (error) {
                        reject(new Error(`Respuesta IA invalida: ${error.message}`));
                    }
                });
            }
        );

        req.on('error', reject);
        req.end(body);
    });
};

const procesarImagenConteo = async ({ imagenPath, imagenUrl }) => {
    if (process.env.IA_SERVICE_URL) {
        try {
            const resultadoIA = await llamarServicioFastAPI({ imagenPath });
            const imagenProcesadaUrl = await guardarImagenProcesada({
                imagenProcesadaUrl: resultadoIA.imagenProcesadaUrl,
                imagenPath,
                imagenUrl
            });

            return {
                cantidadDetectada: resultadoIA.cantidadDetectada,
                confianzaPromedio: resultadoIA.confianzaPromedio,
                detecciones: resultadoIA.detecciones,
                imagenProcesadaUrl,
                proveedor: 'fastapi-yolo',
                imagenPath
            };
        } catch (error) {
            console.error('Error llamando servicio IA:', error.message);
            if (process.env.NODE_ENV === 'production' || process.env.IA_ALLOW_SIMULATION !== 'true') throw error;
        }
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('El servicio de IA no está configurado. No se generó ningún conteo.');
    }
    if (process.env.IA_ALLOW_SIMULATION !== 'true') {
        throw new Error('IA_SERVICE_URL no configurado y la simulación está deshabilitada.');
    }

    const cantidadDetectada = 8 + Math.floor(Math.random() * 9);
    const detecciones = generarDeteccionesSimuladas(cantidadDetectada);

    return {
        cantidadDetectada,
        confianzaPromedio: calcularConfianzaPromedio(detecciones),
        detecciones,
        imagenProcesadaUrl: imagenUrl,
        proveedor: 'simulado',
        imagenPath
    };
};

module.exports = {
    procesarImagenConteo,
    simulacionPermitida: () => process.env.NODE_ENV !== 'production' && process.env.IA_ALLOW_SIMULATION === 'true'
};
