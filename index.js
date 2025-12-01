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

  // régi "egy darab" értékelés objektum (kompatibilitás miatt meghagyjuk)
  ertekeles: { type: Object, default: {} },

  // ÚJ: bírálónkénti értékelések
  ertekelesek: [
    {
      biraloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Felhasznalos' },
      pontszam: { type: Number },
      szovegesErtekeles: { type: String },
      form: { type: Object, default: {} },   // 🔹 teljes űrlap bírálónként
      createdAt: { type: Date, default: Date.now }
    }
  ],

  // ÚJ: jelölés, hogy a két fő bírálat között > 12 pont különbség van
  nagyElteres12: { type: Boolean, default: false },

  biralok: [
    {
      felhasznaloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Felhasznalos' },
      allapot: {
        type: String,
        enum: ['Felkérve', 'Elfogadva', 'Elutasítva'],
        default: 'Felkérve'
      },
      lastReminderAt: { type: Date }
    }
  ],
  szekcioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },

   // jelöljük, hogy a bírálatokat már kiküldtük-e a hallgatónak
  reviewSentToStudentsAt: { type: Date, default: null }
}));



// 🔹 Határidők modell
const DeadlineSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // pl. 'dolgozat_jelentkezes'
  nev: { type: String, required: true },               // emberi név
  leiras: { type: String },                            // magyarázat (opcionális)
  hatarido: { type: Date, required: true },            // konkrét dátum+idő
  soft: { type: Boolean, default: false }              // true = túlléphető (pl. bírálat)
});

const Deadline = mongoose.model('Deadline', DeadlineSchema);


// Összes határidő lekérése
app.get('/api/deadlines', async (req, res) => {
  try {
    const deadlines = await Deadline.find().lean();
    res.json(deadlines);
  } catch (err) {
    console.error('Hiba a határidők lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a határidők lekérésekor' });
  }
});

// Egy konkrét határidő lekérése kulcs alapján
app.get('/api/deadlines/:key', async (req, res) => {
  try {
    const deadline = await Deadline.findOne({ key: req.params.key }).lean();
    if (!deadline) {
      return res.status(404).json({ error: 'Nincs ilyen határidő beállítva.' });
    }
    res.json(deadline);
  } catch (err) {
    console.error('Hiba a határidő lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a határidő lekérésekor' });
  }
});

// Határidő létrehozása / módosítása kulcs alapján (upsert)
app.put('/api/deadlines/:key', async (req, res) => {
  try {
    const key = req.params.key;               // pl. 'dolgozat_jelentkezes'
    const { hatarido, nev, leiras } = req.body;

    if (!hatarido) {
      return res.status(400).json({ error: 'Hiányzik a határidő.' });
    }

    const date = new Date(hatarido);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Érvénytelen dátum formátum.' });
    }

    // Ezek lesznek "soft" határidők (túlléphető, csak figyelmeztetést küldünk majd)
    const softKeys = ['biralat_hatarido'];
    const soft = softKeys.includes(key);

    const updated = await Deadline.findOneAndUpdate(
      { key },
      {
        $set: {
          key,
          nev: nev || key,
          leiras: leiras || '',
          hatarido: date,
          soft
        }
      },
      { upsert: true, new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error('Hiba a határidő mentésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a határidő mentésekor.' });
  }
});



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

// Segédfüggvény: admin-jellegű felhasználó-e
function isAdminLikeUser(user) {
  if (!user || !Array.isArray(user.csoportok)) return false;

  const adminGroups = [
    'admin',
    'egyetemi adminisztrátor',
    'kari adminisztrátor'
  ];

  return user.csoportok.some(csoport => adminGroups.includes(csoport));
}


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
        dolgozat.allapot = 'bírálva';
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


// Segédfüggvény: userId kiolvasása az Authorization headerből (ha van)
function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, secretKey);
    return decoded.id || null;
  } catch (err) {
    return null;
  }
}

// Segédfüggvény: bírálati állapot és pontszám frissítése egy dolgozatnál
function frissitsBiralatiAllapot(dolgozat) {
  const accepted = (dolgozat.biralok || []).filter(b => b.allapot === 'Elfogadva');
  const acceptedIds = accepted.map(b => String(b.felhasznaloId));

  const evaluations = (dolgozat.ertekelesek || []).filter(e => e.biraloId);
  const doneEvals = evaluations.filter(e => acceptedIds.includes(String(e.biraloId)));

  const totalAccepted = acceptedIds.length;
  const completed = doneEvals.length;

  // Alapállapot: nincs nagy eltérés jelölve
  dolgozat.nagyElteres12 = false;

  if (completed === 0) {
    // még nincs bírálat – nem piszkáljuk az állapotot
    return { totalAccepted, completed };
  }

  if (completed === 1) {
    // első bírálat megvan → bírálat alatt
    if (dolgozat.allapot !== 'bírálva') {
      dolgozat.allapot = 'bírálat alatt';
    }
    return { totalAccepted, completed };
  }

  // Legalább 2 bírálat készen van
  const sorted = doneEvals.slice().sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  const firstTwo = sorted.slice(0, 2);
  const scores = firstTwo
    .map(e => typeof e.pontszam === 'number' ? e.pontszam : parseInt(e.pontszam, 10))
    .filter(s => !Number.isNaN(s));

  if (scores.length === 2) {
    const diff = Math.abs(scores[0] - scores[1]);

    // Itt figyelünk 12 pontra (>= 12)
    if (diff >= 12) {
      // Ha MÉG nincs kész a 3. bírálat → jelöljük, hogy nagy eltérés van
      if (!(completed >= 3 && totalAccepted >= 3)) {
        dolgozat.nagyElteres12 = true;                // ezt látja a faculties.js
        if (dolgozat.allapot !== 'bírálva') {
          dolgozat.allapot = 'bírálat alatt';
        }
      } else {
        // Itt már a 3. bíráló is kész → ez lesz a végleges
        const thirdEval = sorted[2];
        if (thirdEval && typeof thirdEval.pontszam !== 'undefined') {
          dolgozat.nagyElteres12 = false;             // konfliktus megoldva, jelölés törölve
          dolgozat.allapot = 'bírálva';
          dolgozat.pontszam = String(thirdEval.pontszam);
          dolgozat.ertekeles = {
            ...(dolgozat.ertekeles || {}),
            pontszam: thirdEval.pontszam,
            szovegesErtekeles: thirdEval.szovegesErtekeles || ''
          };
        } else {
          // ha valamiért nincs pont, marad bírálat alatt
          if (dolgozat.allapot !== 'bírálva') {
            dolgozat.allapot = 'bírálat alatt';
          }
        }
      }
    } else {
      // Két bírálat, különbség < 12 pont → átlagolt végső pontszám
      const avg = Math.round((scores[0] + scores[1]) / 2);
      dolgozat.nagyElteres12 = false;
      dolgozat.allapot = 'bírálva';
      dolgozat.pontszam = String(avg);
      dolgozat.ertekeles = {
        ...(dolgozat.ertekeles || {}),
        pontszam: avg,
        atlagoltBiralatokSzama: 2
      };
    }
  }

  return { totalAccepted, completed };
}



