const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

// MongoDB kapcsolat
mongoose.connect('mongodb://localhost:27017/tdk_adatbazis')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

// Statikus fájlok kiszolgálása
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Mongoose modellek
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

// Nodemailer beállítás SendGrid SMTP-vel
const transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
        user: 'apikey', // ez a fix felhasználónév a SendGrid-ben
        pass: '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' // cseréld ki a generált SendGrid API kulcsodra
    }
});


// E-mail küldése bírálónak
async function kuldErtesitesBiralonak(biraloEmail, dolgozat) {
    const mailOptions = {
        from: 'm48625729@gmail.com',
        to: 'mayer.mate@outlook.com',
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

// Multer fájlkezelés beállítása
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads');  // Az 'uploads' mappa a 'public' mappán kívül van
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Fájl megtekintése speciális URL-en keresztül
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.sendFile(filePath);
});

// CRUD műveletek

// Minden dolgozat lekérdezése
app.get('/api/dolgozatok', async (req, res) => {
    try {
        const dolgozatok = await Dolgozat.find();
        res.json(dolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozatok lekérésekor' });
    }
});

// Kész dolgozatok lekérdezése a feltöltési oldalhoz
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

// Felhasználók hozzáadása
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

// Felhasználók lekérdezése
app.get('/api/felhasznalok', async (req, res) => {
    try {
        const felhasznalok = await Felhasznalo.find();
        res.json(felhasznalok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználók lekérésekor' });
    }
});

// Csoportok szerinti felhasználók lekérdezése
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

// Fájl feltöltése és e-mail küldése
app.post('/api/dolgozatok/feltoltes/:id', upload.single('file'), async (req, res) => {
    const { id } = req.params;
    const alapertelmezettEmail = 'mayer.mate@outlook.com'; // Itt add meg a fix e-mail címet

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

        // Bíráló vagy témavezető e-mail cím keresése
        const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_id });
        const biraloEmail = temavezeto ? temavezeto.email : alapertelmezettEmail;

        // Értesítés küldése
        await kuldErtesitesBiralonak(biraloEmail, dolgozat);
        res.status(200).json({ message: 'Fájl sikeresen feltöltve és e-mail elküldve.', filePath: dolgozat.filePath });
    } catch (error) {
        console.error('Hiba történt a fájl mentése során:', error);
        res.status(500).json({ error: 'Hiba történt a fájl mentésekor' });
    }
});

// Dolgozat értékelési fájl és pontszám feltöltése
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

        // Fájl mentése és állapot frissítése
        dolgozat.ertekelesFilePath = `/uploads/${req.file.filename}`;
        dolgozat.pontszam = pontszam;
        dolgozat.allapot = 'értékelve';
        await dolgozat.save();

        // Hallgató és témavezető e-mail címének lekérdezése a Neptun-kód alapján
        const hallgato = await Felhasznalo.findOne({ neptun: dolgozat.hallgato_id });
        const temavezeto = await Felhasznalo.findOne({ neptun: dolgozat.temavezeto_id });

        // E-mail küldése, ha megtaláltuk a hallgató és témavezető e-mail címét
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


// Szerver indítása
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});

