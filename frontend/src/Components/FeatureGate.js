import React from 'react';
import { usePlan } from '../context/PlanContext';
import UpgradeMessage from './UpgradeMessage';

const FeatureGate = ({ feature, children, fallback }) => {
  const { cargando, tieneFeature } = usePlan();
  if (cargando) return null;
  if (!tieneFeature(feature)) return fallback || <UpgradeMessage feature={feature} />;
  return children;
};

export default FeatureGate;
