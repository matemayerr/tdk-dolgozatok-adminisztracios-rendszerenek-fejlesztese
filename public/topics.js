document.addEventListener('DOMContentLoaded', async () => {
  // Globális flag alapértéke – ne írjuk felül, ha máshol már beállítottad
  if (typeof window.dolgozatJelentkezesLejart === 'undefined') {
    window.dolgozatJelentkezesLejart = false;
  }

  // Jelentkezési határidő betöltése, ha létezik ilyen függvény (pl. másik JS-ben)
  if (typeof betoltDolgozatJelentkezesHatarido === 'function') {
    try {
      betoltDolgozatJelentkezesHatarido();
    } catch (e) {
      console.warn('Hiba a jelentkezési határidő betöltésekor:', e);
    }
  }

  // 🔹 ÚJ: Jelentkezési határidő lekérdezése kifejezetten a témák oldalra
  async function initJelentkezesiHataridoTopics() {
    try {
      const res = await fetch('/api/deadlines/dolgozat_jelentkezes');
      if (!res.ok) {
        // ha nincs határidő beállítva, engedjük a jelentkezést
        return;
      }

      const data = await res.json();
      if (!data.hatarido) return;

      const deadline = new Date(data.hatarido);
      const now = new Date();

      // ha már lejárt
      if (now > deadline) {
        window.dolgozatJelentkezesLejart = true;

        // Ha a táblázat már fel van építve, azonnal tiltsuk a Jelentkezés gombokat
        document.querySelectorAll('#topic-table .topic-apply-btn').forEach(btn => {
          btn.disabled = true;
          btn.classList.add('disabled-btn');
        });
      } else {
        // ha még nem járt le, biztosítsuk, hogy false legyen
        window.dolgozatJelentkezesLejart = false;
      }
    } catch (err) {
      console.error('Hiba a dolgozat jelentkezési határidő lekérésekor (topics):', err);
      // hiba esetén inkább engedjük a jelentkezést
    }
  }

  const newTopicBtn       = document.getElementById('new-topic-btn');
  const topicForm         = document.getElementById('topic-form');
  const cancelBtn         = document.getElementById('topic-cancel');
  const tableBody         = document.querySelector('#topic-table tbody');
  const supervisorSelect  = document.getElementById('topic-supervisor');

  let selectedTopicId = null;
  let currentEditId   = null;

  // ───────────────────────────────── 2) TÉMÁK LISTÁZÁSA
  async function loadTopics() {
    if (!tableBody) return; // ha nincs topics táblázat, lépjünk ki

    try {
      const res = await fetch('/api/topics');
      if (!res.ok) throw new Error('Hibás válasz /api/topics');
      let topics = await res.json();

      // 🔹 Lekérjük az aktuális felhasználót
      const userData = JSON.parse(localStorage.getItem('felhasznalo') || 'null');

      // 🔹 Ha hallgató, lekérjük a már beadott dolgozatait, és kiszűrjük a már választott témákat
      let dolgozatok = [];
      if (userData?.csoportok?.includes('hallgato')) {
        try {
          const resDolgozat = await fetch('/api/dolgozatok');
          if (resDolgozat.ok) {
            dolgozatok = await resDolgozat.json();
          }
        } catch (e) {
          console.warn('Dolgozatok lekérése nem sikerült:', e);
        }

        const jelentkezettCimek = dolgozatok
          .filter(d => d.hallgato_ids?.includes(userData.neptun))
          .map(d => d.cím);

        topics = topics.filter(t => !jelentkezettCimek.includes(t.cim));
      }

      tableBody.innerHTML = '';

      topics.forEach(t => {
        const tr = document.createElement('tr');
        const cim     = t.cim || '';
        const tvNev   = t.temavezetoNev || t.temavezeto?.nev || '';
        const tanszek = (t.tanszek && t.tanszek.trim() !== '') ? t.tanszek : '–';
        const kar     = t.kar?.nev || t.kar || '–';
        const ossz    = t.osszefoglalo || t.osszefoglal || '';

        tr.innerHTML = `
          <td class="clickable-title" data-id="${t._id}">${cim}</td>
          <td>${tvNev}</td>
          <td>${tanszek}</td>
          <td>${kar}</td>
          <td>
            <button class="jelentkezes-btn topic-apply-btn" data-topic-id="${t._id}">
              Jelentkezés
            </button>
            <button class="modosit-btn" data-id="${t._id}">Módosítás</button>
            <button class="delete-btn" data-id="${t._id}">Törlés</button>
          </td>
        `;
        tableBody.appendChild(tr);

        // Lenyitható összefoglaló sor
        const detailsRow = document.createElement('tr');
        detailsRow.classList.add('topic-details-row', 'hidden');
        detailsRow.innerHTML = `
          <td colspan="5">
            <div class="topic-details-panel">
              <p><strong>Tartalmi összefoglaló:</strong></p>
              <p>${ossz || '(nincs megadva)'}</p>
            </div>
          </td>
        `;
        tableBody.appendChild(detailsRow);
      });

      // Címre kattintva lenyitja az összefoglalót
      document.querySelectorAll('.clickable-title').forEach(cell => {
        cell.addEventListener('click', () => {
          const detailsRow = cell.closest('tr').nextElementSibling;
          if (!detailsRow) return;
          detailsRow.classList.toggle('hidden');
        });
      });

      // Jelentkezés gombok
      document.querySelectorAll('#topic-table .jelentkezes-btn').forEach(b => {
        b.addEventListener('click', () => jelentkezesTema(b.dataset.topicId));
      });

      // 🔹 ÚJ: ha a határidő lejárt, tiltsuk le az összes Jelentkezés gombot
      if (window.dolgozatJelentkezesLejart) {
        document
          .querySelectorAll('#topic-table .topic-apply-btn')
          .forEach(btn => {
            btn.disabled = true;
            btn.classList.add('disabled-btn');
          });
      }

      // Módosítás gombok
      document.querySelectorAll('#topic-table .modosit-btn').forEach(b => {
        b.addEventListener('click', () => modositTema(b.dataset.id));
      });

      // Törlés gombok
      document.querySelectorAll('#topic-table .delete-btn').forEach(b => {
        b.addEventListener('click', () => torolTema(b.dataset.id));
      });

    } catch (err) {
      console.error('Hiba a témák betöltésekor:', err);
      tableBody.innerHTML = '<tr><td colspan="5">(Hiba a témák betöltésekor)</td></tr>';
    }
  }

  // Tegyük elérhetővé más JS-nek is
  window.loadTopics  = loadTopics;
  window.betoltTemak = loadTopics;

  // ───────────────────────────────── 3) ÚJ TÉMA — ŰRLAP
  if (newTopicBtn && topicForm && cancelBtn) {
    newTopicBtn.addEventListener('click', () => {
      document.getElementById('uj-topic-homalyositas').style.display = 'block';
      topicForm.style.display = 'block';
    });

    cancelBtn.addEventListener('click', () => {
      topicForm.reset();
      topicForm.style.display = 'none';
      document.getElementById('uj-topic-homalyositas').style.display = 'none';
    });

    topicForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cim          = document.getElementById('topic-title').value.trim();
      const osszefoglalo = document.getElementById('topic-description').value.trim();

      const userData = JSON.parse(localStorage.getItem('felhasznalo') || 'null');
      if (!userData || !userData.nev || !userData.neptun) {
        alert('Hiba: bejelentkezett felhasználó adatai nem elérhetők.');
        return;
      }

      const temavezetoNev    = userData.nev;
      const temavezetoNeptun = userData.neptun;
      const kar = typeof userData.kar === 'object' ? userData.kar.nev : userData.kar || '';
      const tanszek = (userData.tanszek && userData.tanszek.trim() !== '')
        ? userData.tanszek
        : '–';

      if (!cim || !osszefoglalo) {
        alert('Minden mezőt ki kell tölteni!');
        return;
      }

      try {
        const res = await fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cim,
            osszefoglalo,
            temavezetoNev,
            temavezetoNeptun,
            kar,
            tanszek
          })
        });

        if (!res.ok) throw new Error('Mentési hiba /api/topics');

        alert('Témajavaslat elmentve.');
        topicForm.reset();
        topicForm.style.display = 'none';
        document.getElementById('uj-topic-homalyositas').style.display = 'none';
        loadTopics();
      } catch (err) {
        console.error('Hiba a téma mentésekor:', err);
        alert('Hiba történt a téma mentésekor.');
      }
    });
  }

  // ───────────────────────────────── 4) EGYSZERŰ JELENTKEZÉS (MODAL NÉLKÜL)
  async function jelentkezesTema(topicId) {
    // 🔹 Ha lejárt a jelentkezési határidő, ne engedjünk jelentkezni
    if (window.dolgozatJelentkezesLejart) {
      alert('A dolgozat jelentkezési határideje lejárt, témára már nem lehet jelentkezni.');
      return;
    }

    const userData = JSON.parse(localStorage.getItem('felhasznalo') || 'null');
    if (!userData || !userData.neptun || !userData.csoportok?.includes('hallgato')) {
      alert('Csak bejelentkezett hallgató jelentkezhet témára!');
      return;
    }

    try {
      // Lekérjük a kiválasztott téma adatait
      const resTopic = await fetch('/api/topics');
      if (!resTopic.ok) throw new Error('Hiba a /api/topics lekérdezésekor');
      const topics = await resTopic.json();
      const selected = topics.find(t => t._id === topicId);
      if (!selected) {
        alert('A téma nem található.');
        return;
      }

      // Létrehozzuk a dolgozat bejegyzést
      const dolgozat = {
        cím: selected.cim,
        leiras: selected.osszefoglalo,
        hallgato_ids: [userData.neptun],
        temavezeto_ids: [selected.temavezetoNeptun],
        allapot: 'jelentkezett'
      };

      const res = await fetch('/api/dolgozatok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dolgozat)
      });

      if (!res.ok) throw new Error('Sikertelen jelentkezés');
      alert('Sikeresen jelentkeztél a témára!');

      // 🔹 Frissítjük a listát, hogy eltűnjön a jelentkezett téma
      await loadTopics();

    } catch (err) {
      console.error('Hiba a jelentkezés során:', err);
      alert('Hiba történt a jelentkezés során.');
    }
  }

  // ───────────────────────────────── 5) TÉMA TÖRLÉSE
  async function torolTema(id) {
    if (!confirm('Biztosan törlöd ezt a témajavaslatot?')) return;
    try {
      const res = await fetch(`/api/topics/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Törlési hiba');
      loadTopics();
    } catch (err) {
      console.error('Hiba a téma törlésekor:', err);
      alert('Hiba történt törlés közben.');
    }
  }

  // ───────────────────────────────── 6) TÉMA MÓDOSÍTÁS

  // 🔹 Legördülő témavezetők listájának feltöltése (szerkesztő modalhoz)
  async function loadTemavezetoSelect() {
    const select = document.getElementById('edit-supervisor');
    if (!select) return;

    try {
      const res = await fetch('/api/temavezetok');
      if (!res.ok) throw new Error('Nem sikerült lekérni a témavezetőket');
      const temavezetoLista = await res.json();

      select.innerHTML = '';

      temavezetoLista.forEach(tv => {
        const opt = document.createElement('option');
        opt.value = tv.nev;
        opt.textContent = `${tv.nev} (${tv.neptun})`;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('Hiba a témavezetők betöltésekor:', err);
    }
  }

  async function initEditModal() {
    await loadTemavezetoSelect();
  }

  function modositTema(id) {
    currentEditId = id;
    const row = document.querySelector(`button[data-id="${id}"]`)?.closest('tr');
    if (!row) return;

    const cells = row.querySelectorAll('td');

    const editTitle      = document.getElementById('edit-title');
    const editSupervisor = document.getElementById('edit-supervisor');
    const editDept       = document.getElementById('edit-department');
    const editFaculty    = document.getElementById('edit-faculty');
    const editSummary    = document.getElementById('edit-summary');

    if (!editTitle || !editSupervisor || !editDept || !editFaculty || !editSummary) {
      console.warn('Hiányzó edit modal elemek.');
      return;
    }

    editTitle.value      = cells[0].innerText.trim();
    editSupervisor.value = cells[1].innerText.trim();
    editDept.value       = cells[2].innerText.trim();
    editFaculty.value    = cells[3].innerText.trim();

    const summaryRow = row.nextElementSibling;
    if (summaryRow && summaryRow.querySelector('.topic-details-panel')) {
      editSummary.value =
        summaryRow.querySelector('.topic-details-panel p:nth-child(2)').innerText.trim();
    }

    document.getElementById('edit-modal').style.display = 'block';
    document.getElementById('uj-topic-homalyositas').style.display = 'block';
  }

  const saveEditBtn   = document.getElementById('save-edit-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');

  if (saveEditBtn && cancelEditBtn) {
    saveEditBtn.addEventListener('click', async () => {
      const cim           = document.getElementById('edit-title').value.trim();
      const temavezetoNev = document.getElementById('edit-supervisor').value.trim();
      const tanszek       = document.getElementById('edit-department').value.trim();
      const kar           = document.getElementById('edit-faculty').value.trim();
      const osszefoglalo  = document.getElementById('edit-summary').value.trim();

      if (!cim || !temavezetoNev || !osszefoglalo) {
        alert('A cím, témavezető és összefoglaló mező kötelező!');
        return;
      }

      try {
        const res = await fetch(`/api/topics/${currentEditId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cim, temavezetoNev, tanszek, kar, osszefoglalo })
        });

        if (!res.ok) throw new Error('Hiba a módosítás mentésekor.');
        alert('Téma sikeresen módosítva.');
        document.getElementById('edit-modal').style.display = 'none';
        document.getElementById('uj-topic-homalyositas').style.display = 'none';
        loadTopics();
      } catch (err) {
        console.error('Hiba a mentés során:', err);
        alert('Nem sikerült a mentés.');
      }
    });

    cancelEditBtn.addEventListener('click', () => {
      document.getElementById('edit-modal').style.display = 'none';
      document.getElementById('uj-topic-homalyositas').style.display = 'none';
    });
  }

  // ───────────────────────────────── 7) RÉGI MÓDOSÍTÁS MENTÉSE (inline edit támogatás)
  async function mentModositast(id) {
    const cimElem  = document.getElementById(`edit-cim-${id}`);
    const osszElem = document.getElementById(`edit-ossz-${id}`);
    if (!cimElem || !osszElem) return;

    const cim = cimElem.value.trim();
    const ossz = osszElem.value.trim();

    if (!cim || !ossz) {
      alert('Minden mezőt ki kell tölteni!');
      return;
    }

    try {
      const res = await fetch(`/api/topics/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cim, osszefoglalo: ossz })
      });

      if (!res.ok) throw new Error('Hiba a módosítás mentésekor.');
      alert('Téma sikeresen módosítva.');
      loadTopics();
    } catch (err) {
      console.error('Hiba a módosítás mentésekor:', err);
      alert('Hiba történt a mentés során.');
    }
  }

  // Ha máshol is hivatkozod:
  window.mentModositast = mentModositast;

  // ───────────────────────────────── INDULÓ BETÖLTÉS
  await initEditModal();
  await initJelentkezesiHataridoTopics();  // 🔹 határidő lekérdezése
  await loadTopics();
});


// ───────────────────────────────── RENDEZÉS OSZLOP SZERINT (párokban tartva a részleteket)
let sortDirection = {}; // oszloponként: true = növekvő, false = csökkenő

function sortTableByColumn(columnIndex) {
  const table = document.getElementById('topic-table');
  if (!table) return;

  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));

  // Csak a fő sorokat (páros indexűeket) gyűjtjük be (a részletek a következő sorban vannak)
  const dataRows = [];
  for (let i = 0; i < rows.length; i += 2) {
    const mainRow   = rows[i];
    const detailRow = rows[i + 1];
    if (!mainRow) continue;
    dataRows.push({ mainRow, detailRow });
  }

  sortDirection[columnIndex] = !sortDirection[columnIndex];
  const direction = sortDirection[columnIndex] ? 1 : -1;

  const sorted = dataRows.sort((a, b) => {
    const cellA = a.mainRow.children[columnIndex]?.textContent.trim().toLowerCase() || '';
    const cellB = b.mainRow.children[columnIndex]?.textContent.trim().toLowerCase() || '';
    return cellA.localeCompare(cellB) * direction;
  });

  // Eredeti sorok törlése
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }

  // Újrarendezett sorok beszúrása
  sorted.forEach(({ mainRow, detailRow }) => {
    tbody.appendChild(mainRow);
    if (detailRow) tbody.appendChild(detailRow);
  });
}
