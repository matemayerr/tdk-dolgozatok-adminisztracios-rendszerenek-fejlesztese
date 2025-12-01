// Express.js és szükséges modulok betöltése
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const resetTokens = {}; // egyszerű token tárolás memóriában (indítás után elveszik)
const Paper = require('./models/Paper');



// Alkalmazás és port inicializálása
const app = express();
const port = 3000;

// MongoDB kapcsolat létrehozása
mongoose.connect('mongodb://localhost:27017/tdk_adatbazis')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

// Statikus fájlok kiszolgálása (pl. CSS, JavaScript, képek)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // JSON adatküldés engedélyezése (pl. POST és PUT kérésekhez)

// Mongoose modellek létrehozása a "Dolgozat" és "Felhasznalo" gyűjteményekhez
const Dolgozat = mongoose.model('dolgozat', new mongoose.Schema({
  cím: { type: String, required: true },
  sorszam: { type: Number, default: 0 },
  leiras: { type: String },
  hallgato_ids: { type: [String], required: true },
  temavezeto_ids: { type: [String], required: true },

  // 🔹 A dolgozat karja – a dolgozatot felvevő hallgató kar-rövidítése (pl. GIVK, KGGK)
  kar: { type: String, default: '' },

  allapot: { type: String, default: 'jelentkezett' },
  filePath: { type: String },
  files: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    originalName: String,
    fileName: String,
    path: String,
    mimeType: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  pontszam: { type: String, default: '' },
  ertekelesFilePath: { type: String },
  elutasitas_oka: { type: String },
  szovegesErtekeles: { type: String },
  ertekeles: { type: Object, default: {} },
  biralok: [
    {
      felhasznaloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Felhasznalos' },
      allapot: {
        type: String,
        enum: ['Felkérve', 'Elfogadva', 'Elutasítva'],
        default: 'Felkérve'
      }
    }
  ],
  szekcioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null }
}));




const bcrypt = require('bcrypt');

// Felhasznalo modell
const Felhasznalo = mongoose.model('Felhasznalos', new mongoose.Schema({
    nev: { type: String, required: true },
    neptun: { type: String, required: false },
    email: { type: String, required: true },
    csoportok: { type: [String], required: true },
    kar: { type: String, required: false },
    szak: { type: String, required: false },
    evfolyam: { type: String, required: false },
    jelszo: { type: String, required: false }
}));


//e-mail sablonbeolvasó függvény
const fs = require('fs');

function betoltEmailSablon(fajlNev, helyettesites = {}) {
    const sablonPath = path.join(__dirname, 'emails', fajlNev);
    let szoveg = fs.readFileSync(sablonPath, 'utf-8');
    for (const kulcs in helyettesites) {
        const regex = new RegExp(`{{${kulcs}}}`, 'g');
        szoveg = szoveg.replace(regex, helyettesites[kulcs]);
    }
    return szoveg;
}



// Ellenörzöm a Neptun-kod és jelszo helyesseget, majd egy JWT tokent adok vissza
const jwt = require('jsonwebtoken');
const secretKey = 'titkosKulcs123'; // Titkos kulcs a tokenhez (ezt .env-be kellene tenni)

app.post('/api/login', async (req, res) => {
    const { email, jelszo } = req.body;

    try {
        console.log("Bejelentkezési próbálkozás:", email);

        const felhasznalo = await Felhasznalo.findOne({ email });
        if (!felhasznalo) {
            console.error("Nincs ilyen felhasználó:", email);
            return res.status(400).json({ error: 'Hibás E-mail cím vagy jelszó' });
        }

        console.log("Felhasználó megtalálva:", felhasznalo);

        // Ellenőrizzük, hogy van-e jelszó a request-ben
        if (!jelszo) {
            console.error("Nincs jelszó megadva a bejelentkezéshez!");
            return res.status(400).json({ error: 'Hiányzó jelszó!' });
        }

        // Ellenőrizzük, hogy a felhasználónak van-e mentett jelszava
        if (!felhasznalo.jelszo) {
            console.error("A felhasználónak nincs jelszava az adatbázisban!");
            return res.status(500).json({ error: 'Nincs jelszó mentve az adatbázisban!' });
        }

        const isMatch = await bcrypt.compare(jelszo, felhasznalo.jelszo);
        if (!isMatch) {
            console.error("Helytelen jelszó:", jelszo);
            return res.status(400).json({ error: 'Hibás E-mail cím vagy jelszó' });
        }

        console.log("Jelszó egyezik, token generálás...");
        const token = jwt.sign(
  { id: felhasznalo._id, csoportok: felhasznalo.csoportok || [] },
  secretKey,
  { expiresIn: '2h' }
);


        console.log("Bejelentkezés sikeres!");
        res.json({ token, felhasznalo });
    } catch (error) {
        console.error("Hiba történt a bejelentkezés során:", error);
        res.status(500).json({ error: 'Szerverhiba' });
    }
});

// A frontend oldalon torli a tokent
app.post('/api/logout', (req, res) => {
    res.json({ message: 'Sikeres kijelentkezés' });
});

// Az endpoint biztositja, hogy a jelszavak biztonsagban legyenek mentve
app.post('/api/register', async (req, res) => {
    const { nev, neptun, email, csoport, jelszo } = req.body;

    try {
        const hash = await bcrypt.hash(jelszo, 10);
        const ujFelhasznalo = new Felhasznalo({ nev, neptun, email, csoportok, jelszo: hash });
        await ujFelhasznalo.save();
        res.status(201).json({ message: 'Sikeres regisztráció' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a regisztráció során' });
    }
});


const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'm48625729@gmail.com',   // ide a saját Gmail címed
    pass: 'uxjraaxejiswddjn'       // ide az alkalmazásjelszavad, szóköz nélkül
  }
});


async function kuldErtesitesTemavezetonek(temavezetoEmail, dolgozat) {
    const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_ids[0] });
    const hallgato = await Felhasznalo.findOne({ neptun: dolgozat.hallgato_ids[0] });

    const emailSzoveg = betoltEmailSablon('ertesites_temavezetonek.txt', {
        TEMAVEZETONEV: temavezeto?.nev || 'Tisztelt témavezető',
        DOLGOZATCIM: dolgozat.cím,
        HALLGATONEV: hallgato?.nev || 'Ismeretlen hallgató',
        NEPTUNKOD: hallgato?.neptun || '',
        DOLGOZAT_LINK: `http://localhost:3000/dolgozatok/${dolgozat._id}`
    });

    const mailOptions = {
        from: 'm48625729@gmail.com',
        to: temavezetoEmail,
        subject: 'Új dolgozat érkezett elfogadásra',
        text: emailSzoveg
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Értesítés sikeresen elküldve a témavezetőnek.');
    } catch (error) {
        console.error('Hiba történt az értesítés küldésekor:', error);
    }
}



// Szöveges értékelés és jegy mentése
app.post('/api/dolgozatok/ertekeles/:id', async (req, res) => {
    const { id } = req.params;
    const { pontszam, szovegesErtekeles } = req.body;

    try {
        const dolgozat = await Dolgozat.findById(id);
        if (!dolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }

        dolgozat.pontszam = pontszam;
        dolgozat.szovegesErtekeles = szovegesErtekeles;
        dolgozat.allapot = 'értékelve';
        await dolgozat.save();

        res.status(200).json({ message: 'Értékelés sikeresen mentve.', dolgozat });
    } catch (error) {
        console.error('Hiba történt az értékelés mentése során:', error);
        res.status(500).json({ error: 'Hiba történt az értékelés mentése során' });
    }
});



// Multer beállítása fájlok feltöltéséhez
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads'); // Fájlok mentése az 'uploads' mappába
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Fájlnév dátummal egyedi név biztosítása érdekében
    }
});
const upload = multer({ storage });

// Feltöltött fájl elérése közvetlen URL-en keresztül
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.sendFile(filePath);
});

// CRUD műveletek a dolgozatokra

