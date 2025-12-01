document.addEventListener('DOMContentLoaded', function () {
    const dolgozatTbody = document.getElementById('dolgozat-tbody');
    const searchInput = document.getElementById('dolgozat-search-input');
    const paginationContainer = document.getElementById('dolgozat-pagination');
    let dolgozatok = [];
    let currentPage = 1;
    let itemsPerPage = 25;

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

        // 🔹 Nevek + Neptun -> hallgatók / témavezetők szövege
        const hallgatokText =
            (dolgozat.hallgato_ids || [])
                .map(neptun => {
                    const nev = felhasznalokNevek[neptun];
                    return nev ? `${nev} (${neptun})` : neptun;
                })
                .join(', ') || '—';

        const temavezetoText =
            (dolgozat.temavezeto_ids || [])
                .map(neptun => {
                    const nev = felhasznalokNevek[neptun];
                    return nev ? `${nev} (${neptun})` : neptun;
                })
                .join(', ') || '—';

        const leiras = dolgozat.leiras || '—';

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
                    dolgozat.allapot === 'jelentkezett'
                        ? `<button class="jelentkezes-btn" onclick="feltoltes('${dolgozat._id}')">Feltöltés</button>`
                        : ''
                }
                ${
                    dolgozat.filePath &&
                    (dolgozat.allapot === 'feltöltve' || dolgozat.allapot === 'értékelve')
                        ? `<button class="view-button" onclick="megtekintes('${dolgozat.filePath}')">Megtekintés</button>`
                        : ''
                }
            </td>
        `;

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

    // Feltöltés művelet
    window.feltoltes = async function (id) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = ".pdf";
        fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await fetch(`/api/dolgozatok/feltoltes/${id}`, {
                    method: 'POST',
                    body: formData
                });
                if (response.ok) {
                    alert('Fájl sikeresen feltöltve');
                    listazDolgozatok(); // Frissítjük a listát
                } else {
                    console.error('Hiba történt a feltöltés során');
                }
            } catch (error) {
                console.error('Hiba történt a feltöltés során:', error);
            }
        };
        fileInput.click();
    }

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
