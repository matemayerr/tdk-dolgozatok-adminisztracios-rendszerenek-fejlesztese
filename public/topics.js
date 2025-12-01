document.addEventListener('DOMContentLoaded', async () => {
    // 🔹 Bejelentkezett user adatai
  const loggedUser = JSON.parse(localStorage.getItem('felhasznalo') || 'null');

  // 🔹 Csak hallgató? (NINCS más csoportja)
  const csakHallgato =
    loggedUser &&
    Array.isArray(loggedUser.csoportok) &&
    loggedUser.csoportok.length === 1 &&
    loggedUser.csoportok.includes('hallgato');

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

  const newTopicBtn      = document.getElementById('new-topic-btn');
  const topicForm        = document.getElementById('topic-form');
  const cancelBtn        = document.getElementById('topic-cancel');
  const tableBody        = document.querySelector('#topic-table tbody');
  const supervisorSelect = document.getElementById('topic-supervisor'); // (ha majd lesz ilyen)

    // 🔹 Csak hallgató esetén az "Új témajavaslat" gomb ne is látszódjon
  if (newTopicBtn && csakHallgato) {
    newTopicBtn.style.display = 'none';
  }


  let selectedTopicId = null;
  let currentEditId   = null;

  // ───────────────────────────────── 2) TÉMÁK LISTÁZÁSA
  async function loadTopics() {
    if (!tableBody) return; // ha nincs topics táblázat, lépjünk ki

    try {
      const res = await fetch('/api/topics');
      if (!res.ok) throw new Error('Hibás válasz /api/topics');
      let topics = await res.json();

            // 🔹 Bejelentkezett felhasználó (a DOMContentLoaded elején kiolvasva)
      const userData = loggedUser;


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
        const kar     = t.kar?.nev || t.kar || '–';
        const ossz    = t.osszefoglalo || t.osszefoglal || '';

                // 🔹 Csak hallgató: csak Jelentkezés gomb
        const actionsHtml = csakHallgato
          ? `
            <button class="jelentkezes-btn topic-apply-btn" data-topic-id="${t._id}">
              Jelentkezés
            </button>`
          : `
            <button class="jelentkezes-btn topic-apply-btn topic-apply-btn" data-topic-id="${t._id}">
              Jelentkezés
            </button>
            <button class="modosit-btn" data-id="${t._id}">Módosítás</button>
            <button class="delete-btn" data-id="${t._id}">Törlés</button>`;

        tr.innerHTML = `
          <td class="clickable-title" data-id="${t._id}">${cim}</td>
          <td>${tvNev}</td>
          <td>${kar}</td>
          <td>
            ${actionsHtml}
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

      // 🔹 Ha a határidő lejárt, tiltsuk le az összes Jelentkezés gombot
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
      tableBody.innerHTML = '<tr><td colspan="4">(Hiba a témák betöltésekor)</td></tr>';
      showToast('Hiba a témák betöltésekor.', 'error');
    }
  }

  // Tegyük elérhetővé más JS-nek is
  window.loadTopics  = loadTopics;
  window.betoltTemak = loadTopics;

  // ───────────────────────────────── 3) ÚJ TÉMA — ŰRLAP
      if (newTopicBtn && topicForm && cancelBtn && !csakHallgato) {
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
        showToast('Hiba: bejelentkezett felhasználó adatai nem elérhetők.', 'error');
        return;
      }

      const temavezetoNev    = userData.nev;
      const temavezetoNeptun = userData.neptun;
      const kar = typeof userData.kar === 'object' ? userData.kar.nev : userData.kar || '';
      const tanszek = (userData.tanszek && userData.tanszek.trim() !== '')
        ? userData.tanszek
        : '–';

      if (!cim || !osszefoglalo) {
        showToast('Minden mezőt ki kell tölteni!', 'error');
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

        showToast('Témajavaslat elmentve.', 'success');
        topicForm.reset();
        topicForm.style.display = 'none';
        document.getElementById('uj-topic-homalyositas').style.display = 'none';
        loadTopics();
      } catch (err) {
        console.error('Hiba a téma mentésekor:', err);
        showToast('Hiba történt a téma mentésekor.', 'error');
      }
    });
  }

  // ───────────────────────────────── 4) EGYSZERŰ JELENTKEZÉS (MODAL NÉLKÜL)
  async function jelentkezesTema(topicId) {
    // 🔹 Ha lejárt a jelentkezési határidő, ne engedjünk jelentkezni
    if (window.dolgozatJelentkezesLejart) {
      showToast('A dolgozat jelentkezési határideje lejárt, témára már nem lehet jelentkezni.', 'error');
      return;
    }

    const userData = JSON.parse(localStorage.getItem('felhasznalo') || 'null');
    if (!userData || !userData.neptun || !userData.csoportok?.includes('hallgato')) {
      showToast('Csak bejelentkezett hallgató jelentkezhet témára!', 'error');
      return;
    }

    try {
      // Lekérjük a kiválasztott téma adatait
      const resTopic = await fetch('/api/topics');
      if (!resTopic.ok) throw new Error('Hiba a /api/topics lekérdezésekor');
      const topics = await resTopic.json();
      const selected = topics.find(t => t._id === topicId);
      if (!selected) {
        showToast('A téma nem található.', 'error');
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
      showToast('Sikeresen jelentkeztél a témára!', 'success');

      // 🔹 Frissítjük a listát, hogy eltűnjön a jelentkezett téma
      await loadTopics();

    } catch (err) {
      console.error('Hiba a jelentkezés során:', err);
      showToast('Hiba történt a jelentkezés során.', 'error');
    }
  }

  // ───────────────────────────────── 5) TÉMA TÖRLÉSE – szép confirm modallal
  async function torolTema(id) {
    const confirmed = await confirmDialog('Biztosan törlöd ezt a témajavaslatot?');
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/topics/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Törlési hiba');
      showToast('Téma sikeresen törölve.', 'success');
      loadTopics();
    } catch (err) {
      console.error('Hiba a téma törlésekor:', err);
      showToast('Hiba történt törlés közben.', 'error');
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

if (!editTitle || !editSupervisor /* || !editDept */ || !editFaculty || !editSummary) {
  console.warn('Hiányzó edit modal elemek.');
  return;
}

    editTitle.value      = cells[0].innerText.trim();
    editSupervisor.value = cells[1].innerText.trim();
    editFaculty.value    = cells[2].innerText.trim();


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
      const kar           = document.getElementById('edit-faculty').value.trim();
      const osszefoglalo  = document.getElementById('edit-summary').value.trim();

      if (!cim || !temavezetoNev || !osszefoglalo) {
        showToast('A cím, témavezető és összefoglaló mező kötelező!', 'error');
        return;
      }

      try {
        const res = await fetch(`/api/topics/${currentEditId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cim, temavezetoNev, tanszek, kar, osszefoglalo })
        });

        if (!res.ok) throw new Error('Hiba a módosítás mentésekor.');
        showToast('Téma sikeresen módosítva.', 'success');
        document.getElementById('edit-modal').style.display = 'none';
        document.getElementById('uj-topic-homalyositas').style.display = 'none';
        loadTopics();
      } catch (err) {
        console.error('Hiba a mentés során:', err);
        showToast('Nem sikerült a mentés.', 'error');
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
      showToast('Minden mezőt ki kell tölteni!', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/topics/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cim, osszefoglalo: ossz })
      });

      if (!res.ok) throw new Error('Hiba a módosítás mentésekor.');
      showToast('Téma sikeresen módosítva.', 'success');
      loadTopics();
    } catch (err) {
      console.error('Hiba a módosítás mentésekor:', err);
      showToast('Hiba történt a mentés során.', 'error');
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


// ─────────────────────────────
// SZÉP CONFIRM MODAL + TOAST
// ─────────────────────────────
function confirmDialog(message) {
  return new Promise((resolve) => {
    const modal     = document.getElementById('confirm-modal');
    const msgEl     = document.getElementById('confirm-message');
    const okBtn     = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const homaly    = document.getElementById('uj-topic-homalyositas');

    // ha valami hiányzik, fallback a sima confirmre
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      const res = window.confirm(message || 'Biztosan törlöd?');
      resolve(res);
      return;
    }

    msgEl.textContent = message || 'Biztosan törlöd?';

    modal.style.display = 'flex';   // <-- ez a lényeg
    if (homaly) homaly.style.display = 'block';


    const cleanup = () => {
      modal.style.display = 'none';
      if (homaly) homaly.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

// 🔔 Egységes toast értesítés
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');

  // ha valamiért nincs konténer, fallback alertre
  if (!container) {
    alert(message);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  // kattintással is bezárható
  toast.addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });

  container.appendChild(toast);

  // animáció indítás
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // automatikus eltűnés
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
