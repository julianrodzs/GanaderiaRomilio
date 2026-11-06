import React, { useEffect, useState } from 'react';
import {
  crearCheckoutFacturacion,
  crearPortalFacturacion,
  obtenerEstadoFacturacion
} from '../services/api';
import { EstadoSuscripcion, HistorialPagosSuscripcion } from './SuscripcionesSaas';
import { enlaceRenovacion, fechaSuscripcion } from '../utils/suscripciones.mjs';

const fecha = (valor) => valor ? new Date(valor).toLocaleDateString('es-CR') : 'Sin fecha programada';

const FacturacionPlan = ({ codigoActual }) => {
  const [estado, setEstado] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [procesando, setProcesando] = useState('');
  const manual = estado && (estado.suscripcion?.modoFacturacion !== 'STRIPE' || !estado.stripeConfigurado);
  const contacto = (destino) => enlaceRenovacion({ telefono: import.meta.env.VITE_WHATSAPP_SOPORTE,
    organizacion: estado?.organizacion?.nombre || 'mi organización', actual: codigoActual, destino });

  useEffect(() => {
    obtenerEstadoFacturacion().then(setEstado).catch((error) => setMensaje(error.message));
    const resultado = new URLSearchParams(window.location.search).get('facturacion');
    if (resultado === 'exito') setMensaje('El pago fue recibido. El plan se actualizará al confirmar Stripe.');
    if (resultado === 'cancelada') setMensaje('El proceso de pago fue cancelado.');
  }, []);

  const irCheckout = async (codigoPlan) => {
    setProcesando(codigoPlan); setMensaje('');
    try {
      const respuesta = await crearCheckoutFacturacion(codigoPlan);
      window.location.assign(respuesta.url);
    } catch (error) {
      setMensaje(error.message); setProcesando('');
    }
  };

  const irPortal = async () => {
    setProcesando('portal'); setMensaje('');
    try {
      const respuesta = await crearPortalFacturacion();
      window.location.assign(respuesta.url);
    } catch (error) {
      setMensaje(error.message); setProcesando('');
    }
  };

  return (
    <section className="facturacion-plan">
      <div className="panel-title">
        <div><p className="eyebrow">Facturación</p><h2>Suscripción y renovación</h2></div>
        {!manual && estado?.plan?.administrable && <button type="button" onClick={irPortal} disabled={Boolean(procesando)}>Administrar pagos</button>}
      </div>
      {estado && (
        <p className="facturacion-vigencia">
          {manual ? <><EstadoSuscripcion suscripcion={estado.suscripcion} /> · Vigente hasta: <strong>{fechaSuscripcion(estado.suscripcion?.fechaProximoVencimiento)}</strong></> : <>Estado: <strong>{estado.plan.estado}</strong> · Próxima renovación: <strong>{fecha(estado.plan.fechaRenovacion)}</strong></>}
        </p>
      )}
      {mensaje && <p className="form-message">{mensaje}</p>}
      {manual && <div className="facturacion-contacto">{contacto() ? <a className="boton-primario" href={contacto()} target="_blank" rel="noopener noreferrer">Solicitar renovación por WhatsApp / SINPE</a> : <p role="status">Contacta al administrador de CIR Ganadero para coordinar tu renovación. El contacto comercial está pendiente de configuración.</p>}</div>}
      <div className="facturacion-planes">
        {(estado?.catalogo || []).map((item) => (
          <article key={item.codigo} className={item.codigo === codigoActual ? 'actual' : ''}>
            <span>{item.nombre}</span>
            <strong>${item.precioMensualUSD} USD / mes</strong>
            {manual ? item.codigo === codigoActual ? <strong>Plan actual</strong> : contacto(item.codigo) ? <a className="boton-secundario" href={contacto(item.codigo)} target="_blank" rel="noopener noreferrer">Solicitar cambio de plan</a> : <button type="button" disabled title="Contacto comercial pendiente de configuración">Solicitar cambio de plan</button> : <button
              type="button"
              className="boton-primario compacto"
              disabled={item.codigo === codigoActual || (!estado.plan.administrable && !item.checkoutDisponible) || Boolean(procesando)}
              title={!estado.plan.administrable && !item.checkoutDisponible ? 'El precio aún no está configurado en Stripe.' : ''}
              onClick={() => estado.plan.administrable ? irPortal() : irCheckout(item.codigo)}
            >
              {item.codigo === codigoActual ? 'Plan actual' : procesando === item.codigo || procesando === 'portal' ? 'Abriendo...' : estado.plan.administrable ? 'Cambiar en portal' : 'Seleccionar'}
            </button>}
          </article>
        ))}
      </div>
      {manual && <><h3>Mis pagos registrados</h3><HistorialPagosSuscripcion /></>}
    </section>
  );
};

export default FacturacionPlan;
