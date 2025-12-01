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
  leiras: { type: String },
  hallgato_ids: { type: [String], required: true },
  temavezeto_ids: { type: [String], required: true },
  allapot: { type: String, default: 'jelentkezett' },
  filePath: { type: String },
  pontszam: { type: String, default: '' },
  ertekelesFilePath: { type: String },
  elutasitas_oka: { type: String },
  szovegesErtekeles: { type: String },
  ertekeles: { type: Object, default: {} }   // 🔹 EZ HIÁNYZOTT
}));



const bcrypt = require('bcrypt');

// Felhasznalo modell
const Felhasznalo = mongoose.model('felhasznalos', new mongoose.Schema({
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
        const token = jwt.sign({ id: felhasznalo._id, csoport: felhasznalo.csoport }, secretKey, { expiresIn: '1h' });

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
    pass: 'uxjraaxejiswddjn '       // ide az alkalmazásjelszavad, szóköz nélkül
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

// Minden dolgozat lekérdezése
app.get('/api/dolgozatok', async (req, res) => {
    try {
        const dolgozatok = await Dolgozat.find();
        res.json(dolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozatok lekérésekor' });
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
    const { cím, hallgato_ids, temavezeto_ids, leiras } = req.body;
    try {
        const dolgozat = new Dolgozat({ 
            cím, 
            hallgato_ids, 
            temavezeto_ids, 
            leiras, 
            allapot: 'jelentkezett'   // 🔹 Mindig alapértelmezett
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
    const { cím, hallgato_ids, temavezeto_ids, allapot, elutasitas_oka } = req.body;

    try {
        const updatedDolgozat = await Dolgozat.findByIdAndUpdate(id, {
            cím, hallgato_ids, temavezeto_ids, allapot, elutasitas_oka
        }, { new: true });

        if (!updatedDolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }
        res.json(updatedDolgozat);
    } catch (error) {
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


// Fájl feltöltése és értesítés küldése a témavezetőnek
app.post('/api/dolgozatok/feltoltes/:id', upload.single('file'), async (req, res) => {
    const { id } = req.params;
    const alapertelmezettEmail = 'mayer.mate@outlook.com'; // ideiglenes email

    if (!req.file) {
        return res.status(400).json({ error: 'Fájl nem lett kiválasztva!' });
    }

    try {
        const dolgozat = await Dolgozat.findById(id);
        if (!dolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }

        if (dolgozat.allapot !== 'jelentkezett') {
            return res.status(400).json({ error: 'Csak jelentkezett állapotú dolgozathoz tölthető fel fájl.' });
        }

        dolgozat.filePath = `/uploads/${req.file.filename}`;
        dolgozat.allapot = 'feltöltve - témavezető válaszára vár';
        await dolgozat.save();

        // küldünk értesítést a témavezetőnek
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
    const dolgozat = await Dolgozat.findById(req.params.id);
    if (!dolgozat) return res.status(404).json({ error: 'Dolgozat nem található' });

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

        const token = jwt.sign({ id: ujFelhasznalo._id }, secretKey, { expiresIn: '1h' });
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


// Egy dolgozat lekérése ID alapján
app.get('/api/papers/:id', async (req, res) => {
  try {
    const paper = await mongoose.connection.collection('dolgozats').findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });

    if (!paper) {
      return res.status(404).json({ error: 'A dolgozat nem található.' });
    }

    const felhasznalok = await mongoose.connection.collection('felhasznalos').find({}).toArray();

    const szerzok = (paper.hallgato_ids || []).map(neptun => {
      const felhasznalo = felhasznalok.find(f => f.neptun === neptun);
      return {
        nev: felhasznalo?.nev || '',
        szak: felhasznalo?.szak || '',
        evfolyam: felhasznalo?.evfolyam || ''
      };
    });

    res.json({
      cim: paper["cím"],
      szerzok
    });
  } catch (err) {
    console.error('Hiba a dolgozat lekérdezésekor:', err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});




app.get('/api/papers', async (req, res) => {
  try {
    const dolgozatok = await Dolgozat.find().lean();
    const felhasznalok = await Felhasznalo.find().lean();

    // Neptun → felhasználó map
    const felhasznaloMap = {};
    felhasznalok.forEach(f => {
      if (f.neptun) felhasznaloMap[f.neptun] = f;
    });

    const eredmeny = dolgozatok.map(d => ({
      _id: d._id,
      cim: d["cím"],
      allapot: d.allapot,
      ertekeles: d.ertekeles || {},   // 🔹 FONTOS
      szerzok: (d.hallgato_ids || []).map(neptun => ({
        nev: felhasznaloMap[neptun]?.nev || '',
        neptun: neptun,
        szak: felhasznaloMap[neptun]?.szak || '',
        evfolyam: felhasznaloMap[neptun]?.evfolyam || ''
      })),
      temavezeto: (d.temavezeto_ids || []).map(neptun => ({
        nev: felhasznaloMap[neptun]?.nev || '',
        neptun: neptun
      }))
    }));

    res.json(eredmeny);
  } catch (error) {
    console.error('Hiba a dolgozatok betöltésekor:', error);
    res.status(500).json({ error: 'Hiba történt a dolgozatok lekérdezésekor' });
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
  const { cim, osszefoglalo, temavezetoNev, temavezetoNeptun } = req.body;
  try {
    const ujTema = new TemaJavaslat({ cim, osszefoglalo, temavezetoNev, temavezetoNeptun });
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
    const temavezetok = await Felhasznalo.find({ csoportok: { $in: ['temavezeto'] } });
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
    const topic = await TemaJavaslat.findById(id); // ✅ helyes modellnév
    if (!topic) return res.status(404).json({ error: 'Téma nem található' });

    const newDolgozat = new Dolgozat({
      cím: topic.cim,
      leiras: topic.osszefoglalo,
      hallgato_ids: hallgato_ids || [],
      temavezeto_ids: [topic.temavezetoNeptun],
      allapot: 'jelentkezett'
    });

    await newDolgozat.save();
    res.status(201).json({ message: 'Jelentkezés sikeres, a dolgozat létrehozva.', dolgozat: newDolgozat });
  } catch (err) {
    console.error('Hiba a jelentkezés során:', err);
    res.status(500).json({ error: 'Szerverhiba a jelentkezés mentésekor' });
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
  


app.get('/dolgozatok/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'review-thesis.html'));
});


// Szerver indítása megadott porton
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
