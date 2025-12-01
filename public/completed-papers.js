document.addEventListener('DOMContentLoaded', function () {
    const dolgozatTbody = document.getElementById('dolgozat-tbody');
    const searchInput = document.getElementById('dolgozat-search-input');
    const paginationContainer = document.getElementById('dolgozat-pagination');
    let dolgozatok = [];
    let currentPage = 1;
    let itemsPerPage = 25;
    let currentUploadPaperId = null;
    let selectedFiles = []; // csak a most kiválasztott (még fel nem töltött) fájlok
    const uploadModal = document.getElementById('upload-modal');
    const uploadBlur = document.getElementById('upload-blur');
    const uploadInput = document.getElementById('upload-files-input');
    const uploadedFilesList = document.getElementById('uploaded-files-list');
    const uploadSaveBtn = document.getElementById('upload-save-btn');
    const uploadCancelBtn = document.getElementById('upload-cancel-btn');

    const feltoltesEngedelyezettAllapotok = [
  'jelentkezett',
  'feltöltve - témavezető válaszára vár',
  'elfogadva - témavezető által',
  'elutasítva - témavezető által'
];



    // Dolgozatok lekérdezése
    async function listazDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok/feltoltheto');
            dolgozatok = await response.json();
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba történt a dolgozatok lekérése során:', err);
        }
    }

// Dolgozatok megjelenítése
async function megjelenitDolgozatok() {
    const searchText = searchInput.value.toLowerCase();

    // 🔹 Felhasználók betöltése név-térképhez
    let felhasznalokNevek = {};
    try {
        const res = await fetch('/api/felhasznalok');
        const felhasznalok = await res.json();
        felhasznalok.forEach(f => {
            if (f.neptun && f.nev) {
                felhasznalokNevek[f.neptun] = f.nev;
            }
        });
    } catch (err) {
        console.error('Nem sikerült lekérni a felhasználókat:', err);
    }

    // 🔹 Szűrés (cím, állapot, Neptun)
    const filteredDolgozatok = dolgozatok.filter(dolgozat => {
        const cim = (dolgozat.cim || dolgozat.cím || '').toLowerCase();
        const allapot = (dolgozat.allapot || '').toLowerCase();
        const hallgatoStr = (dolgozat.hallgato_ids || []).join(', ').toLowerCase();
        const temavezetoStr = (dolgozat.temavezeto_ids || []).join(', ').toLowerCase();

        return (
            cim.includes(searchText) ||
            allapot.includes(searchText) ||
            hallgatoStr.includes(searchText) ||
            temavezetoStr.includes(searchText)
        );
    });

    const start = (currentPage - 1) * itemsPerPage;
    const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);

    dolgozatTbody.innerHTML = '';

