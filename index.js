const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = 3000;

// MongoDB kapcsolat
mongoose.connect('mongodb://localhost:27017/tdk_adatbazis', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Could not connect to MongoDB:', err);
});

// Statikus fájlok kiszolgálása (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Mongoose modellek
const Dolgozat = mongoose.model('dolgozat', new mongoose.Schema({
    cím: { type: String, required: true },    // Biztosítjuk, hogy a cím kötelező
    hallgato_id: { type: String, required: true },
    temavezeto_id: { type: String, required: true },
    allapot: { type: String, required: true },
    filePath: String // Fájl útvonal tárolása
}));

// Fájlok feltöltési beállításai
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Dolgozat hozzáadása (fájllal együtt)
app.post('/api/dolgozatok/feltoltes', upload.single('dolgozatFile'), async (req, res) => {
    const { cím, hallgato_id, temavezeto_id, allapot } = req.body;

    // Ellenőrizzük, hogy a szükséges mezők kitöltöttek-e
    if (!cím || !hallgato_id || !temavezeto_id || !allapot) {
        return res.status(400).json({ error: 'Minden mezőt ki kell tölteni!' });
    }

    const filePath = req.file ? req.file.path : null;

    const dolgozat = new Dolgozat({
        cím,
        hallgato_id,
        temavezeto_id,
        allapot,
        filePath
    });

    try {
        await dolgozat.save();
        res.status(201).json(dolgozat);
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat mentésekor' });
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

// Dolgozat módosítása
app.put('/api/dolgozatok/:id', async (req, res) => {
    const { cím, hallgato_id, temavezeto_id, allapot } = req.body;

    // Ellenőrizzük, hogy a szükséges mezők kitöltöttek-e
    if (!cím || !hallgato_id || !temavezeto_id || !allapot) {
        return res.status(400).json({ error: 'Minden mezőt ki kell tölteni!' });
    }

    try {
        const updatedDolgozat = await Dolgozat.findByIdAndUpdate(req.params.id, {
            cím,
            hallgato_id,
            temavezeto_id,
            allapot
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
    try {
        const dolgozat = await Dolgozat.findByIdAndDelete(req.params.id);
        if (!dolgozat) {
            return res.status(404).json({ error: 'Dolgozat nem található' });
        }
        if (dolgozat.filePath) {
            fs.unlinkSync(dolgozat.filePath);
        }
        res.json({ message: 'Dolgozat sikeresen törölve' });
    } catch (error) {
        res.status(500).json({ error: 'Hiba történt a dolgozat törlésekor' });
    }
});

// Fájlok letöltése
app.use('/uploads', express.static('uploads'));

// Szerver indítása
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

