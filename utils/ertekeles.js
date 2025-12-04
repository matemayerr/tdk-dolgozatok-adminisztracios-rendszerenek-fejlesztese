// Egyszerű segédfüggvény annak eldöntésére, hogy üres-e az értékelés
function isErtekelesUres(ertekeles = {}) {
  const pontszam = parseInt(ertekeles.pontszam, 10);
  const szoveg = (ertekeles.szovegesErtekeles || '').trim();

  return Number.isNaN(pontszam) && !szoveg;
}

module.exports = { isErtekelesUres };
