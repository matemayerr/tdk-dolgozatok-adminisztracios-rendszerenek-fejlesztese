document.addEventListener('DOMContentLoaded', function () {
  const dolgozatTbody = document.getElementById('dolgozat-tbody');
  const searchInput = document.getElementById('dolgozat-search-input');
  const paginationContainer = document.getElementById('dolgozat-pagination');
  const uploadModal = document.getElementById('upload-modal');
  const uploadBlur = document.getElementById('upload-blur');
  const uploadInput = document.getElementById('upload-files-input');
  const uploadedFilesList = document.getElementById('uploaded-files-list');
  const uploadSaveBtn = document.getElementById('upload-save-btn');
  const uploadCancelBtn = document.getElementById('upload-cancel-btn');
  const sorokSzamaSelect = document.getElementById('sorokSzama');

  // 🔹 Fájl törlés megerősítő modal elemei – HTML-hez igazítva
  const fileDeleteConfirmModal = document.getElementById('confirm-delete-modal');
  const fileDeleteConfirmText = document.getElementById('confirm-delete-text');
  const fileDeleteConfirmYesBtn = document.getElementById('confirm-delete-ok');
  const fileDeleteConfirmNoBtn = document.getElementById('confirm-delete-cancel');

  let dolgozatok = [];
  let currentPage = 1;
  let itemsPerPage = 25;
  let currentUploadPaperId = null;
  let selectedFiles = [];        // csak a most kiválasztott, még fel nem töltött fájlok
  let KAROK = [];                // /api/karok-ból jön
  let GLOBAL_UPLOAD_DEADLINE = null; // 🔹 globális határidő

  // 🔹 éppen törlésre kijelölt fájl ID + név
  let deleteTargetFileId = null;
  let deleteTargetFileName = '';

  const feltoltesEngedelyezettAllapotok = [
    'jelentkezett',
    'feltöltve - témavezető válaszára vár',
    'elfogadva - témavezető által',
    'elutasítva - témavezető által'
  ];

  // ---------------------------
  // 🔔 Egységes toast értesítő
  // ---------------------------
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
      // ha valamiért nincs konténer, fallback alert
      alert(message);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // kis csúsztatás, hogy az animáció biztosan lefusson
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    const removeToast = () => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, 300);
    };

    toast.addEventListener('click', removeToast);
    setTimeout(removeToast, 4000);
  }

  // ---------------------------
  // 1. Dolgozatok lekérdezése
  // ---------------------------
  async function listazDolgozatok() {
    try {
      const response = await fetch('/api/dolgozatok/feltoltheto');
      if (!response.ok) {
        throw new Error('Sikertelen válasz a /api/dolgozatok/feltoltheto végponttól.');
      }
      dolgozatok = await response.json();
      await megjelenitDolgozatok();
    } catch (err) {
      console.error('Hiba történt a dolgozatok lekérése során:', err);
      showToast('Nem sikerült lekérni a dolgozatokat.', 'error');
    }
  }

  // --------------------------------------------
  // 2. Dolgozatok megjelenítése táblázatban
  // --------------------------------------------
  async function megjelenitDolgozatok() {
    const searchText = (searchInput.value || '').toLowerCase();

    // 🔹 Felhasználók betöltése név-térképhez
    let felhasznalokNevek = {};
    try {
      const res = await fetch('/api/felhasznalok');
      if (!res.ok) throw new Error('Hiba a /api/felhasznalok hívásnál');
      const felhasznalok = await res.json();
      felhasznalok.forEach(f => {
        if (f.neptun && f.nev) {
          felhasznalokNevek[f.neptun] = f.nev;
        }
      });
    } catch (err) {
      console.error('Nem sikerült lekérni a felhasználókat:', err);
      showToast('Nem sikerült betölteni a felhasználókat.', 'error');
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

    // 🔹 Lapozás
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);

    dolgozatTbody.innerHTML = '';

    paginatedDolgozatok.forEach(dolgozat => {
      const cim = dolgozat.cim || dolgozat.cím || 'N/A';
      const allapot = dolgozat.allapot || 'N/A';
      const leiras = dolgozat.leiras || '';

      // Hallgatók (név + Neptun)
      const hallgatokText =
        (dolgozat.hallgato_ids || [])
          .map(neptun => {
            const nev = felhasznalokNevek[neptun] || '';
            return nev ? `${nev} (${neptun})` : neptun;
          })
          .join(', ') || '–';

      // Témavezetők (név + Neptun)
      const temavezetoText =
        (dolgozat.temavezeto_ids || [])
          .map(neptun => {
            const nev = felhasznalokNevek[neptun] || '';
            return nev ? `${nev} (${neptun})` : neptun;
          })
          .join(', ') || '–';

      const eredetiAllapot = dolgozat.allapot || '';
      const mutassFeltoltesGombot = feltoltesEngedelyezettAllapotok.includes(eredetiAllapot);
      const mutassMegtekintesGombot = !!dolgozat.filePath;

      // Határidő infó a kar alapján
      const { text: hataridoSzoveg, lejart: hataridoLejart } = getKarDeadlineInfo(dolgozat);

      // 🔹 Fősor
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
        <td class="actions-cell"></td>
      `;

      const actionsCell = tr.querySelector('.actions-cell');

      // Feltöltés gomb
      if (mutassFeltoltesGombot) {
        const btn = document.createElement('button');
        btn.className = 'jelentkezes-btn';
        btn.title = hataridoSzoveg;

        if (hataridoLejart) {
          btn.textContent = 'Határidő lejárt';
          btn.disabled = true;
          btn.classList.add('disabled-btn');
        } else {
          btn.textContent = 'Feltöltés';
          btn.addEventListener('click', () => feltoltes(dolgozat._id));
        }

        actionsCell.appendChild(btn);
      }

      // 🔹 Részletek sor (lenyíló)
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
            <p><strong>Kar határidő:</strong> ${hataridoSzoveg}</p>
          </div>
        </td>
      `;

      dolgozatTbody.appendChild(tr);
      dolgozatTbody.appendChild(detailTr);
    });

    frissitPaginacio(filteredDolgozatok.length);
  }

  // ---------------------------
  // 3. Lapozó frissítése
  // ---------------------------
  function frissitPaginacio(totalItems) {
    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

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

  // ---------------------------------------------------
  // 4. Fájl feltöltés modal – megnyitás / bezárás stb.
  // ---------------------------------------------------
  window.feltoltes = async function (id) {
    currentUploadPaperId = id;
    selectedFiles = [];
    uploadInput.value = '';

    const dolgozat = dolgozatok.find(d => d._id === id);
    const { text: hataridoSzoveg, lejart: hataridoLejart } = getKarDeadlineInfo(dolgozat);

    const deadlineElem = document.getElementById('upload-deadline-info');
    if (deadlineElem) {
      deadlineElem.textContent = hataridoSzoveg;
    }

    uploadSaveBtn.disabled = hataridoLejart;
    if (hataridoLejart) {
      uploadSaveBtn.classList.add('disabled-btn');
    } else {
      uploadSaveBtn.classList.remove('disabled-btn');
    }

    // már meglévő fájlok betöltése
    try {
      const res = await fetch(`/api/dolgozatok/${id}/files`);
      const files = res.ok ? await res.json() : [];
      renderUploadedFiles(files);
    } catch (err) {
      console.error('Nem sikerült lekérni a fájlokat:', err);
      showToast('Nem sikerült betölteni a fájlokat.', 'error');
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

  // új fájlok kiválasztása
  uploadInput.addEventListener('change', () => {
    const files = Array.from(uploadInput.files);
    selectedFiles = selectedFiles.concat(files);
    renderSelectedFiles();
  });

  // -------------------------------------------
  // 5. Szerveren lévő + új fájlok kilistázása
  // -------------------------------------------
  function renderUploadedFiles(filesFromServer) {
    uploadedFilesList.innerHTML = '';

    // Szerveren lévők
    filesFromServer.forEach(file => {
      const li = document.createElement('li');
      li.style.marginBottom = '6px';

      const fileName = file.originalName || file.fileName;

      li.innerHTML = `
        <span class="file-name" style="cursor:pointer; text-decoration:underline;">
          ${fileName}
        </span>
        <button class="delete-btn" style="padding:3px 8px; margin-left:8px;">
          Törlés
        </button>
      `;

      li.querySelector('.file-name').addEventListener('click', () => {
        if (file.path) window.open(file.path, '_blank');
      });

      // confirm() helyett saját modal
      li.querySelector('.delete-btn').addEventListener('click', () => {
        openFileDeleteConfirmModal(file._id, fileName);
      });

      uploadedFilesList.appendChild(li);
    });

    // Újonnan kiválasztott, még fel nem töltött fájlok
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
          renderUploadedFiles(filesFromServer);
        });

        li.appendChild(delBtn);
        uploadedFilesList.appendChild(li);
      });
    }
  }

  function renderSelectedFiles() {
    if (!currentUploadPaperId) return;

    fetch(`/api/dolgozatok/${currentUploadPaperId}/files`)
      .then(r => (r.ok ? r.json() : []))
      .then(files => renderUploadedFiles(files))
      .catch(err => {
        console.error('Nem sikerült újrarajzolni a listát:', err);
        showToast('Nem sikerült frissíteni a fájllistát.', 'error');
        renderUploadedFiles([]);
      });
  }

  // ------------------------------------------------
  // 5/b. Fájl törlés MODAL logika
  // ------------------------------------------------
  function openFileDeleteConfirmModal(fileId, fileName) {
    deleteTargetFileId = fileId;
    deleteTargetFileName = fileName || '';

    if (fileDeleteConfirmText) {
      fileDeleteConfirmText.textContent =
        fileName
          ? `Biztosan törlöd a(z) "${fileName}" fájlt?`
          : 'Biztosan törlöd ezt a fájlt?';
    }

    if (fileDeleteConfirmModal) {
      fileDeleteConfirmModal.style.display = 'block';
    }
  }

  function closeFileDeleteConfirmModal() {
    if (fileDeleteConfirmModal) {
      fileDeleteConfirmModal.style.display = 'none';
    }
    deleteTargetFileId = null;
    deleteTargetFileName = '';
  }

  // "Mégse" gomb a modalban
  if (fileDeleteConfirmNoBtn) {
    fileDeleteConfirmNoBtn.addEventListener('click', () => {
      closeFileDeleteConfirmModal();
    });
  }

  // Modal háttérre kattintás – (ha a teljes overlay a modal elem)
  if (fileDeleteConfirmModal) {
    fileDeleteConfirmModal.addEventListener('click', (e) => {
      if (e.target === fileDeleteConfirmModal) {
        closeFileDeleteConfirmModal();
      }
    });
  }

  // "Törlés" gomb a modalban
  if (fileDeleteConfirmYesBtn) {
    fileDeleteConfirmYesBtn.addEventListener('click', async () => {
      if (!currentUploadPaperId || !deleteTargetFileId) {
        closeFileDeleteConfirmModal();
        return;
      }

      try {
        const res = await fetch(
          `/api/dolgozatok/${currentUploadPaperId}/files/${deleteTargetFileId}`,
          { method: 'DELETE' }
        );
        if (res.ok) {
          const updated = await res.json();
          renderUploadedFiles(updated.files || []);
          showToast('Fájl sikeresen törölve.', 'success');
        } else {
          console.error('Hiba történt a fájl törlésekor');
          showToast('Hiba történt a fájl törlésekor.', 'error');
        }
      } catch (err) {
        console.error('Hiba történt a fájl törlésekor:', err);
        showToast('Hiba történt a fájl törlésekor.', 'error');
      } finally {
        closeFileDeleteConfirmModal();
      }
    });
  }

  // ---------------------------------
  // 6. Fájlok tényleges feltöltése
  // ---------------------------------
  uploadSaveBtn.addEventListener('click', async () => {
    if (!currentUploadPaperId) return;

    if (selectedFiles.length === 0) {
      showToast('Nem választottál új fájlt.', 'info');
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
        showToast('Hiba történt a feltöltés során.', 'error');
        return;
      }

      const data = await res.json();
      showToast('Fájl(ok) sikeresen feltöltve.', 'success');

      selectedFiles = [];
      renderUploadedFiles(data.files || []);

      await listazDolgozatok();
      hideUploadModal();
    } catch (err) {
      console.error('Hiba történt a fájlok feltöltésekor:', err);
      showToast('Hiba történt a feltöltés során.', 'error');
    }
  });

  // ------------------------
  // 7. Karok / határidők
  // ------------------------
  async function betoltKarok() {
    try {
      const res = await fetch('/api/karok');
      if (!res.ok) throw new Error('Nem sikerült betölteni a karokat');
      KAROK = await res.json(); // [{_id, nev, rovidites, feltoltesHatarido, ...}]
    } catch (err) {
      console.error('Hiba a karok betöltésekor:', err);
      KAROK = [];
      showToast('Nem sikerült betölteni a karok adatait.', 'error');
    }
  }

  // 🔹 Globális dolgozatfeltöltési határidő betöltése
  async function betoltGlobalFeltoltesHatarido() {
    try {
      const res = await fetch('/api/deadlines/dolgozat_feltoltes_global');
      if (!res.ok) {
        GLOBAL_UPLOAD_DEADLINE = null;
        return;
      }
      const d = await res.json();
      GLOBAL_UPLOAD_DEADLINE = d.hatarido || null;
    } catch (err) {
      console.error('Hiba a globális feltöltési határidő lekérésekor:', err);
      GLOBAL_UPLOAD_DEADLINE = null;
      showToast('Nem sikerült betölteni a globális határidőt.', 'error');
    }
  }

  function getKarDeadlineInfo(dolgozat) {
    const now = new Date();
    let hatarido = null;
    let forras = '';

    // 1️⃣ Kar-specifikus határidő
    if (dolgozat.kar && KAROK && KAROK.length > 0) {
      const karDoc = KAROK.find(k =>
        (k.rovidites && k.rovidites === dolgozat.kar) ||
        (k.nev && k.nev === dolgozat.kar)
      );

      if (karDoc && karDoc.feltoltesHatarido) {
        const d = new Date(karDoc.feltoltesHatarido);
        if (!Number.isNaN(d.getTime())) {
          hatarido = d;
          forras = `kar-specifikus (${karDoc.rovidites || karDoc.nev})`;
        }
      }
    }

    // 2️⃣ Ha nincs kar-specifikus, akkor globális
    if (!hatarido && GLOBAL_UPLOAD_DEADLINE) {
      const d = new Date(GLOBAL_UPLOAD_DEADLINE);
      if (!Number.isNaN(d.getTime())) {
        hatarido = d;
        forras = 'globális határidő';
      }
    }

    // 3️⃣ Ha semmi nincs → nincs korlát
    if (!hatarido) {
      return {
        text: 'Nincs beállítva határidő (korlátlan feltöltés)',
        lejart: false
      };
    }

    const lejart = now.getTime() > hatarido.getTime();
    const human = hatarido.toLocaleString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      text: `${forras}: ${human}`,
      lejart
    };
  }

  // ------------------------
  // 8. Egyéb globális függvények
  // ------------------------
  window.megtekintes = function (filePath) {
    if (filePath) window.open(filePath, '_blank');
  };

  window.toggleDolgozatSearch = function () {
    if (searchInput.style.display === 'none') {
      searchInput.style.display = 'block';
      searchInput.focus();
    } else {
      searchInput.style.display = 'none';
      searchInput.value = '';
      megjelenitDolgozatok();
    }
  };

  window.searchDolgozatok = function () {
    currentPage = 1;
    megjelenitDolgozatok();
  };

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

  // ------------------------
  // 9. Sorok száma választó
  // ------------------------
  if (sorokSzamaSelect) {
    sorokSzamaSelect.addEventListener('change', function () {
      itemsPerPage = parseInt(this.value, 10);
      currentPage = 1;
      megjelenitDolgozatok();
    });
  }

  // ------------------------
  // 10. Init
  // ------------------------
  (async function init() {
    await betoltKarok();
    await betoltGlobalFeltoltesHatarido();
    await listazDolgozatok();
  })();
});
