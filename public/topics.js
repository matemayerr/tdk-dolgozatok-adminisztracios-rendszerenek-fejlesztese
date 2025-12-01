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

  // 🔹 Lekérjük az aktuális bejelentkezett felhasználót a localStorage-ből (auth.js-ben eltárolt)
  const userData = JSON.parse(localStorage.getItem('felhasznalo'));
  if (!userData || !userData.nev || !userData.neptun) {
    alert('Hiba: bejelentkezett felhasználó adatai nem elérhetők.');
    return;
  }

  const temavezetoNev = userData.nev;
  const temavezetoNeptun = userData.neptun;

  if (!cim || !osszefoglalo) {
    alert('Minden mezőt ki kell tölteni!');
    return;
  }

  try {
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cim, osszefoglalo, temavezetoNev, temavezetoNeptun })
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
;

  // ───────────────────────────────── 4) JELENTKEZÉS MODAL – HALLGATÓK BETÖLTÉSE
async function openJelentkezesModal(topicId) {
  selectedTopicId = topicId;
  const modal = document.getElementById("jelentkezes-modal");
  const homaly = document.getElementById("jelentkezes-homalyositas");
  const hallgatoValaszto = document.getElementById("hallgato-valaszto");

  modal.style.display = "flex";
  homaly.style.display = "block";
  hallgatoValaszto.innerHTML = "Betöltés…";

  try {
    const res = await fetch("/api/felhasznalok");
    if (!res.ok) throw new Error("Hibás válasz /api/felhasznalok");
    const users = await res.json();

    const hallgatok = users.filter(
      (u) => Array.isArray(u.csoportok) && u.csoportok.includes("hallgato")
    );

    if (hallgatok.length === 0) {
      hallgatoValaszto.innerHTML = "<em>Nincs elérhető hallgató.</em>";
      return;
    }

    // ➤ hallgatói lista modern elrendezésben
    hallgatoValaszto.innerHTML = `
      <div id="hallgato-lista" 
        style="max-height:350px; overflow-y:auto; background:#f9f9f9; border-radius:6px; padding:6px; border:1px solid #ddd;"></div>
    `;

    const listaElem = document.getElementById("hallgato-lista");

    function renderList(szuro = "") {
      const filtered = hallgatok.filter(h =>
        h.nev.toLowerCase().includes(szuro.toLowerCase())
      );
      listaElem.innerHTML = filtered.map(h => `
        <div class="hallgato-sor" 
          style="display:flex; justify-content:space-between; align-items:center;
                 padding:6px 8px; margin-bottom:5px; background:#fff; border-radius:6px;
                 border:1px solid #ddd;">
          <span>${h.nev || "Névtelen"} (${h.neptun || "-"})</span>
          <input type="checkbox" value="${h.neptun || ""}">
        </div>
      `).join("");
    }

    renderList();

    document.getElementById("hallgato-kereso").addEventListener("input", e => {
      renderList(e.target.value);
    });

  } catch (err) {
    console.error("Hiba a hallgatók betöltésekor:", err);
    hallgatoValaszto.innerHTML = "<em>Hiba a betöltéskor.</em>";
  }
}

// Kereső a hallgatólistában
document.getElementById('hallgato-kereso')?.addEventListener('input', (e) => {
  const szuro = e.target.value.toLowerCase();
  document.querySelectorAll('#hallgato-valaszto label').forEach(label => {
    const szoveg = label.textContent.toLowerCase();
    label.style.display = szoveg.includes(szuro) ? '' : 'none';
  });
});


// === Bezárás ===
document.getElementById("jelentkezes-bezar").addEventListener("click", () => {
  document.getElementById("jelentkezes-modal").style.display = "none";
  document.getElementById("jelentkezes-homalyositas").style.display = "none";
});

// === Mentés ===
document.getElementById("jelentkezes-mentes").addEventListener("click", async () => {
  const hallgatoValaszto = document.getElementById("hallgato-valaszto");
  const kivalasztott = Array.from(
    hallgatoValaszto.querySelectorAll("input[type='checkbox']:checked")
  )
    .map((cb) => cb.value)
    .filter((v) => v);

  if (kivalasztott.length === 0) {
    alert("Válassz legalább egy hallgatót!");
    return;
  }

  try {
    const res = await fetch(`/api/topics/${selectedTopicId}/jelentkezes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hallgato_ids: kivalasztott }),
    });

    if (!res.ok) throw new Error("Jelentkezési hiba");

    alert("Jelentkezés sikeresen mentve!");
    document.getElementById("jelentkezes-modal").style.display = "none";
    document.getElementById("jelentkezes-homalyositas").style.display = "none";
  } catch (err) {
    console.error("Hiba a jelentkezés során:", err);
    alert("Hiba történt a jelentkezés során.");
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
await loadTopics();
});