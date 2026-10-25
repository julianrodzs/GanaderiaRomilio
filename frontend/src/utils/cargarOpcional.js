export const cargarOpcional = async (peticion, valorPorDefecto = null) => {
  try {
    return await (typeof peticion === 'function' ? peticion() : peticion);
  } catch (error) {
    if ([401, 403, 404].includes(error?.status)) return valorPorDefecto;
    throw error;
  }
};
