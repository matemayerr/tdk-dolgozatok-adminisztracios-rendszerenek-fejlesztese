const { isErtekelesUres } = require('./ertekeles');

describe('isErtekelesUres', () => {
  test('igazat ad, ha se pontszám, se szöveg nincs', () => {
    const eredmeny = isErtekelesUres({ pontszam: '', szovegesErtekeles: '   ' });
    expect(eredmeny).toBe(true);
  });

  test('hamisat ad, ha csak pontszám van', () => {
    const eredmeny = isErtekelesUres({ pontszam: '15', szovegesErtekeles: '' });
    expect(eredmeny).toBe(false);
  });

  test('hamisat ad, ha csak szöveg van', () => {
    const eredmeny = isErtekelesUres({ pontszam: '', szovegesErtekeles: 'jó dolgozat' });
    expect(eredmeny).toBe(false);
  });
});