paginatedDolgozatok.forEach(dolgozat => {
    const cim = dolgozat.cim || dolgozat.cím || 'N/A';
    const allapot = dolgozat.allapot || 'N/A';

      // 🔹 Leírás
    const leiras = dolgozat.leiras || '';

    // 🔹 Hallgatók (név + Neptun, ha van)
    const hallgatokText =
        (dolgozat.hallgato_ids || [])
            .map(neptun => {
                const nev = felhasznalokNevek[neptun] || '';
                return nev ? `${nev} (${neptun})` : neptun;
            })
            .join(', ') || '–';

    // 🔹 Témavezetők (név + Neptun, ha van)
    const temavezetoText =
        (dolgozat.temavezeto_ids || [])
            .map(neptun => {
                const nev = felhasznalokNevek[neptun] || '';
                return nev ? `${nev} (${neptun})` : neptun;
            })
            .join(', ') || '–';

    // ... hallgatokText, temavezetoText, leiras ugyanúgy marad ...

    const eredetiAllapot = dolgozat.allapot || '';
    const mutassFeltoltesGombot =
        feltoltesEngedelyezettAllapotok.includes(eredetiAllapot);
    const mutassMegtekintesGombot = !!dolgozat.filePath;

    // 🔹 Fő sor (Cím + Állapot + Műveletek)
    const tr = document.createElement('tr');
    tr.dataset.id = dolgozat._id;
    tr.innerHTML = `
        <td class="clickable-title" onclick="toggleDetails('${dolgozat._id}')">
            <div class="cim-es-ikon">
                <span class="cim-szoveg" title="${cim}">${cim}</span>
                <span class="toggle-icon" id="toggle-icon-${dolgozat._id}">▼</span>
            </div>
        </td>
        <td>${allapot}</td>
        <td class="actions-cell">
            ${
                mutassFeltoltesGombot
                    ? `<button class="jelentkezes-btn" onclick="feltoltes('${dolgozat._id}')">Feltöltés</button>`
                    : ''
            }
        </td>
    `;

    // 🔹 Részletek sor (lenyíló) – ez maradhat pont úgy, ahogy most van
    const detailTr = document.createElement('tr');
    detailTr.classList.add('dolgozat-details-row');
    detailTr.id = `details-${dolgozat._id}`;
    detailTr.style.display = 'none';

    detailTr.innerHTML = `
        <td colspan="3">
            <div class="dolgozat-details-panel">
                <p class="dolgozat-leiras">
                    <span class="leiras-cimke">Tartalmi összefoglaló:</span><br>
                    <span class="leiras-szoveg">${leiras}</span>
                </p>

                <p><strong>Hallgatók:</strong> ${hallgatokText}</p>
                <p><strong>Témavezetők:</strong> ${temavezetoText}</p>
            </div>
        </td>
    `;

    dolgozatTbody.appendChild(tr);
    dolgozatTbody.appendChild(detailTr);
});


    frissitPaginacio(filteredDolgozatok.length);
}


    // Lapozó gombok frissítése
    function frissitPaginacio(totalItems) {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            if (i === currentPage) btn.classList.add('active');
            btn.addEventListener('click', () => {
                currentPage = i;
                megjelenitDolgozatok();
            });
            paginationContainer.appendChild(btn);
        }
    }

    // Feltöltés gomb → modal megnyitása
        window.feltoltes = async function (id) {
        currentUploadPaperId = id;
        selectedFiles = [];
        uploadInput.value = ''; // kiürítjük

        // már meglévő fájlok betöltése az API-ból
        try {
            const res = await fetch(`/api/dolgozatok/${id}/files`);
            const files = res.ok ? await res.json() : [];
            renderUploadedFiles(files);
        } catch (err) {
            console.error('Nem sikerült lekérni a fájlokat:', err);
            renderUploadedFiles([]);
        }

        showUploadModal();
        };

        function showUploadModal() {
        uploadModal.style.display = 'block';
        uploadBlur.style.display = 'block';
        }

        function hideUploadModal() {
        uploadModal.style.display = 'none';
        uploadBlur.style.display = 'none';
        currentUploadPaperId = null;
        selectedFiles = [];
        uploadInput.value = '';
        uploadedFilesList.innerHTML = '';
        }

        uploadCancelBtn.addEventListener('click', hideUploadModal);
        uploadBlur.addEventListener('click', hideUploadModal);

        uploadInput.addEventListener('change', () => {
        // hozzáadjuk az újonnan kiválasztott fájlokat a selectedFiles tömbhöz
        const files = Array.from(uploadInput.files);
        selectedFiles = selectedFiles.concat(files);

        // Kijelzéshez kombináljuk a már adatbázisban lévő fájlokat + újakat.
        // A régieket az API-ból tölti be a feltoltes() hívás, itt most csak az újak listáját rajzoljuk külön.
        renderSelectedFiles();
        });

        // A már szerveren lévő fájlok kilistázása
function renderUploadedFiles(filesFromServer) {
  uploadedFilesList.innerHTML = '';

  filesFromServer.forEach(file => {
    const li = document.createElement('li');
    li.style.marginBottom = '6px';

    li.innerHTML = `
      <span class="file-name" style="cursor:pointer; text-decoration:underline;">
        ${file.originalName || file.fileName}
      </span>
      <button class="delete-btn" style="padding:3px 8px; margin-left:8px;">
        Törlés
      </button>
    `;

    // Megtekintés (névre kattintva – új fülön nyitja meg)
    li.querySelector('.file-name').addEventListener('click', () => {
      if (file.path) window.open(file.path, '_blank');
    });

    // Törlés a szerverről
    li.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Biztosan törlöd ezt a fájlt?')) return;
      try {
        const res = await fetch(`/api/dolgozatok/${currentUploadPaperId}/files/${file._id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          const updated = await res.json();
          renderUploadedFiles(updated.files || []);
        } else {
          console.error('Hiba történt a fájl törlésekor');
        }
      } catch (err) {
        console.error('Hiba történt a fájl törlésekor:', err);
      }
    });

    uploadedFilesList.appendChild(li);
  });

  // Újonnan kiválasztott (még fel nem töltött) fájlok is jelenjenek meg
  if (selectedFiles.length > 0) {
    const separator = document.createElement('li');
    separator.style.borderTop = '1px solid #ccc';
    separator.style.margin = '8px 0';
    uploadedFilesList.appendChild(separator);

    selectedFiles.forEach((file, index) => {
      const li = document.createElement('li');
      li.style.marginBottom = '4px';
      li.textContent = `${file.name} (még nincs feltöltve)`;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.textContent = 'Eltávolítás a listából';
      delBtn.style.padding = '3px 8px';
      delBtn.style.marginLeft = '8px';
      delBtn.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderUploadedFiles(filesFromServer); // újrarajzol
      });

      li.appendChild(delBtn);
      uploadedFilesList.appendChild(li);
    });
  }
}

// csak az új, még fel nem töltött fájlokat frissítjük a listában
function renderSelectedFiles() {
  // először újra lekérjük a szerveren lévőket, hogy ne vesszen el az info
  fetch(`/api/dolgozatok/${currentUploadPaperId}/files`)
    .then(r => r.ok ? r.json() : [])
    .then(files => renderUploadedFiles(files))
    .catch(err => {
      console.error('Nem sikerült újrarajzolni a listát:', err);
      renderUploadedFiles([]);
    });
}
    // A már szerveren lévő fájlok kilistázása
function renderUploadedFiles(filesFromServer) {
  uploadedFilesList.innerHTML = '';

  filesFromServer.forEach(file => {
    const li = document.createElement('li');
    li.style.marginBottom = '6px';

    li.innerHTML = `
      <span class="file-name" style="cursor:pointer; text-decoration:underline;">
        ${file.originalName || file.fileName}
      </span>
      <button class="delete-btn" style="padding:3px 8px; margin-left:8px;">
        Törlés
      </button>
    `;

    // Megtekintés (névre kattintva – új fülön nyitja meg)
    li.querySelector('.file-name').addEventListener('click', () => {
      if (file.path) window.open(file.path, '_blank');
    });

    // Törlés a szerverről
    li.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Biztosan törlöd ezt a fájlt?')) return;
      try {
        const res = await fetch(`/api/dolgozatok/${currentUploadPaperId}/files/${file._id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          const updated = await res.json();
          renderUploadedFiles(updated.files || []);
        } else {
          console.error('Hiba történt a fájl törlésekor');
        }
      } catch (err) {
        console.error('Hiba történt a fájl törlésekor:', err);
      }
    });

    uploadedFilesList.appendChild(li);
  });

  // Újonnan kiválasztott (még fel nem töltött) fájlok is jelenjenek meg
  if (selectedFiles.length > 0) {
    const separator = document.createElement('li');
    separator.style.borderTop = '1px solid #ccc';
    separator.style.margin = '8px 0';
    uploadedFilesList.appendChild(separator);

    selectedFiles.forEach((file, index) => {
      const li = document.createElement('li');
      li.style.marginBottom = '4px';
      li.textContent = `${file.name} (még nincs feltöltve)`;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.textContent = 'Eltávolítás a listából';
      delBtn.style.padding = '3px 8px';
      delBtn.style.marginLeft = '8px';
      delBtn.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderUploadedFiles(filesFromServer); // újrarajzol
      });

      li.appendChild(delBtn);
      uploadedFilesList.appendChild(li);
    });
  }
}