// 🔹 Dolgozatok sorrendjének mentése drag and drop után
app.put('/api/dolgozatok/reorder', async (req, res) => {
  try {
    const body = req.body || {};
    const dolgozatok = body.dolgozatok;

    console.log('🔁 Érkezett sorrend:', JSON.stringify(dolgozatok, null, 2));

    if (!Array.isArray(dolgozatok)) {
      return res.status(400).json({ error: 'Hibás formátumú dolgozatlista.' });
    }

    let updatedCount = 0;

    for (const d of dolgozatok) {
      if (!d.id) {
        console.warn('⚠️ Hiányzik az id egy elemnél:', d);
        continue;
      }

      const result = await Dolgozat.updateOne(
        { _id: d.id },
        { $set: { sorszam: d.sorszam ?? 0 } }
      );

      updatedCount += result.modifiedCount ?? result.nModified ?? 0;
    }

    console.log('✅ Sorrend frissítve, módosított dokumentumok:', updatedCount);
    res.json({ message: 'Sorrend sikeresen frissítve.', updated: updatedCount });
  } catch (err) {
    console.error('❌ Hiba a sorrend mentésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a sorrend mentésekor.', details: String(err.message || err) });
  }
});

// Minden dolgozat lekérdezése
app.get('/api/dolgozatok', async (req, res) => {
  try {
    const dolgozatok = await Dolgozat.find()
      .sort({ szekcioId: 1, sorszam: 1, _id: 1 })  // 🔹 itt a rendezés
      .lean();

    const felhasznalok = await Felhasznalo.find().lean();

    // Neptun → felhasználó map
    const felhasznaloMapNeptun = {};
    const felhasznaloMapId = {};
    felhasznalok.forEach(f => {
      if (f.neptun) felhasznaloMapNeptun[f.neptun] = f;
      felhasznaloMapId[String(f._id)] = f;
    });


    const eredmeny = dolgozatok.map(d => ({
      _id: d._id,
      cim: d.cím || d.cim || '',
      allapot: d.allapot,
      leiras: d.leiras || '',
      szekcioId: d.szekcioId ? String(d.szekcioId) : null,
      szerzok: (d.hallgato_ids || []).map(neptun => ({
        nev: felhasznaloMapNeptun[neptun]?.nev || '',
        neptun
      })),
      temavezeto: (d.temavezeto_ids || []).map(neptun => ({
        nev: felhasznaloMapNeptun[neptun]?.nev || '',
        neptun
      }))

    }));

    res.json(eredmeny);
  } catch (error) {
    console.error('Hiba a dolgozatok lekérésekor:', error);
    res.status(500).json({ error: 'Szerverhiba a dolgozatok lekérésekor' });
  }
});



// Feltöltéshez elérhető dolgozatok lekérdezése
app.get('/api/dolgozatok/feltoltheto', async (req, res) => {
    try {
        const feltolthetoDolgozatok = await Dolgozat.find({
            allapot: { $in: ['jelentkezett','feltöltve - témavezető válaszára vár','elfogadva - témavezető által',
                    'elutasítva - témavezető által'] }
        });
        res.json(feltolthetoDolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a feltölthető dolgozatok lekérésekor' });
    }
});


// Új dolgozat hozzáadása
app.post('/api/dolgozatok', async (req, res) => {
  // kar-t is vegyük át a body-ból
  const { cím, hallgato_ids, temavezeto_ids, leiras, kar: bodyKar } = req.body;

  try {
    // 🔹 Alapértelmezett: nincs kar
    let kar = bodyKar || '';

    // Minimális validáció
    if (!cím || !Array.isArray(hallgato_ids) || !hallgato_ids.length ||
        !Array.isArray(temavezeto_ids) || !temavezeto_ids.length) {
      return res.status(400).json({ error: 'Hiányzó adatok az új dolgozathoz.' });
    }

    // 🔹 Ha a frontend nem küldött kart, próbáljuk meg kideríteni az első hallgató alapján
    if (!kar && hallgato_ids.length > 0) {
      const elsoHallgato = await Felhasznalo.findOne({ neptun: hallgato_ids[0] }).lean();
      if (elsoHallgato && elsoHallgato.kar) {
        kar = elsoHallgato.kar; // pl. GIVK, KGGK
      }
    }

    const dolgozat = new Dolgozat({
      cím,
      hallgato_ids,
      temavezeto_ids,
      leiras,
      allapot: 'jelentkezett',
      kar
    });

    await dolgozat.save();
    res.status(201).json(dolgozat);
  } catch (error) {
    console.error('Hiba történt a dolgozat hozzáadásakor:', error);
    res.status(500).json({ error: 'Hiba történt a dolgozat hozzáadásakor' });
  }
});




// Dolgozat módosítása
app.put('/api/dolgozatok/:id', async (req, res) => {
  const { id } = req.params;
  const { cím, hallgato_ids, temavezeto_ids, elutasitas_oka } = req.body;

  try {
    const updateData = {
      cím,
      hallgato_ids,
      temavezeto_ids,
      elutasitas_oka
    };

    // 🔹 Ha kapunk hallgato_ids tömböt, frissítjük a kar-t is az első hallgató alapján
    if (Array.isArray(hallgato_ids) && hallgato_ids.length > 0) {
      const elsoHallgato = await Felhasznalo.findOne({ neptun: hallgato_ids[0] }).lean();
      updateData.kar = elsoHallgato?.kar || '';
    }

    const updatedDolgozat = await Dolgozat.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updatedDolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található' });
    }
    res.json(updatedDolgozat);
  } catch (error) {
    console.error('Hiba történt a dolgozat módosítása során', error);
    res.status(500).json({ error: 'Hiba történt a dolgozat módosítása során' });
  }
});


// Dolgozat törlése
app.delete('/api/dolgozatok/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const deletedDolgozat = await Dolgozat.findByIdAndDelete(id);
        if (!deletedDolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }
        res.json({ message: 'Dolgozat törölve' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat törlése során' });
    }
});

// Dolgozat státusz frissítése
app.put('/api/dolgozatok/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { allapot } = req.body;

        if (!allapot) {
            return res.status(400).json({ error: 'Hiányzik az új állapot.' });
        }

        // Engedélyezett státuszok
        const allowedStatuses = [
        'jelentkezett',
        'feltöltve',
        'feltöltve - témavezető válaszára vár',
        'nem nyilatkozott még',
        'elfogadva',
        'elutasítva',
        'bírálat alatt',
        'értékelve',
        'zsűrizésre kész'
        ];


        if (!allowedStatuses.includes(allapot)) {
            return res.status(400).json({ error: 'Érvénytelen állapot.' });
        }

        const updatedDolgozat = await Dolgozat.findByIdAndUpdate(
            id,
            { allapot },
            { new: true }
        );

        if (!updatedDolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található.' });
        }

        res.json(updatedDolgozat);
    } catch (error) {
        console.error('Hiba a státusz frissítésekor:', error);
        res.status(500).json({ error: 'Szerverhiba a státusz frissítésekor' });
    }
});


// Felhasználó CRUD műveletek

// Új felhasználó hozzáadása
app.post('/api/felhasznalok', async (req, res) => {
    const { nev, neptun, email, jelszo, kar, csoportok, szak, evfolyam } = req.body;

    if (!nev || !email || !Array.isArray(csoportok)) {
        return res.status(400).json({ error: 'Hiányzó adatok' });
    }

    try {
        const ujFelhasznalo = {
            nev,
            neptun,
            email,
            jelszo,
            kar,
            csoportok,
            szak,
            evfolyam
        };

        if (jelszo && jelszo.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            ujFelhasznalo.jelszo = await bcrypt.hash(jelszo, salt);
        }

        const ujFelhasznaloMentett = new Felhasznalo(ujFelhasznalo);
        await ujFelhasznaloMentett.save();
        res.status(201).json(ujFelhasznaloMentett);
    } catch (err) {
        if (err.code === 11000 && err.keyPattern?.email) {
            return res.status(400).json({ error: 'Ez az e-mail cím már létezik a rendszerben.' });
        }
        console.error('Hiba a felhasználó létrehozásakor:', err);
        res.status(500).json({ error: 'Szerverhiba a felhasználó létrehozásakor' });
    }
});


