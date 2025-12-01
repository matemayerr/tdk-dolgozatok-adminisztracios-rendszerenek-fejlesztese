const mongoose = require('mongoose');

const szakSchema = new mongoose.Schema({
  nev: String,
  tipus: String,           // pl. BSc, MSc, FOSZK, Osztatlan
});

// 🔹 EGYETLEN fő schema az egész dokumentumra
const UniversityStructureSchema = new mongoose.Schema({
  nev: { type: String, required: true },        // kar neve
  rovidites: { type: String, required: true },  // pl. GIVK, KGGK

  szakok: [szakSchema],                         // marad a régi felépítés

  // 🔹 ÚJ MEZŐ: dolgozat-feltöltési határidő
  feltoltesHatarido: { type: Date, default: null }
});

// 🔹 EGYETLEN export
module.exports = mongoose.model('UniversityStructure', UniversityStructureSchema);
