const AceptacionLegal = require('../models/AceptacionLegal');
const prepararIndices = async () => {
    await AceptacionLegal.createIndexes();
    return { modelos: ['AceptacionLegal'], datosModificados: 0 };
};
if (require.main === module) {
    require('dotenv').config();
    process.env.MONGODB_AUTO_INDEX = 'false';
    require('../database')().then(prepararIndices).then((r) => console.log(JSON.stringify(r, null, 2)))
        .catch((e) => { console.error(e.message); process.exitCode = 1; })
        .finally(() => require('mongoose').disconnect());
}
module.exports = { prepararIndices };
