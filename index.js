// Express.js és szükséges modulok betöltése
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');

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
    hallgato_id: { type: String, required: true },
    temavezeto_id: { type: String, required: true },
    allapot: { type: String, default: 'benyújtva' },
    filePath: { type: String },
    pontszam: { type: String, default: '' },
    ertekelesFilePath: { type: String },
    elutasitas_oka: { type: String }
}));

const Felhasznalo = mongoose.model('felhasznalo', new mongoose.Schema({
    nev: { type: String, required: true },
    neptun: { type: String, required: true },
    email: { type: String, required: true },
    csoport: { type: String, required: true }
}));

// Nodemailer beállítása SendGrid SMTP szerverrel az e-mail küldéshez
const transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
        user: 'apikey', // SendGrid fix felhasználónév
        pass: 'API_KEY_HERE' // SendGrid API kulcsod helye
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
            allapot: { $in: ['elfogadva', 'feltöltésre vár', 'feltöltve', 'értékelve'] }
        });
        res.json(keszDolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a kész dolgozatok lekérésekor' });
    }
});

// Új dolgozat hozzáadása
app.post('/api/dolgozatok', async (req, res) => {
    const { cím, hallgato_id, temavezeto_id } = req.body;
    const dolgozat = new Dolgozat({ cím, hallgato_id, temavezeto_id });

    try {
        await dolgozat.save();
        res.status(201).json(dolgozat);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat mentésekor' });
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
    const { nev, neptun, email, csoport } = req.body;
    const felhasznalo = new Felhasznalo({ nev, neptun, email, csoport });

    try {
        await felhasznalo.save();
        res.status(201).json(felhasznalo);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználó mentésekor' });
    }
});

// Felhasználók listázása
app.get('/api/felhasznalok', async (req, res) => {
    try {
        const felhasznalok = await Felhasznalo.find();
        res.json(felhasznalok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználók lekérésekor' });
    }
});

// Csoportok szerinti felhasználók listázása
app.get('/api/felhasznalok/csoportok', async (req, res) => {
    try {
        const hallgatok = await Felhasznalo.find({ csoport: 'hallgato' });
        const temavezetok = await Felhasznalo.find({ csoport: 'temavezeto' });
        res.json({ hallgatok, temavezetok });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználók lekérésekor csoportok szerint' });
    }
});

// Felhasználó módosítása
app.put('/api/felhasznalok/:id', async (req, res) => {
    const { id } = req.params;
    const { nev, neptun, email, csoport } = req.body;

    try {
        const updatedFelhasznalo = await Felhasznalo.findByIdAndUpdate(
            id,
            { nev, neptun, email, csoport },
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

// Szerver indítása megadott porton
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
