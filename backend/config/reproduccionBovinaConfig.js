module.exports = {
    diasRevisionCeloPostParto: 60,
    diasCicloEstralEstimado: 21,
    mesesDestetePostParto: 7,
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
            titulo: 'Destetar ternero',
            tipo: 'Reproducción',
            prioridad: 'Media',
            categoriaAutomatica: 'Reproducción bovina',
            tipoEventoBitacora: 'Destete'
        }
    }
};