app.get('/api/felhasznalok/csoportok', async (req, res) => {
    try {
        const hallgatok = await Felhasznalo.find({ csoportok: { $in: ['hallgato'] } });
        const temavezetok = await Felhasznalo.find({ csoportok: { $in: ['temavezeto'] } });

        res.json({ hallgatok, temavezetok });
    } catch (error) {
        console.error('Hiba történt a csoportok szerinti felhasználók lekérésekor:', error);
        res.status(500).json({ error: 'Hiba történt a felhasználók lekérésekor' });
    }
});



// Felhasználók listázása
app.get('/api/felhasznalok', async (req, res) => {
    try {
        const felhasznalok = await Felhasznalo.find(); // Már a "felhasznalos" gyűjteményt használja
        res.json(felhasznalok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználók lekérésekor' });
    }
});

// Felhasználó módosítása
app.put('/api/felhasznalok/:id', async (req, res) => {
    const { id } = req.params;
    const { nev, neptun, email, csoportok, kar, szak, evfolyam } = req.body;


    try {
        const updatedFelhasznalo = await Felhasznalo.findByIdAndUpdate(
    id,
    { nev, neptun, email, csoportok, kar, szak, evfolyam },
    { new: true }
);


        if (!updatedFelhasznalo) {
            return res.status(404).json({ error: 'Felhasználó nem található' });
        }
        res.json(updatedFelhasznalo);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználó módosítása során' });
    }
});

// Felhasználó törlése
app.delete('/api/felhasznalok/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const felhasznalo = await Felhasznalo.findByIdAndDelete(id);
        if (!felhasznalo) {
            return res.status(404).json({ error: 'Felhasználó nem található' });
        }

        // Dolgozatok frissítése, ha hallgató vagy témavezető volt
     await Dolgozat.updateMany(
    { hallgato_ids: felhasznalo.neptun },
    { $pull: { hallgato_ids: felhasznalo.neptun } }
);

    await Dolgozat.updateMany(
    { temavezeto_ids: felhasznalo.neptun },
    { $pull: { temavezeto_ids: felhasznalo.neptun } }
);

        res.json({ message: 'Felhasználó sikeresen törölve' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználó törlése során' });
    }
});

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Hiányzó token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Érvénytelen token' });
  }
};

app.get('/api/felhasznalok/jelenlegi', authMiddleware, async (req, res) => {
  try {
    const felhasznalo = await Felhasznalo.findById(req.user.id).lean();
    if (!felhasznalo) {
      return res.status(404).json({ error: 'Felhasználó nem található' });
    }

    res.json({
      id: felhasznalo._id,
      nev: felhasznalo.nev,
      neptun: felhasznalo.neptun || '',
      email: felhasznalo.email,
      csoportok: felhasznalo.csoportok || [],
      kar: felhasznalo.kar || ''

    });
  } catch (err) {
    console.error('Hiba a jelenlegi felhasználó lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});




// Fájl feltöltése és értesítés küldése a témavezetőnek
app.post('/api/dolgozatok/feltoltes/:id', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const alapertelmezettEmail = 'mayer.mate@outlook.com';

  if (!req.file) {
    return res.status(400).json({ error: 'Fájl nem lett kiválasztva!' });
  }

  try {
    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található' });
    }

    // 🔹 HATÁRIDŐ ELLENŐRZÉS – ide való az await!
    const hataridoLejart = await isUploadDeadlineExpiredForDolgozat(dolgozat);
    if (hataridoLejart) {
      return res.status(400).json({
        error: 'A dolgozat feltöltési határideje lejárt ezen a karon. További módosítás nem engedélyezett.'
      });
    }

    if (dolgozat.allapot !== 'jelentkezett') {
      return res.status(400).json({ error: 'Csak jelentkezett állapotú dolgozathoz tölthető fel fájl.' });
    }

    dolgozat.filePath = `/uploads/${req.file.filename}`;
    dolgozat.allapot = 'feltöltve - témavezető válaszára vár';
    await dolgozat.save();

    const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_ids[0] });
    const emailCim = temavezeto ? temavezeto.email : alapertelmezettEmail;

    await kuldErtesitesTemavezetonek(emailCim, dolgozat);

    res.status(200).json({
      message: 'Fájl sikeresen feltöltve, a témavezető értesítve lett.',
      filePath: dolgozat.filePath
    });
  } catch (error) {
    console.error('Hiba történt a fájl mentése során:', error);
    res.status(500).json({ error: 'Hiba történt a fájl mentésekor' });
  }
});





// Értékelés mentése
app.post('/api/papers/:id/ertekeles', async (req, res) => {
  const { id } = req.params;
  const ertekeles = req.body;

  try {
    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) return res.status(404).send('Dolgozat nem található');

    dolgozat.ertekeles = ertekeles;
    await dolgozat.save();

    res.json({ message: 'Értékelés elmentve', dolgozat });
  } catch (err) {
    console.error('Hiba az értékelés mentésekor:', err);
    res.status(500).json({ error: 'Szerver hiba' });
  }
});


// Értékelés lekérdezése (megtekintéshez)

app.get('/api/papers/:id/ertekeles', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.warn('Érvénytelen dolgozat ID:', id);
      return res.status(400).json({ error: 'Érvénytelen dolgozat ID' });
    }

    const dolgozat = await Dolgozat.findById(id);

    if (!dolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található' });
    }

    res.json(dolgozat.ertekeles || {});
  } catch (err) {
    console.error('Hiba az értékelés lekérdezésekor:', err);
    res.status(500).json({ error: 'Szerver hiba' });
  }
});





  // Csak a kész (feltölthető) dolgozatok lekérdezése
app.get('/api/dolgozatok/kesz', async (req, res) => {
    try {
        const keszDolgozatok = await Dolgozat.find({
            allapot: { $in: ['jelentkezett', 'elfogadva', 'feltöltve - témavezető válaszára vár'] }
        });
        res.json(keszDolgozatok);
    } catch (error) {
        console.error('Hiba a kész dolgozatok lekérésekor:', error);
        res.status(500).json({ error: 'Hiba történt a kész dolgozatok lekérésekor' });
    }
});

// Értékelés fájl feltöltése és értesítések küldése a hallgatónak és témavezetőnek
app.post('/api/dolgozatok/ertekeles-feltoltes/:id', upload.single('file'), async (req, res) => {
    const { id } = req.params;
    const { pontszam } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'Fájl nem lett kiválasztva!' });
    }

    try {
        const dolgozat = await Dolgozat.findById(id);
        if (!dolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }

        dolgozat.ertekelesFilePath = `/uploads/${req.file.filename}`;
        dolgozat.pontszam = pontszam;
        dolgozat.allapot = 'értékelve';
        await dolgozat.save();

        const hallgato = await Felhasznalo.findOne({ neptun: dolgozat.hallgato_ids[0] });
        const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_ids[0] });

        if (hallgato && hallgato.email) {
            await kuldErtesitesHallgatonakEsTemavezetonek(hallgato.email, dolgozat, "hallgató");
        }
        if (temavezeto && temavezeto.email) {
            await kuldErtesitesHallgatonakEsTemavezetonek(temavezeto.email, dolgozat, "témavezető");
        }

        res.status(200).json({ message: 'Értékelés sikeresen feltöltve és értesítések elküldve.', filePath: dolgozat.ertekelesFilePath });
    } catch (error) {
        console.error('Hiba történt az értékelés mentése során:', error);
        res.status(500).json({ error: 'Hiba történt az értékelés mentése során' });
    }
});

