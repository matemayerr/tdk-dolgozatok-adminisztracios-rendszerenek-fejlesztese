// models/universityStructure.js
const mongoose = require('mongoose');

const szakSchema = new mongoose.Schema({
  nev: String,
  rovidites: String,      // ha kell rövidítés is
  tipus: String           // pl. BSc, MSc, FOSZK, Osztatlan
});

const UniversityStructureSchema = new mongoose.Schema({
  nev: { type: String, required: true },        // kar neve
  rovidites: { type: String, required: true },  // pl. GIVK, KGGK
  szakok: [szakSchema],

  // Dolgozat-feltöltési határidő ehhez a karhoz
  feltoltesHatarido: { type: Date, default: null }
});

module.exports = mongoose.model('UniversityStructure', UniversityStructureSchema);