// CRUD műveletek a dolgozatokra

// Dolgozatok sorrendjének mentése drag and drop után
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

    console.log('Sorrend frissítve, módosított dokumentumok:', updatedCount);
    res.json({ message: 'Sorrend sikeresen frissítve.', updated: updatedCount });
  } catch (err) {
    console.error('Hiba a sorrend mentésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a sorrend mentésekor.', details: String(err.message || err) });
  }
});


// Minden dolgozat lekérdezése (szerepkör alapú szűréssel)
app.get('/api/dolgozatok', authMiddleware, async (req, res) => {
  try {
    const bejelentkezettFelhasznaloId = req.user.id;
    const bejelentkezettCsoportok = req.user.csoportok || [];

    // Megkeressük a teljes felhasználói rekordot (neptun miatt)
    const aktualisFelhasznalo = await Felhasznalo.findById(bejelentkezettFelhasznaloId).lean();
    const sajatNeptun = aktualisFelhasznalo?.neptun || null;

    // Alap query: minden dolgozat
    let query = {};

    // Ha NEM admin-jellegű felhasználó → szűrünk
    if (!isAdminLikeUser({ csoportok: bejelentkezettCsoportok })) {
      const orFeltetelek = [];

      // Hallgató: ahol a hallgato_ids tartalmazza az ő Neptun-kódját
      if (bejelentkezettCsoportok.includes('hallgato') && sajatNeptun) {
        orFeltetelek.push({ hallgato_ids: sajatNeptun });
      }

      // Témavezető: ahol a temavezeto_ids tartalmazza az ő Neptun-kódját
      if (bejelentkezettCsoportok.includes('temavezeto') && sajatNeptun) {
        orFeltetelek.push({ temavezeto_ids: sajatNeptun });
      }

      // Bíráló: ahol a biralok tömbben felhasznaloId = ő
      if (bejelentkezettCsoportok.includes('biralo')) {
        orFeltetelek.push({ 'biralok.felhasznaloId': bejelentkezettFelhasznaloId });
      }

      // Ha bármelyik szerep miatt van feltétel, beállítjuk az $or-t
      if (orFeltetelek.length > 0) {
        query = { $or: orFeltetelek };
      } else {
        // ha elvileg nem admin és nincs releváns szerepe, ne lásson semmit
        query = { _id: null };
      }
    }

    const dolgozatok = await Dolgozat.find(query)
      .sort({ szekcioId: 1, sorszam: 1, _id: 1 })
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



// Feltöltéshez elérhető dolgozatok lekérdezése (szerepkör alapú szűréssel)
app.get('/api/dolgozatok/feltoltheto', authMiddleware, async (req, res) => {
  try {
    const bejelentkezettFelhasznaloId = req.user.id;
    const bejelentkezettCsoportok = req.user.csoportok || [];

    // Az aktuális felhasználó a Neptun miatt kell
    const aktualisFelhasznalo = await Felhasznalo.findById(bejelentkezettFelhasznaloId).lean();
    const sajatNeptun = aktualisFelhasznalo?.neptun || null;

    const allowedStates = [
      'jelentkezett',
      'feltöltve - témavezető válaszára vár',
      'elfogadva - témavezető által',
      'elutasítva - témavezető által'
    ];

    // Alap: csak a feltölthető állapotok
    let query = { allapot: { $in: allowedStates } };

    // Ha NEM admin jellegű user (hallgató, témavezető, bíráló...) akkor szűrünk
    if (!isAdminLikeUser({ csoportok: bejelentkezettCsoportok })) {
      const orFeltetelek = [];

      // Hallgató: csak a saját dolgozatai
      if (bejelentkezettCsoportok.includes('hallgato') && sajatNeptun) {
        orFeltetelek.push({ hallgato_ids: sajatNeptun });
      }

      // Témavezető: azok, ahol ő a témavezető
      if (bejelentkezettCsoportok.includes('temavezeto') && sajatNeptun) {
        orFeltetelek.push({ temavezeto_ids: sajatNeptun });
      }

      // Bíráló: azok, ahol bírálóként szerepel
      if (bejelentkezettCsoportok.includes('biralo')) {
        orFeltetelek.push({ 'biralok.felhasznaloId': bejelentkezettFelhasznaloId });
      }

      if (orFeltetelek.length > 0) {
        // allapot + saját releváns dolgozatok metszete
        query = {
          $and: [
            { allapot: { $in: allowedStates } },
            { $or: orFeltetelek }
          ]
        };
      } else {
        // ha nincs releváns szerepe, akkor ne kapjon semmit
        query = { _id: null };
      }
    }

    const feltolthetoDolgozatok = await Dolgozat.find(query);
    res.json(feltolthetoDolgozatok);
  } catch (error) {
    console.error('Hiba történt a feltölthető dolgozatok lekérésekor:', error);
    res.status(500).json({ error: 'Hiba történt a feltölthető dolgozatok lekérésekor' });
  }
});



// Új dolgozat hozzáadása
app.post('/api/dolgozatok', async (req, res) => {
    // Határidő ellenőrzés – csak akkor tilt, ha be van állítva
  if (await isGlobalDeadlineExpired('dolgozat_jelentkezes')) {
    return res.status(400).json({
      error: 'A dolgozat jelentkezési határideje lejárt, új dolgozat már nem adható le.'
    });
  }
  // kar-t is vegyük át a body-ból
  const { cím, hallgato_ids, temavezeto_ids, leiras, kar: bodyKar } = req.body;

  try {
    // Alapértelmezett: nincs kar
    let kar = bodyKar || '';

    // Minimális validáció
    if (!cím || !Array.isArray(hallgato_ids) || !hallgato_ids.length ||
        !Array.isArray(temavezeto_ids) || !temavezeto_ids.length) {
      return res.status(400).json({ error: 'Hiányzó adatok az új dolgozathoz.' });
    }

    // Ha a frontend nem küldött kart, próbáljuk meg kideríteni az első hallgató alapján
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
  const { cím, leiras, hallgato_ids, temavezeto_ids, elutasitas_oka } = req.body;

  try {
    const updateData = {};

    if (typeof cím !== 'undefined') {
      updateData.cím = cím;
    }
    if (typeof leiras !== 'undefined') {
      updateData.leiras = leiras;
    }
    if (Array.isArray(hallgato_ids)) {
      updateData.hallgato_ids = hallgato_ids;

      // csak akkor számoljuk újra a kart, ha tényleg küldtek hallgato_ids-t
      if (hallgato_ids.length > 0) {
        const elsoHallgato = await Felhasznalo.findOne({ neptun: hallgato_ids[0] }).lean();
        updateData.kar = elsoHallgato?.kar || '';
      }
    }
    if (Array.isArray(temavezeto_ids)) {
      updateData.temavezeto_ids = temavezeto_ids;
    }
    if (typeof elutasitas_oka !== 'undefined') {
      updateData.elutasitas_oka = elutasitas_oka;
    }

    const updatedDolgozat = await Dolgozat.findByIdAndUpdate(id, updateData, { new: true });

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
        'bírálva',
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

async function isGlobalDeadlineExpired(key) {
  try {
    const d = await Deadline.findOne({ key }).lean();
    if (!d || !d.hatarido) return false; // ha nincs beállítva, ne tiltsunk

    const now = new Date();
    const hatarido = new Date(d.hatarido);

    return now.getTime() > hatarido.getTime();
  } catch (err) {
    console.error('Hiba a globális határidő ellenőrzésekor:', err);
    // hiba esetén inkább ne bénítsuk le a rendszert
    return false;
  }
}




// Értékelés mentése
// Többszörös bírálat mentése
app.post('/api/papers/:id/ertekeles', async (req, res) => {
  const { id } = req.params;
  const ertekeles = req.body || {};

  try {
    const dolgozat = await Dolgozat.findById(id);
    if (!dolgozat) return res.status(404).send('Dolgozat nem található');

    // 🔹 ÜRES értékelés szűrése: ha nincs pontszám ÉS nincs szöveges rész, akkor ne mentsünk semmit
    const scoreKeys = ['pontszam', 'score1', 'score2', 'score3', 'score4', 'score5'];
    const textKeys = [
      'szovegesErtekeles',
      'szoveges',
      'megjegyzes',
      'text1',
      'text2',
      'text3',
      'text4',
      'text5'
    ];

    const hasScore = scoreKeys.some(key => {
      const v = ertekeles[key];
      if (v === null || v === undefined) return false;
      const str = String(v).trim();
      if (str === '') return false;
      const num = parseFloat(str.replace(',', '.'));
      return !Number.isNaN(num);
    });

    const hasText = textKeys.some(key => {
      const v = ertekeles[key];
      return typeof v === 'string' && v.trim() !== '';
    });

    if (!hasScore && !hasText) {
      return res.status(400).json({
        error:
          'Nem érkezett értékelés (nincs pontszám vagy szöveges mező kitöltve). ' +
          'Kérjük, tölts fel Excel fájlt, vagy adj meg pontszámot / szöveges értékelést, mielőtt mentesz.'
      });
    }

    // Mindig elmentjük a "legutóbbi" értékelés objektumot kompatibilitás miatt
    dolgozat.ertekeles = ertekeles || {};

    // Megpróbáljuk kideríteni, KI a bíráló
    const tokenUserId = getUserIdFromToken(req);
    const bodyBiraloId = ertekeles.biraloId || ertekeles.biralo_id || null;
    const biraloId = tokenUserId || bodyBiraloId;

    // Ha nem tudjuk, ki a bíráló, visszaesünk a régi viselkedésre
    if (!biraloId) {
      console.warn('Nincs biraloId az értékelés mentésénél – régi mód szerint bírálva-ra állítjuk.');
      dolgozat.allapot = 'bírálva';
      await dolgozat.save();
      return res.json({ message: 'Értékelés elmentve (biraloId nélkül)', dolgozat });
    }

    // Biztosítsuk, hogy ertekelesek tömb létezik
    if (!Array.isArray(dolgozat.ertekelesek)) {
      dolgozat.ertekelesek = [];
    }

    // pontszám kinyerése / kiszámítása
    let pontszam = ertekeles.pontszam;

    if (pontszam === null || pontszam === undefined || pontszam === '') {
      // Ha nincs külön megadva, számoljuk ki a score1..score5 mezőkből
      const scores = [1, 2, 3, 4, 5].map(i => {
        const raw = ertekeles[`score${i}`];
        const n = parseInt(raw, 10);
        return Number.isNaN(n) ? 0 : n;
      });
      pontszam = scores.reduce((sum, v) => sum + v, 0);
    } else if (typeof pontszam === 'string') {
      const parsed = parseInt(pontszam, 10);
      pontszam = Number.isNaN(parsed) ? undefined : parsed;
    } else if (typeof pontszam !== 'number') {
      pontszam = undefined;
    }

    const szoveg =
      ertekeles.szovegesErtekeles ||
      ertekeles.szoveges ||
      ertekeles.megjegyzes ||
      ['text1', 'text2', 'text3', 'text4', 'text5']
        .map(kulcs => (ertekeles[kulcs] || '').trim())
        .filter(Boolean)
        .join('\n\n'); // KÉT sortöréssel fűzzük egybe

    // Megnézzük, van-e már értékelés ettől a bírálótól
    const existing = dolgozat.ertekelesek.find(
      e => String(e.biraloId) === String(biraloId)
    );

    if (existing) {
      if (typeof pontszam === 'number') {
        existing.pontszam = pontszam;
      }
      if (szoveg) {
        existing.szovegesErtekeles = szoveg;
      }
      existing.form = ertekeles; // 🔹 teljes űrlap mentése
      existing.createdAt = new Date();
    } else {
      dolgozat.ertekelesek.push({
        biraloId,
        pontszam: typeof pontszam === 'number' ? pontszam : undefined,
        szovegesErtekeles: szoveg,
        form: ertekeles, // 🔹 teljes űrlap mentése
        createdAt: new Date()
      });
    }

    // Bírálati állapot frissítése (1/2, 2/2, 3/3 logika + nagy eltérés)
    const stat = frissitsBiralatiAllapot(dolgozat);

    await dolgozat.save();

    res.json({
      message: 'Értékelés elmentve',
      dolgozat,
      reviewStats: stat
    });
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

    // bíráló azonosítása tokenből vagy query paraméterből
    const tokenUserId = getUserIdFromToken(req);
    const qBiraloId =
      req.query.biraloId ||
      req.query.biralo_id ||
      req.query.reviewer ||
      req.query.userId ||
      null;

    const biraloId = tokenUserId || qBiraloId;

    if (biraloId && Array.isArray(dolgozat.ertekelesek)) {
      const sajat = dolgozat.ertekelesek.find(
        e => String(e.biraloId) === String(biraloId)
      );
      if (sajat && sajat.form && Object.keys(sajat.form).length > 0) {
        // 🔹 bíráló a saját, teljes űrlapját kapja
        return res.json(sajat.form);
      }
    }

    // visszaesés a régi egy darab értékelésre (admin / régi adatok)
    res.json(dolgozat.ertekeles || {});
  } catch (err) {
    console.error('Hiba az értékelés lekérdezésekor:', err);
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// Csak a kész (feltölthető) dolgozatok lekérdezése – SZEREPKÖR ALAPÚ SZŰRÉSSEL
app.get('/api/dolgozatok/kesz', authMiddleware, async (req, res) => {
  try {
    const bejelentkezettFelhasznaloId = req.user.id;
    const bejelentkezettCsoportok = req.user.csoportok || [];

    // Az aktuális felhasználó a Neptun miatt kell
    const aktualisFelhasznalo = await Felhasznalo.findById(bejelentkezettFelhasznaloId).lean();
    const sajatNeptun = aktualisFelhasznalo?.neptun || null;

    // Mely állapotokban engedjük a feltöltést / megjelenítést
    const allowedStates = [
      'jelentkezett',
      'feltöltve - témavezető válaszára vár',
      'elfogadva - témavezető által',
      'elutasítva - témavezető által'
    ];

    // Alap: csak az allowedStates
    let query = { allapot: { $in: allowedStates } };

    // Ha NEM admin jellegű user → szűrjük a saját szerepe szerint
    if (!isAdminLikeUser({ csoportok: bejelentkezettCsoportok })) {
      const orFeltetelek = [];

      // Hallgató: csak a SAJÁT dolgozatai
      if (bejelentkezettCsoportok.includes('hallgato') && sajatNeptun) {
        orFeltetelek.push({ hallgato_ids: sajatNeptun });
      }

      // Témavezető: ahol ő a témavezető
      if (bejelentkezettCsoportok.includes('temavezeto') && sajatNeptun) {
        orFeltetelek.push({ temavezeto_ids: sajatNeptun });
      }

      // Bíráló: ahol ő bíráló
      if (bejelentkezettCsoportok.includes('biralo')) {
        orFeltetelek.push({ 'biralok.felhasznaloId': bejelentkezettFelhasznaloId });
      }

      if (orFeltetelek.length > 0) {
        query = {
          $and: [
            { allapot: { $in: allowedStates } },
            { $or: orFeltetelek }
          ]
        };
      } else {
        // ha nincs releváns szerepe, ne lásson semmit
        query = { _id: null };
      }
    }

    const keszDolgozatok = await Dolgozat.find(query);
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
        dolgozat.allapot = 'bírálva';
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

// Hallgatói nézethez: bírálatok listája egy dolgozathoz (pontszám nélkül)
app.get('/api/papers/:id/ertekelesek-hallgato', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Érvénytelen dolgozat ID' });
    }

    const paper = await Dolgozat.findById(id).lean();
    if (!paper) {
      return res.status(404).json({ error: 'Dolgozat nem található.' });
    }

    // Ha még nincs bírálva, akkor ne adjunk vissza bírálatot
    if (paper.allapot !== 'bírálva') {
      return res.status(400).json({ error: 'A dolgozat még nincs bírálva, bírálatok nem érhetők el.' });
    }

    const felhasznalok = await Felhasznalo.find().lean();
    const felhasznaloMapNeptun = {};
    const felhasznaloMapId = {};

    felhasznalok.forEach(f => {
      if (f.neptun) felhasznaloMapNeptun[f.neptun] = f;
      felhasznaloMapId[String(f._id)] = f;
    });

    // Hallgatók
    const szerzok = (paper.hallgato_ids || []).map(neptun => {
      const f = felhasznaloMapNeptun[neptun] || {};
      return {
        nev: f.nev || 'Ismeretlen hallgató',
        neptun
      };
    });

    // Elfogadott bírálók
    const acceptedReviewers = (paper.biralok || [])
      .filter(b => b.allapot === 'Elfogadva')
      .map(b => {
        const f = felhasznaloMapId[String(b.felhasznaloId)] || {};
        return {
          id: String(b.felhasznaloId),
          nev: f.nev || 'Ismeretlen bíráló'
        };
      });

    // Bírálónkénti értékelés – pontszám nélkül, de a TEXT mezőkre bontva
    const reviews = [];
    (paper.ertekelesek || []).forEach(e => {
      const rid = String(e.biraloId || '');
      const reviewer = acceptedReviewers.find(r => r.id === rid);
      if (!reviewer) return;

      // csak akkor küldjük, ha van valamilyen szöveges rész
      const fullText = e.szovegesErtekeles || '';
      const form = (e.form && typeof e.form === 'object') ? e.form : {};

      // Csak a hallgatónak fontos SZÖVEGES mezőket engedjük át
      const allowedKeys = [
        'text1', 'text2', 'text3', 'text4', 'text5',
        'kerdesek', 'bírálói_kérdések',
        'otdk', 'otdk_reszvetel',
        'datum'
      ];

      const sanitizedForm = {};
      allowedKeys.forEach(k => {
        if (typeof form[k] === 'string' && form[k].trim() !== '') {
          sanitizedForm[k] = form[k];
        }
      });

      // ha semmi szöveges nincs, akkor ne tegyük listába
      if (!fullText && Object.keys(sanitizedForm).length === 0) return;

      reviews.push({
        biraloId: rid,
        biraloNev: reviewer.nev,
        szovegesErtekeles: fullText || '',
        form: sanitizedForm,          // <- EBBŐL fogunk tölteni text1..text5-öt
        leadva: e.createdAt || null
      });
    });

    // Szekció neve (ha kell a hallgatói felülethez)
    let szekcioNev = '';
    if (paper.szekcioId) {
      const szekcio = await Section.findById(paper.szekcioId).lean();
      if (szekcio) szekcioNev = szekcio.name || '';
    }

    res.json({
      paperId: paper._id,
      cim: paper.cím || paper.cim || '',
      szerzok,
      szekcioNev,
      reviews
    });
  } catch (err) {
    console.error('Hiba a hallgatói bírálatok lekérdezésekor:', err);
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// Zsűrinézethez: bírálatok listája (pontszámokkal, teljes űrlappal)
app.get('/api/papers/:id/ertekelesek-zsuri', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Érvénytelen dolgozat ID' });
    }

    const paper = await Dolgozat.findById(id).lean();
    if (!paper) {
      return res.status(404).json({ error: 'Dolgozat nem található.' });
    }

    // csak bírálva állapot esetén mutatjuk
    if (paper.allapot !== 'bírálva') {
      return res.status(400).json({ error: 'A dolgozat még nincs bírálva.' });
    }

    const felhasznalok = await Felhasznalo.find().lean();
    const felhasznaloMapId = {};
    felhasznalok.forEach(f => {
      felhasznaloMapId[String(f._id)] = f;
    });

    const acceptedReviewers = (paper.biralok || [])
      .filter(b => b.allapot === 'Elfogadva')
      .map(b => {
        const f = felhasznaloMapId[String(b.felhasznaloId)] || {};
        return {
          id: String(b.felhasznaloId),
          nev: f.nev || 'Ismeretlen bíráló'
        };
      });

    const reviews = [];
    (paper.ertekelesek || []).forEach(e => {
      const rid = String(e.biraloId || '');
      const reviewer = acceptedReviewers.find(r => r.id === rid);
      if (!reviewer) return;

      reviews.push({
        biraloId: rid,
        biraloNev: reviewer.nev,
        pontszam: e.pontszam ?? null,
        form: e.form && typeof e.form === 'object' ? e.form : {},
        leadva: e.createdAt || null
      });
    });

    res.json({
      paperId: paper._id,
      cim: paper.cím || paper.cim || '',
      reviews
    });
  } catch (err) {
    console.error('Hiba a zsűri bírálatok lekérdezésekor:', err);
    res.status(500).json({ error: 'Szerver hiba' });
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

    // Értesítés a hallgatónak
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

// Regisztráció
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
          allapot: { $in: ['elfogadva - témavezető által', 'elutasítva - témavezető által'] },
          'biralok.allapot': 'Elfogadva'
        })
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


// Egy dolgozat lekérése ID alapján (hallgatók, szekció neve, bíráló(k) neve)
app.get('/api/papers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Érvénytelen dolgozat ID' });
    }

    // Dolgozat lekérése
    const paper = await Dolgozat.findById(id).lean();
    if (!paper) {
      return res.status(404).json({ error: 'A dolgozat nem található.' });
    }

    // Felhasználók lekérése
    const felhasznalok = await Felhasznalo.find().lean();

    const felhasznaloMapNeptun = {};
    const felhasznaloMapId = {};

    felhasznalok.forEach(f => {
      if (f.neptun) {
        felhasznaloMapNeptun[f.neptun] = f;
      }
      felhasznaloMapId[String(f._id)] = f;
    });

    // Hallgatók adatai
    const szerzok = (paper.hallgato_ids || []).map(neptun => {
      const f = felhasznaloMapNeptun[neptun] || {};
      return {
        nev: f.nev || '',
        szak: f.szak || '',
        evfolyam: f.evfolyam || ''
      };
    });

    // Elfogadott bírálók nevei (biralok tömb + allapot === 'Elfogadva')
    const acceptedReviewers = (paper.biralok || [])
      .filter(b => b.allapot === 'Elfogadva')
      .map(b => {
        const f = felhasznaloMapId[String(b.felhasznaloId)] || {};
        return {
          id: String(b.felhasznaloId),
          nev: f.nev || 'Ismeretlen bíráló',
          email: f.email || ''
        };
      });

    // Ha több elfogadott bíráló van, mindet kiírjuk vesszővel elválasztva
    const biraloNev = acceptedReviewers.map(b => b.nev).join(', ');

    // Szekció neve (ha van)
    let szekcioNev = '';
    if (paper.szekcioId) {
      const szekcio = await Section.findById(paper.szekcioId).lean();
      if (szekcio) {
        szekcioNev = szekcio.name || '';
      }
    }

    res.json({
      _id: paper._id,
      cim: paper.cím || paper.cim || '',
      szerzok,
      biralo: biraloNev,     // Ezt használja az import_form.html a "Bíráló:" mezőhöz
      biralok: acceptedReviewers,  // Ha később kell részletes lista
      szekcioNev
    });
  } catch (err) {
    console.error('Hiba a dolgozat lekérdezésekor (/api/papers/:id):', err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});


// Dolgozatok lekérése, szekciókhoz és listákhoz is használható formátumban (szerepkör alapú szűréssel)
app.get('/api/papers', authMiddleware, async (req, res) => {
  try {
    const bejelentkezettFelhasznaloId = req.user.id;
    const bejelentkezettCsoportok = req.user.csoportok || [];

    // Megkeressük a teljes felhasználót a Neptun-kód miatt
    const aktualisFelhasznalo = await Felhasznalo.findById(bejelentkezettFelhasznaloId).lean();
    const sajatNeptun = aktualisFelhasznalo?.neptun || null;

    let query = {};

    if (!isAdminLikeUser({ csoportok: bejelentkezettCsoportok })) {
      const orFeltetelek = [];

      if (bejelentkezettCsoportok.includes('hallgato') && sajatNeptun) {
        orFeltetelek.push({ hallgato_ids: sajatNeptun });
      }

      if (bejelentkezettCsoportok.includes('temavezeto') && sajatNeptun) {
        orFeltetelek.push({ temavezeto_ids: sajatNeptun });
      }

      if (bejelentkezettCsoportok.includes('biralo')) {
        orFeltetelek.push({ 'biralok.felhasznaloId': bejelentkezettFelhasznaloId });
      }

      if (orFeltetelek.length > 0) {
        query = { $or: orFeltetelek };
      } else {
        query = { _id: null };
      }
    }

    const dolgozatok = await Dolgozat.find(query)
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
      let kar = d.kar || '';
      if (!kar && Array.isArray(d.hallgato_ids) && d.hallgato_ids.length > 0) {
        const elsoNeptun = d.hallgato_ids[0];
        const hallgato = felhasznaloMapNeptun[elsoNeptun];
        if (hallgato && hallgato.kar) {
          kar = hallgato.kar;
        }
      }

      return {
        _id: d._id,
        cim: d.cím || d.cim || 'Névtelen dolgozat',
        allapot: d.allapot || 'ismeretlen',
        leiras: d.leiras || '',
        szekcioId: d.szekcioId ? String(d.szekcioId) : null,
        kar,
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
        }),

        ertekelesek: (d.ertekelesek || []).map(e => ({
          biraloId: String(e.biraloId),
          pontszam: e.pontszam,
          szovegesErtekeles: e.szovegesErtekeles || ''
        })),

        nagyElteres12: !!d.nagyElteres12,

        reviewCounter: (() => {
          const accepted = (d.biralok || []).filter(b => b.allapot === 'Elfogadva');
          const acceptedIds = accepted.map(b => String(b.felhasznaloId));
          const evals = (d.ertekelesek || []).filter(e => e.biraloId);
          const done = evals.filter(e => acceptedIds.includes(String(e.biraloId)));

          return {
            osszesElfogadottBiralo: acceptedIds.length,
            befejezettBiralat: done.length
          };
        })()
      };
    });

    res.json(eredmeny);
  } catch (error) {
    console.error('Hiba a dolgozatok lekérésekor (/api/papers):', error);
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


// Témaajánlók kezeléséhez új Mongoose modell
const TemaJavaslat = mongoose.model('temajavaslat', new mongoose.Schema({
  cim: { type: String, required: true },
  osszefoglalo: { type: String, required: true },
  temavezetoNev: { type: String, required: true },
  temavezetoNeptun: { type: String, required: false },
  kar: { type: String, required: false },
  tanszek: { type: String, required: false }
}));


// Témaajánlatok lekérése
app.get('/api/topics', async (req, res) => {
  try {
    const topics = await TemaJavaslat.find();
    res.json(topics);
  } catch (err) {
    console.error('Hiba a témák lekérésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a témák lekérésekor' });
  }
});

// Új témajavaslat mentése
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


// Téma törlése
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

// Témavezetők listázása (MongoDB-ből)
app.get('/api/temavezetok', async (req, res) => {
  try {
    const temavezetok = await Felhasznalo.find({ csoportok: { $in: ['temavezeto'] } })
  .select('nev neptun email kar');
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

    // UGYANAZ A HATÁRIDŐ-ELLENŐRZÉS
  if (await isGlobalDeadlineExpired('dolgozat_jelentkezes')) {
    return res.status(400).json({
      error: 'A dolgozat jelentkezési határideje lejárt, témára már nem lehet jelentkezni.'
    });
  }

  try {
    const topic = await TemaJavaslat.findById(id);
    if (!topic) return res.status(404).json({ error: 'Téma nem található' });

    // Kar meghatározása az első hallgató alapján
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



// Téma módosítása
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
    const now = new Date();
    let hatarido = null;
    let forras = 'nincs';

    // 1️KAR-specifikus határidő – ha van kar, megpróbáljuk kinyerni
    if (dolgozat && dolgozat.kar) {
      const karDoc = await UniversityStructure.findOne({
        $or: [
          { rovidites: dolgozat.kar }, // pl. "GIVK"
          { nev: dolgozat.kar }        // ha teljes név van eltárolva
        ]
      }).lean();

      if (karDoc && karDoc.feltoltesHatarido) {
        const d = new Date(karDoc.feltoltesHatarido);
        if (!isNaN(d.getTime())) {
          hatarido = d;
          forras = `kar-specifikus (${karDoc.rovidites || karDoc.nev})`;
        }
      }
    }

    // 2️Ha még nincs határidő, akkor jön a GLOBÁLIS
    if (!hatarido) {
      const globalDeadlineDoc = await Deadline.findOne({
        key: 'dolgozat_feltoltes_global'
      }).lean();

      if (globalDeadlineDoc && globalDeadlineDoc.hatarido) {
        const d = new Date(globalDeadlineDoc.hatarido);
        if (!isNaN(d.getTime())) {
          hatarido = d;
          forras = 'globális';
        }
      }
    }

    // 3️Ha se kar-specifikus, se globális nincs → nincs korlát
    if (!hatarido) {
      console.log(`⏱ NINCS feltöltési határidő (dolgozat=${dolgozat?._id})`);
      return false;
    }

    const lejart = now.getTime() > hatarido.getTime();
    console.log(
      `⏱ Feltöltési határidő forrás=${forras}, határidő=${hatarido.toISOString()}, ` +
      `now=${now.toISOString()}, lejart=${lejart}`
    );

    return lejart;
  } catch (err) {
    console.error('Hiba a feltöltési határidő ellenőrzésekor:', err);
    // hiba esetén inkább ne tiltsunk le mindent
    return false;
  }
}





// Egyetemi struktúra lekérdezése
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
  ],
    zsuriErtesitesSentAt: { type: Date, default: null }
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



// Feltételezve, hogy a karokat a UniversityStructure kollekcióban tárolom

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

// Karhoz tartozó dolgozat-feltöltési határidő mentése / törlése
app.put('/api/karok/:id/hatarido', async (req, res) => {
  try {
    const { id } = req.params;
    const { hatarido } = req.body;

    // Ha nincs határidő megadva: kar-specifikus határidő törlése (null),
    //    innentől a globális dolgozat_feltoltes_global lesz az érvényes.
    if (!hatarido) {
      const updated = await UniversityStructure.findByIdAndUpdate(
        id,
        { $set: { feltoltesHatarido: null } },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ error: 'Kar nem található.' });
      }

      return res.json(updated);
    }

    // Ha van dátum: normál mentés
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




// Dolgozat eltávolítása szekcióból
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

    // Zsűri-jelentkezési határidő ellenőrzése
    // Ha nincs beállítva ilyen határidő, az isGlobalDeadlineExpired(false)-t ad vissza, tehát engedjük.
    if (await isGlobalDeadlineExpired('zsuri_jelentkezes')) {
      return res.status(400).json({
        error: 'A zsűritagok jelentkezési határideje lejárt, új zsűritag már nem adható hozzá.'
      });
    }

    if (!felhasznaloId || !szerep)
      return res.status(400).json({ error: 'Hiányzó adatok.' });

    const section = await Section.findById(id);
    if (!section) return res.status(404).json({ error: 'Szekció nem található.' });

    // Ha már létezik ugyanaz a szerep / személy
    const alreadyExists = section.zsuri.some(
      z => String(z.felhasznaloId) === String(felhasznaloId)
    );
    if (alreadyExists) {
      return res.status(400).json({ error: 'Ez a felhasználó már zsűritag ebben a szekcióban.' });
    }

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

    // Képek beágyazása Base64 formátumban
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.inline(async (image) => {
  const imageBuffer = await image.read();
  const base64 = imageBuffer.toString("base64");
  const contentType = image.contentType;
  // adjunk hozzá inline style-t a képhez
  return {
    src: `data:${contentType};base64,${base64}`,
    alt: "Beágyazott kép",
    style: "max-width:80%;height:auto;display:block;margin:20px auto;border-radius:6px;"
  };
}),

      }
    );

    const outputPath = path.join(__dirname, 'public', 'homepage.html');

    // A konvertált HTML mentése
    fs.writeFileSync(outputPath, result.value, 'utf8');

    // Opcionálisan: törölheted a feltöltött Word fájlt
    fs.unlinkSync(req.file.path);

    res.json({ message: 'Főoldal frissítve a Word dokumentum alapján (képekkel együtt).' });
  } catch (error) {
    console.error('Hiba a Word konvertálás során:', error);
    res.status(500).json({ error: 'Nem sikerült feldolgozni a Word dokumentumot.' });
  }
});


async function sendDailyReviewReminders() {
  try {
    // 1️Bírálati (soft) határidő lekérése
    const deadline = await Deadline.findOne({ key: 'biralat_hatarido' });
    if (!deadline || !deadline.hatarido) {
      return; // nincs beállítva, nincs mit küldeni
    }

    const now = new Date();
    const hatarido = new Date(deadline.hatarido);
    if (isNaN(hatarido.getTime())) return;

    // Csak akkor küldünk, ha már lejárt a határidő
    if (now <= hatarido) return;

    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // 2️Összes olyan dolgozat, ahol van Elfogadott bíráló, de még NINCS kész a bírálat
    const dolgozatok = await Dolgozat.find({
      'biralok.allapot': 'Elfogadva',
      allapot: { $ne: 'bírálva' }   // itt használjuk a fenti módosítást
    }).populate('biralok.felhasznaloId'); // hogy legyen e-mail cím

    for (const d of dolgozatok) {
      for (const b of d.biralok) {
        if (b.allapot !== 'Elfogadva') continue;

        // Ha már ma küldtünk neki, ne küldjünk újra
        if (b.lastReminderAt) {
          const lastStr = b.lastReminderAt.toISOString().slice(0, 10);
          if (lastStr === todayStr) continue;
        }

        const felhasznalo = b.felhasznaloId;
        if (!felhasznalo || !felhasznalo.email) continue;

        const emailSzoveg = betoltEmailSablon('emlekezteto_biralat_hatarido.txt', {
          NEV: felhasznalo.nev || 'Tisztelt Bíráló',
          DOLGOZATCIM: d.cím || 'ismeretlen című dolgozat',
          HATARIDO: hatarido.toLocaleString('hu-HU'),
          LINK: `http://localhost:3000/import_form.html?id=${d._id}`
        });

        await transporter.sendMail({
          from: 'TDK rendszer <m48625729@gmail.com>',
          to: felhasznalo.email,
          subject: 'Emlékeztető: TDK dolgozat bírálata',
          text: emailSzoveg
        });

        // Jelöljük, hogy ma már küldtünk neki
        b.lastReminderAt = now;
      }

      await d.save();
    }
  } catch (err) {
    console.error('Hiba a bírálói emlékeztetők küldésekor:', err);
  }
}

// Bírálatok kiküldése hallgatóknak a globális határidő után
async function sendReviewsToStudentsAfterDeadline() {
  try {
    const deadline = await Deadline.findOne({ key: 'biralat_kikuldese_hallgatoknak' }).lean();
    if (!deadline || !deadline.hatarido) {
      return; // nincs beállítva ilyen határidő
    }

    const now = new Date();
    const hatarido = new Date(deadline.hatarido);
    if (isNaN(hatarido.getTime())) return;

    // Csak akkor indulunk, ha már lejárt a hallgatói kiküldés határideje
    if (now <= hatarido) return;

    // Olyan dolgozatokat keresünk, amelyek már "bírálva" állapotúak,
    // de a bírálatokat még NEM küldtük ki a hallgatóknak
    const dolgozatok = await Dolgozat.find({
      allapot: 'bírálva',
      $or: [
        { reviewSentToStudentsAt: { $exists: false } },
        { reviewSentToStudentsAt: null }
      ]
    })
      .lean();

    if (!dolgozatok.length) return;

    const felhasznalok = await Felhasznalo.find().lean();
    const felhasznaloMapNeptun = {};
    const felhasznaloMapId = {};

    felhasznalok.forEach(f => {
      if (f.neptun) felhasznaloMapNeptun[f.neptun] = f;
      felhasznaloMapId[String(f._id)] = f;
    });

    for (const d of dolgozatok) {
      // Elfogadott bírálók
      const acceptedReviewers = (d.biralok || [])
        .filter(b => b.allapot === 'Elfogadva')
        .map(b => {
          const f = felhasznaloMapId[String(b.felhasznaloId)] || {};
          return {
            id: String(b.felhasznaloId),
            nev: f.nev || 'Ismeretlen bíráló'
          };
        });

      if (acceptedReviewers.length < 2) {
        // nincs meg legalább 2 elfogadott bíráló → ne küldjünk
        continue;
      }

      // Bírálónkénti szöveges értékelés összegyűjtése
      const reviewsForMail = [];
      (d.ertekelesek || []).forEach(e => {
        const rid = String(e.biraloId || '');
        const reviewer = acceptedReviewers.find(r => r.id === rid);
        if (!reviewer) return;
        if (!e.szovegesErtekeles) return;

        reviewsForMail.push({
          biraloNev: reviewer.nev,
          szovegesErtekeles: e.szovegesErtekeles
        });
      });

      if (reviewsForMail.length < 2) {
        // még nincs legalább 2 szöveges bírálat → várunk
        continue;
      }

      // Bírálatok szövegének összeállítása a sablonba
      const biralatiSzovegek = reviewsForMail
        .map((r, idx) => {
          return `\n${idx + 1}. bíráló (${r.biraloNev}):\n${r.szovegesErtekeles}\n`;
        })
        .join('\n');

      // Hallgatók e-mail címei
      const hallgatoFelhasznalok = (d.hallgato_ids || [])
        .map(neptun => felhasznaloMapNeptun[neptun])
        .filter(f => f && f.email);

      if (!hallgatoFelhasznalok.length) continue;

      // Link a hallgatói nézetre (readonly + hallgatói mód)
      const link = `http://localhost:3000/import_form.html?id=${d._id}&readonly=true&student=true`;

      for (const hallgato of hallgatoFelhasznalok) {
        const emailSzoveg = betoltEmailSablon('ertesites_biralatok_hallgatonak.txt', {
          HALLGATONEV: hallgato.nev || 'Kedves Hallgató',
          DOLGOZATCIM: d.cím || d.cim || 'ismeretlen című dolgozat',
          BIRALATI_SZOVEGEK: biralatiSzovegek,
          LINK: link
        });

        await transporter.sendMail({
          from: 'TDK rendszer <m48625729@gmail.com>',
          to: hallgato.email,
          subject: 'TDK dolgozat bírálatai',
          text: emailSzoveg
        });
      }

      // Jelöljük, hogy kiküldtük a hallgatóknak
      await Dolgozat.updateOne(
        { _id: d._id },
        { $set: { reviewSentToStudentsAt: now } }
      );
    }
  } catch (err) {
    console.error('Hiba a bírálatok hallgatóknak való kiküldésekor:', err);
  }
}

// 🔹 Zsűritagok értesítése a bírálatokról a globális határidő után
async function sendZsuriNotificationsAfterDeadline() {
  try {
    // 1️Határidő lekérése
    const deadline = await Deadline.findOne({ key: 'zsuri_ertesites' }).lean();
    if (!deadline || !deadline.hatarido) {
      return; // nincs ilyen határidő beállítva
    }

    const now = new Date();
    const hatarido = new Date(deadline.hatarido);
    if (isNaN(hatarido.getTime())) return;

    // Csak akkor indulunk, ha MÁR LEJÁRT a határidő
    if (now <= hatarido) return;

    // 2️Olyan szekciók, ahol van legalább egy elfogadott zsűritag,
    //    de még NEM küldtünk értesítést (zsuriErtesitesSentAt == null)
    const sections = await Section.find({
      'zsuri.allapot': 'Elfogadva',
      $or: [
        { zsuriErtesitesSentAt: { $exists: false } },
        { zsuriErtesitesSentAt: null }
      ]
    }).populate('zsuri.felhasznaloId');

    if (!sections.length) return;

    for (const section of sections) {
      const link = `http://localhost:3000/review-papers.html?section=${section._id}`;

      // minden elfogadott zsűritagnak (elnök, titkár, zsűri)
      for (const z of section.zsuri || []) {
        if (z.allapot !== 'Elfogadva') continue;
        const user = z.felhasznaloId;
        if (!user || !user.email) continue;

        const emailSzoveg = betoltEmailSablon('ertesites_zsurinek.txt', {
          NEV: user.nev || 'Tisztelt zsűritag',
          SZEKCIO: section.name || '',
          LINK: link
        });

        await transporter.sendMail({
          from: 'TDK rendszer <m48625729@gmail.com>',
          to: user.email,
          subject: `TDK – bírálatok áttekintése (${section.name})`,
          text: emailSzoveg
        });
      }

      // jelöljük, hogy ez a szekció már megkapta az értesítést
      section.zsuriErtesitesSentAt = now;
      await section.save();
    }
  } catch (err) {
    console.error('Hiba a zsűritagok értesítésekor:', err);
  }
}


// 3️Időzítő: óránként lefuttatjuk (lastReminderAt miatt így is csak napi 1 mail jut bírálónként)
setInterval(() => {
  // 1️Bírálat indítható (feltöltési határidő lejárt + témavezető elfogadta)
  sendReviewStartEmailsAfterUploadDeadline()
    .catch(err => console.error('Hiba a bírálat megkezdéséről szóló értesítéseknél:', err));

  // 2️Már futó bírálatokhoz napi emlékeztető a bírálati határidő után
  sendDailyReviewReminders()
    .catch(err => console.error('Hiba az emlékeztető futtatásakor:', err));

  // 3️Bírálatok kiküldése hallgatóknak (pontszám nélkül)
  sendReviewsToStudentsAfterDeadline()
    .catch(err => console.error('Hiba a bírálatok hallgatóknak való kiküldésekor:', err));
  // 4️Zsűritagok értesítése
      sendZsuriNotificationsAfterDeadline()
    .catch(err => console.error('Hiba a zsűritagok értesítésekor:', err));
}, 1000 * 60 * 60); // kb. óránként



async function sendReviewStartEmailsAfterUploadDeadline() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Olyan dolgozatok, amelyeket a témavezető már elfogadott,
    // van elfogadott bírálójuk, de még NINCS kész bírálat.
    const dolgozatok = await Dolgozat.find({
      allapot: 'elfogadva - témavezető által',
      'biralok.allapot': 'Elfogadva'
    }).populate('biralok.felhasznaloId'); // kell az e-mail cím

    for (const d of dolgozatok) {
      // ellenőrizzük, hogy LEJÁRT-e a feltöltési határidő erre a dolgozatra
      const uploadDeadlineExpired = await isUploadDeadlineExpiredForDolgozat(d);
      if (!uploadDeadlineExpired) continue;

      // Végigmegyünk az elfogadott bírálókon
      for (const b of d.biralok || []) {
        if (b.allapot !== 'Elfogadva') continue;

        // Ha ma már KÜLDTÜNK neki bármilyen bírálati e-mailt (start vagy emlékeztető), ne küldjünk még egyet
        if (b.lastReminderAt) {
          const lastStr = b.lastReminderAt.toISOString().slice(0, 10);
          if (lastStr === todayStr) continue;
        }

        const felhasznalo = b.felhasznaloId;
        if (!felhasznalo || !felhasznalo.email) continue;

        const emailSzoveg = betoltEmailSablon('ertesites_biralat_megkezdheto.txt', {
          NEV: felhasznalo.nev || 'Tisztelt Bíráló',
          DOLGOZATCIM: d.cím || d.cim || 'ismeretlen című dolgozat',
          LINK: `http://localhost:3000/import_form.html?id=${d._id}&biraloId=${b.felhasznaloId}`
        });

        await transporter.sendMail({
          from: 'TDK rendszer <m48625729@gmail.com>',
          to: felhasznalo.email,
          subject: 'TDK dolgozat bírálata megkezdhető',
          text: emailSzoveg
        });

        // Megjegyezzük, hogy ma már küldtünk neki e-mailt
        b.lastReminderAt = now;
      }

      await d.save();
    }
  } catch (err) {
    console.error('Hiba a bírálat megkezdéséről szóló értesítések küldésekor:', err);
  }
}



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

      // HATÁRIDŐ ELLENŐRZÉS – szerver idő alapján
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

    // csak akkor küldünk e-mailt, ha most lépett át jelentkezett → feltöltve - témavezető válaszára vár
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


// Bírálók listázása (opcionálisan karszűréssel)
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


// Bíráló hozzárendelése egy dolgozathoz
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


// Bíráló eltávolítása egy dolgozatról
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


// Bírálói felkérés elfogadása / elutasítása
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

       // HATÁRIDŐ ELLENŐRZÉS
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



// Határidő törlése kulcs alapján
app.delete('/api/deadlines/:key', async (req, res) => {
  try {
    const key = req.params.key;

    // Töröljük a dokumentumot az adott kulcs alapján
    const deleted = await Deadline.findOneAndDelete({ key });

    // Ha nincs ilyen, én nem tekintem hibának – a cél úgyis az, hogy ne legyen határidő
    if (!deleted) {
      return res.status(200).json({ message: 'Nem volt beállítva határidő, nincs mit törölni.' });
    }

    res.json({ message: 'Határidő törölve.' });
  } catch (err) {
    console.error('Hiba a határidő törlésekor:', err);
    res.status(500).json({ error: 'Szerverhiba a határidő törlésekor.' });
  }
});




// Szerver indítása megadott porton
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