app.put('/api/dolgozatok/:id/temavezeto-nyilatkozat', async (req, res) => {
  try {
    const { id } = req.params;
    const { dontes, elutasitas_oka } = req.body;

    if (!['elfogadva', 'elutasítva'].includes(dontes)) {
      return res.status(400).json({ error: 'Érvénytelen döntés. Csak elfogadás vagy elutasítás lehetséges.' });
    }

    const updateData = { 
      allapot: dontes === 'elfogadva' 
        ? 'elfogadva - témavezető által' 
        : 'elutasítva - témavezető által'
    };

    if (dontes === 'elutasítva' && elutasitas_oka) {
      updateData.elutasitas_oka = elutasitas_oka;
    }

    const updatedDolgozat = await Dolgozat.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedDolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található.' });
    }

    // 🔔 Értesítés a hallgatónak
    const hallgato = await Felhasznalo.findOne({ neptun: updatedDolgozat.hallgato_ids[0] });

    if (hallgato && hallgato.email) {
      const sablon = dontes === 'elfogadva'
        ? 'temavezeto_elfogadas.txt'
        : 'temavezeto_elutasitas.txt';

      const szoveg = betoltEmailSablon(sablon, {
        HALLGATONEV: hallgato.nev,
        CIM: updatedDolgozat.cím,
        INDOKLAS: updateData.elutasitas_oka || 'Nincs megadva.'
      });

      await transporter.sendMail({
        from: 'TDK rendszer <m48625729@gmail.com>',
        to: hallgato.email,
        subject: 'Témavezetői döntés a dolgozatodról',
        text: szoveg
      });
    }

    res.json(updatedDolgozat);
  } catch (error) {
    console.error('Hiba a témavezető nyilatkozat frissítésekor:', error);
    res.status(500).json({ error: 'Szerverhiba a nyilatkozat frissítésekor' });
  }
});


// Értesítés küldése a hallgatónak és a témavezetőnek az értékelésről
async function kuldErtesitesHallgatonakEsTemavezetonek(cimzettEmail, dolgozat, szerep) {
    const mailOptions = {
        from: 'm48625729@gmail.com',
        to: cimzettEmail,
        subject: 'Dolgozat értékelése befejeződött',
        text: betoltEmailSablon('ertesites_ertekelesrol.txt', {
            cim: dolgozat.cím,
            pontszam: dolgozat.pontszam,
            szerep
        }) 
    };       

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Értesítés sikeresen elküldve a ${szerep} e-mail címére: ${cimzettEmail}`);
    } catch (error) {
        console.error(`Hiba történt az értesítés küldésekor a ${szerep} számára:`, error);
    }
}

// 🔹 Regisztráció
app.post('/api/regisztracio', async (req, res) => {
    try {
        const { nev, neptun, email, jelszo } = req.body;

        if (!nev || !email || !jelszo) {
            return res.status(400).json({ error: 'Minden kötelező mezőt ki kell tölteni!' });
        }

        const letezo = await Felhasznalo.findOne({ email });
        if (letezo) {
            return res.status(400).json({ error: 'Ez az e-mail cím már létezik.' });
        }

        const hash = await bcrypt.hash(jelszo, 10);
        const ujFelhasznalo = new Felhasznalo({
            nev,
            neptun,
            email,
            jelszo: hash,
            csoportok: ['hallgato']
        });

        await ujFelhasznalo.save();

        const token = jwt.sign({ id: ujFelhasznalo._id }, secretKey, { expiresIn: '2h' });
        res.status(201).json({ token, felhasznalo: ujFelhasznalo });

    } catch (err) {
        console.error('Regisztrációs hiba:', err);
        res.status(500).json({ error: 'Szerverhiba' });
    }
});

app.get('/api/dolgozatok/ertekeleshez', async (req, res) => {
    try {
        const dolgozatok = await Dolgozat.find({
            allapot: { $in: ['feltöltve', 'értékelve','elfogadva - témavezető által'] }
        });
        res.json(dolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt az értékelhető dolgozatok lekérésekor' });
    }
});

app.post('/api/ertekelesek', async (req, res) => {
    try {
        const ujErtekeles = new ErtekelesModel(req.body);
        await ujErtekeles.save();
        res.status(201).send({ message: 'Értékelés elmentve' });
    } catch (error) {
        console.error('Hiba az értékelés mentésénél:', error);
        res.status(500).send({ error: 'Hiba történt az értékelés mentésekor.' });
    }
});


// Egy dolgozat lekérése ID alapján (bíráló névvel együtt)
app.get('/api/papers/:id', async (req, res) => {
  try {
    const paper = await mongoose.connection.collection('dolgozats').findOne({
      _id: new mongoose.Types.ObjectId(req.params.id)
    });

    if (!paper) {
      return res.status(404).json({ error: 'A dolgozat nem található.' });
    }

    // Felhasználók lekérdezése (hallgatók, témavezetők, bírálók)
    const felhasznalok = await mongoose.connection.collection('felhasznalos').find({}).toArray();

    // Hallgatók adatai
    const szerzok = (paper.hallgato_ids || []).map(neptun => {
      const felhasznalo = felhasznalok.find(f => f.neptun === neptun);
      return {
        nev: felhasznalo?.nev || '',
        szak: felhasznalo?.szak || '',
        evfolyam: felhasznalo?.evfolyam || ''
      };
    });

    // 🔹 Bíráló adatai (ha van a dokumentumban biralo_ids mező)
    let biraloNev = '';
    if (paper.biralo_ids && paper.biralo_ids.length > 0) {
      const biralo = felhasznalok.find(f => f.neptun === paper.biralo_ids[0]);
      biraloNev = biralo?.nev || '';
    }

    res.json({
      cim: paper["cím"],
      szerzok,
      biralo: biraloNev
    });
  } catch (err) {
    console.error('Hiba a dolgozat lekérdezésekor:', err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});





// 🔹 Dolgozatok lekérése, szekciókhoz és listákhoz is használható formátumban
app.get('/api/papers', async (req, res) => {
  try {
    const dolgozatok = await Dolgozat.find()
      .sort({ szekcioId: 1, sorszam: 1, _id: 1 })
      .lean();

    const felhasznalok = await Felhasznalo.find().lean();

    const felhasznaloMapNeptun = {};
    const felhasznaloMapId = {};

    felhasznalok.forEach(f => {
      if (f.neptun) {
        felhasznaloMapNeptun[f.neptun] = f;
      }
      felhasznaloMapId[String(f._id)] = f;
    });

    const eredmeny = dolgozatok.map(d => {
      // 🔹 Kar kinyerése – ha nincs a dolgozatban, vegyük az első hallgató karját
      let kar = d.kar || '';
      if (!kar && Array.isArray(d.hallgato_ids) && d.hallgato_ids.length > 0) {
        const elsoNeptun = d.hallgato_ids[0];
        const hallgato = felhasznaloMapNeptun[elsoNeptun];
        if (hallgato && hallgato.kar) {
          kar = hallgato.kar;  // lehet rövidítés vagy teljes név, a faculties.js mindkettőt kezeli
        }
      }

      return {
        _id: d._id,
        cim: d.cím || d.cim || 'Névtelen dolgozat',
        allapot: d.allapot || 'ismeretlen',
        leiras: d.leiras || '',
        szekcioId: d.szekcioId ? String(d.szekcioId) : null,
        kar,                                // ⬅️ itt már a kiszámolt értéket adjuk vissza
        ertekeles: d.ertekeles || {},

        szerzok: (d.hallgato_ids || []).map(neptun => {
          const f = felhasznaloMapNeptun[neptun] || {};
          return {
            nev: f.nev || 'Ismeretlen hallgató',
            neptun,
            szak: f.szak || '',
            evfolyam: f.evfolyam || ''
          };
        }),

        temavezeto: (d.temavezeto_ids || []).map(neptun => {
          const f = felhasznaloMapNeptun[neptun] || {};
          return {
            nev: f.nev || 'Ismeretlen témavezető',
            neptun,
            kar: f.kar || ''
          };
        }),

        biralok: (d.biralok || []).map(b => {
          const f = felhasznaloMapId[String(b.felhasznaloId)] || {};
          return {
            id: String(b.felhasznaloId),
            nev: f.nev || 'Ismeretlen bíráló',
            email: f.email || '',
            allapot: b.allapot || 'Felkérve'
          };
        })
      };
    });

    res.json(eredmeny);
  } catch (error) {
    console.error('❌ Hiba a dolgozatok lekérésekor (/api/papers):', error);
    res.status(500).json({ error: 'Szerverhiba a dolgozatok lekérésekor' });
  }
});





//Jelszó visszaállítás e-mail küldés tokennel
app.post('/api/reset-jelszo-kerelem', async (req, res) => {
    const { email } = req.body;

    const felhasznalo = await Felhasznalo.findOne({ email });
    if (!felhasznalo) {
        return res.status(200).json({ message: 'Ha létezik ilyen fiók, küldtünk emailt.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    resetTokens[token] = felhasznalo._id;

    const resetLink = `http://localhost:3000/reset.html?token=${token}`;

    try {
        transporter.sendMail({
            from: 'TDK rendszer <m48625729@gmail.com>',
            to: email,
            subject: 'Jelszó visszaállítás',
            text: betoltEmailSablon('jelszo_visszaallit.txt', {
                link: resetLink
            })
        });          

        res.status(200).json({ message: 'Email elküldve, ha a fiók létezik.' });
    } catch (error) {
        console.error('Hiba az e-mail küldés során:', error);
        res.status(500).json({ error: 'Nem sikerült e-mailt küldeni.' });
    }
});


