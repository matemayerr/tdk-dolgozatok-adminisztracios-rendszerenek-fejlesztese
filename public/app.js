document.addEventListener('DOMContentLoaded', function () {
    const dolgozatForm = document.getElementById('uj-dolgozat-form');
    const dolgozatTbody = document.getElementById('dolgozat-tbody');
    const searchInput = document.getElementById('dolgozat-search-input');
    const paginationContainer = document.getElementById('dolgozat-pagination');
    const hallgatoSelect = document.getElementById('dolgozat-hallgato-id');
    const temavezetoSelect = document.getElementById('dolgozat-temavezeto-id');
    let dolgozatok = [];
    let currentPage = 1;
    let aktualisModositandoId = null;
    let itemsPerPage = 25;
    let loggedInUser = null; // 🔹 bejelentkezett felhasználó adatai
    let dolgozatJelentkezesDeadline = null;
    let dolgozatJelentkezesLejart = false;

    function formatDateTimeHu(date) {
        return date.toLocaleString('hu-HU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', '');
    }

    // 🔹 Határidő lekérése a backendről
    async function betoltDolgozatJelentkezesHatarido() {
        try {
            const res = await fetch('/api/deadlines/dolgozat_jelentkezes');
            if (!res.ok) return;           // ha nincs beállítva, nincs korlátozás
            const data = await res.json();

            if (!data.hatarido) return;

            dolgozatJelentkezesDeadline = new Date(data.hatarido);
            frissitDolgozatJelentkezesUI();
        } catch (err) {
            console.error('Hiba a dolgozat jelentkezési határidő betöltésekor:', err);
        }
    }

    // 🔹 UI frissítése: szöveg + gombok
    function frissitDolgozatJelentkezesUI() {
        if (!dolgozatJelentkezesDeadline) return;

        const now = new Date();
        dolgozatJelentkezesLejart = now.getTime() > dolgozatJelentkezesDeadline.getTime();

        const infoElem = document.getElementById('dolgozat-deadline-info');
        const ujDolgozatGomb = document.getElementById('uj-dolgozat-gomb');
        const hozzaadasGomb = document.getElementById('hozzaadas-gomb');

        const formatted = formatDateTimeHu(dolgozatJelentkezesDeadline);

        if (infoElem) {
            if (dolgozatJelentkezesLejart) {
                infoElem.textContent =
                    `A dolgozat jelentkezési határidő lejárt (${formatted}). Új dolgozat már nem adható hozzá.`;
                infoElem.classList.add('deadline-expired');
            } else {
                infoElem.textContent = `Dolgozat jelentkezési határidő: ${formatted}`;
                infoElem.classList.remove('deadline-expired');
            }
        }

        if (dolgozatJelentkezesLejart) {
            if (ujDolgozatGomb) {
                ujDolgozatGomb.disabled = true;
                ujDolgozatGomb.classList.add('disabled-btn');
            }
            if (hozzaadasGomb) {
                hozzaadasGomb.disabled = true;
                hozzaadasGomb.classList.add('disabled-btn');
            }
        }
    }

    // sor kiválasztás
    const sorSzamSelect = document.getElementById('sorok-szama-dolgozat');
    if (sorSzamSelect) {
        sorSzamSelect.addEventListener('change', () => {
            const ertek = sorSzamSelect.value;
            if (ertek === 'all') {
                itemsPerPage = dolgozatok.length || 1000;
            } else {
                itemsPerPage = parseInt(ertek, 25);
            }
            currentPage = 1;
            megjelenitDolgozatok();
        });
    }

    // Felhasználók betöltése csoportok szerint
    async function betoltFelhasznalok() {
        try {
            const response = await fetch('/api/felhasznalok/csoportok');
            const { hallgatok, temavezetok } = await response.json();

            // Témavezetők betöltése (ez marad)
            const temavezetoLista = document.getElementById('temavezeto-lista');
            if (temavezetoLista) {
                temavezetoLista.innerHTML = temavezetok.map(t => `
                    <label>
                        <span>${t.nev} (${t.neptun})</span>
                        <input type="checkbox" value="${t.neptun}">
                    </label>
                `).join('');
            }
        } catch (error) {
            console.error('Hiba történt a felhasználók betöltése során:', error);
        }
    }

    // Hallgatói kereső szűrés
    const hallgatoKereso = document.getElementById('hallgato-kereso');
    if (hallgatoKereso) {
        hallgatoKereso.addEventListener('input', function () {
            const keres = this.value.toLowerCase();
            document.querySelectorAll('#hallgato-lista label').forEach(label => {
                label.style.display = label.textContent.toLowerCase().includes(keres) ? '' : 'none';
            });
        });
    }

    // Témavezető kereső szűrés
    const temavezetoKereso = document.getElementById('temavezeto-kereso');
    if (temavezetoKereso) {
        temavezetoKereso.addEventListener('input', function () {
            const keres = this.value.toLowerCase();
            document.querySelectorAll('#temavezeto-lista label').forEach(label => {
                label.style.display = label.textContent.toLowerCase().includes(keres) ? '' : 'none';
            });
        });
    }

    // Dolgozatok lekérdezése
    async function listazDolgozatok() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.warn('Nincs token, nem tudom lekérni a dolgozatokat. Jelentkezz be.');
                dolgozatok = [];
                megjelenitDolgozatok();
                return;
            }

            const response = await fetch('/api/papers', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.error('Nem sikerült lekérni a dolgozatokat. HTTP:', response.status);
                dolgozatok = [];
                megjelenitDolgozatok();
                return;
            }

            const data = await response.json();
            dolgozatok = Array.isArray(data) ? data : [];
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba történt a dolgozatok listázása során:', err);
            dolgozatok = [];
            megjelenitDolgozatok();
        }
    }

    // Dolgozatok megjelenítése
    async function megjelenitDolgozatok() {
        const searchText = searchInput.value.toLowerCase();

        // Felhasználók nevének betöltése (lokálisan cache-elt)
        let felhasznalokNevek = {};
        try {
            const response = await fetch('/api/felhasznalok');
            const felhasznalok = await response.json();
            felhasznalok.forEach(f => {
                felhasznalokNevek[f.neptun] = f.nev;
            });
        } catch (error) {
            console.error("Nem sikerült lekérni a felhasználókat", error);
        }

        // Szűrés a keresőszöveg alapján
        const filteredDolgozatok = dolgozatok.filter(dolgozat => {
            const cim = (dolgozat.cim || dolgozat.cím || '').toLowerCase();
            const allapot = dolgozat.allapot?.toLowerCase() || '';
            const temavezetoNev = (dolgozat.temavezeto || [])
                .map(t => (t.nev || '').toLowerCase()).join(' ');
            const hallgatokNevek = (dolgozat.szerzok || [])
                .map(s => (s.nev || '').toLowerCase()).join(' ');

            return cim.includes(searchText)
                || allapot.includes(searchText)
                || temavezetoNev.includes(searchText)
                || hallgatokNevek.includes(searchText);
        });

        const start = (currentPage - 1) * itemsPerPage;
        const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);

        dolgozatTbody.innerHTML = '';
        paginatedDolgozatok.forEach(dolgozat => {
            const roviditettCim = dolgozat.cim || dolgozat.cím;

            const tr = document.createElement('tr');
            tr.dataset.id = dolgozat._id;
            tr.innerHTML = `
                <td class="clickable-title" onclick="toggleDetails('${dolgozat._id}')">
                    <div class="cim-es-ikon">
                        <span class="cim-szoveg" title="${dolgozat.cim || dolgozat.cím}">${roviditettCim}</span>
                        <span class="toggle-icon" id="toggle-icon-${dolgozat._id}">▼</span>
                    </div>
                </td>
                <td>${dolgozat.allapot || 'N/A'}</td>
                <td>
                    <button class="modosit-btn" onclick="editDolgozat('${dolgozat._id}')">Módosítás</button>
                    <button class="delete-btn" onclick="deleteDolgozat('${dolgozat._id}')">Törlés</button>
                </td>
            `;

            const detailTr = document.createElement('tr');
            detailTr.classList.add('dolgozat-details-row');
            detailTr.id = `details-${dolgozat._id}`;
            detailTr.style.display = 'none';

            detailTr.innerHTML = `
                <td colspan="3">
                    <div class="dolgozat-details-panel">
                        <p class="dolgozat-leiras">
                            <span class="leiras-cimke">Tartalmi összefoglaló:</span><br>
                            <span class="leiras-szoveg">${dolgozat.leiras || '—'}</span>
                        </p>
                        <p><strong>Hallgatók:</strong> ${
                            (dolgozat.szerzok || []).map(s => `${s.nev} (${s.neptun})`).join(', ') || '—'
                        }</p>
                        <p><strong>Témavezetők:</strong> ${
                            (dolgozat.temavezeto || []).map(t => `${t.nev} (${t.neptun})`).join(', ') || '—'
                        }</p>
                    </div>
                </td>
            `;

            dolgozatTbody.appendChild(tr);
            dolgozatTbody.appendChild(detailTr);
        });

        frissitPaginacio(filteredDolgozatok.length);
    }

    // Új dolgozat hozzáadása
    if (dolgozatForm) {
        dolgozatForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (dolgozatJelentkezesLejart) {
                showToast('A dolgozat jelentkezési határideje lejárt, új dolgozat már nem adható hozzá.', 'error');
                return;
            }

            if (!loggedInUser || !loggedInUser.neptun) {
                showToast('Nem sikerült azonosítani a bejelentkezett hallgatót. Jelentkezz be újra!', 'error');
                return;
            }

            const selectedTemavezetok = Array
                .from(document.querySelectorAll('#temavezeto-lista input[type="checkbox"]:checked'))
                .map(cb => cb.value);

            if (selectedTemavezetok.length === 0) {
                showToast('Válassz legalább egy témavezetőt!', 'error');
                return;
            }

            const cim = document.getElementById('dolgozat-cim').value.trim();
            const leiras = document.getElementById('dolgozat-leiras').value.trim();

            if (!cim || !leiras) {
                showToast('Kérlek, töltsd ki a címet és az összefoglalót!', 'error');
                return;
            }

            const formData = {
                cím: cim,
                leiras,
                hallgato_ids: [loggedInUser.neptun],
                temavezeto_ids: selectedTemavezetok,
                kar: loggedInUser.kar || ''
            };

            try {
                const response = await fetch('/api/dolgozatok', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    const ujDolgozat = await response.json();
                    console.log('Sikeres POST:', ujDolgozat);

                    await listazDolgozatok();

                    dolgozatForm.reset();
                    document.getElementById('uj-dolgozat-form').style.display = 'none';
                    document.getElementById('homalyositas').style.display = 'none';

                    showToast('Dolgozat sikeresen hozzáadva.', 'success');
                } else {
                    console.error('Hiba történt a dolgozat hozzáadása során');
                    showToast('Hiba történt a dolgozat hozzáadása során.', 'error');
                }
            } catch (error) {
                console.error('Hiba történt a dolgozat mentése során:', error);
                showToast('Szerverhiba a dolgozat mentése során.', 'error');
            }
        });
    }

    // Dolgozat szerkesztése
    window.editDolgozat = async function (id) {
        aktualisModositandoId = id;
        const dolgozat = dolgozatok.find(d => d._id === id);
        if (!dolgozat) {
            console.error('Nem találom a dolgozatot:', id);
            return;
        }

        document.getElementById('modosit-dolgozat-cim').value = dolgozat.cim || dolgozat.cím || '';
        document.getElementById('modosit-dolgozat-leiras').value = dolgozat.leiras || '';

        const response = await fetch('/api/felhasznalok');
        const felhasznalok = await response.json();
        const hallgatok = felhasznalok.filter(f => (f.csoportok || []).includes('hallgato'));
        const temavezetok = felhasznalok.filter(f => (f.csoportok || []).includes('temavezeto'));

        const dolgozatHallgatoNeptunok = (dolgozat.szerzok || [])
            .map(s => s.neptun)
            .filter(Boolean);

        const dolgozatTemavezetoNeptunok = (dolgozat.temavezeto || [])
            .map(t => t.neptun)
            .filter(Boolean);

        const hallgatoLista = document.getElementById('modosit-hallgato-lista');
        hallgatoLista.innerHTML = hallgatok.map(h => `
            <label>
                <span>${h.nev} (${h.neptun})</span>
                <input 
                    type="checkbox" 
                    value="${h.neptun}"
                    ${dolgozatHallgatoNeptunok.includes(h.neptun) ? 'checked' : ''}
                >
            </label>
        `).join('');

        const temavezetoLista = document.getElementById('modosit-temavezeto-lista');
        temavezetoLista.innerHTML = temavezetok.map(t => `
            <label>
                <span>${t.nev} (${t.neptun})</span>
                <input 
                    type="checkbox" 
                    value="${t.neptun}"
                    ${dolgozatTemavezetoNeptunok.includes(t.neptun) ? 'checked' : ''}
                >
            </label>
        `).join('');

        const modHallKivonat = document.getElementById('modosit-hallgato-kivonat');
        if (modHallKivonat) {
            if (dolgozatHallgatoNeptunok.length === 0) {
                modHallKivonat.textContent = 'Nincs kiválasztott hallgató.';
            } else {
                const hallgatoNevek = hallgatok
                    .filter(h => dolgozatHallgatoNeptunok.includes(h.neptun))
                    .map(h => `${h.nev} (${h.neptun})`);
                modHallKivonat.textContent = hallgatoNevek.join(', ');
            }
        }

        const modTemKivonat = document.getElementById('modosit-temavezeto-kivonat');
        if (modTemKivonat) {
            if (dolgozatTemavezetoNeptunok.length === 0) {
                modTemKivonat.textContent = 'Nincs kiválasztott témavezető.';
            } else {
                const temavezetoNevek = temavezetok
                    .filter(t => dolgozatTemavezetoNeptunok.includes(t.neptun))
                    .map(t => `${t.nev} (${t.neptun})`);
                modTemKivonat.textContent = temavezetoNevek.join(', ');
            }
        }

        document.getElementById('modosit-dolgozat-form').style.display = 'block';
        document.getElementById('homalyositas').style.display = 'block';
    };

    // Dolgozat mentése szerkesztés után
    document.getElementById('modosit-megse-gomb').addEventListener('click', () => {
        document.getElementById('modosit-dolgozat-form').style.display = 'none';
        document.getElementById('homalyositas').style.display = 'none';
    });

    document.getElementById('modosit-mentes-gomb').addEventListener('click', async () => {
        const cim = document.getElementById('modosit-dolgozat-cim').value;
        const leiras = document.getElementById('modosit-dolgozat-leiras').value;
        const hallgato_ids = Array.from(document.querySelectorAll('#modosit-hallgato-lista input[type="checkbox"]:checked')).map(cb => cb.value);
        const temavezeto_ids = Array.from(document.querySelectorAll('#modosit-temavezeto-lista input[type="checkbox"]:checked')).map(cb => cb.value);

        if (!cim || !leiras || !hallgato_ids.length || !temavezeto_ids.length) {
            showToast('Minden mező kitöltése kötelező!', 'error');
            return;
        }

        const formData = {
            cím: cim,
            leiras: leiras,
            hallgato_ids,
            temavezeto_ids,
        };

        try {
            const response = await fetch(`/api/dolgozatok/${aktualisModositandoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                document.getElementById('modosit-dolgozat-form').style.display = 'none';
                document.getElementById('homalyositas').style.display = 'none';
                await listazDolgozatok();
                showToast('Dolgozat sikeresen módosítva.', 'success');
            } else {
                console.error('Hiba történt a mentésnél.');
                showToast('Hiba történt a dolgozat módosítása során.', 'error');
            }
        } catch (err) {
            console.error('Mentési hiba:', err);
            showToast('Szerverhiba a dolgozat mentése során.', 'error');
        }
    });

    // ─────────────────────────────
    // SZÉP MODALOS TÖRLÉS-MEGERŐSÍTÉS
    // ─────────────────────────────
    function confirmDialog(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const msgEl = document.getElementById('confirm-message');
            const okBtn = document.getElementById('confirm-ok-btn');
            const cancelBtn = document.getElementById('confirm-cancel-btn');
            const homaly = document.getElementById('homalyositas');

            // ha valami hiányzik, fallback a sima confirmre
            if (!modal || !msgEl || !okBtn || !cancelBtn) {
                const res = window.confirm(message || 'Biztosan törölni szeretnéd?');
                resolve(res);
                return;
            }

            msgEl.textContent = message || 'Biztosan törölni szeretnéd?';

            modal.style.display = 'block';
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

    // Dolgozat törlése
    window.deleteDolgozat = async function (id) {
        const confirmed = await confirmDialog('Biztosan törölni szeretnéd ezt a dolgozatot?');
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/dolgozatok/${id}`, { method: 'DELETE' });
            if (response.ok) {
                dolgozatok = dolgozatok.filter(d => d._id !== id);
                megjelenitDolgozatok();
                showToast('Dolgozat sikeresen törölve.', 'success');
            } else {
                console.error('Hiba történt a dolgozat törlése során');
                showToast('Hiba történt a dolgozat törlése során.', 'error');
            }
        } catch (error) {
            console.error('Hiba történt a törlés során:', error);
            showToast('Szerverhiba a dolgozat törlése során.', 'error');
        }
    };

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

    // Kereső megjelenítése/elrejtése
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

    // Keresés
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        megjelenitDolgozatok();
    });

    const ujDolgozatGomb = document.getElementById('uj-dolgozat-gomb');
    const ujDolgozatForm = document.getElementById('uj-dolgozat-form');
    const homalyositas = document.getElementById('homalyositas');
    const megseGomb = document.getElementById('megse-gomb');

    ujDolgozatGomb.addEventListener('click', () => {
        if (dolgozatJelentkezesLejart) {
            showToast('A dolgozat jelentkezési határideje lejárt, új dolgozat már nem hozható létre.', 'error');
            return;
        }
        ujDolgozatForm.style.display = 'block';
        homalyositas.style.display = 'block';
    });

    megseGomb.addEventListener('click', () => {
        ujDolgozatForm.style.display = 'none';
        homalyositas.style.display = 'none';
    });

    async function betoltAktualisFelhasznalo() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.warn('Nincs token, nem tudom betölteni a bejelentkezett felhasználót.');
            return;
        }

        try {
            const res = await fetch('/api/felhasznalok/jelenlegi', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                console.error('Nem sikerült betölteni a bejelentkezett felhasználót.');
                return;
            }

            loggedInUser = await res.json();

            const nevSpan = document.getElementById('aktualis-hallgato-nev');
            if (nevSpan && loggedInUser.nev) {
                const neptun = loggedInUser.neptun || 'nincs Neptun-kód';
                nevSpan.textContent = `${loggedInUser.nev} (${neptun})`;
            }
        } catch (err) {
            console.error('Hiba az aktuális felhasználó lekérésekor:', err);
        }
    }

    // Indításkor: bejelentkezett felhasználó, dolgozatok, témavezetők
    betoltAktualisFelhasznalo();
    listazDolgozatok();
    betoltFelhasznalok();
    betoltDolgozatJelentkezesHatarido();
});

