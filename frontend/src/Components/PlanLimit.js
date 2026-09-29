import React from 'react';

const PlanLimit = ({ etiqueta, actual = 0, limite, sobreLimite = false }) => {
  const porcentaje = limite ? Math.min((actual / limite) * 100, 100) : 0;
  return (
    <article className={`plan-limit ${sobreLimite ? 'plan-limit-over' : ''}`}>
      <div><strong>{etiqueta}</strong><span>{actual} / {limite ?? 'Sin límite fijo'}</span></div>
      {limite !== null && limite !== undefined && (
        <div className="plan-limit-track"><span style={{ width: `${porcentaje}%` }} /></div>
      )}
    </article>
  );
};

export default PlanLimit;