// 🔹 Témaajánlók kezeléséhez új Mongoose modell
const TemaJavaslat = mongoose.model('temajavaslat', new mongoose.Schema({
  cim: { type: String, required: true },
  osszefoglalo: { type: String, required: true },
  temavezetoNev: { type: String, required: true },
  temavezetoNeptun: { type: String, required: false },
  kar: { type: String, required: false },
  tanszek: { type: String, required: false }
}));


// 🔹 Témaajánlatok lekérése
app.get('/api/topics', async (req, res) => {
  try {
    const topics = await TemaJavaslat.find();
    res.json(topics);
  } catch (err) {
    console.error('Hiba a témák lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a témák lekérésekor' });
  }
});

// 🔹 Új témajavaslat mentése
app.post('/api/topics', async (req, res) => {
  const { cim, osszefoglalo, temavezetoNev, temavezetoNeptun, kar, tanszek } = req.body;

  try {
    const ujTema = new TemaJavaslat({
      cim,
      osszefoglalo,
      temavezetoNev,
      temavezetoNeptun,
      kar,
      tanszek
    });

    await ujTema.save();
    res.status(201).json({ message: 'Téma sikeresen mentve', tema: ujTema });
  } catch (err) {
    console.error('Hiba téma mentésekor:', err);
    res.status(500).json({ error: 'Hiba téma mentésekor' });
  }
});


// 🔹 Téma törlése
app.delete('/api/topics/:id', async (req, res) => {
  try {
    const result = await TemaJavaslat.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Téma nem található' });
    res.json({ message: 'Téma törölve' });
  } catch (err) {
    console.error('Hiba téma törlésekor:', err);
    res.status(500).json({ error: 'Hiba téma törlésekor' });
  }
});

// 🔹 Témavezetők listázása (MongoDB-ből)
app.get('/api/temavezetok', async (req, res) => {
  try {
    const temavezetok = await Felhasznalo.find({ csoportok: { $in: ['temavezeto'] } })
  .select('nev neptun email kar tanszek');
    res.json(temavezetok);
  } catch (err) {
    console.error('Hiba a témavezetők lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a témavezetők lekérésekor' });
  }
});


// Hallgató(k) jelentkezése egy témajavaslatra
app.post('/api/topics/:id/jelentkezes', async (req, res) => {
  const { id } = req.params;
  const { hallgato_ids } = req.body; // Több hallgató jelentkezhet

  try {
    const topic = await TemaJavaslat.findById(id);
    if (!topic) return res.status(404).json({ error: 'Téma nem található' });

    // 🔹 Kar meghatározása az első hallgató alapján
    let kar = '';
    if (Array.isArray(hallgato_ids) && hallgato_ids.length > 0) {
      const elsoHallgato = await Felhasznalo.findOne({ neptun: hallgato_ids[0] }).lean();
      if (elsoHallgato && elsoHallgato.kar) {
        kar = elsoHallgato.kar;
      }
    }

    const newDolgozat = new Dolgozat({
      cím: topic.cim,
      leiras: topic.osszefoglalo,
      hallgato_ids: hallgato_ids || [],
      temavezeto_ids: [topic.temavezetoNeptun],
      allapot: 'jelentkezett',
      kar
    });

    await newDolgozat.save();
    res.status(201).json({ message: 'Jelentkezés sikeres, a dolgozat létrehozva.', dolgozat: newDolgozat });
  } catch (err) {
    console.error('Hiba a jelentkezés során:', err);
    res.status(500).json({ error: 'Szerverhiba a jelentkezés mentésekor' });
  }
});



// 🔹 Téma módosítása
app.put('/api/topics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cim, temavezetoNev, tanszek, kar, osszefoglalo } = req.body;

    const updatedTopic = await TemaJavaslat.findByIdAndUpdate(
      id,
      { cim, temavezetoNev, tanszek, kar, osszefoglalo },
      { new: true }
    );

    if (!updatedTopic) {
      return res.status(404).json({ error: 'Téma nem található' });
    }

    res.json({ message: 'Téma sikeresen módosítva', tema: updatedTopic });
  } catch (err) {
    console.error('Hiba a téma módosításakor:', err);
    res.status(500).json({ error: 'Szerverhiba a módosítás során' });
  }
});





//Új jelszó mentése token alapján
app.post('/api/reset-jelszo', async (req, res) => {
    const { token, jelszo } = req.body;
    const felhasznaloId = resetTokens[token];
  
    if (!felhasznaloId) {
      return res.status(400).json({ error: "Érvénytelen vagy lejárt link." });
    }
  
    try {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(jelszo, salt);
  
      await Felhasznalo.findByIdAndUpdate(felhasznaloId, { jelszo: hash });
      delete resetTokens[token];
  
      res.status(200).json({ message: "Jelszó frissítve." });
    } catch (err) {
      console.error("Hiba jelszó módosítás során:", err);
      res.status(500).json({ error: "Szerverhiba." });
    }
  });


  // token generálás és e-mail küldés a regisztrációhoz
  const regisztraciosTokenek = {}; // vagy külön adatbázisba is lehet