// Lebegő menü dropdownok kezelése
document.querySelectorAll('.dropdown-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const dropdown = this.parentElement;
        dropdown.classList.toggle('active');
    });
});

document.querySelectorAll('.user-dropdown .dropdown-content').forEach(content => {
    content.addEventListener('click', function (e) {
        e.stopPropagation();
    });
});

document.addEventListener('keydown', function (e) {
    if (e.key === "Escape") {
        document.querySelectorAll('.user-dropdown').forEach(drop => drop.classList.remove('active'));
    }
});

document.addEventListener('click', () => {
    document.querySelectorAll('.user-dropdown').forEach(drop => drop.classList.remove('active'));
});

window.toggleDetails = function (dolgozatId) {
    const detailRow = document.getElementById(`details-${dolgozatId}`);
    const icon = document.getElementById(`toggle-icon-${dolgozatId}`);

    if (!detailRow) return;
    const isVisible = detailRow.style.display === 'table-row';
    detailRow.style.display = isVisible ? 'none' : 'table-row';
    if (icon) icon.textContent = isVisible ? '▼' : '▲';
};

// ─────────────────────────────
// TÉMAVEZETŐ MODAL LOGIKA
// ─────────────────────────────
const temavezetoModal = document.getElementById('temavezeto-modal');
const temavezetoOpenBtn = document.getElementById('temavezeto-open-modal');
const temavezetoMentesBtn = document.getElementById('temavezeto-mentes-gomb');
const temavezetoMegseBtn = document.getElementById('temavezeto-megse-gomb');
const temavezetoKivonat = document.getElementById('temavezeto-kivonat');

