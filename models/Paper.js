const mongoose = require('mongoose');

const szerzoSchema = new mongoose.Schema({
  nev: String,
  szak: String,
  evfolyam: String,
});

const paperSchema = new mongoose.Schema({
  cim: String,
  szekcio: String,
  szerzok: [szerzoSchema],
});

module.exports = mongoose.model('Paper', paperSchema);