app.post('/api/emailes-regisztracio', async (req, res) => {
    const { email } = req.body;

    const letezo = await Felhasznalo.findOne({ email });
    if (letezo) {
        return res.status(400).json({ error: 'Ez az e-mail cím már regisztrálva van.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    regisztraciosTokenek[token] = email;

    const link = `http://localhost:3000/complete-registration.html?token=${token}`;

    transporter.sendMail({
        from: 'TDK rendszer <m48625729@gmail.com>',
        to: email,
        subject: 'TDK Regisztráció',
        text: betoltEmailSablon('regisztracio_megerosites.txt', {
            link
        })
    });       

    res.status(200).json({ message: 'Regisztrációs link elküldve.' });
});


//regisztráció
app.get('/api/regisztracios-email', (req, res) => {
    const { token } = req.query;
    const email = regisztraciosTokenek[token];

    if (!email) {
        return res.status(400).json({ error: 'Érvénytelen vagy lejárt link.' });
    }

    res.status(200).json({ email });
});

app.post('/api/regisztracio-befejezes', async (req, res) => {
    const { token, nev, jelszo, neptun, kar } = req.body;
    const email = regisztraciosTokenek[token];

    if (!email) {
        return res.status(400).json({ error: 'Érvénytelen vagy lejárt link.' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(jelszo, salt);

        const ujFelhasznalo = new Felhasznalo({
            nev,
            email,
            neptun: neptun || "",      // opcionális
            kar: kar || "",            // opcionális
            jelszo: hash,
            csoportok: ['hallgato']
        });

        await ujFelhasznalo.save();
        delete regisztraciosTokenek[token];

        res.status(201).json({ message: 'Regisztráció sikeres' });
    } catch (err) {
        console.error("Hiba regisztrációnál:", err);
        res.status(500).json({ error: 'Szerverhiba' });
    }
});



// Egy adott dolgozat részleteinek lekérdezése ID alapján
app.get('/api/dolgozatok/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const dolgozat = await Dolgozat.findById(id);
        if (!dolgozat) return res.status(404).json({ error: 'Dolgozat nem található' });

        // Hallgató és témavezető nevének kinyerése
        const hallgato = await Felhasznalo.findOne({ neptun: dolgozat.hallgato_ids[0] });
        const hallgatoNev = hallgato ? hallgato.nev : 'Ismeretlen';

        res.json({
            cim: dolgozat.cím,
            hallgato_nev: hallgatoNev,
            neptun: dolgozat.hallgato_ids[0],
            fileUrl: dolgozat.filePath
        });
    } catch (err) {
        console.error('Hiba a dolgozat lekérdezésekor:', err);
        res.status(500).json({ error: 'Szerverhiba' });
    }
});



//Statisztikai lekérdezések

// 1. Összes dolgozat kilistázása kapcsolt nevekkel
app.get('/api/stats/dolgozatok', async (req, res) => {
  try {
    const dolgozatok = await Dolgozat.find();
    const felhasznalok = await Felhasznalo.find();

    const felhasznaloMap = {};
    felhasznalok.forEach(f => felhasznaloMap[f.neptun] = f.nev);

    const adat = dolgozatok.map(d => ({
      cím: d.cím,
      hallgatok: d.hallgato_ids.map(id => felhasznaloMap[id] || id),
      temavezeto: d.temavezeto_ids.map(id => felhasznaloMap[id] || id),
      allapot: d.allapot
    }));

    res.json(adat);
  } catch (e) {
    console.error('Hiba /api/stats/dolgozatok:', e);
    res.status(500).json({ error: 'Szerverhiba statisztikánál' });
  }
});

// 2. Dolgozatok száma minden hallgató és témavezető esetén
app.get('/api/stats/szemelyek', async (req, res) => {
    try {
      const felhasznalok = await Felhasznalo.find();
      const dolgozatok = await Dolgozat.find();
  
      const stat = felhasznalok.map(f => {
        const hallgatoDolgozatok = dolgozatok.filter(d => d.hallgato_ids.includes(f.neptun));
        const temaDolgozatok = dolgozatok.filter(d => d.temavezeto_ids.includes(f.neptun));
  
        const osszes = [...new Set([...hallgatoDolgozatok, ...temaDolgozatok])];
        const cimek = osszes.map(d => d.cím);
  
        const szerepkor = [];
        if (hallgatoDolgozatok.length > 0) szerepkor.push('hallgató');
        if (temaDolgozatok.length > 0) szerepkor.push('témavezető');
  
        return {
          nev: f.nev,
          neptun: f.neptun,
          szerep: szerepkor.join(', '),
          db: osszes.length,
          dolgozatCimek: cimek
        };
      }).filter(f => f.db > 0);
  
      res.json(stat);
    } catch (e) {
      console.error('Hiba /api/stats/szemelyek:', e);
      res.status(500).json({ error: 'Szerverhiba statisztikánál' });
    }
  });
  
const UniversityStructure = require('./models/universityStructure.js');

async function isUploadDeadlineExpiredForDolgozat(dolgozat) {
  try {
    if (!dolgozat || !dolgozat.kar) return false;

    const karDoc = await UniversityStructure.findOne({
      $or: [
        { rovidites: dolgozat.kar }, // pl. GIVK
        { nev: dolgozat.kar }        // ha valahol teljes név van tárolva
      ]
    }).lean();

    if (!karDoc || !karDoc.feltoltesHatarido) return false;

    const now = new Date(); // 🔹 szerver ideje!
    const hatarido = new Date(karDoc.feltoltesHatarido);

    return now.getTime() > hatarido.getTime(); // true = lejárt
  } catch (err) {
    console.error('Hiba a feltöltési határidő ellenőrzésekor:', err);
    // hiba esetén inkább ne tiltsunk (false), hogy ne bénuljon le a rendszer
    return false;
  }
}


// 🔹 Egyetemi struktúra lekérdezése
app.get('/api/university-structure', async (req, res) => {
  try {
    const strukturak = await UniversityStructure.find();
    res.json(strukturak);
  } catch (err) {
    console.error('Hiba a struktúra lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a struktúra lekérésekor' });
  }
});




app.get('/dolgozatok/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'review-thesis.html'));
});




const SectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  felev: { type: String, required: true },
  kar: { type: String },
  zsuri: [
    {
      felhasznaloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Felhasznalos' },
      szerep: { type: String, enum: ['elnok', 'titkar', 'zsuri'] },
      allapot: { type: String, enum: ['Elfogadás alatt', 'Elfogadva', 'Elutasítva'], default: 'Elfogadás alatt' }
    }
  ]
});


const Section = mongoose.model('Section', SectionSchema);

// -----------------------------
// Sections API végpontok
// -----------------------------

// Összes szekció lekérése
app.get('/api/sections', async (req, res) => {
  try {
    const karok = await UniversityStructure.find({}).lean();  // karok: [{ nev, rovidites }]
    const sections = await Section.find()
  .populate('zsuri.felhasznaloId') // Minden zsűritaghoz tölti be a felhasználót
  .lean();


    // A rövidítések alapján megkeressük a teljes nevet
    const enrichedSections = sections.map(section => {
      const karObj = karok.find(k => k.rovidites === section.kar);
      return {
        ...section,
        kar: karObj ? karObj.nev : section.kar || '-'  // teljes név vagy fallback
      };
    });

    res.json(enrichedSections);
  } catch (err) {
    console.error('Hiba a szekciók lekérdezésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a lekérdezésnél' });
  }
});



// Új szekció létrehozása
app.post('/api/sections', async (req, res) => {
  const { name, kar, elnokId, titkarId, zsuriTagIds } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'A szekció neve kötelező' });
  }

  try {
    const setting = await mongoose.connection.collection('settings').findOne({ _id: 'aktualis-felev' });
    const felev = setting?.ertek || 'Ismeretlen';

    const sectionData = {
      name: name.trim(),
      felev,
      kar: kar || '',
      elnokId: elnokId || null,
      titkarId: titkarId || null,
      zsuriIds: zsuriTagIds || []
    };

    const result = await mongoose.connection.collection('sections').insertOne(sectionData);

    res.status(201).json({ message: 'Szekció létrehozva', id: result.insertedId });
  } catch (err) {
    console.error('Hiba a szekció létrehozásakor:', err);
    res.status(500).json({ error: 'Szerverhiba a létrehozás során' });
  }
});




// Szekció nevének módosítása
app.put('/api/sections/:id', async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'A név nem lehet üres' });
  }

  try {
    await mongoose.connection.collection('sections').updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { name: name.trim() } }
    );
    res.json({ message: 'Szekció frissítve' });
  } catch (err) {
    console.error('Hiba a szekció módosításakor:', err);
    res.status(500).json({ error: 'Szerverhiba a módosítás során' });
  }
});

// Szekció törlése
app.delete('/api/sections/:id', async (req, res) => {
  try {
    await mongoose.connection.collection('sections').deleteOne({
      _id: new mongoose.Types.ObjectId(req.params.id)
    });
    res.json({ message: 'Szekció törölve' });
  } catch (err) {
    console.error('Hiba a szekció törlésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a törlés során' });
  }
});

