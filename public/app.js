document.addEventListener('DOMContentLoaded', function () {
    const dolgozatForm = document.getElementById('uj-dolgozat-form');
    const dolgozatTbody = document.getElementById('dolgozat-tbody');
    const searchInput = document.getElementById('dolgozat-search-input');
    const paginationContainer = document.getElementById('dolgozat-pagination');
    const hallgatoSelect = document.getElementById('dolgozat-hallgato-id');
    const temavezetoSelect = document.getElementById('dolgozat-temavezeto-id');
    let dolgozatok = [];
    let currentPage = 1;
    const itemsPerPage = 10;

    // Felhasználók betöltése csoportok szerint
    async function betoltFelhasznalok() {
        try {
            const response = await fetch('/api/felhasznalok/csoportok');
            const { hallgatok, temavezetok } = await response.json();
            
            // Hallgatók betöltése a legördülő menübe
        const hallgatoLista = document.getElementById('hallgato-lista');
        hallgatoLista.innerHTML = hallgatok.map(hallgato => `
            <label>
                <input type="checkbox" value="${hallgato.neptun}"> ${hallgato.nev} (${hallgato.neptun})
            </label>
        `).join('');


            const temavezetoLista = document.getElementById('temavezeto-lista'); // Hozz létre egy ilyen divet a HTML-ben
temavezetoLista.innerHTML = temavezetok.map(temavezeto => `
    <label class="csoport-label">
        <input type="radio" name="temavezeto" value="${temavezeto.neptun}"> ${temavezeto.nev} (${temavezeto.neptun})
    </label>
`).join('');

        } catch (error) {
            console.error('Hiba történt a felhasználók betöltése során:', error);
        }
    }

    // Dolgozatok lekérdezése
    async function listazDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok');
            dolgozatok = await response.json();
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba történt a dolgozatok listázása során:', err);
        }
    }

// Dolgozatok megjelenítése
function megjelenitDolgozatok() {
    const filteredDolgozatok = dolgozatok.filter(dolgozat => 
        dolgozat.cím.toLowerCase().includes(searchInput.value.toLowerCase()) ||
        (Array.isArray(dolgozat.hallgato_ids) && dolgozat.hallgato_ids.some(id => id.toLowerCase().includes(searchInput.value.toLowerCase()))) ||
        dolgozat.temavezeto_id.toLowerCase().includes(searchInput.value.toLowerCase()) ||
        dolgozat.allapot.toLowerCase().includes(searchInput.value.toLowerCase())
    );
    
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);
    
    dolgozatTbody.innerHTML = '';
    paginatedDolgozatok.forEach(dolgozat => {
        const roviditettCim = dolgozat.cím.length > 40 ? dolgozat.cím.substring(0, 40) + '...' : dolgozat.cím;
        
        const tr = document.createElement('tr');
        tr.dataset.id = dolgozat._id;
        tr.innerHTML = `
    <td class="clickable-title" onclick="toggleDetails('${dolgozat._id}')">${roviditettCim}</td>
    <td>${dolgozat.allapot || 'N/A'}</td>
    <td>
        <button onclick="editDolgozat('${dolgozat._id}')">Módosítás</button>
        <button onclick="deleteDolgozat('${dolgozat._id}')">Törlés</button>
    </td>
`;

const detailTr = document.createElement('tr');
detailTr.classList.add('dolgozat-details-row');
detailTr.id = `details-${dolgozat._id}`;
detailTr.innerHTML = `
    <td colspan="3">
        <div class="dolgozat-details-panel" id="panel-${dolgozat._id}">
            <p><strong>Leírás:</strong> ${dolgozat.leiras || '—'}</p>
            <p><strong>Hallgató(k):</strong> ${dolgozat.hallgato_ids ? dolgozat.hallgato_ids.join(', ') : '—'}</p>
            <p><strong>Témavezető:</strong> ${dolgozat.temavezeto_id || '—'}</p>
        </div>
    </td>
`;

dolgozatTbody.appendChild(tr);
dolgozatTbody.appendChild(detailTr);

        dolgozatTbody.appendChild(tr);
    });

    frissitPaginacio(filteredDolgozatok.length);
}


    // Új dolgozat hozzáadása
