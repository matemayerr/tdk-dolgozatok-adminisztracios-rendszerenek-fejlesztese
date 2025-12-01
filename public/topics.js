document.addEventListener('DOMContentLoaded', async () => {
  const newTopicBtn = document.getElementById('new-topic-btn');
  const topicForm   = document.getElementById('topic-form');
  const cancelBtn   = document.getElementById('topic-cancel');
  const tableBody   = document.querySelector('#topic-table tbody');
  const supervisorSelect = document.getElementById('topic-supervisor');


  let selectedTopicId = null;


  // ───────────────────────────────── 2) TÉMÁK LISTÁZÁSA
  async function loadTopics() {
    try {
      const res = await fetch('/api/topics');
      if (!res.ok) throw new Error('Hibás válasz /api/topics');
      let topics = await res.json();

      // 🔹 Lekérjük az aktuális felhasználót
const userData = JSON.parse(localStorage.getItem('felhasznalo'));

// 🔹 Ha hallgató, lekérjük a már beadott dolgozatait
let dolgozatok = [];
if (userData?.csoportok?.includes("hallgato")) {
  try {
    const resDolgozat = await fetch('/api/dolgozatok');
    if (resDolgozat.ok) {
      dolgozatok = await resDolgozat.json();
    }
  } catch (e) {
    console.warn("Dolgozatok lekérése nem sikerült:", e);
  }

  // 🔹 Szűrjük ki azokat a témákat, amire a hallgató már jelentkezett
  const jelentkezettCimek = dolgozatok
    .filter(d => d.hallgato_ids?.includes(userData.neptun))
    .map(d => d.cím);

  topics = topics.filter(t => !jelentkezettCimek.includes(t.cim));
}


      tableBody.innerHTML = '';
topics.forEach(t => {
  const tr = document.createElement('tr');
  const cim = t.cim || '';
  const tvNev = t.temavezetoNev || t.temavezeto?.nev || '';
  const tanszek = (t.tanszek && t.tanszek.trim() !== '') ? t.tanszek : '–';
  const kar = t.kar?.nev || t.kar || '–';

  const ossz = t.osszefoglalo || t.osszefoglal || '';

  tr.innerHTML = `
    <td class="clickable-title" data-id="${t._id}">${cim}</td>
    <td>${tvNev}</td>
    <td>${tanszek}</td>
    <td>${kar}</td>
    <td>
      <button class="jelentkezes-btn" data-id="${t._id}">Jelentkezés</button>
      <button class="modosit-btn" data-id="${t._id}">Módosítás</button>
      <button class="delete-btn" data-id="${t._id}">Törlés</button>
    </td>
  `;
  tableBody.appendChild(tr);

  // Lenyitható összefoglaló sor hozzáadása
  const detailsRow = document.createElement('tr');
  detailsRow.classList.add('topic-details-row', 'hidden');
  detailsRow.innerHTML = `
    <td colspan="5">
      <div class="topic-details-panel">
        <p><strong>Tartalmi összefoglaló:</strong></</p>
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


      // gombok
document.querySelectorAll('#topic-table .jelentkezes-btn').forEach(b =>
  b.addEventListener('click', () => jelentkezesTema(b.dataset.id))
);


document.querySelectorAll('.modosit-btn').forEach(b =>
  b.addEventListener('click', () => modositTema(b.dataset.id))
);


document.querySelectorAll('.delete-btn').forEach(b =>
  b.addEventListener('click', () => torolTema(b.dataset.id))
);

    } catch (err) {
      console.error('Hiba a témák betöltésekor:', err);
      tableBody.innerHTML = '<tr><td colspan="5">(Hiba a témák betöltésekor)</td></tr>';
    }
  }

  // ───────────────────────────────── 3) ÚJ TÉMA — ŰRLAP
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

  // 🔹 Lekérjük a bejelentkezett felhasználót
  const userData = JSON.parse(localStorage.getItem('felhasznalo'));
  if (!userData || !userData.nev || !userData.neptun) {
    alert('Hiba: bejelentkezett felhasználó adatai nem elérhetők.');
    return;
  }

  const temavezetoNev = userData.nev;
  const temavezetoNeptun = userData.neptun;
  const kar = typeof userData.kar === 'object' ? userData.kar.nev : userData.kar || '';
  const tanszek = userData.tanszek && userData.tanszek.trim() !== '' 
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
      body: JSON.stringify({ cim, osszefoglalo, temavezetoNev, temavezetoNeptun, kar, tanszek }) // 🔹 bővített JSON
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


  // ───────────────────────────────── 4) EGYSZERŰ JELENTKEZÉS (MODAL NÉLKÜL)
async function jelentkezesTema(topicId) {
  const userData = JSON.parse(localStorage.getItem('felhasznalo'));
  if (!userData || !userData.neptun || !userData.csoportok?.includes("hallgato")) {
    alert("Csak bejelentkezett hallgató jelentkezhet témára!");
    return;
  }

  try {
    // Lekérjük a kiválasztott téma adatait
    const resTopic = await fetch(`/api/topics`);
    const topics = await resTopic.json();
    const selected = topics.find(t => t._id === topicId);
    if (!selected) {
      alert("A téma nem található.");
      return;
    }

    // Létrehozzuk a dolgozat bejegyzést
    const dolgozat = {
      cím: selected.cim,
      leiras: selected.osszefoglalo,
      hallgato_ids: [userData.neptun],
      temavezeto_ids: [selected.temavezetoNeptun],
      allapot: "jelentkezett"
    };

    const res = await fetch('/api/dolgozatok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dolgozat)
    });

    if (!res.ok) throw new Error('Sikertelen jelentkezés');
    alert("Sikeresen jelentkeztél a témára!");

    // 🔹 Frissítjük a listát, hogy eltűnjön a jelentkezett téma
    await loadTopics();
    
  } catch (err) {
    console.error("Hiba a jelentkezés során:", err);
    alert("Hiba történt a jelentkezés során.");
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
let currentEditId = null;

// 🔹 Legördülő témavezetők listájának feltöltése
async function loadTemavezetoSelect() {
  try {
    const res = await fetch('/api/temavezetok');
    if (!res.ok) throw new Error('Nem sikerült lekérni a témavezetőket');
    const temavezetoLista = await res.json();

    const select = document.getElementById('edit-supervisor');
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


 await loadTemavezetoSelect();

function modositTema(id) {

  currentEditId = id;
  const row = document.querySelector(`button[data-id="${id}"]`).closest('tr');
  const cells = row.querySelectorAll('td');

  // Kitöltjük a modal mezőit a táblázat adataival
  document.getElementById('edit-title').value = cells[0].innerText.trim();
  document.getElementById('edit-supervisor').value = cells[1].innerText.trim();
  document.getElementById('edit-department').value = cells[2].innerText.trim();
  document.getElementById('edit-faculty').value = cells[3].innerText.trim();

  // Az összefoglalót a részletekből olvassuk ki
  const summaryRow = row.nextElementSibling;
  if (summaryRow && summaryRow.querySelector('.topic-details-panel')) {
    document.getElementById('edit-summary').value =
      summaryRow.querySelector('.topic-details-panel p:nth-child(2)').innerText.trim();
  }

  // Modal megjelenítése
  document.getElementById('edit-modal').style.display = 'block';
  document.getElementById('uj-topic-homalyositas').style.display = 'block';
}

// Mentés gomb esemény
document.getElementById('save-edit-btn').addEventListener('click', async () => {
  const cim = document.getElementById('edit-title').value.trim();
  const temavezetoNev = document.getElementById('edit-supervisor').value.trim();
  const tanszek = document.getElementById('edit-department').value.trim();
  const kar = document.getElementById('edit-faculty').value.trim();
  const osszefoglalo = document.getElementById('edit-summary').value.trim();

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

// Mégse gomb
document.getElementById('cancel-edit-btn').addEventListener('click', () => {
  document.getElementById('edit-modal').style.display = 'none';
  document.getElementById('uj-topic-homalyositas').style.display = 'none';
});



// ───────────────────────────────── 7) MÓDOSÍTÁS MENTÉSE
async function mentModositast(id) {
  const cim = document.getElementById(`edit-cim-${id}`).value.trim();
  const ossz = document.getElementById(`edit-ossz-${id}`).value.trim();

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


// ───────────────────────────────── INDULÓ BETÖLTÉS
await loadTopics();
});

/*
function sortTableByColumn(columnIndex) {
  const table = document.getElementById("topic-table");
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));

  // Csak a fő sorokat (páros indexűeket) gyűjtjük be (a részletek a következő sorban vannak)
  const dataRows = [];
  for (let i = 0; i < rows.length; i += 2) {
    const mainRow = rows[i];
    const detailRow = rows[i + 1];
    dataRows.push({ mainRow, detailRow });
  }

  // Rendezés
  const sorted = dataRows.sort((a, b) => {
    const cellA = a.mainRow.children[columnIndex]?.textContent.trim().toLowerCase() || '';
    const cellB = b.mainRow.children[columnIndex]?.textContent.trim().toLowerCase() || '';
    return cellA.localeCompare(cellB);
  });

  // Eredeti sorok törlése
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }

  // Újrarendezett sorok beszúrása
  sorted.forEach(({ mainRow, detailRow }) => {
    tbody.appendChild(mainRow);
    tbody.appendChild(detailRow);
  });
}
*/

let sortDirection = {}; // tárolja az oszlopok irányát (növekvő/csökkenő)

function sortTableByColumn(columnIndex) {
  const table = document.getElementById("topic-table");
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));

  // rendezési irány beállítása: alapértelmezetten növekvő
  sortDirection[columnIndex] = !sortDirection[columnIndex];

  const direction = sortDirection[columnIndex] ? 1 : -1;

  const sortedRows = rows.sort((rowA, rowB) => {
    const cellA = rowA.children[columnIndex]?.textContent.trim().toLowerCase() || "";
    const cellB = rowB.children[columnIndex]?.textContent.trim().toLowerCase() || "";

    return cellA.localeCompare(cellB) * direction;
  });

  // újrarendereljük a rendezett sorokat
  tbody.innerHTML = "";
  sortedRows.forEach(row => tbody.appendChild(row));
}