// Egy szekcióhoz dolgozatokat rendel
app.post('/api/sections/:id/add-papers', async (req, res) => {
  const sectionId = req.params.id;
  const paperIds = req.body.paperIds; // Tömb: [id1, id2, id3]

  try {
    const objectIds = paperIds.map(id => new mongoose.Types.ObjectId(id));

    await mongoose.connection.collection('dolgozats').updateMany(
      { _id: { $in: objectIds } },
      { $set: { szekcioId: new mongoose.Types.ObjectId(sectionId) } }
    );

    res.json({ message: 'Dolgozatok sikeresen hozzárendelve a szekcióhoz.' });
  } catch (err) {
    console.error('Hiba a dolgozatok szekcióhoz rendelésekor:', err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});


const SzekcioSchema = new mongoose.Schema({
  name: String,
  felev: String
});


//Aktuális félév
const SettingSchema = new mongoose.Schema({
  _id: String,
  ertek: String
});

const Setting = mongoose.model('Setting', SettingSchema);

// GET aktuális félév
app.get('/api/settings/current-semester', async (req, res) => {
  const setting = await Setting.findById('aktualis-felev');
  if (setting) {
    res.json({ ertek: setting.ertek });
  } else {
    res.json({ ertek: 'Nincs beállítva' });
  }
});

// PUT új félév beállítása
app.put('/api/settings/current-semester', async (req, res) => {
  const { ertek } = req.body;
  if (!ertek) return res.status(400).json({ error: 'Hiányzó érték' });

  const updated = await Setting.findByIdAndUpdate(
    'aktualis-felev',
    { ertek },
    { upsert: true, new: true }
  );
  res.json({ message: 'Félév frissítve', updated });
});

//aktuális félév szekció.
app.post('/api/szekciok', async (req, res) => {
  try {
    const current = await Setting.findById('aktualis-felev');
    const felev = current ? current.ertek : 'Ismeretlen';

    const ujSzekcio = new Szekcio({
      name: req.body.name,
      felev: felev
    });
    await ujSzekcio.save();

    res.json({ message: 'Szekció hozzáadva', szekcio: ujSzekcio });
  } catch (err) {
    console.error('Hiba szekció mentéskor:', err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});



// Feltételezve, hogy a karokat a UniversityStructure kollekcióban tárolod

const universityStructureSchema = new mongoose.Schema({
  nev: String,
  rovidites: String,
  feltoltesHatarido: { type: Date, default: null }

});

app.get('/api/karok', async (req, res) => {
  try {
    const karok = await UniversityStructure.find({});
    res.json(karok);
  } catch (err) {
    res.status(500).json({ error: 'Hiba a karok lekérdezésekor' });
  }
});

// 🔹 Karhoz tartozó dolgozat-feltöltési határidő mentése
app.put('/api/karok/:id/hatarido', async (req, res) => {
  try {
    const { id } = req.params;
    const { hatarido } = req.body;

    if (!hatarido) {
      return res.status(400).json({ error: 'Hiányzik a határidő.' });
    }

    const updated = await UniversityStructure.findByIdAndUpdate(
      id,
      { feltoltesHatarido: new Date(hatarido) },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Kar nem található.' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Hiba a határidő mentésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a határidő mentésekor.' });
  }
});


// ✅ Dolgozat eltávolítása szekcióból
app.put('/api/dolgozatok/:id/remove-from-section', async (req, res) => {
  try {
    const { id } = req.params;
    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található' });
    }

    dolgozat.szekcioId = null;
    await dolgozat.save();

    res.json({ message: 'Dolgozat eltávolítva a szekcióból' });
  } catch (err) {
    console.error('Hiba a dolgozat szekcióból való eltávolításakor:', err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});


// Zsűritag / elnök / titkár hozzáadása egy szekcióhoz
app.post('/api/sections/:id/add-judge', async (req, res) => {
  try {
    const { id } = req.params;
    const { felhasznaloId, szerep } = req.body;

    if (!felhasznaloId || !szerep)
      return res.status(400).json({ error: 'Hiányzó adatok.' });

    const section = await Section.findById(id);
    if (!section) return res.status(404).json({ error: 'Szekció nem található.' });

    // Ha már létezik ugyanaz a szerep / személy
    const alreadyExists = section.zsuri.some(z => String(z.felhasznaloId) === String(felhasznaloId));
    if (alreadyExists) return res.status(400).json({ error: 'Ez a felhasználó már zsűritag ebben a szekcióban.' });

    section.zsuri.push({ felhasznaloId, szerep });
    await section.save();

    // Küldjünk e-mailt
    const felhasznalo = await Felhasznalo.findById(felhasznaloId);
    if (felhasznalo?.email) {
      const emailSzoveg = betoltEmailSablon('felkeres_zsuri.txt', {
        NEV: felhasznalo.nev,
        SZEREP: szerep,
        SZEKCIO: section.name,
        LINK_ELFOGADAS: `http://localhost:3000/accept-invite.html?section=${id}&user=${felhasznaloId}&action=accept`,
        LINK_ELUTASITAS: `http://localhost:3000/accept-invite.html?section=${id}&user=${felhasznaloId}&action=reject`
      });

      await transporter.sendMail({
        from: 'TDK rendszer <m48625729@gmail.com>',
        to: felhasznalo.email,
        subject: `TDK zsűri felkérés (${section.name})`,
        text: emailSzoveg
      });
    }

    res.json({ message: 'Zsűritag hozzáadva és e-mail elküldve.', section });
  } catch (err) {
    console.error('Hiba zsűri hozzáadásakor:', err);
    res.status(500).json({ error: 'Szerverhiba.' });
  }
});


//zsüri tag eltávlítás a szekciókból

app.delete('/api/sections/:sectionId/remove-judge/:userId', async (req, res) => {
  try {
    const { sectionId, userId } = req.params;
    const section = await Section.findById(sectionId);
    if (!section) return res.status(404).json({ error: 'Szekció nem található.' });

    section.zsuri = section.zsuri.filter(z => String(z.felhasznaloId) !== String(userId));
    await section.save();

    res.json({ message: 'Zsűritag eltávolítva.', section });
  } catch (err) {
    console.error('Hiba zsűritag eltávolításakor:', err);
    res.status(500).json({ error: 'Szerverhiba a zsűri törlésekor.' });
  }
});

//Elfogadás / Elutasítás link -  e-mail visszaigazolással
app.get('/api/sections/:sectionId/judge-response', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { userId, action } = req.query;

    const section = await Section.findById(sectionId);
    if (!section) return res.status(404).send('Szekció nem található.');

    const judge = section.zsuri.find(z => String(z.felhasznaloId) === String(userId));
    if (!judge) return res.status(404).send('Zsűritag nem található.');

    judge.allapot = action === 'accept' ? 'Elfogadva' : 'Elutasítva';
    await section.save();

    res.send(`Köszönjük, a felkérés ${judge.allapot.toLowerCase()} állapotba került.`);
  } catch (err) {
    res.status(500).send('Hiba a válasz feldolgozásakor.');
  }
});


// -------------------------------
// WORD feltöltés és főoldal frissítés (képekkel együtt)
// -------------------------------
const mammoth = require('mammoth');

app.post('/api/upload-homepage', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nem érkezett fájl.' });
    }

    const buffer = fs.readFileSync(req.file.path);

    // 🖼️ Képek beágyazása Base64 formátumban
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.inline(async (image) => {
  const imageBuffer = await image.read();
  const base64 = imageBuffer.toString("base64");
  const contentType = image.contentType;
  // 🖼️ adjunk hozzá inline style-t a képhez
  return {
    src: `data:${contentType};base64,${base64}`,
    alt: "Beágyazott kép",
    style: "max-width:80%;height:auto;display:block;margin:20px auto;border-radius:6px;"
  };
}),

      }
    );

    const outputPath = path.join(__dirname, 'public', 'homepage.html');

    // 💾 A konvertált HTML mentése
    fs.writeFileSync(outputPath, result.value, 'utf8');

    // 🧹 Opcionálisan: törölheted a feltöltött Word fájlt
    fs.unlinkSync(req.file.path);

    res.json({ message: 'Főoldal frissítve a Word dokumentum alapján (képekkel együtt).' });
  } catch (error) {
    console.error('Hiba a Word konvertálás során:', error);
    res.status(500).json({ error: 'Nem sikerült feldolgozni a Word dokumentumot.' });
  }
});

// -------------------------------
// Főoldal tartalmának betöltése (a legutóbb feltöltött Word alapján)
// -------------------------------
app.get('/api/homepage-content', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'homepage.html');

  if (!fs.existsSync(filePath)) {
    return res.send('<p>Még nem töltöttek fel Word dokumentumot a főoldalhoz.</p>');
  }

  const htmlContent = fs.readFileSync(filePath, 'utf8');
  res.send(htmlContent);
});


// Egy dolgozathoz tartozó fájlok listája
app.get('/api/dolgozatok/:id/files', async (req, res) => {
  try {
    const dolgozat = await Dolgozat.findById(req.params.id).lean();
    if (!dolgozat) return res.status(404).json({ error: 'Dolgozat nem található' });
    res.json(dolgozat.files || []);
  } catch (err) {
    console.error('Hiba a fájlok listázásakor:', err);
    res.status(500).json({ error: 'Szerverhiba a fájlok listázásakor' });
  }
});


