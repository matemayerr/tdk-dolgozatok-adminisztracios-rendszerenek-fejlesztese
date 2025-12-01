document.addEventListener("DOMContentLoaded", async () => {
    await betoltDolgozatok();
    await betoltSzemelyek();
    frissitLathatosag(); // csak az első mutatott szekció
  
    document.getElementById('statisztika-valaszto').addEventListener('change', frissitLathatosag);
  });
  
  function frissitLathatosag() {
    const valasztott = document.getElementById('statisztika-valaszto').value;
  
    document.getElementById('szekcio-dolgozatok').style.display = valasztott === 'dolgozatok' ? 'block' : 'none';
    document.getElementById('szekcio-szemelyek').style.display = valasztott === 'szemelyek' ? 'block' : 'none';
  }
  
  async function betoltDolgozatok() {
    try {
      const res = await fetch('/api/stats/dolgozatok');
      const dolgozatok = await res.json();
  
      const tbody = document.querySelector('#dolgozatok-table tbody');
      tbody.innerHTML = '';
  
      dolgozatok.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${d.cím}</td>
          <td>${d.hallgatok.join(', ')}</td>
          <td>${d.temavezeto.join(', ')}</td>
          <td>${d.allapot}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Hiba a dolgozatok lekérésekor:', err);
    }
  }
  
  async function betoltSzemelyek() {
    try {
      const res = await fetch('/api/stats/szemelyek');
      const szemelyek = await res.json();
  
      const tbody = document.querySelector('#szemelyek-table tbody');
      tbody.innerHTML = '';
  
      szemelyek.forEach((s, index) => {
        const tr = document.createElement('tr');
  
        const dolgozatListaId = `lista-${index}`;
        const gombId = `gomb-${index}`;
  
        const listaHTML = s.dolgozatCimek?.length
          ? `
            <button id="${gombId}" class="toggle-btn">📂 Megnyitás</button>
            <ul id="${dolgozatListaId}" class="hidden">
              ${s.dolgozatCimek.map(cim => `<li>${cim}</li>`).join('')}
            </ul>
          `
          : '—';
  
        tr.innerHTML = `
          <td>${s.nev}</td>
          <td>${s.neptun}</td>
          <td>${s.szerep}</td>
          <td>
            ${s.db}
            <br>
            ${listaHTML}
          </td>
        `;
  
        tbody.appendChild(tr);
  
        // Gomb eseménykezelő a lista nyitásához/csukásához
        if (s.dolgozatCimek?.length) {
          const gomb = tr.querySelector(`#${gombId}`);
          const lista = tr.querySelector(`#${dolgozatListaId}`);
  
          gomb.addEventListener('click', () => {
            const nyitott = !lista.classList.contains('hidden');
            lista.classList.toggle('hidden');
            gomb.textContent = nyitott ? '📂 Megnyitás' : '📁 Bezárás';
          });
        }
      });
    } catch (err) {
      console.error('Hiba a személyek lekérésekor:', err);
    }
  }
  