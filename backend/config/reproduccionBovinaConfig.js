module.exports = {
    tareasAutomaticas: {
        partoEstimado: {
            clave: 'parto-estimado',
            titulo: 'Revisar parto estimado',
            tipo: 'Reproducción',
            prioridad: 'Alta',
            categoriaAutomatica: 'Reproducción bovina',
            tipoEventoBitacora: 'Parto'
        },
        proximoCelo: {
            clave: 'proximo-celo',
            titulo: 'Revisar próximo celo estimado',
            tipo: 'Reproducción',
            prioridad: 'Media',
            categoriaAutomatica: 'Reproducción bovina',
            tipoEventoBitacora: 'Monta'
        },
        destete: {
            clave: 'destete',
            titulo: 'Revisar destete',
            tipo: 'Reproducción',
            prioridad: 'Media',
            categoriaAutomatica: 'Reproducción bovina',
            tipoEventoBitacora: 'Destete'
        }
    }
};
