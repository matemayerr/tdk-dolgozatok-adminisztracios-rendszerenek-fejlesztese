// public/faculties.js

document.addEventListener('DOMContentLoaded', () => {
  initKarBiralatAdmin();
});

// Globális állapot
let KAROK = [];
let DOLGOZATOK = [];
const biraloCache = {}; // rovidites -> biralok tömb
let GLOBAL_UPLOAD_DEADLINE = null; // globális dolgozat feltöltési határidő

async function initKarBiralatAdmin() {
  const hibadiv = document.getElementById('hiba-uzenet');
  hibadiv.textContent = '';

  try {
    const [karok, dolgozatok, globalHatarido] = await Promise.all([
      betoltKarok(),
      betoltDolgozatok(),
      betoltGlobalFeltoltesHatarido()
    ]);

    KAROK = karok;
    DOLGOZATOK = dolgozatok;
    GLOBAL_UPLOAD_DEADLINE = globalHatarido;

    renderKarok();
  } catch (err) {
    console.error('Init hiba:', err);
    hibadiv.textContent = 'Hiba történt az adatok betöltésekor. Próbáld meg frissíteni az oldalt.';
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      localStorage.removeItem('token');
      window.location.href = 'login.html';
    });
  }
}

/* -------------------- SEGÉDFÜGGVÉNYEK – FETCH -------------------- */

async function betoltGlobalFeltoltesHatarido() {
  try {
    const res = await fetch('/api/deadlines/dolgozat_feltoltes_global');
    if (!res.ok) return null;

    const d = await res.json();
    return d.hatarido || null;
  } catch (err) {
    console.error('Hiba a globális feltöltési határidő lekérésekor:', err);
    return null;
  }
}

async function betoltKarok() {
  const res = await fetch('/api/karok');
  if (!res.ok) throw new Error('Nem sikerült betölteni a karokat');
  return await res.json(); // [{nev, rovidites, feltoltesHatarido}, ...]
}

async function betoltDolgozatok() {
  const token = localStorage.getItem('token');

  const res = await fetch('/api/papers', {
    headers: {
      'Authorization': token ? `Bearer ${token}` : ''
    }
  });

  if (!res.ok) throw new Error('Nem sikerült betölteni a dolgozatokat');
  return await res.json();
}


async function betoltBiralok(karRoviditesVagyOsszes) {
  const key = karRoviditesVagyOsszes || 'osszes';

  if (biraloCache[key]) {
    return biraloCache[key];
  }

  const url = key === 'osszes'
    ? '/api/biralok?kar=osszes'
    : `/api/biralok?kar=${encodeURIComponent(key)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Nem sikerült betölteni a bírálókat');

  const data = await res.json(); // [{_id, nev, email, kar, csoportok}, ...]
  biraloCache[key] = data;
  return data;
}

async function mentsKarHatarido(karId, datumStr) {
  const res = await fetch(`/api/karok/${encodeURIComponent(karId)}/hatarido`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hatarido: datumStr })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Hiba a határidő mentésekor');
  }
  return await res.json();
}

async function hozzaadBiralo(dolgozatId, felhasznaloId) {
  const res = await fetch(`/api/dolgozatok/${dolgozatId}/add-reviewer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ felhasznaloId })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Hiba a bíráló hozzáadásakor');
  }
  return await res.json();
}

