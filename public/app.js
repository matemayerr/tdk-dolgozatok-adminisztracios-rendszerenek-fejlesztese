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
async function megjelenitDolgozatok() {
    const filteredDolgozatok = dolgozatok.filter(dolgozat => 
        dolgozat.cím.toLowerCase().includes(searchInput.value.toLowerCase()) ||
        (Array.isArray(dolgozat.hallgato_ids) && dolgozat.hallgato_ids.some(id => id.toLowerCase().includes(searchInput.value.toLowerCase()))) ||
        dolgozat.temavezeto_id.toLowerCase().includes(searchInput.value.toLowerCase()) ||
        dolgozat.allapot.toLowerCase().includes(searchInput.value.toLowerCase())
    );

    // Felhasználók lekérése a nevekhez
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


    const start = (currentPage - 1) * itemsPerPage;
    const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);
    
    dolgozatTbody.innerHTML = '';
    paginatedDolgozatok.forEach(dolgozat => {
        const roviditettCim = dolgozat.cím
        
        /* .length > 110 ? dolgozat.cím.substring(0, 110) + '...' : dolgozat.cím; */
        
        const tr = document.createElement('tr');
        tr.dataset.id = dolgozat._id;
        tr.innerHTML = `
        <td class="clickable-title" onclick="toggleDetails('${dolgozat._id}')">
    <div class="cim-es-ikon">
        <span class="cim-szoveg" title="${dolgozat.cím}">${roviditettCim}</span>
        <span class="toggle-icon" id="toggle-icon-${dolgozat._id}">▼</span>
    </div>
</td>


</td>   
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
            <p class="dolgozat-leiras">
  <span class="leiras-cimke">Leírás:</span><br>
  <span class="leiras-szoveg">${dolgozat.leiras || '—'}</span>
</p>
            <p><strong>Hallgató(k):</strong> ${
    dolgozat.hallgato_ids
        ? dolgozat.hallgato_ids.map(id => `${felhasznalokNevek[id] || 'Ismeretlen'} (${id})`).join(', ')
        : '—'
}</p>
<p><strong>Témavezető:</strong> ${
    dolgozat.temavezeto_id
        ? `${felhasznalokNevek[dolgozat.temavezeto_id] || 'Ismeretlen'} (${dolgozat.temavezeto_id})`
        : '—'
}</p>

        </div>
    </td>
`;


dolgozatTbody.appendChild(tr);        // A dolgozat fő sora felül
dolgozatTbody.appendChild(detailTr);  // Először a részletek jönnek alulra

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
            leiras: document.getElementById('dolgozat-leiras').value,
            hallgato_ids: selectedHallgatok,
            temavezeto_id: selectedTemavezeto.value,
            allapot: "bírálás alatt"

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
        aktualisModositandoId = id;
        const dolgozat = dolgozatok.find(d => d._id === id);
    
        // Inputmezők feltöltése
        document.getElementById('modosit-dolgozat-cim').value = dolgozat.cím || '';
        document.getElementById('modosit-dolgozat-leiras').value = dolgozat.leiras || '';
        document.getElementById('modosit-allapot').value = dolgozat.allapot || 'benyújtva';
    
        // Felhasználók lekérése
        const response = await fetch('/api/felhasznalok');
        const felhasznalok = await response.json();
        const hallgatok = felhasznalok.filter(f => f.csoportok.includes('hallgato'));
        const temavezetok = felhasznalok.filter(f => f.csoportok.includes('temavezeto'));
    
        // Hallgatók
        const hallgatoLista = document.getElementById('modosit-hallgato-lista');
        hallgatoLista.innerHTML = hallgatok.map(h => `
            <label><input type="checkbox" value="${h.neptun}" ${dolgozat.hallgato_ids.includes(h.neptun) ? 'checked' : ''}> ${h.nev} (${h.neptun})</label>
        `).join('');
    
        // Témavezető
        const temavezetoLista = document.getElementById('modosit-temavezeto-lista');
        temavezetoLista.innerHTML = temavezetok.map(t => `
            <label><input type="radio" name="modosit-temavezeto" value="${t.neptun}" ${dolgozat.temavezeto_id === t.neptun ? 'checked' : ''}> ${t.nev} (${t.neptun})</label>
        `).join('');
    
        // Megjelenítés
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
        const allapot = document.getElementById('modosit-allapot').value;
        const hallgato_ids = Array.from(document.querySelectorAll('#modosit-hallgato-lista input[type="checkbox"]:checked')).map(cb => cb.value);
        const temavezetoInput = document.querySelector('input[name="modosit-temavezeto"]:checked');
    
        if (!cim || !leiras || !hallgato_ids.length || !temavezetoInput) {
            alert('Minden mező kitöltése kötelező!');
            return;
        }
    
        const formData = {
            cím: cim,
            leiras: leiras,
            hallgato_ids,
            temavezeto_id: temavezetoInput.value,
            allapot
        };
    
        try {
            const response = await fetch(`/api/dolgozatok/${aktualisModositandoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
    
            if (response.ok) {
                document.getElementById('modosit-dolgozat-modal').style.display = 'none';
                document.getElementById('modosit-homalyositas').style.display = 'none';
                listazDolgozatok(); // újralistázás
            } else {
                console.error('Hiba történt a mentésnél.');
            }
        } catch (err) {
            console.error('Mentési hiba:', err);
        }
    });
    

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
    const icon = document.getElementById(`toggle-icon-${dolgozatId}`);
    if (panel && icon) {
        const isOpen = panel.classList.toggle('open');
        icon.textContent = isOpen ? '▲' : '▼';
    }
};




