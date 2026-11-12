import React from 'react';
import { TIPOS_PESAJE, normalizarTipoPesaje, etiquetaTipoPesaje } from '../constants/tiposPesaje.mjs';
import './TipoPesaje.css';
export const BadgeTipoPesaje = ({ tipo }) => <span className={`tipo-pesaje-badge tipo-pesaje-${normalizarTipoPesaje(tipo).toLowerCase()}`}>{etiquetaTipoPesaje(tipo)}</span>;
export const SelectorTipoPesaje = ({ valor, onChange, todos = false }) => <label>Tipo de pesaje<select name="tipoPesaje" value={valor} onChange={(e) => onChange(e.target.value)}>{todos && <option value="Todos">Todos los tipos</option>}{TIPOS_PESAJE.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}</select></label>;
export const NotaPesajeDestete = ({ tipo }) => tipo === 'DESTETE' ? <p className="nota-pesaje-destete" role="note">Actualizará automáticamente el peso y fecha de destete en la ficha del animal y registrará el evento en su bitácora.</p> : null;
