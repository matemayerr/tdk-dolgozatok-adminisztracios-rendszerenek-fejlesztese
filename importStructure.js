const mongoose = require('mongoose');
const XLSX = require('xlsx');
const UniversityStructure = require('./models/universityStructure.js');

// 1️⃣ Kapcsolódás az adatbázishoz
mongoose.connect('mongodb://localhost:27017/tdk_adatbazis')
  .then(async () => {
    console.log('Kapcsolódva a MongoDB-hez');

    // 2️⃣ Excel beolvasása
    const workbook = XLSX.readFile('sze_struktura.xlsx'); // pontos fájlnév!
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`📄 ${rows.length} sor beolvasva az Excel fájlból.`);

    // 3️⃣ Adatok feltöltése / frissítése
    for (const row of rows) {
      const karNev = row['Kar'];
      const rovidites = row['Kar rövidítés'] || '';
      const szakNev = row['Szak'];
      const tipus = row['Képzés típusa'] || '';

      if (!karNev || !szakNev) continue;

      let kar = await UniversityStructure.findOne({ nev: karNev });
      if (!kar) {
        kar = new UniversityStructure({ nev: karNev, rovidites, szakok: [] });
      }

      const letezo = kar.szakok.find(s => s.nev === szakNev && s.tipus === tipus);
      if (!letezo) {
        kar.szakok.push({ nev: szakNev, tipus });
      }

      await kar.save();
    }

    console.log('✅ Egyetemi struktúra sikeresen importálva az adatbázisba!');
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('❌ Hiba az adatbázis kapcsolódáskor:', err);
  });
