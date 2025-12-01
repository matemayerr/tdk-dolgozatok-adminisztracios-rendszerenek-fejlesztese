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

// Statikus fájlok kiszolgálása (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Mongoose modell
const Dolgozat = mongoose.model('dolgozat', new mongoose.Schema({
    cím: { type: String, required: true },
    hallgato_id: { type: String, required: true },
    temavezeto_id: { type: String, required: true },
    allapot: { type: String, required: true },
    filePath: { type: String } // Fájl elérési út mentése
}));

// Multer beállítások a fájlfeltöltéshez
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads'); // A fájlokat az 'uploads' mappába mentjük
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Egyedi fájlnevet generálunk
    }
});

const upload = multer({ storage });

// Új dolgozat hozzáadása
app.post('/api/dolgozatok/feltoltes', async (req, res) => {
    const { cím, hallgato_id, temavezeto_id, allapot } = req.body;

    if (!cím || !hallgato_id || !temavezeto_id || !allapot) {
        return res.status(400).json({ error: 'Minden mezőt ki kell tölteni!' });
    }

    const dolgozat = new Dolgozat({ cím, hallgato_id, temavezeto_id, allapot });

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

// Kész dolgozatok lekérdezése
app.get('/api/dolgozatok/kesz', async (req, res) => {
    try {
        const keszDolgozatok = await Dolgozat.find({ allapot: 'elfogadva' });
        res.json(keszDolgozatok);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a kész dolgozatok lekérésekor' });
    }
});

// Dolgozat módosítása (hiányzó PUT végpont)
app.put('/api/dolgozatok/:id', async (req, res) => {
    const { id } = req.params;
    const { cím, hallgato_id, temavezeto_id, allapot } = req.body;

    if (!cím || !hallgato_id || !temavezeto_id || !allapot) {
        return res.status(400).json({ error: 'Minden mezőt ki kell tölteni!' });
    }

    try {
        const updatedDolgozat = await Dolgozat.findByIdAndUpdate(
            id,
            { cím, hallgato_id, temavezeto_id, allapot },
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

// Dolgozat törlése
app.delete('/api/dolgozatok/:id', async (req, res) => {
    try {
        const dolgozat = await Dolgozat.findByIdAndDelete(req.params.id);
        if (!dolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }
        res.json({ message: 'Dolgozat sikeresen törölve' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat törlése során' });
    }
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});

