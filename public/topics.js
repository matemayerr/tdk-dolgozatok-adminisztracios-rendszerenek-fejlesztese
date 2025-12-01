document.addEventListener('DOMContentLoaded', async () => {
  const newTopicBtn = document.getElementById('new-topic-btn');
  const topicForm   = document.getElementById('topic-form');
  const cancelBtn   = document.getElementById('topic-cancel');
  const tableBody   = document.querySelector('#topic-table tbody');
  const supervisorSelect = document.getElementById('topic-supervisor');

  const modal            = document.getElementById('jelentkezes-modal');
  const hallgatoValaszto = document.getElementById('hallgato-valaszto');
  const modalMentes      = document.getElementById('jelentkezes-mentes');
  const modalBezar       = document.getElementById('jelentkezes-bezar');

  let selectedTopicId = null;

  // ───────────────────────────────── 1) TÉMAVEZETŐK BETÖLTÉSE
  async function loadSupervisors() {
    try {
      const res = await fetch('/api/felhasznalok');
      if (!res.ok) throw new Error('Hibás válasz /api/felhasznalok');
      const users = await res.json();

      const supervisors = users.filter(u =>
        Array.isArray(u.csoportok) && u.csoportok.includes('temavezeto')
      );

      supervisorSelect.innerHTML = '<option value="">Válassz témavezetőt...</option>';
      supervisors.forEach(t => {
        const opt = document.createElement('option');
        // value: a Neptun legyen — ezt tároljuk a témában
        opt.value = t.neptun || '';
        opt.textContent = `${t.nev || 'Névtelen'} (${t.neptun || '-'})`;
        // név eléréséhez később:
        opt.dataset.nev = t.nev || '';
        supervisorSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('Hiba a témavezetők betöltésekor:', err);
      supervisorSelect.innerHTML = '<option value="">(Hiba a betöltéskor)</option>';
    }
  }

  // ───────────────────────────────── 2) TÉMÁK LISTÁZÁSA
  async function loadTopics() {
    try {
      const res = await fetch('/api/topics');
      if (!res.ok) throw new Error('Hibás válasz /api/topics');
      const topics = await res.json();

      tableBody.innerHTML = '';
      topics.forEach(t => {
        const tr = document.createElement('tr');
        const cim = t.cim || '';
        const tvNev = t.temavezetoNev || t.temavezeto?.nev || '';
        const tvNep = t.temavezetoNeptun || t.temavezeto?.neptun || '';
        const ossz = t.osszefoglalo || t.osszefoglal || '';

        tr.innerHTML = `
          <td>${cim}</td>
          <td>${tvNev}</td>
          <td>${tvNep}</td>
          <td>${ossz}</td>
          <td>
            <button class="jelentkezes-btn" data-id="${t._id}">Jelentkezés</button>
            <button class="delete-btn" data-id="${t._id}">Törlés</button>
          </td>
        `;
        tableBody.appendChild(tr);
      });

      // gombok
      document.querySelectorAll('.jelentkezes-btn').forEach(b =>
        b.addEventListener('click', () => openJelentkezesModal(b.dataset.id))
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
    topicForm.style.display = 'block';
  });

  cancelBtn.addEventListener('click', () => {
    topicForm.reset();
    topicForm.style.display = 'none';
  });

  topicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cim          = document.getElementById('topic-title').value.trim();
    const osszefoglalo = document.getElementById('topic-description').value.trim();

    const selOpt = supervisorSelect.options[supervisorSelect.selectedIndex];
    const temavezetoNeptun = supervisorSelect.value;
    const temavezetoNev    = selOpt?.dataset?.nev || '';

    if (!cim || !osszefoglalo || !temavezetoNeptun) {
      alert('Minden mezőt ki kell tölteni!');
      return;
    }

    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ cim, osszefoglalo, temavezetoNev, temavezetoNeptun })
      });
      if (!res.ok) throw new Error('Mentési hiba /api/topics');

      alert('Témajavaslat elmentve.');
      topicForm.reset();
      topicForm.style.display = 'none';
      loadTopics();
    } catch (err) {
      console.error('Hiba a téma mentésekor:', err);
      alert('Hiba történt a téma mentésekor.');
    }
  });

  // ───────────────────────────────── 4) JELENTKEZÉS MODAL – HALLGATÓK BETÖLTÉSE
  async function openJelentkezesModal(topicId) {
    selectedTopicId = topicId;
    hallgatoValaszto.innerHTML = 'Betöltés…';
    modal.style.display = 'block';

    try {
      const res = await fetch('/api/felhasznalok');
      if (!res.ok) throw new Error('Hibás válasz /api/felhasznalok');
      const users = await res.json();

      const hallgatok = users.filter(u =>
        Array.isArray(u.csoportok) && u.csoportok.includes('hallgato')
      );

      if (hallgatok.length === 0) {
        hallgatoValaszto.innerHTML = '<em>Nincs elérhető hallgató.</em>';
        return;
      }

      hallgatoValaszto.innerHTML = hallgatok.map(h => `
        <label style="display:block; margin-bottom:4px;">
          <input type="checkbox" value="${h.neptun || ''}">
          ${h.nev || 'Névtelen'} (${h.neptun || '-'})
        </label>
      `).join('');
    } catch (err) {
      console.error('Hiba a hallgatók betöltésekor:', err);
      hallgatoValaszto.innerHTML = '<em>Hiba a betöltéskor.</em>';
    }
  }

  modalBezar.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modalMentes.addEventListener('click', async () => {
    const kivalasztott = Array
      .from(hallgatoValaszto.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value)
      .filter(v => v);

    if (kivalasztott.length === 0) {
      alert('Válassz legalább egy hallgatót!');
      return;
    }

    try {
      // Itt azt az endpointot hívd, amit a backendben megírtál a jelentkezésre:
      // két verzióból valamelyik biztosan létezik nálad – válaszd azt, ami megvan:
      // 1) /api/topics/:id/jelentkezes
      // 2) /api/papers/from-topic  (ha ezt használod, a body-ban topicId is kell)
      const res = await fetch(`/api/topics/${selectedTopicId}/jelentkezes`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ hallgato_ids: kivalasztott })
      });

      if (!res.ok) throw new Error('Jelentkezési hiba');
      alert('Jelentkezés mentve.');
      modal.style.display = 'none';
    } catch (err) {
      console.error('Hiba a jelentkezés során:', err);
      alert('Hiba történt a jelentkezés során.');
    }
  });

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

    // === 6. Jelentkezés mentése (új dolgozat létrehozása) ===
  modalMentes.addEventListener("click", () => {
    const selectedHallgatoIds = Array.from(
      hallgatoValaszto.querySelectorAll("input[type='checkbox']:checked")
    ).map(cb => cb.value);

    if (selectedHallgatoIds.length === 0) {
      alert("Válassz legalább egy hallgatót!");
      return;
    }

    const selectedTopic = topics.find(t => t._id === selectedTopicId);
    if (!selectedTopic) {
      alert("Hiba: téma nem található!");
      return;
    }

    // Hallgatók teljes adatainak beépítése (név + neptun)
    const selectedHallgatok = hallgatok
      .filter(h => selectedHallgatoIds.includes(h._id))
      .map(h => ({ nev: h.nev, neptun: h.neptun }));

    // Témavezető adatainak objektumba szervezése
    const temavezetoObj = {
      nev: selectedTopic.temavezeto,
      neptun: selectedTopic.neptun || "",
    };

fetch("/api/dolgozatok", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    cím: selectedTopic.cim,
    leiras: selectedTopic.osszefoglalo,
    hallgato_ids: selectedHallgatok.map(h => h.neptun),
    temavezeto_ids: [selectedTopic.neptun],
  }),
})
  .then(res => res.json())
  .then(() => {
    alert("Jelentkezés sikeresen mentve!");
    modal.style.display = "none";
  })
  .catch(err => console.error("Jelentkezés mentési hiba:", err));
  }); // 🔹 ezzel zárjuk le a modalMentes.addEventListener blokkot


// ───────────────────────────────── INDULÓ BETÖLTÉS
await loadSupervisors();
await loadTopics();
});