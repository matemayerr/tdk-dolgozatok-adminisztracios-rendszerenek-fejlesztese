const mongoose = require('mongoose');

const szakSchema = new mongoose.Schema({
  nev: String,
  tipus: String, // pl. BSc, MSc, FOSZK, Osztatlan
});

const karSchema = new mongoose.Schema({
  nev: String,
  rovidites: String,
  szakok: [szakSchema],
});

module.exports = mongoose.model('UniversityStructure', karSchema);
