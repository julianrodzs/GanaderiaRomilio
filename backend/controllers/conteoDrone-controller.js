const conteoDroneCtrl = {};

conteoDroneCtrl.getEstadoModulo = (req, res) => {
    res.json({
        modulo: 'conteoDrone',
        estado: 'pendiente',
        mensaje: 'Modulo reservado para futuro conteo de ganado con drone e IA'
    });
};

module.exports = conteoDroneCtrl;
