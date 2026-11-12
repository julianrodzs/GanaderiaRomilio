const mongoose = require('mongoose');
const path = require('node:path');
async function main() {
    require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI es obligatoria.');
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
    const Pesaje = require('../models/Pesaje');
    await Pesaje.createIndexes();
    console.log('Indices de pesajes preparados. No se modificaron registros ni se eliminaron indices.');
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
