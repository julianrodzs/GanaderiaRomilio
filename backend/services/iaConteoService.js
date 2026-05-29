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

const llamarServicioFastAPI = ({ imagenPath }) => {
    return new Promise((resolve, reject) => {
        const baseUrl = process.env.IA_CONTEO_URL;

        if (!baseUrl) {
            return reject(new Error('IA_CONTEO_URL no configurado'));
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
                    'Content-Length': body.length
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
    if (process.env.IA_CONTEO_URL) {
        try {
            const resultadoIA = await llamarServicioFastAPI({ imagenPath });

            return {
                cantidadDetectada: resultadoIA.cantidadDetectada,
                confianzaPromedio: resultadoIA.confianzaPromedio,
                detecciones: resultadoIA.detecciones,
                imagenProcesadaUrl: resultadoIA.imagenProcesadaUrl,
                proveedor: 'fastapi-yolo',
                imagenPath
            };
        } catch (error) {
            console.error('Error llamando servicio IA, usando simulacion:', error.message);
        }
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
    procesarImagenConteo
};