if (temavezetoOpenBtn && temavezetoModal) {
    temavezetoOpenBtn.addEventListener('click', () => {
        temavezetoModal.style.display = 'block';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'block';
    });
}

if (temavezetoMegseBtn && temavezetoModal) {
    temavezetoMegseBtn.addEventListener('click', () => {
        temavezetoModal.style.display = 'none';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'none';
    });
}

if (temavezetoMentesBtn && temavezetoModal) {
    temavezetoMentesBtn.addEventListener('click', () => {
        const selected = Array.from(
            document.querySelectorAll('#temavezeto-lista input[type="checkbox"]:checked')
        );

        if (selected.length === 0) {
            temavezetoKivonat.textContent = 'Nincs kiválasztott témavezető.';
        } else {
            const nevek = selected.map(cb => cb.parentElement.textContent.trim());
            temavezetoKivonat.textContent = nevek.join(', ');
        }

        temavezetoModal.style.display = 'none';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'none';
    });
}

// ─────────────────────────────
// MÓDOSÍTÁS: HALLGATÓ MODAL
// ─────────────────────────────
const modHallModal = document.getElementById('modosit-hallgato-modal');
const modHallOpenBtn = document.getElementById('modosit-hallgato-open-modal');
const modHallMentesBtn = document.getElementById('modosit-hallgato-mentes-gomb');
const modHallMegseBtn = document.getElementById('modosit-hallgato-megse-gomb');
const modHallKivonat = document.getElementById('modosit-hallgato-kivonat');
const modHallKereso = document.getElementById('modosit-hallgato-kereso');

