const reproduccionPorcinaConfig = {
    diasRevisionCeloPostInseminacion: 21,
    diasGestacion: 118,
    margenPartoDias: 3,
    diasDesparasitacionAntesParto: 30,
    diasAlimentoLactanciaAntesParto: 15,
    diasDestetePostParto: 31,
    diasNuevaMontaPostDestete: 5,
    diasRevisionCeloPostNuevaMonta: 21,

    criasQueSeQuedan: {
        diasHierroPostNacimiento: 3,
        diasVitaminaDesparasitacionPostNacimiento: 8,
        diasAlimentoInicioPostNacimiento: 15,
        diasCircovirusPostNacimiento: 21,
        diasAlimentoDesarrolloPostNacimiento: 60,
        diasAlimentoEngordePostNacimiento: 123,
        diasPrimeraMontaPostNacimiento: 270
    },

    criasQueSeVenden: {
        diasHierroPostNacimiento: 3,
        diasVitaminaDesparasitacionPostNacimiento: 8,
        diasVentaPostNacimiento: 30
    },

    criasEngorde: {
        diasHierroPostNacimiento: 3,
        diasVitaminaDesparasitacionPostNacimiento: 8,
        diasAlimentoInicioPostNacimiento: 15,
        diasAlimentoDesarrolloPostNacimiento: 60,
        diasAlimentoEngordePostNacimiento: 123,
        diasSacrificioPostNacimiento: 270
    }
};

module.exports = reproduccionPorcinaConfig;
