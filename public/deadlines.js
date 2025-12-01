// 🔹 Konfiguráció: milyen határidőket kezelünk
const DEADLINE_TYPES = [
  {
    key: 'dolgozat_jelentkezes',
    label: 'Dolgozat jelentkezés',
    description: 'Új dolgozat jelentkezések leadása eddig az időpontig engedélyezett.'
  },
  {
    key: 'dolgozat_feltoltes_global',
    label: 'Dolgozatok feltöltése (globális)',
    description: 'Alapértelmezett határidő a dolgozatok feltöltésére minden karon. Kar-specifikus határidő felülírja.'
  },
  {
    key: 'biralat_hatarido',
    label: 'Bírálatok határideje',
    description: 'Ajánlott határidő a bírálatok feltöltésére. Túlléphető, de később napi emlékeztetőt küldünk majd.'
  },
  {
    key: 'biralat_kikuldese_hallgatoknak',
    label: 'Bírálatok kiküldése hallgatóknak',
    description: 'Legkésőbbi időpont, ameddig a bírálatokat el kell juttatni a hallgatókhoz.'
  },
  {
    key: 'zsuri_jelentkezes',
    label: 'Potenciális zsűritagok jelentkezése',
    description: 'A zsűritag-jelöltek eddig az időpontig jelezhetik a részvételi szándékukat.'
  },
  {
    key: 'zsuri_ertesites',
    label: 'Zsűritagok értesítése',
    description: 'Eddig az időpontig küldjük ki a zsűritagoknak a dolgozatokra vonatkozó értesítéseket.'
  }
];


document.addEventListener('DOMContentLoaded', () => {
  renderDeadlineRows();
  loadDeadlines();
});

// 🔹 Táblázat sorok generálása – EGY input mező (datetime-local)
function renderDeadlineRows() {
  const tbody = document.querySelector('#deadline-table tbody');
  tbody.innerHTML = '';

  DEADLINE_TYPES.forEach(type => {
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    tdLabel.innerHTML = `<strong>${type.label}</strong><br><small>${type.description || ''}</small>`;

    const tdInput = document.createElement('td');

    const datetimeInput = document.createElement('input');
    datetimeInput.type = 'datetime-local';
    datetimeInput.id = `deadline-${type.key}`;
    datetimeInput.className = 'deadline-input';
    datetimeInput.step = 60 * 15; // 15 perc

    tdInput.appendChild(datetimeInput);

    const tdAction = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Mentés';
    btn.className = 'btn btn-primary';
    btn.addEventListener('click', () => saveDeadline(type.key));
    tdAction.appendChild(btn);

    tr.appendChild(tdLabel);
    tr.appendChild(tdInput);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
}

// 🔹 Backendből érkező Date → datetime-local input érték
function setInputFromDate(dateStr, key) {
  if (!dateStr) return;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return;

  const pad = n => String(n).padStart(2, '0');

  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  const value = `${year}-${month}-${day}T${hours}:${minutes}`;

  const input = document.getElementById(`deadline-${key}`);
  if (input) {
    input.value = value;
  }
}

// 🔹 Határidők betöltése a szerverről
async function loadDeadlines() {
  try {
    const res = await fetch('/api/deadlines');
    if (!res.ok) {
      console.error('Nem sikerült lekérni a határidőket.');
      return;
    }

    const data = await res.json();
    const map = {};
    data.forEach(d => { map[d.key] = d; });

    DEADLINE_TYPES.forEach(type => {
      const d = map[type.key];
      if (d && d.hatarido) {
        setInputFromDate(d.hatarido, type.key);
      }
    });
  } catch (err) {
    console.error('Hiba a határidők betöltésekor:', err);
  }
}

// 🔹 Határidő mentése vagy törlése a szerverre
async function saveDeadline(key) {
  const input = document.getElementById(`deadline-${key}`);
  if (!input) return;

  const value = input.value; // pl. "2025-11-24T23:59"
  const config = DEADLINE_TYPES.find(t => t.key === key);

  // 👉 Ha nincs érték az inputban: határidő törlése
  if (!value) {
    const confirmed = confirm(
      'Nem adtál meg dátumot.\n\nEz törölni fogja az adott határidőt, ' +
      'és a kapcsolódó funkció korlátlan lesz. Folytatod?'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/deadlines/${key}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Hiba történt a határidő törlésekor.');
        return;
      }

      alert('Határidő törölve. Az adott funkció mostantól nincs korlátozva.');
      return;
    } catch (err) {
      console.error('Hiba a határidő törlésekor:', err);
      alert('Szerverhiba a törlés során.');
      return;
    }
  }

  // 👉 Ha van dátum: szokásos mentés (PUT)
  const hatarido = value;

  try {
    const res = await fetch(`/api/deadlines/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        hatarido,
        nev: config?.label || key,
        leiras: config?.description || ''
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      alert(errorData.error || 'Hiba történt a mentés során.');
      return;
    }

    alert('Határidő sikeresen mentve.');
  } catch (err) {
    console.error('Hiba a határidő mentésekor:', err);
    alert('Szerverhiba a mentés során.');
  }
}
