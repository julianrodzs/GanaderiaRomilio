import React from 'react';
import { usePlan } from '../context/PlanContext';
import UpgradeMessage from './UpgradeMessage';

const FeatureGate = ({ feature, children, fallback, titulo, pregunta, etiqueta }) => {
  const { cargando, tieneFeature } = usePlan();
  if (cargando) return null;
  if (!tieneFeature(feature)) return fallback || <UpgradeMessage feature={feature} titulo={titulo} pregunta={pregunta} etiqueta={etiqueta} />;
  return children;
};

export default FeatureGate;