if (modHallOpenBtn && modHallModal) {
    modHallOpenBtn.addEventListener('click', () => {
        modHallModal.style.display = 'block';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'block';
    });
}

if (modHallMegseBtn && modHallModal) {
    modHallMegseBtn.addEventListener('click', () => {
        modHallModal.style.display = 'none';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'none';
    });
}

if (modHallMentesBtn && modHallModal) {
    modHallMentesBtn.addEventListener('click', () => {
        const selected = Array.from(
            document.querySelectorAll('#modosit-hallgato-lista input[type="checkbox"]:checked')
        );

        if (!modHallKivonat) return;

        if (selected.length === 0) {
            modHallKivonat.textContent = 'Nincs kiválasztott hallgató.';
        } else {
            const nevek = selected.map(cb => cb.parentElement.textContent.trim());
            modHallKivonat.textContent = nevek.join(', ');
        }

        modHallModal.style.display = 'none';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'none';
    });
}

if (modHallKereso) {
    modHallKereso.addEventListener('input', function () {
        const keres = this.value.toLowerCase();
        document.querySelectorAll('#modosit-hallgato-lista label').forEach(label => {
            label.style.display = label.textContent.toLowerCase().includes(keres) ? '' : 'none';
        });
    });
}

// ─────────────────────────────
// MÓDOSÍTÁS: TÉMAVEZETŐ MODAL
// ─────────────────────────────
const modTemModal = document.getElementById('modosit-temavezeto-modal');
const modTemOpenBtn = document.getElementById('modosit-temavezeto-open-modal');
const modTemMentesBtn = document.getElementById('modosit-temavezeto-mentes-gomb');
const modTemMegseBtn = document.getElementById('modosit-temavezeto-megse-gomb');
const modTemKivonat = document.getElementById('modosit-temavezeto-kivonat');
const modTemKereso = document.getElementById('modosit-temavezeto-kereso');

