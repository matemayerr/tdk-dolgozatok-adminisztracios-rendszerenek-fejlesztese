document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('felhasznalo-form');
    const tbody = document.getElementById('felhasznalo-tbody');
    const searchInput = document.getElementById('search-input');
    const paginationDiv = document.getElementById('pagination');

    let felhasznalok = [];
    let filteredFelhasznalok = [];
    let currentPage = 1;
    const rowsPerPage = 10;

    // 🔹 Új felhasználó hozzáadása több csoporttal
    form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nev = document.getElementById('felhasznalo-nev').value;
    const neptun = document.getElementById('felhasznalo-neptun').value;
    const email = document.getElementById('felhasznalo-email').value;
    const checkboxes = document.querySelectorAll('#felhasznalo-csoport input[type="checkbox"]:checked');
    const csoportok = Array.from(checkboxes).map(checkbox => checkbox.value);

    const response = await fetch('/api/felhasznalok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nev, neptun, email, csoportok })
    });

    if (response.ok) {
        const newFelhasznalo = await response.json();
        felhasznalok.push(newFelhasznalo);
        filteredFelhasznalok = [...felhasznalok];
        renderTable();
        form.reset();
    } else {
        try {
            const hibauzenet = await response.json();
            if (hibauzenet.error) {
                alert(`Hiba: ${hibauzenet.error}`);
            } else {
                alert('Ismeretlen hiba történt a felhasználó hozzáadása során.');
            }
        } catch (e) {
            alert('Hiba történt a válasz feldolgozása során.');
        }
    }
    
});

    // 🔹 Felhasználók betöltése
    async function loadFelhasznalok() {
        const response = await fetch('/api/felhasznalok');
        felhasznalok = await response.json();
        filteredFelhasznalok = [...felhasznalok];
        renderTable();
    }

    // 🔹 Táblázat frissítése
    function renderTable() {
        tbody.innerHTML = '';
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        const felhasznalokToDisplay = filteredFelhasznalok.slice(startIndex, endIndex);

        felhasznalokToDisplay.forEach(felhasznalo => {
            const tr = document.createElement('tr');
            tr.dataset.id = felhasznalo._id;

            tr.innerHTML = `
                <td>${felhasznalo.nev}</td>
                <td>${felhasznalo.neptun}</td>
                <td>${felhasznalo.email}</td>
                <td>${felhasznalo.csoportok.join(', ')}</td>
                <td>
                <button onclick="modositFelhasznalo('${felhasznalo._id}')">Módosítás</button>
                <button onclick="deleteFelhasznalo('${felhasznalo._id}')">Törlés</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        renderPagination();
    }

    function renderPagination() {
        paginationDiv.innerHTML = '';
        const pageCount = Math.ceil(filteredFelhasznalok.length / rowsPerPage);

        for (let i = 1; i <= pageCount; i++) {
            const pageButton = document.createElement('button');
            pageButton.textContent = i;
            pageButton.classList.add('page-btn');
            if (i === currentPage) pageButton.classList.add('active');
            pageButton.addEventListener('click', () => {
                currentPage = i;
                renderTable();
            });
            paginationDiv.appendChild(pageButton);
        }
    }

    // 🔹 Felhasználó törlése
    window.deleteFelhasznalo = async function(id) {
        const response = await fetch(`/api/felhasznalok/${id}`, { method: 'DELETE' });
        if (response.ok) {
            felhasznalok = felhasznalok.filter(felhasznalo => felhasznalo._id !== id);
            filteredFelhasznalok = filteredFelhasznalok.filter(felhasznalo => felhasznalo._id !== id);
            renderTable();
        } else {
            console.error('Hiba történt a felhasználó törlése során');
        }
    };

    // 🔹 Felhasználó szerkesztése több csoporttal
    window.editFelhasznalo = function(id) {
    const tr = document.querySelector(`tr[data-id='${id}']`);
    const felhasznalo = felhasznalok.find(f => f._id === id);

    // Biztosítjuk, hogy mindig tömbként kezeljük a csoportokat
    const csoportLista = ['hallgato', 'temavezeto', 'biralo', 'zsuri', 'rendszergazda'];
    const userCsoportok = Array.isArray(felhasznalo.csoportok) ? felhasznalo.csoportok : [];

    tr.innerHTML = `
        <td><input type="text" value="${felhasznalo.nev}" id="edit-nev-${id}"></td>
        <td><input type="text" value="${felhasznalo.neptun}" id="edit-neptun-${id}"></td>
        <td><input type="email" value="${felhasznalo.email}" id="edit-email-${id}"></td>
                <td>
        <div class="dropdown">
            <button class="dropbtn" onclick="toggleDropdown('edit-csoport-${id}')">Csoport kiválasztása ▼</button>
            <div id="edit-csoport-${id}" class="dropdown-content">
                ${csoportLista.map(role => `
                    <label class="csoport-label">
                        <input type="checkbox" value="${role}" ${userCsoportok.includes(role) ? 'checked' : ''}> ${role}
                    </label>
                `).join('')}
            </div>
        </div>
    </td>

        <td>
            <button onclick="saveFelhasznalo('${id}')">Mentés</button>
            <button onclick="renderTable()">Mégse</button>
        </td>
    `;
};

    // 🔹 Módosított felhasználó mentése
    window.saveFelhasznalo = async function(id) {
        const checkboxes = document.querySelectorAll(`#edit-csoport-${id} input[type="checkbox"]:checked`);
const csoportok = Array.from(checkboxes).map(checkbox => checkbox.value);


        const updatedFelhasznalo = {
            nev: document.getElementById(`edit-nev-${id}`).value,
            neptun: document.getElementById(`edit-neptun-${id}`).value,
            email: document.getElementById(`edit-email-${id}`).value,
            csoportok
        };

        const response = await fetch(`/api/felhasznalok/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedFelhasznalo)
        });

        if (response.ok) {
            const index = felhasznalok.findIndex(f => f._id === id);
            felhasznalok[index] = { ...updatedFelhasznalo, _id: id };
            filteredFelhasznalok = [...felhasznalok];
            renderTable();
        } else {
            console.error('Hiba történt a felhasználó módosítása során');
        }
    };
    
window.toggleDropdown = function(id) {
    const dropdown = document.getElementById(id);
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
};

// Bezárja a lenyíló menüt, ha máshova kattintasz
document.addEventListener('click', function(event) {
    const dropdowns = document.querySelectorAll('.user-dropdown .dropdown-content');
    dropdowns.forEach(dropdown => {
        if (!dropdown.parentElement.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });
});

// 🔸 Lebegő ablak vezérlése
const ujFelhasznaloGomb = document.getElementById('uj-felhasznalo-gomb');
const felhasznaloForm = document.getElementById('felhasznalo-form');
const felhasznaloMegse = document.getElementById('felhasznalo-megse-gomb');
const homalyLayer = document.getElementById('felhasznalo-homaly');

ujFelhasznaloGomb.addEventListener('click', () => {
    felhasznaloForm.style.display = 'block';
    homalyLayer.style.display = 'block';
});

felhasznaloMegse.addEventListener('click', () => {
    felhasznaloForm.style.display = 'none';
    homalyLayer.style.display = 'none';
});

// Legördülő menü aktiválása az új felhasználó űrlaphoz
const felhasznaloDropdownBtn = document.querySelector('#felhasznalo-form .dropdown-btn');
const felhasznaloDropdownContent = document.querySelector('#felhasznalo-form .dropdown-content');

felhasznaloDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Ne zárja be más esemény
    felhasznaloDropdownContent.style.display = 
        felhasznaloDropdownContent.style.display === 'block' ? 'none' : 'block';
});

// Ne zárja be, ha checkboxra kattintasz
felhasznaloDropdownContent.addEventListener('click', (e) => {
    e.stopPropagation();
});

// 🔸 Kereső mező megjelenítése/elrejtése
window.toggleSearch = function () {
    if (searchInput.style.display === 'none') {
        searchInput.style.display = 'block';
        searchInput.focus();
    } else {
        searchInput.style.display = 'none';
        searchInput.value = '';
        searchFelhasznalok();
    }
};

// felhasznalo modositasa
let modositandoFelhasznaloId = null;

window.modositFelhasznalo = function(id) {
    const felhasznalo = felhasznalok.find(f => f._id === id);
    if (!felhasznalo) return;

    modositandoFelhasznaloId = id;
    document.getElementById('modosit-nev').value = felhasznalo.nev;
    document.getElementById('modosit-neptun').value = felhasznalo.neptun;
    document.getElementById('modosit-email').value = felhasznalo.email;

    document.querySelectorAll('#modosit-csoport-lista input[type="checkbox"]')
    .forEach(checkbox => {
        checkbox.checked = felhasznalo.csoportok.includes(checkbox.value);
    });


    document.getElementById('modosit-felhasznalo-modal').style.display = 'block';
    document.getElementById('modosit-homalyositas').style.display = 'block';
};

document.getElementById('modosit-megse').addEventListener('click', () => {
    document.getElementById('modosit-felhasznalo-modal').style.display = 'none';
    document.getElementById('modosit-homalyositas').style.display = 'none';
});

document.getElementById('modosit-mentes').addEventListener('click', async () => {
    const updated = {
        nev: document.getElementById('modosit-nev').value,
        neptun: document.getElementById('modosit-neptun').value,
        email: document.getElementById('modosit-email').value,
        csoportok: Array.from(document.querySelectorAll('#modosit-csoport-lista input[type="checkbox"]:checked')
    ).map(cb => cb.value),
    };

    try {
        const res = await fetch(`/api/felhasznalok/${modositandoFelhasznaloId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });

        if (res.ok) {
            const updatedFelhasznalo = await res.json();
            const index = felhasznalok.findIndex(f => f._id === modositandoFelhasznaloId);
            felhasznalok[index] = updatedFelhasznalo;
            renderTable();
            document.getElementById('modosit-felhasznalo-modal').style.display = 'none';
            document.getElementById('modosit-homalyositas').style.display = 'none';
        } else {
            alert('Hiba a módosítás során');
        }
    } catch (err) {
        console.error('Szerverhiba a módosítás során:', err);
    }
});

// Lenyíló menü működése a módosítás modalban
const modositDropdownBtn = document.querySelector('#modosit-felhasznalo-modal .dropdown-btn');
const modositDropdownContent = document.querySelector('#modosit-felhasznalo-modal .dropdown-content');

modositDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    modositDropdownContent.style.display =
        modositDropdownContent.style.display === 'block' ? 'none' : 'block';
});

modositDropdownContent?.addEventListener('click', (e) => {
    e.stopPropagation();
});



    loadFelhasznalok();
});

