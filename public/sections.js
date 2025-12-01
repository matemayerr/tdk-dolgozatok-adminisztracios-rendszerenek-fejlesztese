// Szekciók betöltése
let allPapersCache = null; // cache az összes dolgozathoz

document.addEventListener('DOMContentLoaded', async () => {
  // 🄹 1️⃣ Aktuális félév lekérése és megjelenítése
  try {
    const response = await fetch('/api/settings/current-semester');
    const data = await response.json();
    const felevSpan = document.getElementById('aktualis-felev');

    if (data && (data.ertek || data.value)) {
      felevSpan.textContent = data.ertek || data.value;
    } else {
      felevSpan.textContent = 'Nincs beállítva';
    }
  } catch (error) {
    console.error('Hiba az aktuális félév lekérésekor:', error);
  }

  await betoltKarok();
  await loadSections();

  async function betoltKarok() {
    try {
      const response = await fetch('/api/university-structure');
      const karLista = await response.json();
      const karSelect = document.getElementById('szekcio-kar');

      karLista.forEach(kar => {
        const option = document.createElement('option');
        option.value = kar.nev;
        option.textContent = kar.nev;
        karSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Hiba a karok betöltésekor:', error);
    }
  }

  document.getElementById('section-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('section-name');
    const kar = document.getElementById('szekcio-kar').value;
    const name = nameInput.value.trim();
    if (!name) return alert('A szekció neve nem lehet üres.');

    const semesterRes = await fetch('/api/settings/current-semester');
    const semesterData = await semesterRes.json();
    const felev = semesterData.value || 'Ismeretlen';

    const response = await fetch('/api/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, felev, kar })
    });

    if (response.ok) {
      nameInput.value = '';
      await loadSections();
    } else {
      alert('Hiba történt a szekció hozzáadásakor.');
    }
  });

  async function loadSections() {
    const tableBody = document.getElementById('sections-table-body');
    tableBody.innerHTML = '';

    try {
      const [respSec, respPapers] = await Promise.all([
        fetch('/api/sections'),
        fetch('/api/papers')
      ]);

      const sections = await respSec.json();
      allPapersCache = await respPapers.json();

      for (const section of sections) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.innerHTML = `
          <div class="clickable-title">
            <span>${section.name}</span>
            <span id="toggle-${section._id}" class="toggle-icon">▼</span>
          </div>`;
        row.appendChild(nameCell);

        const karCell = document.createElement('td');
        karCell.textContent = section.kar || '-';
        row.appendChild(karCell);

        const felevCell = document.createElement('td');
        felevCell.textContent = section.felev || 'Ismeretlen';
        row.appendChild(felevCell);

        const actionsCell = document.createElement('td');
        actionsCell.classList.add('actions-cell');

        const assignButton = document.createElement('button');
        assignButton.textContent = 'Dolgozatok hozzáadása';
        assignButton.classList.add('btn', 'btn-secondary', 'me-2');
        assignButton.addEventListener('click', () => openAssignModal(section._id));
        actionsCell.appendChild(assignButton);

        const editButton = document.createElement('button');
        editButton.textContent = 'Módosítás';
        editButton.classList.add('btn', 'btn-warning', 'me-2');
        editButton.addEventListener('click', () => editSection(section));
        actionsCell.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Törlés';
        deleteButton.classList.add('btn', 'btn-danger');
        deleteButton.addEventListener('click', () => deleteSection(section._id));
        actionsCell.appendChild(deleteButton);

        row.appendChild(actionsCell);
        tableBody.appendChild(row);

        const detailRow = document.createElement('tr');
        const detailCell = document.createElement('td');
        detailCell.colSpan = 4;

        const papersInSection = allPapersCache.filter(p => String(p.szekcioId) === String(section._id));

        if (papersInSection.length === 0) {
          detailCell.innerHTML = `<div class="dolgozat-details-panel">Nincs dolgozat hozzárendelve.</div>`;
        } else {
          const innerTable = document.createElement('table');
          innerTable.classList.add('inner-table');
          innerTable.innerHTML = `
            <thead><tr><th>Cím</th><th>Állapot</th><th></th></tr></thead>
            <tbody></tbody>`;

          const innerTbody = innerTable.querySelector('tbody');

          for (const p of papersInSection) {
            const innerRow = document.createElement('tr');

            const titleCell = document.createElement('td');
            const statusCell = document.createElement('td');
            const deleteCell = document.createElement('td');

            const torlesButton = document.createElement('button');
            torlesButton.textContent = 'Eltávolítás';
            torlesButton.classList.add('btn', 'btn-danger', 'btn-sm');
            torlesButton.addEventListener('click', async (e) => {
              e.stopPropagation();
              if (!confirm('Biztosan el szeretnéd távolítani a dolgozatot a szekcióból?')) return;
              try {
                const response = await fetch(`/api/dolgozatok/${p._id}/remove-from-section`, {
                  method: 'PUT'
                });
                if (response.ok) {
                  alert('Dolgozat eltávolítva a szekcióból.');
                  await loadSections();
                } else {
                  alert('Hiba történt az eltávolítás során.');
                }
              } catch (error) {
                console.error('Hiba a dolgozat eltávolításakor:', error);
                alert('Szerverhiba a dolgozat eltávolításakor.');
              }
            });

            const toggleSpan = document.createElement('span');
            toggleSpan.textContent = '▼';
            toggleSpan.classList.add('toggle-icon');

            const titleSpan = document.createElement('span');
            titleSpan.textContent = p.cim || p.cím || 'Névtelen dolgozat';

            const clickableDiv = document.createElement('div');
            clickableDiv.classList.add('clickable-paper');
            clickableDiv.appendChild(titleSpan);
            clickableDiv.appendChild(toggleSpan);

            clickableDiv.addEventListener('click', () => {
              const isVisible = innerDetailRow.style.display === 'table-row';
              innerDetailRow.style.display = isVisible ? 'none' : 'table-row';
              toggleSpan.textContent = isVisible ? '▼' : '▲';
            });

            titleCell.appendChild(clickableDiv);
            statusCell.textContent = p.allapot || '-';
            deleteCell.appendChild(torlesButton);

            innerRow.appendChild(titleCell);
            innerRow.appendChild(statusCell);
            innerRow.appendChild(deleteCell);
            innerTbody.appendChild(innerRow);

            const innerDetailRow = document.createElement('tr');
            const innerDetailCell = document.createElement('td');
            innerDetailCell.colSpan = 3;

            const hallgatokSzoveg = (p.szerzok || []).map(s => `${s.nev} (${s.neptun})`).join(', ') || '—';
            const temavezetoSzoveg = (p.temavezeto || []).map(t => `${t.nev} (${t.neptun})`).join(', ') || '—';

            innerDetailCell.innerHTML = `
              <div class="dolgozat-details-panel">
                <p><strong>Tartalmi összefoglaló:</strong><br>${p.leiras || '—'}</p>
                <p><strong>Hallgató(k):</strong> ${hallgatokSzoveg}</p>
                <p><strong>Témavezető(k):</strong> ${temavezetoSzoveg}</p>
              </div>`;

            innerDetailRow.appendChild(innerDetailCell);
            innerDetailRow.style.display = 'none';
            innerTbody.appendChild(innerDetailRow);
          }

          detailCell.appendChild(innerTable);
        }

        detailRow.appendChild(detailCell);
        detailRow.style.display = 'none';
        tableBody.appendChild(detailRow);

        nameCell.querySelector('.clickable-title').addEventListener('click', () => {
          const isVisible = detailRow.style.display === 'table-row';
          detailRow.style.display = isVisible ? 'none' : 'table-row';
          const icon = document.getElementById(`toggle-${section._id}`);
          if (icon) icon.textContent = isVisible ? '▼' : '▲';
        });
      }
    } catch (err) {
      console.error('Hiba a szekciók betöltésekor:', err);
    }
  }

  async function deleteSection(id) {
    if (!confirm('Biztosan törölni szeretnéd ezt a szekciót?')) return;
    const response = await fetch(`/api/sections/${id}`, { method: 'DELETE' });
    if (response.ok) {
      await loadSections();
    } else {
      alert('Hiba történt a törlés során.');
    }
  }

  function editSection(section) {
    const newName = prompt('Add meg az új nevet:', section.name);
    if (!newName || newName.trim() === '') return;

    fetch(`/api/sections/${section._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() })
    }).then(response => {
      if (response.ok) {
        loadSections();
      } else {
        alert('Hiba történt a módosítás során.');
      }
    });
  }

  let selectedSectionId = null;

  function openAssignModal(sectionId) {
    selectedSectionId = sectionId;
    document.getElementById('assign-modal').style.display = 'block';
    loadAllPapers();
  }

  function closeAssignModal() {
    document.getElementById('assign-modal').style.display = 'none';
    document.getElementById('assign-papers-list').innerHTML = '';
    selectedSectionId = null;
  }

  async function loadAllPapers() {
    try {
      const response = await fetch('/api/papers');
      const papers = await response.json();

      const listContainer = document.getElementById('assign-papers-list');
      listContainer.innerHTML = '';

      papers.forEach(paper => {
        const label = document.createElement('label');
        label.classList.add('checkbox-label');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = paper._id;

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(paper.cim || 'Névtelen dolgozat'));
        listContainer.appendChild(label);
      });
    } catch (err) {
      console.error('Hiba a dolgozatok betöltésekor:', err);
    }
  }

  document.getElementById('assign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const checked = document.querySelectorAll('#assign-papers-list input[type="checkbox"]:checked');
    const paperIds = Array.from(checked).map(cb => cb.value);

    try {
      const response = await fetch(`/api/sections/${selectedSectionId}/add-papers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperIds })
      });

      if (response.ok) {
        alert('Dolgozatok sikeresen hozzárendelve.');
        closeAssignModal();
      } else {
        alert('Hiba történt a dolgozatok hozzárendelésekor.');
      }
    } catch (err) {
      console.error('Hiba a hozzárendelés során:', err);
    }
  });

  function filterPapersByTitle() {
    const searchTerm = document.getElementById('search-papers-input').value.toLowerCase();
    const labels = document.querySelectorAll('#assign-papers-list label');
    labels.forEach(label => {
      const text = label.textContent.toLowerCase();
      label.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
  }
});