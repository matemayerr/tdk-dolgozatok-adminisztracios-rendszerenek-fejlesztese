// Express.js és szükséges modulok betöltése
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const resetTokens = {}; // egyszerű token tárolás memóriában (indítás után elveszik)


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
    hallgato_ids: { type: [String], required: true }, // ✔ Több hallgató támogatása
    temavezeto_id: { type: String, required: true },
    allapot: { type: String, default: 'benyújtva' },
    filePath: { type: String },
    pontszam: { type: String, default: '' },
    ertekelesFilePath: { type: String },
    elutasitas_oka: { type: String },
    szovegesErtekeles: { type: String }
}));


const bcrypt = require('bcrypt');

// Felhasznalo modell
const Felhasznalo = mongoose.model('felhasznalos', new mongoose.Schema({
    nev: { type: String, required: true },
    neptun: { type: String, required: false },
    email: { type: String, required: true },
    csoportok: { type: [String], required: true },
    kar: { type: String, required: false },
    jelszo: { type: String, required: false }
}));

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





// Nodemailer beállítása SendGrid SMTP szerverrel az e-mail küldéshez
const transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
        user: 'apikey', // ez a fix felhasználónév a SendGrid-ben
        pass: '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'
    }
});

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

// Értesítés küldése bírálónak e-mailben
async function kuldErtesitesBiralonak(biraloEmail, dolgozat) {
    const mailOptions = {
        from: 'm48625729@gmail.com',
        to: biraloEmail,
        subject: 'Új dolgozat érkezett értékelésre',
        text: `Tisztelt Bíráló!

Egy új dolgozat került feltöltésre a rendszerbe, amely értékelésre vár.

Dolgozat címe: ${dolgozat.cím}
Hallgató Neptun kódja: ${dolgozat.hallgato_id}
POST /api/felhasznalok
Üdvözlettel,
TDK Adminisztrációs Rendszer`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Értesítés sikeresen elküldve a bírálónak.');
    } catch (error) {
        console.error('Hiba történt az értesítés küldésekor:', error);
    }
}

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

// Csak a kész dolgozatok lekérdezése
app.get('/api/dolgozatok/kesz', async (req, res) => {
    try {
        const keszDolgozatok = await Dolgozat.find({
            allapot: { $in: ['elfogadva','feltöltve'] }
        });
        res.json(keszDolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a kész dolgozatok lekérésekor' });
    }
});

  // Új dolgozat hozzáadása
app.post('/api/dolgozatok', async (req, res) => {
    const { cím, hallgato_ids, temavezeto_id, allapot, leiras } = req.body;
    try {
        const dolgozat = new Dolgozat({ cím, hallgato_ids, temavezeto_id, allapot, leiras });
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
    const { cím, hallgato_id, temavezeto_id, allapot, elutasitas_oka } = req.body;

    try {
        const updatedDolgozat = await Dolgozat.findByIdAndUpdate(id, {
            cím, hallgato_id, temavezeto_id, allapot, elutasitas_oka
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

// Felhasználó CRUD műveletek

// Új felhasználó hozzáadása
app.post('/api/felhasznalok', async (req, res) => {
    const { nev, neptun, email, csoportok, kar, jelszo } = req.body;

    if (!nev || !email || !Array.isArray(csoportok)) {
        return res.status(400).json({ error: 'Hiányzó adatok' });
    }

    try {
        const ujFelhasznalo = {
            nev,
            neptun,
            email,
            csoportok,
            kar
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
    const { nev, neptun, email, csoportok } = req.body;

    try {
        const updatedFelhasznalo = await Felhasznalo.findByIdAndUpdate(
            id,
            { nev, neptun, email, csoportok },
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
            { hallgato_id: felhasznalo.neptun },
            { hallgato_id: "Nincs kijelölt személy. Kérjük válasszon másikat!" }
        );

        await Dolgozat.updateMany(
            { temavezeto_id: felhasznalo.neptun },
            { temavezeto_id: "Nincs kijelölt személy. Kérjük válasszon másikat!" }
        );

        res.json({ message: 'Felhasználó sikeresen törölve' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználó törlése során' });
    }
});



// Fájl feltöltése és értesítés küldése a bírálónak
app.post('/api/dolgozatok/feltoltes/:id', upload.single('file'), async (req, res) => {
    const { id } = req.params;
    const alapertelmezettEmail = 'mayer.mate@outlook.com'; // Fix e-mail cím

    if (!req.file) {
        return res.status(400).json({ error: 'Fájl nem lett kiválasztva!' });
    }

    try {
        const dolgozat = await Dolgozat.findById(id);
        if (!dolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }

        dolgozat.filePath = `/uploads/${req.file.filename}`;
        dolgozat.allapot = 'feltöltve';
        await dolgozat.save();

        const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_id });
        const biraloEmail = temavezeto ? temavezeto.email : alapertelmezettEmail;

        await kuldErtesitesBiralonak(biraloEmail, dolgozat);
        res.status(200).json({ message: 'Fájl sikeresen feltöltve és e-mail elküldve.', filePath: dolgozat.filePath });
    } catch (error) {
        console.error('Hiba történt a fájl mentése során:', error);
        res.status(500).json({ error: 'Hiba történt a fájl mentésekor' });
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

        const hallgato = await Felhasznalo.findOne({ neptun: dolgozat.hallgato_id });
        const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_id });

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

// Értesítés küldése a hallgatónak és a témavezetőnek az értékelésről
async function kuldErtesitesHallgatonakEsTemavezetonek(cimzettEmail, dolgozat, szerep) {
    const mailOptions = {
        from: 'm48625729@gmail.com',
        to: cimzettEmail,
        subject: 'Dolgozat értékelése befejeződött',
        text: `Tisztelt ${szerep}!

A dolgozat értékelése befejeződött.

Dolgozat címe: ${dolgozat.cím}
Érdemjegy: ${dolgozat.pontszam}

Üdvözlettel,
TDK Adminisztrációs Rendszer`
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
            allapot: { $in: ['feltöltve', 'értékelve'] }
        });
        res.json(dolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt az értékelhető dolgozatok lekérésekor' });
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
        await transporter.sendMail({
            from: 'TDK rendszer <m48625729@gmail.com>',
            to: email,
            subject: 'Jelszó visszaállítás',
            html: `
                <p>Kedves felhasználó!</p>
                <p>Ha Ön kérte a jelszó visszaállítását, kattintson az alábbi linkre:</p>
                <a href="${resetLink}">${resetLink}</a>
                <p>Ha nem Ön kérte, kérjük hagyja figyelmen kívül ezt az e-mailt.</p>
            `
        });

        res.status(200).json({ message: 'Email elküldve, ha a fiók létezik.' });
    } catch (error) {
        console.error('Hiba az e-mail küldés során:', error);
        res.status(500).json({ error: 'Nem sikerült e-mailt küldeni.' });
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

    await transporter.sendMail({
        from: 'TDK rendszer <m48625729@gmail.com>',
        to: email,
        subject: 'TDK Regisztráció',
        html: `<p>Kattints az alábbi linkre a regisztráció folytatásához:</p>
               <a href="${link}">${link}</a>`
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




// Szerver indítása megadott porton
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
