import React, { useEffect, useState } from 'react';
import { catalogosFinancierosBase } from '../constants/catalogosFinancieros';
import { obtenerCatalogosFinancieros } from '../services/api';

const estadoInicial = {
  fecha: new Date().toISOString().slice(0, 10),
  tipoMovimiento: 'Compra',
  naturaleza: 'Egreso',
  categoria: '',
  descripcion: '',
  producto: '',
  cantidad: '',
  unidad: '',
  precioUnitario: '',
  periodoInicio: '',
  periodoFin: '',
  tipoTrabajo: '',
  cantidadPersonas: '',
  diasTrabajados: '',
  horasTrabajadas: '',
  costoUnitario: '',
  tipoInversion: '',
  activoAsociado: '',
  destinoUso: '',
  depreciable: false,
  vidaUtilMeses: '',
  fechaInicioUso: '',
  valorResidual: '',
  depreciacionMensual: '',
  estadoActivo: '',
  monto: '',
  moneda: 'CRC',
  metodoPago: '',
  proveedor: '',
  empleado: '',
  finca: '',
  comprobante: '',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const numeroFormulario = (valor, decimales = 2) => {
  if (valor === '' || valor === null || valor === undefined) return '';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return Number(numero.toFixed(decimales));
};

const normalizarMovimiento = (movimiento) => ({
  ...estadoInicial,
  ...movimiento,
  fecha: formatearFechaInput(movimiento?.fecha),
  periodoInicio: formatearFechaInput(movimiento?.periodoInicio),
  periodoFin: formatearFechaInput(movimiento?.periodoFin),
  fechaInicioUso: formatearFechaInput(movimiento?.fechaInicioUso),
  cantidad: movimiento?.cantidad ?? '',
  precioUnitario: numeroFormulario(movimiento?.precioUnitario),
  cantidadPersonas: movimiento?.cantidadPersonas ?? '',
  diasTrabajados: movimiento?.diasTrabajados ?? '',
  horasTrabajadas: movimiento?.horasTrabajadas ?? '',
  costoUnitario: movimiento?.costoUnitario ?? '',
  depreciable: Boolean(movimiento?.depreciable),
  vidaUtilMeses: movimiento?.vidaUtilMeses ?? '',
  valorResidual: movimiento?.valorResidual ?? '',
  depreciacionMensual: movimiento?.depreciacionMensual ?? '',
  monto: movimiento?.monto ?? ''
});

const numeroONulo = (valor) => (valor === '' || valor === null || valor === undefined ? null : Number(valor));

const camposTextoMayuscula = new Set([
  'descripcion',
  'producto',
  'unidad',
  'tipoTrabajo',
  'tipoInversion',
  'activoAsociado',
  'estadoActivo',
  'proveedor',
  'empleado',
  'finca',
  'metodoPago',
  'comprobante',
  'observaciones'
]);

const mayusculas = (valor) => String(valor || '').toUpperCase();

const opcionesConValorActual = (opciones = [], valorActual) => {
  if (!valorActual || opciones.includes(valorActual)) return opciones;
  return [...opciones, valorActual];
};

const OpcionesDatalist = ({ id, opciones = [] }) => (
  <datalist id={id}>
    {opciones.map((opcion) => <option key={opcion} value={opcion} />)}
  </datalist>
);

const FormularioMovimientoFinanciero = ({
  movimientoInicial,
  modo = 'crear',
  onCancelar,
  onGuardar,
  guardando,
  error
}) => {
  const [formulario, setFormulario] = useState(() => normalizarMovimiento(movimientoInicial));
  const [catalogos, setCatalogos] = useState(catalogosFinancierosBase);

  useEffect(() => {
    let activo = true;

    obtenerCatalogosFinancieros()
      .then((datos) => {
        if (activo) setCatalogos({ ...catalogosFinancierosBase, ...datos });
      })
      .catch(() => {
        if (activo) setCatalogos(catalogosFinancierosBase);
      });

    return () => {
      activo = false;
    };
  }, []);

  const actualizarCampo = (evento) => {
    const { name, value, type, checked } = evento.target;
    const valor = camposTextoMayuscula.has(name) ? mayusculas(value) : value;
    setFormulario((actual) => ({ ...actual, [name]: type === 'checkbox' ? checked : valor }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();

    onGuardar({
      ...formulario,
      cantidad: numeroONulo(formulario.cantidad),
      precioUnitario: numeroONulo(formulario.precioUnitario),
      cantidadPersonas: numeroONulo(formulario.cantidadPersonas),
      diasTrabajados: numeroONulo(formulario.diasTrabajados),
      horasTrabajadas: numeroONulo(formulario.horasTrabajadas),
      costoUnitario: numeroONulo(formulario.costoUnitario),
      vidaUtilMeses: numeroONulo(formulario.vidaUtilMeses),
      valorResidual: numeroONulo(formulario.valorResidual),
      depreciacionMensual: numeroONulo(formulario.depreciacionMensual),
      monto: Number(formulario.monto)
    });
  };

  const categorias = opcionesConValorActual(catalogos.categorias, formulario.categoria);
  const destinosUso = opcionesConValorActual(catalogos.destinosUso, formulario.destinoUso);

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Costos y finanzas</p>
          <h2>{modo === 'editar' ? 'Editar movimiento financiero' : 'Nuevo movimiento financiero'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
          <label>
            Fecha
            <input name="fecha" type="date" value={formulario.fecha} onChange={actualizarCampo} required />
          </label>

          <label>
            Tipo
            <select name="tipoMovimiento" value={formulario.tipoMovimiento} onChange={actualizarCampo} required>
              {(catalogos.tiposMovimiento || catalogosFinancierosBase.tiposMovimiento)
                .filter((tipo) => ['Planilla', 'Inversion', 'Compra'].includes(tipo))
                .map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label>
            Naturaleza
            <select name="naturaleza" value={formulario.naturaleza} onChange={actualizarCampo} required>
              {(catalogos.naturalezas || catalogosFinancierosBase.naturalezas).map((naturaleza) => (
                <option key={naturaleza} value={naturaleza}>{naturaleza}</option>
              ))}
            </select>
          </label>

          <label>
            Categoria
            <select name="categoria" value={formulario.categoria} onChange={actualizarCampo} required>
              <option value="">Seleccionar categoria</option>
              {categorias.map((categoria) => (
                <option key={categoria} value={categoria}>{categoria}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Descripcion
          <input name="descripcion" value={formulario.descripcion} onChange={actualizarCampo} required />
        </label>

        <div className="form-grid">
          <label>
            Producto
            <input name="producto" value={formulario.producto} onChange={actualizarCampo} placeholder="Ej. Gasolina regular" />
          </label>

          <label>
            Unidad
            <input name="unidad" list="unidades-financieras" value={formulario.unidad} onChange={actualizarCampo} placeholder="litros, sacos, unidades..." />
            <OpcionesDatalist id="unidades-financieras" opciones={catalogos.unidades} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Cantidad
            <input name="cantidad" type="number" min="0" step="0.01" value={formulario.cantidad} onChange={actualizarCampo} />
          </label>

          <label>
            Precio unitario
            <input name="precioUnitario" type="number" min="0" step="0.01" value={formulario.precioUnitario} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Monto
            <input name="monto" type="number" min="0" step="0.01" value={formulario.monto} onChange={actualizarCampo} required />
          </label>

          <label>
            Moneda
            <select name="moneda" value={formulario.moneda} onChange={actualizarCampo}>
              {(catalogos.monedas || catalogosFinancierosBase.monedas).map((moneda) => (
                <option key={moneda} value={moneda}>{moneda}</option>
              ))}
            </select>
          </label>
        </div>

        {formulario.tipoMovimiento === 'Planilla' && (
          <section className="form-subsection">
            <div>
              <p className="eyebrow">Detalle de planilla</p>
              <h3>Periodo y trabajo</h3>
            </div>

            <div className="form-grid">
              <label>
                Inicio periodo
                <input name="periodoInicio" type="date" value={formulario.periodoInicio} onChange={actualizarCampo} />
              </label>

              <label>
                Fin periodo
                <input name="periodoFin" type="date" value={formulario.periodoFin} onChange={actualizarCampo} />
              </label>
            </div>

            <div className="form-grid">
              <label>
                Tipo de trabajo
                <input name="tipoTrabajo" list="tipos-trabajo-financieros" value={formulario.tipoTrabajo} onChange={actualizarCampo} placeholder="Chapia, cerca, mano de obra..." />
                <OpcionesDatalist id="tipos-trabajo-financieros" opciones={catalogos.tiposTrabajo} />
              </label>

              <label>
                Cantidad de personas
                <input name="cantidadPersonas" type="number" min="0" step="1" value={formulario.cantidadPersonas} onChange={actualizarCampo} />
              </label>
            </div>

            <div className="form-grid">
              <label>
                Dias trabajados
                <input name="diasTrabajados" type="number" min="0" step="0.5" value={formulario.diasTrabajados} onChange={actualizarCampo} />
              </label>

              <label>
                Horas trabajadas
                <input name="horasTrabajadas" type="number" min="0" step="0.5" value={formulario.horasTrabajadas} onChange={actualizarCampo} />
              </label>
            </div>

            <label>
              Costo unitario
              <input name="costoUnitario" type="number" min="0" step="0.01" value={formulario.costoUnitario} onChange={actualizarCampo} />
            </label>
          </section>
        )}

        {formulario.tipoMovimiento === 'Inversion' && (
          <section className="form-subsection">
            <div>
              <p className="eyebrow">Detalle de inversion</p>
              <h3>Activo y depreciacion</h3>
            </div>

            <div className="form-grid">
              <label>
                Tipo de inversion
                <input name="tipoInversion" list="tipos-inversion-financieros" value={formulario.tipoInversion} onChange={actualizarCampo} placeholder="Ganado, finca, maquinaria..." />
                <OpcionesDatalist id="tipos-inversion-financieros" opciones={catalogos.tiposInversion} />
              </label>

              <label>
                Activo asociado
                <input name="activoAsociado" value={formulario.activoAsociado} onChange={actualizarCampo} placeholder="Corral, tractor, lote..." />
              </label>
            </div>

            <div className="form-grid">
              <label>
                Fecha inicio de uso
                <input name="fechaInicioUso" type="date" value={formulario.fechaInicioUso} onChange={actualizarCampo} />
              </label>

              <label>
                Estado del activo
                <input name="estadoActivo" list="estados-activo-financieros" value={formulario.estadoActivo} onChange={actualizarCampo} placeholder="En uso, pendiente, vendido..." />
                <OpcionesDatalist id="estados-activo-financieros" opciones={catalogos.estadosActivo} />
              </label>
            </div>

            <label className="checkbox-line">
              <input name="depreciable" type="checkbox" checked={formulario.depreciable} onChange={actualizarCampo} />
              Depreciable
            </label>

            <div className="form-grid">
              <label>
                Vida util meses
                <input name="vidaUtilMeses" type="number" min="0" step="1" value={formulario.vidaUtilMeses} onChange={actualizarCampo} />
              </label>

              <label>
                Valor residual
                <input name="valorResidual" type="number" min="0" step="0.01" value={formulario.valorResidual} onChange={actualizarCampo} />
              </label>
            </div>

            <label>
              Depreciacion mensual
              <input name="depreciacionMensual" type="number" min="0" step="0.01" value={formulario.depreciacionMensual} onChange={actualizarCampo} />
            </label>
          </section>
        )}

        <div className="form-grid">
          <label>
            Proveedor/Lugar
            <input name="proveedor" value={formulario.proveedor} onChange={actualizarCampo} />
          </label>

          <label>
            Empleado
            <input name="empleado" value={formulario.empleado} onChange={actualizarCampo} />
          </label>
        </div>

        <label>
          Destino de uso
          <select name="destinoUso" value={formulario.destinoUso} onChange={actualizarCampo}>
            <option value="">Sin destino definido</option>
            {destinosUso.map((destino) => (
              <option key={destino} value={destino}>{destino}</option>
            ))}
          </select>
        </label>

        <div className="form-grid">
          <label>
            Finca
            <input name="finca" value={formulario.finca} onChange={actualizarCampo} />
          </label>

          <label>
            Metodo de pago
            <input name="metodoPago" list="metodos-pago-financieros" value={formulario.metodoPago} onChange={actualizarCampo} />
            <OpcionesDatalist id="metodos-pago-financieros" opciones={catalogos.metodosPago} />
          </label>
        </div>

        <label>
          Comprobante
          <input name="comprobante" value={formulario.comprobante} onChange={actualizarCampo} />
        </label>

        <label>
          Observaciones
          <textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} />
        </label>

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar movimiento' : 'Guardar movimiento'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioMovimientoFinanciero;
