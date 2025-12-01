const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');

const app = express();
const port = 3000;

// MongoDB kapcsolat
mongoose.connect('mongodb://localhost:27017/tdk_adatbazis')
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.error('Could not connect to MongoDB:', err);
    });

// Statikus fájlok kiszolgálása (HTML, CSS, JS és feltöltött fájlok)
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'uploads')));
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

// Felhasználók hozzáadása
app.post('/api/felhasznalok', async (req, res) => {
    const { nev, neptun, email, csoport } = req.body;

    if (!nev || !neptun || !email || !csoport) {
        return res.status(400).json({ error: 'Minden mezőt ki kell tölteni!' });
    }

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

// Multer beállítások a fájlfeltöltéshez
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Új dolgozat hozzáadása
app.post('/api/dolgozatok/feltoltes', async (req, res) => {
    const { cím, hallgato_id, temavezeto_id } = req.body;

    if (!cím || !hallgato_id || !temavezeto_id) {
        return res.status(400).json({ error: 'Minden mezőt ki kell tölteni!' });
    }

    const dolgozat = new Dolgozat({ cím, hallgato_id, temavezeto_id });

    try {
        await dolgozat.save();
        res.status(201).json(dolgozat);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat mentésekor' });
    }
});

// Fájl feltöltése egy kész dolgozathoz
app.post('/api/dolgozatok/feltoltes/:id', upload.single('file'), async (req, res) => {
    const { id } = req.params;

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

        res.status(200).json({ message: 'Fájl sikeresen feltöltve', filePath: dolgozat.filePath });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a fájl mentésekor' });
    }
});

// Minden dolgozat lekérdezése
app.get('/api/dolgozatok', async (req, res) => {
    try {
        const dolgozatok = await Dolgozat.find();
        res.json(dolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozatok lekérésekor' });
    }
});

// Kész dolgozatok lekérdezése (értelemszerűen minden olyan dolgozat, amelynek allapota nem „benyújtva”)
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

// Dolgozat értékelése és érdemjegy mentése fájlfeltöltéssel
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

        dolgozat.pontszam = pontszam;
        dolgozat.ertekelesFilePath = `/uploads/${req.file.filename}`;
        dolgozat.allapot = 'értékelve';
        await dolgozat.save();

        res.status(200).json({ message: 'Értékelés sikeresen mentve', filePath: dolgozat.ertekelesFilePath });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt az értékelés mentésekor' });
    }
});

// Dolgozat törlése
app.delete('/api/dolgozatok/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const dolgozat = await Dolgozat.findByIdAndDelete(id);
        if (!dolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }
        res.json({ message: 'Dolgozat sikeresen törölve' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat törlése során' });
    }
});

// Dolgozat módosítása, beleértve az elutasítás okát
app.put('/api/dolgozatok/:id', async (req, res) => {
    const { id } = req.params;
    const { cím, hallgato_id, temavezeto_id, allapot, elutasitas_oka } = req.body;

    if (!cím || !hallgato_id || !temavezeto_id || !allapot) {
        return res.status(400).json({ error: 'Minden mezőt ki kell tölteni!' });
    }

    try {
        const updatedDolgozat = await Dolgozat.findByIdAndUpdate(
            id,
            { cím, hallgato_id, temavezeto_id, allapot, elutasitas_oka },
            { new: true }
        );

        if (!updatedDolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }

        res.json(updatedDolgozat);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat módosítása során' });
    }
});

// Felhasználó törlése
app.delete('/api/felhasznalok/:id', async (req, res) => {
    try {
        const felhasznalo = await Felhasznalo.findByIdAndDelete(req.params.id);
        if (!felhasznalo) {
            return res.status(404).json({ error: 'Felhasználó nem található' });
        }
        res.json({ message: 'Felhasználó törölve' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a felhasználó törlése során' });
    }
});

// Felhasználó módosítása
app.put('/api/felhasznalok/:id', async (req, res) => {
    try {
        const { nev, neptun, email, csoport } = req.body;
        const updatedFelhasznalo = await Felhasznalo.findByIdAndUpdate(
            req.params.id,
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


app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});

