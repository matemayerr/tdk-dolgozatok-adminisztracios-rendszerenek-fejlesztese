document.addEventListener('DOMContentLoaded', async () => {
  await loadSections();

  // Új szekció hozzáadása
  document.getElementById('section-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('section-name');
    const name = nameInput.value.trim();
    if (!name) return alert('A szekció neve nem lehet üres.');

    const response = await fetch('/api/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (response.ok) {
      nameInput.value = '';
      await loadSections();
    } else {
      alert('Hiba történt a szekció hozzáadásakor.');
    }
  });
});

// Szekciók betöltése
async function loadSections() {
  const tableBody = document.getElementById('sections-table-body');
  tableBody.innerHTML = '';

  try {
    const response = await fetch('/api/sections');
    const sections = await response.json();

    sections.forEach(section => {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = section.name;
      row.appendChild(nameCell);

    // Akciógombok közös cellában
const actionsCell = document.createElement('td');
actionsCell.classList.add('actions-cell');

const assignButton = document.createElement('button');
assignButton.textContent = 'Dolgozatok hozzáadása';
assignButton.classList.add('btn', 'btn-secondary', 'me-2');
assignButton.addEventListener('click', () => openAssignModal(section._id));
actionsCell.appendChild(assignButton);

const editButton = document.createElement('button');
editButton.textContent = 'Módosítás';
editButton.classList.add('btn', 'btn-warning', 'me-2'); // Kis margó jobb oldalon
editButton.addEventListener('click', () => editSection(section));
actionsCell.appendChild(editButton);

const deleteButton = document.createElement('button');
deleteButton.textContent = 'Törlés';
deleteButton.classList.add('btn', 'btn-danger');
deleteButton.addEventListener('click', () => deleteSection(section._id));
actionsCell.appendChild(deleteButton);

row.appendChild(actionsCell);


      tableBody.appendChild(row);
    });
  } catch (err) {
    console.error('Hiba a szekciók betöltésekor:', err);
  }
}

// Szekció törlése
async function deleteSection(id) {
  if (!confirm('Biztosan törölni szeretnéd ezt a szekciót?')) return;

  const response = await fetch(`/api/sections/${id}`, {
    method: 'DELETE'
  });

  if (response.ok) {
    await loadSections();
  } else {
    alert('Hiba történt a törlés során.');
  }
}

// Szekció módosítása
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

/*Modal vezérlőfüggvények*/
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
    const response = await fetch(`/api/sections/${selectedSectionId}/assign-papers`, {
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