async function torolBiralo(dolgozatId, userId) {
  const res = await fetch(`/api/dolgozatok/${dolgozatId}/remove-reviewer/${userId}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Hiba a bíráló törlésekor');
  }
  return await res.json();
}

/* -------------------- RENDERELÉS -------------------- */

function renderKarok() {
  const container = document.getElementById('karok-container');
  container.innerHTML = '';

  // 🔹 Map, ami akár rövidítésből, akár teljes névből egy "kulcsot" csinál
  const karKodMap = {};
  KAROK.forEach(kar => {
    const keyValue = (kar.rovidites && kar.rovidites.trim()) || kar.nev;

    if (kar.rovidites && kar.rovidites.trim() !== '') {
      karKodMap[kar.rovidites] = keyValue;
    }
    if (kar.nev) {
      karKodMap[kar.nev] = keyValue;
    }
  });

  const dolgozatokKarSzerint = {};

  DOLGOZATOK.forEach(d => {
    let key = 'NINCS_KAR';

    if (d.kar) {
      const mapped = karKodMap[d.kar];
      key = mapped || 'NINCS_KAR';
    }

    if (!dolgozatokKarSzerint[key]) {
      dolgozatokKarSzerint[key] = [];
    }
    dolgozatokKarSzerint[key].push(d);
  });

  KAROK.forEach(kar => {
    const key = (kar.rovidites && kar.rovidites.trim()) || kar.nev;
    const karDolgozatok = dolgozatokKarSzerint[key] || [];
    renderEgyKarCard(container, kar, karDolgozatok);
  });

  if (dolgozatokKarSzerint['NINCS_KAR'] && dolgozatokKarSzerint['NINCS_KAR'].length > 0) {
    renderEgyKarCard(
      container,
      {
        nev: 'Kar nélküli dolgozatok',
        rovidites: 'NINCS_KAR',
        feltoltesHatarido: null
      },
      dolgozatokKarSzerint['NINCS_KAR']
    );
  }
}

function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${mins}`;
}

function formatDateHuman(dateStr) {
  if (!dateStr) return 'Nincs beállítva';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Érvénytelen dátum';

  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function renderEgyKarCard(container, kar, karDolgozatok) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginBottom = '20px';
  card.style.border = '1px solid #ddd';
  card.style.borderRadius = '6px';
  card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

  const header = document.createElement('div');
  header.className = 'card-header';
  header.style.background = '#1f2940';
  header.style.color = '#fff';
  header.style.padding = '10px 15px';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  const title = document.createElement('div');
  title.innerHTML = `<strong>${kar.nev}</strong> <span style="opacity:0.8;">(${kar.rovidites})</span>`;

  const hataridoWrapper = document.createElement('div');
  hataridoWrapper.style.display = 'flex';
  hataridoWrapper.style.alignItems = 'center';
  hataridoWrapper.style.gap = '8px';

  const hataridoInput = document.createElement('input');
  const effectiveDate = kar.feltoltesHatarido || GLOBAL_UPLOAD_DEADLINE;

  hataridoInput.type = 'datetime-local';
  hataridoInput.value = formatDateForInput(effectiveDate);
  hataridoInput.style.padding = '2px 4px';

  const hataridoLabel = document.createElement('span');
  hataridoLabel.style.fontSize = '0.85rem';

  if (kar.feltoltesHatarido) {
    hataridoLabel.textContent =
      `Jelenlegi (kar-specifikus): ${formatDateHuman(kar.feltoltesHatarido)}`;
  } else if (GLOBAL_UPLOAD_DEADLINE) {
    hataridoLabel.textContent =
      `Jelenlegi (globális alap): ${formatDateHuman(GLOBAL_UPLOAD_DEADLINE)}`;
  } else {
    hataridoLabel.textContent = 'Jelenlegi: nincs beállítva határidő';
  }

  const hataridoBtn = document.createElement('button');
  hataridoBtn.textContent = 'Határidő mentése';
  hataridoBtn.className = 'btn btn-sm btn-primary';

  hataridoBtn.addEventListener('click', async () => {
    const hibadiv = document.getElementById('hiba-uzenet');
    hibadiv.textContent = '';

    try {
      if (kar.rovidites === 'NINCS_KAR') {
        alert('Kar nélküli gyűjtőhöz nem állíthatsz be határidőt.');
        return;
      }

      // ❌ Nincs dátum az inputban
      if (!hataridoInput.value) {
        if (GLOBAL_UPLOAD_DEADLINE) {
          const confirmed = confirm(
            'Nem adtál meg dátumot.\n\n' +
            'Ebben az esetben a kar-specifikus határidőt töröljük, ' +
            'és ez a kar a globális dolgozat-feltöltési határidőt fogja használni.\n\n' +
            'Folytatod?'
          );
          if (!confirmed) return;

          const updated = await mentsKarHatarido(kar._id, null);
          kar.feltoltesHatarido = updated.feltoltesHatarido;

          hataridoInput.value = formatDateForInput(GLOBAL_UPLOAD_DEADLINE);
          hataridoLabel.textContent =
            `Jelenlegi (globális alap): ${formatDateHuman(GLOBAL_UPLOAD_DEADLINE)}`;

          alert('A kar-specifikus határidő törölve, mostantól a globális határidő érvényes erre a karra is.');
          return;
        }

        // Globális sincs → tényleg korlátlan
        const confirmed = confirm(
          'Nem adtál meg dátumot, és globális feltöltési határidő sincs beállítva.\n\n' +
          'Ebben az esetben ez a kar nem lesz időkorlátozva a feltöltésnél.\n\n' +
          'Biztosan folytatod?'
        );
        if (!confirmed) return;

        const updated = await mentsKarHatarido(kar._id, null);
        kar.feltoltesHatarido = updated.feltoltesHatarido;

        hataridoInput.value = '';
        hataridoLabel.textContent = 'Jelenlegi: nincs beállítva határidő';

        alert('A kar-specifikus határidő törölve, nincs korlát.');
        return;
      }

      // ✅ Van dátum → mentés
      const updated = await mentsKarHatarido(kar._id, hataridoInput.value);
      kar.feltoltesHatarido = updated.feltoltesHatarido;

      hataridoInput.value = formatDateForInput(updated.feltoltesHatarido);
      hataridoLabel.textContent =
        `Jelenlegi (kar-specifikus): ${formatDateHuman(updated.feltoltesHatarido)}`;

      alert('Határidő sikeresen mentve.');
    } catch (err) {
      console.error(err);
      hibadiv.textContent = err.message || 'Hiba a határidő mentésekor.';
    }
  });

  hataridoWrapper.appendChild(hataridoInput);
  hataridoWrapper.appendChild(hataridoBtn);
  hataridoWrapper.appendChild(hataridoLabel);

  header.appendChild(title);
  header.appendChild(hataridoWrapper);

  const body = document.createElement('div');
  body.className = 'card-body';
  body.style.padding = '10px 15px';

  if (karDolgozatok.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Ehhez a karhoz jelenleg nincs dolgozat.';
    p.style.fontStyle = 'italic';
    body.appendChild(p);
  } else {
    let biralok;
    try {
      biralok = await betoltBiralok(kar.rovidites === 'NINCS_KAR' ? 'osszes' : kar.rovidites);
    } catch (err) {
      console.error('Bírálók betöltési hiba:', err);
      biralok = [];
    }

    const table = document.createElement('table');
    table.className = 'table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="text-align:left;">Cím</th>
        <th>Hallgató(k)</th>
        <th>Témavezető(k)</th>
        <th>Állapot</th>
        <th>Bírálók</th>
        <th>Új bíráló</th>
      </tr>
    `;

    const tbody = document.createElement('tbody');

    karDolgozatok.forEach(d => {
      const tr = document.createElement('tr');

      const tdCim = document.createElement('td');
      tdCim.textContent = d.cim;
      tdCim.style.fontWeight = '500';

      const tdHallgato = document.createElement('td');
      tdHallgato.innerHTML = (d.szerzok || [])
        .map(s => `${s.nev || 'Ismeretlen'} <span style="opacity:0.7;">(${s.neptun || ''})</span>`)
        .join('<br>') || '-';

      const tdTema = document.createElement('td');
      tdTema.innerHTML = (d.temavezeto || [])
        .map(t => `${t.nev || 'Ismeretlen'} <span style="opacity:0.7;">(${t.neptun || ''})</span>`)
        .join('<br>') || '-';

      const tdAllapot = document.createElement('td');

      // Ha 2 bírálat között >= 12 pont eltérés van ÉS még nincs lezárva (nem "bírálva")
      if (d.nagyElteres12 && d.allapot !== 'bírálva') {
        tdAllapot.innerHTML = `
          <div><strong>12 pontnál nagyobb eltérés a bírálatok között.</strong></div>
          <div style="font-size:0.85rem; color:#c00;">
            Szükséges egy harmadik bíráló felvétele.
          </div>
        `;
      } else {
        // Egyébként a sima állapot látszik
        tdAllapot.textContent = d.allapot || '-';
      }




      const tdBiralok = document.createElement('td');
      if (!d.biralok || d.biralok.length === 0) {
        tdBiralok.textContent = 'Nincs bíráló';
      } else {
        d.biralok.forEach(b => {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.justifyContent = 'space-between';
          row.style.gap = '6px';
          row.style.marginBottom = '4px';

          const info = document.createElement('span');
          info.innerHTML = `${b.nev} <span style="opacity:0.7;">(${b.allapot || 'Felkérve'})</span>`;

          const delBtn = document.createElement('button');
          delBtn.textContent = 'X';
          delBtn.className = 'btn btn-sm btn-danger';
          delBtn.style.padding = '1px 6px';

          delBtn.addEventListener('click', async () => {
            const hibadiv = document.getElementById('hiba-uzenet');
            hibadiv.textContent = '';
            if (!confirm(`Biztosan törlöd ${b.nev} bírálót erről a dolgozatról?`)) return;

            try {
              await torolBiralo(d._id, b.id);
              d.biralok = d.biralok.filter(x => x.id !== b.id);
              renderKarok();
            } catch (err) {
              console.error(err);
              hibadiv.textContent = err.message || 'Hiba a bíráló törlésekor.';
            }
          });

          row.appendChild(info);
          row.appendChild(delBtn);
          tdBiralok.appendChild(row);
        });
      }

      const tdUjBiralo = document.createElement('td');

      if (kar.rovidites === 'NINCS_KAR') {
        tdUjBiralo.textContent = 'Kar nélküli dolgozat';
      } else {
        const select = document.createElement('select');
        select.className = 'form-select form-select-sm';
        select.style.minWidth = '180px';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = biralok.length === 0
          ? 'Nincs elérhető bíráló'
          : 'Válassz bírálót...';
        select.appendChild(defaultOpt);

        biralok.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b._id;
          opt.textContent = `${b.nev} (${b.email})`;
          select.appendChild(opt);
        });

        const addBtn = document.createElement('button');
        addBtn.textContent = 'Hozzáadás';
        addBtn.className = 'btn btn-sm btn-primary';
        addBtn.style.marginLeft = '6px';

        addBtn.addEventListener('click', async () => {
          const hibadiv = document.getElementById('hiba-uzenet');
          hibadiv.textContent = '';

          const valasztottId = select.value;
          if (!valasztottId) {
            alert('Először válassz ki egy bírálót!');
            return;
          }

          try {
            await hozzaadBiralo(d._id, valasztottId);
            DOLGOZATOK = await betoltDolgozatok();
            renderKarok();
          } catch (err) {
            console.error(err);
            hibadiv.textContent = err.message || 'Hiba a bíráló hozzáadásakor.';
          }
        });

        tdUjBiralo.appendChild(select);
        tdUjBiralo.appendChild(addBtn);
      }

      tr.appendChild(tdCim);
      tr.appendChild(tdHallgato);
      tr.appendChild(tdTema);
      tr.appendChild(tdAllapot);
      tr.appendChild(tdBiralok);
      tr.appendChild(tdUjBiralo);

      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    body.appendChild(table);
  }

  card.appendChild(header);
  card.appendChild(body);
  container.appendChild(card);
}