// csak az új, még fel nem töltött fájlokat frissítjük a listában
function renderSelectedFiles() {
  // először újra lekérjük a szerveren lévőket, hogy ne vesszen el az info
  fetch(`/api/dolgozatok/${currentUploadPaperId}/files`)
    .then(r => r.ok ? r.json() : [])
    .then(files => renderUploadedFiles(files))
    .catch(err => {
      console.error('Nem sikerült újrarajzolni a listát:', err);
      renderUploadedFiles([]);
    });
}

    uploadSaveBtn.addEventListener('click', async () => {
  if (!currentUploadPaperId) return;

  if (selectedFiles.length === 0) {
    alert('Nem választottál új fájlt.');
    return;
  }

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('files', f));

  try {
    const res = await fetch(`/api/dolgozatok/${currentUploadPaperId}/files`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      console.error('Hiba történt a fájlok feltöltésekor');
      alert('Hiba történt a feltöltés során.');
      return;
    }

    const data = await res.json();
    alert('Fájl(ok) sikeresen feltöltve.');

    selectedFiles = [];
    renderUploadedFiles(data.files || []);

    // Frissítjük a táblázatot is, hogy az állapot/műveletek is frissüljenek
    listazDolgozatok();
    hideUploadModal();
  } catch (err) {
    console.error('Hiba történt a fájlok feltöltésekor:', err);
    alert('Hiba történt a feltöltés során.');
  }
});


    // Megtekintés művelet
    window.megtekintes = function (filePath) {
        window.open(filePath, '_blank');
    }

    // Keresőmező megjelenítése
    window.toggleDolgozatSearch = function() {
        if (searchInput.style.display === 'none') {
            searchInput.style.display = 'block';
            searchInput.focus();
        } else {
            searchInput.style.display = 'none';
            searchInput.value = '';
            megjelenitDolgozatok();
        }
    }

    // Keresés
    window.searchDolgozatok = function() {
        currentPage = 1;
        megjelenitDolgozatok();
    }

    window.toggleDetails = function (dolgozatId) {
    const detailRow = document.getElementById(`details-${dolgozatId}`);
    const icon = document.getElementById(`toggle-icon-${dolgozatId}`);

    if (!detailRow) return;

    const isVisible = detailRow.style.display === 'table-row';
    detailRow.style.display = isVisible ? 'none' : 'table-row';

    if (icon) {
        icon.textContent = isVisible ? '▼' : '▲';
    }
};


    // Indításkor dolgozatok betöltése
    listazDolgozatok();

    const sorokSzamaSelect = document.getElementById('sorokSzama');
    if (sorokSzamaSelect) {
        sorokSzamaSelect.addEventListener('change', function () {
            itemsPerPage = parseInt(this.value);
            currentPage = 1;
            megjelenitDolgozatok();
        });
    }
});