if (dolgozatForm) {
    dolgozatForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const selectedHallgatok = Array.from(document.querySelectorAll('#hallgato-lista input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);

        if (selectedHallgatok.length === 0) {
            alert('Válassz legalább egy hallgatót!');
            return;
        }

        const selectedTemavezeto = document.querySelector('#temavezeto-lista input[name="temavezeto"]:checked');
        if (!selectedTemavezeto) {
            alert('Válassz témavezetőt!');
            return;
        }

        const formData = {
            cím: document.getElementById('dolgozat-cim').value,
            hallgato_ids: selectedHallgatok,
            temavezeto_id: selectedTemavezeto.value,
            allapot: "benyújtva"
        };

        if (!formData.cím || !formData.temavezeto_id || formData.hallgato_ids.length === 0) {
            alert('Kérlek, töltsd ki az összes mezőt!');
            return;
        }

        try {
            const response = await fetch('/api/dolgozatok', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const ujDolgozat = await response.json();
                console.log('Sikeres POST:', ujDolgozat);
                dolgozatok.push(ujDolgozat);
                megjelenitDolgozatok();
                dolgozatForm.reset();
                document.getElementById('uj-dolgozat-form').style.display = 'none';
                document.getElementById('homalyositas').style.display = 'none';
            } else {
                console.error('Hiba történt a dolgozat hozzáadása során');
            }
        } catch (error) {
            console.error('Hiba történt a dolgozat mentése során:', error);
        }
    });
}



    // Dolgozat szerkesztése
window.editDolgozat = async function (id) {
    const dolgozat = dolgozatok.find(d => d._id === id);
    const tr = document.querySelector(`tr[data-id="${id}"]`);

    if (tr) {
        const cells = tr.querySelectorAll('td');

        // 🔥 Felhasználók betöltése módosításkor
        const response = await fetch('/api/felhasznalok');
        const felhasznalok = await response.json();

        const hallgatok = felhasznalok.filter(f => f.csoportok.includes('hallgato'));
        const temavezetok = felhasznalok.filter(f => f.csoportok.includes('temavezeto'));

        // Hallgatók dropdown
        const hallgatoSelect = `
            <select id="edit-hallgato-${id}">
                ${hallgatok.map(h => `<option value="${h.neptun}" ${dolgozat.hallgato_id === h.neptun ? 'selected' : ''}>${h.nev} (${h.neptun})</option>`).join('')}
            </select>
        `;

        // Témavezetők dropdown
        const temaSelect = `
            <select id="edit-temavezeto-${id}">
                ${temavezetok.map(t => `<option value="${t.neptun}" ${dolgozat.temavezeto_id === t.neptun ? 'selected' : ''}>${t.nev} (${t.neptun})</option>`).join('')}
            </select>
        `;

        // Táblázatba berakjuk a szerkeszthető elemeket
        cells[0].innerHTML = `<input type="text" value="${dolgozat.cím}">`;
        cells[1].innerHTML = hallgatoSelect;
        cells[2].innerHTML = temaSelect;
        cells[3].innerHTML = `
            <select id="allapot-${id}">
                <option value="benyújtva" ${dolgozat.allapot === 'benyújtva' ? 'selected' : ''}>Benyújtva</option>
                <option value="bírálás alatt" ${dolgozat.allapot === 'bírálás alatt' ? 'selected' : ''}>Bírálás alatt</option>
                <option value="elfogadva" ${dolgozat.allapot === 'elfogadva' ? 'selected' : ''}>Elfogadva</option>
                <option value="elutasítva" ${dolgozat.allapot === 'elutasítva' ? 'selected' : ''}>Elutasítva</option>
            </select>
        `;

        // Mentés és Mégse gomb
        // Mentés és Mégse gombok
const saveBtn = document.createElement('button');
saveBtn.textContent = 'Mentés';
saveBtn.addEventListener('click', async () => saveDolgozat(id, cells));

const cancelBtn = document.createElement('button');
cancelBtn.textContent = 'Mégse';
cancelBtn.addEventListener('click', megjelenitDolgozatok);


cells[5].innerHTML = '';
cells[5].appendChild(saveBtn);
cells[5].appendChild(cancelBtn);

    }
};


    // Dolgozat mentése szerkesztés után