// Több fájl feltöltése egy dolgozathoz

app.post('/api/dolgozatok/:id/files', upload.array('files'), async (req, res) => {
  const { id } = req.params;
  const alapertelmezettEmail = 'mayer.mate@outlook.com';

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nem érkezett fájl.' });
  }

  try {
    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található' });
    }

      // 🔹 HATÁRIDŐ ELLENŐRZÉS – szerver idő alapján
  const hataridoLejart = await isUploadDeadlineExpiredForDolgozat(dolgozat);
  if (hataridoLejart) {
    return res.status(400).json({
      error: 'A dolgozat feltöltési határideje lejárt ezen a karon. A feltöltés és módosítás már nem engedélyezett.'
    });
  }


    // megjegyezzük a régi állapotot, hogy csak egyszer küldjünk e-mailt
    const regiAllapot = dolgozat.allapot;

    if (!Array.isArray(dolgozat.files)) {
      dolgozat.files = [];
    }

    req.files.forEach(f => {
      dolgozat.files.push({
        originalName: f.originalname,
        fileName: f.filename,
        path: `/uploads/${f.filename}`,
        mimeType: f.mimetype,
        size: f.size
      });
    });

    // első PDF beállítása fő dolgozatnak
    const firstPdf = req.files.find(f => f.mimetype === 'application/pdf');
    if (firstPdf) {
      dolgozat.filePath = `/uploads/${firstPdf.filename}`;
      if (dolgozat.allapot === 'jelentkezett') {
        dolgozat.allapot = 'feltöltve - témavezető válaszára vár';
      }
    }

    await dolgozat.save();

    // 🔔 csak akkor küldünk e-mailt, ha most lépett át jelentkezett → feltöltve - témavezető válaszára vár
    if (
      regiAllapot === 'jelentkezett' &&
      dolgozat.allapot === 'feltöltve - témavezető válaszára vár'
    ) {
      const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_ids[0] });
      const emailCim = temavezeto ? temavezeto.email : alapertelmezettEmail;
      await kuldErtesitesTemavezetonek(emailCim, dolgozat);
    }

    res.json({ message: 'Fájl(ok) sikeresen feltöltve.', files: dolgozat.files });
  } catch (err) {
    console.error('Hiba több fájl feltöltésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a fájlok feltöltésekor' });
  }
});


// 🔹 Bírálók listázása (opcionálisan karszűréssel)
app.get('/api/biralok', async (req, res) => {
  try {
    const query = { csoportok: { $in: ['biralo'] } };

    if (req.query.kar && req.query.kar !== 'osszes') {
      query.kar = req.query.kar;
    }

    const biralok = await Felhasznalo.find(query)
      .select('nev email kar csoportok');

    res.json(biralok);
  } catch (err) {
    console.error('Hiba a bírálók lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a bírálók lekérésekor' });
  }
});


// 🔹 Bíráló hozzárendelése egy dolgozathoz
app.post('/api/dolgozatok/:id/add-reviewer', async (req, res) => {
  try {
    const { id } = req.params;
    const { felhasznaloId } = req.body;

    if (!felhasznaloId) {
      return res.status(400).json({ error: 'Hiányzik a felhasználó azonosítója.' });
    }

    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található.' });
    }

    dolgozat.biralok = dolgozat.biralok || [];

    // már bíráló?
    const already = dolgozat.biralok.some(
      b => String(b.felhasznaloId) === String(felhasznaloId)
    );
    if (already) {
      return res.status(400).json({ error: 'Ez a felhasználó már bíráló ennél a dolgozatnál.' });
    }

    dolgozat.biralok.push({ felhasznaloId, allapot: 'Felkérve' });
    await dolgozat.save();

    // e-mail a bírálónak
    const biralo = await Felhasznalo.findById(felhasznaloId);

    if (biralo?.email) {
      const emailSzoveg = betoltEmailSablon('felkeres_biralo.txt', {
  NEV: biralo.nev,
  DOLGOZATCIM: dolgozat.cím,
  LINK_ELFOGADAS: `http://localhost:3000/api/dolgozatok/${id}/reviewer-response?userId=${felhasznaloId}&action=accept`,
  LINK_ELUTASITAS: `http://localhost:3000/api/dolgozatok/${id}/reviewer-response?userId=${felhasznaloId}&action=reject`
});


      await transporter.sendMail({
        from: 'TDK rendszer <m48625729@gmail.com>',
        to: biralo.email,
        subject: 'TDK bírálói felkérés',
        text: emailSzoveg
      });
    }

    res.json({ message: 'Bíráló hozzáadva és e-mail elküldve.', dolgozat });
  } catch (err) {
    console.error('Hiba a bíráló hozzárendelésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a bíráló hozzárendelésekor.' });
  }
});


// 🔹 Bíráló eltávolítása egy dolgozatról
app.delete('/api/dolgozatok/:id/remove-reviewer/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) {
      return res.status(404).json({ error: 'Dolgozat nem található.' });
    }

    dolgozat.biralok = (dolgozat.biralok || []).filter(
      b => String(b.felhasznaloId) !== String(userId)
    );
    await dolgozat.save();

    res.json({ message: 'Bíráló eltávolítva.', dolgozat });
  } catch (err) {
    console.error('Hiba a bíráló eltávolításakor:', err);
    res.status(500).json({ error: 'Szerverhiba a bíráló eltávolításakor.' });
  }
});


// 🔹 Bírálói felkérés elfogadása / elutasítása
app.get('/api/dolgozatok/:paperId/reviewer-response', async (req, res) => {
  try {
    const { paperId } = req.params;
    const { userId, action } = req.query; // action: 'accept' | 'reject'

    const dolgozat = await Dolgozat.findById(paperId);
    if (!dolgozat) return res.status(404).send('Dolgozat nem található.');

    const biralo = (dolgozat.biralok || []).find(
      b => String(b.felhasznaloId) === String(userId)
    );
    if (!biralo) return res.status(404).send('Bíráló nem található ennél a dolgozatnál.');

    biralo.allapot = action === 'accept' ? 'Elfogadva' : 'Elutasítva';
    await dolgozat.save();

    res.send(`Köszönjük, a bírálói felkérés ${biralo.allapot.toLowerCase()} állapotba került.`);
  } catch (err) {
    console.error('Hiba a bírálói visszajelzésnél:', err);
    res.status(500).send('Szerverhiba a visszajelzés feldolgozásakor.');
  }
});



// Egyetlen fájl törlése egy dolgozatból
app.delete('/api/dolgozatok/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) return res.status(404).json({ error: 'Dolgozat nem található' });

       // 🔹 HATÁRIDŐ ELLENŐRZÉS
    const hataridoLejart = await isUploadDeadlineExpiredForDolgozat(dolgozat);
    if (hataridoLejart) {
      return res.status(400).json({
        error: 'A dolgozat feltöltési határideje lejárt ezen a karon. A fájlok már nem módosíthatók.'
      });
    }

    const index = (dolgozat.files || []).findIndex(f => String(f._id) === String(fileId));
    if (index === -1) return res.status(404).json({ error: 'Fájl nem található' });

    const file = dolgozat.files[index];

    // fájl törlése a tömbből
    dolgozat.files.splice(index, 1);

    // ha ez volt a fő pdf, töröld a filePath-et is
    if (dolgozat.filePath === file.path) {
      dolgozat.filePath = undefined;
    }

    await dolgozat.save();

    // fizikai fájl törlése (nem kötelező, de általában jó)
    const absPath = path.join(__dirname, 'uploads', file.fileName);
    fs.unlink(absPath, err => {
      if (err) console.warn('Nem sikerült törölni a fájlt:', absPath, err.message);
    });

    res.json({ message: 'Fájl törölve', files: dolgozat.files });
  } catch (err) {
    console.error('Hiba fájl törlésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a fájl törlésekor' });
  }
});



// Szerver indítása megadott porton
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
