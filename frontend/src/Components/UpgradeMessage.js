import React from 'react';

const nombresPlan = {
  analiticaProductiva: 'Gestión',
  analiticaEconomica: 'Pro',
  emailsOperativos: 'Pro',
  configuracionEmailAvanzada: 'Premium',
  reportesMultiFinca: 'Premium',
  auditoriaAvanzada: 'Pro',
  iatfReproductivo: 'Pro',
  protocolosEngorde: 'Pro',
  protocolosReproductivosPorcinos: 'Pro',
  fotosAnimales: 'Pro'
};

const UpgradeMessage = ({ feature, titulo = 'Función no incluida en tu plan', pregunta, etiqueta = 'Disponible en otro plan' }) => (
  <section className="plan-upgrade-message" role="status">
    <small>{etiqueta}</small>
    <strong>{titulo}</strong>
    {pregunta && <p>{pregunta}</p>}
    <span>Disponible a partir del plan {nombresPlan[feature] || 'superior'}.</span>
  </section>
);

export default UpgradeMessage;
