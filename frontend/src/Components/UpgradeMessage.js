import React from 'react';

const nombresPlan = {
  analiticaProductiva: 'Gestión',
  analiticaEconomica: 'Pro',
  emailsOperativos: 'Pro',
  configuracionEmailAvanzada: 'Premium',
  reportesMultiFinca: 'Premium',
  auditoriaAvanzada: 'Pro'
};

const UpgradeMessage = ({ feature, titulo = 'Función no incluida en tu plan' }) => (
  <section className="plan-upgrade-message" role="status">
    <strong>{titulo}</strong>
    <span>Disponible a partir del plan {nombresPlan[feature] || 'superior'}.</span>
  </section>
);

export default UpgradeMessage;