async function saveDolgozat(id, cells) {
    const updatedDolgozat = {
        cím: cells[0].querySelector('input').value,
        hallgato_id: cells[1].querySelector('select').value,
        temavezeto_id: cells[2].querySelector('select').value,
        allapot: document.getElementById(`allapot-${id}`).value,
    };

    try {
        const response = await fetch(`/api/dolgozatok/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedDolgozat)
        });

        if (response.ok) {
            const updatedDolgozatResponse = await response.json();
            const dolgozatIndex = dolgozatok.findIndex(d => d._id === id);
            dolgozatok[dolgozatIndex] = updatedDolgozatResponse;
            megjelenitDolgozatok();
        } else {
            console.error('Hiba történt a dolgozat módosítása során');
        }
    } catch (error) {
        console.error('Hiba történt a dolgozat mentése során:', error);
    }
}


    // Dolgozat törlése
    window.deleteDolgozat = async function (id) {
        if (confirm("Biztosan törölni szeretnéd ezt a dolgozatot?")) {
            try {
                const response = await fetch(`/api/dolgozatok/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    dolgozatok = dolgozatok.filter(d => d._id !== id);
                    megjelenitDolgozatok();
                } else {
                    console.error('Hiba történt a dolgozat törlése során');
                }
            } catch (error) {
                console.error('Hiba történt a törlés során:', error);
            }
        }
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

    // Kereső megjelenítése/elrejtése
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
   searchInput.addEventListener('input', () => {
    currentPage = 1;
    megjelenitDolgozatok();
});

    
    const ujDolgozatGomb = document.getElementById('uj-dolgozat-gomb');
const ujDolgozatForm = document.getElementById('uj-dolgozat-form');
const homalyositas = document.getElementById('homalyositas');
const megseGomb = document.getElementById('megse-gomb');

ujDolgozatGomb.addEventListener('click', () => {
    ujDolgozatForm.style.display = 'block';
    homalyositas.style.display = 'block';
});

megseGomb.addEventListener('click', () => {
    ujDolgozatForm.style.display = 'none';
    homalyositas.style.display = 'none';
});


    // Indításkor dolgozatok betöltése és felhasználók betöltése csoport szerint
    listazDolgozatok();
    betoltFelhasznalok();
});

// Lebegő menü dropdownok kezeléséhez
document.querySelectorAll('.dropdown-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
        e.stopPropagation();  // Ne záródjon be
        const dropdown = this.parentElement;
        dropdown.classList.toggle('active');
    });
});

// Ne zárja be a menüt, ha a felhasználó a checkboxra vagy radiogombra kattint
document.querySelectorAll('.user-dropdown .dropdown-content').forEach(content => {
    content.addEventListener('click', function (e) {
        e.stopPropagation(); // Ne terjedjen fel
    });
});

// Ha ESC-et nyom a felhasználó, bezárja az összeset (opcionális)
document.addEventListener('keydown', function (e) {
    if (e.key === "Escape") {
        document.querySelectorAll('.user-dropdown').forEach(drop => drop.classList.remove('active'));
    }
});


// Ha a felhasználó máshova kattint, zárjuk be a dropdownokat
document.addEventListener('click', () => {
    document.querySelectorAll('.user-dropdown').forEach(drop => drop.classList.remove('active'));
});

window.toggleDetails = function (dolgozatId) {
    const panel = document.getElementById(`panel-${dolgozatId}`);
    if (panel) {
        panel.classList.toggle('open');
    }
};