if (modTemOpenBtn && modTemModal) {
    modTemOpenBtn.addEventListener('click', () => {
        modTemModal.style.display = 'block';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'block';
    });
}

if (modTemMegseBtn && modTemModal) {
    modTemMegseBtn.addEventListener('click', () => {
        modTemModal.style.display = 'none';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'none';
    });
}

if (modTemMentesBtn && modTemModal) {
    modTemMentesBtn.addEventListener('click', () => {
        const selected = Array.from(
            document.querySelectorAll('#modosit-temavezeto-lista input[type="checkbox"]:checked')
        );

        if (!modTemKivonat) return;

        if (selected.length === 0) {
            modTemKivonat.textContent = 'Nincs kiválasztott témavezető.';
        } else {
            const nevek = selected.map(cb => cb.parentElement.textContent.trim());
            modTemKivonat.textContent = nevek.join(', ');
        }

        modTemModal.style.display = 'none';
        const homaly = document.getElementById('homalyositas');
        if (homaly) homaly.style.display = 'none';
    });
}

if (modTemKereso) {
    modTemKereso.addEventListener('input', function () {
        const keres = this.value.toLowerCase();
        document.querySelectorAll('#modosit-temavezeto-lista label').forEach(label => {
            label.style.display = label.textContent.toLowerCase().includes(keres) ? '' : 'none';
        });
    });
}

// 🔔 Egységes toast értesítés (sections.js-ből átvéve)
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
