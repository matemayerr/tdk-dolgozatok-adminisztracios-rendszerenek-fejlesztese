document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('felhasznalo-form');
    const tbody = document.getElementById('felhasznalo-tbody');
    const searchInput = document.getElementById('search-input');
    const paginationDiv = document.getElementById('pagination');

    let felhasznalok = [];
    let filteredFelhasznalok = [];
    let currentPage = 1;
    const rowsPerPage = 10;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const nev = document.getElementById('felhasznalo-nev').value;
        const neptun = document.getElementById('felhasznalo-neptun').value;
        const email = document.getElementById('felhasznalo-email').value;
        const csoport = document.getElementById('felhasznalo-csoport').value;

        const response = await fetch('/api/felhasznalok', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nev, neptun, email, csoport })
        });

        if (response.ok) {
            const newFelhasznalo = await response.json();
            felhasznalok.push(newFelhasznalo);
            filteredFelhasznalok = [...felhasznalok];
            renderTable();
            form.reset();
        } else {
            console.error('Hiba történt a felhasználó hozzáadása során');
        }
    });

    async function loadFelhasznalok() {
        const response = await fetch('/api/felhasznalok');
        felhasznalok = await response.json();
        filteredFelhasznalok = [...felhasznalok];
        renderTable();
    }

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
                <td>${felhasznalo.csoport}</td>
                <td>
                    <button onclick="editFelhasznalo('${felhasznalo._id}')">Módosítás</button>
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

    window.editFelhasznalo = function(id) {
        const tr = document.querySelector(`tr[data-id='${id}']`);
        const felhasznalo = felhasznalok.find(f => f._id === id);

        tr.innerHTML = `
            <td><input type="text" value="${felhasznalo.nev}" id="edit-nev-${id}"></td>
            <td><input type="text" value="${felhasznalo.neptun}" id="edit-neptun-${id}"></td>
            <td><input type="email" value="${felhasznalo.email}" id="edit-email-${id}"></td>
            <td>
                <select id="edit-csoport-${id}">
                    <option value="hallgato" ${felhasznalo.csoport === 'hallgato' ? 'selected' : ''}>Hallgató</option>
                    <option value="temavezeto" ${felhasznalo.csoport === 'temavezeto' ? 'selected' : ''}>Témavezető</option>
                    <option value="biralo" ${felhasznalo.csoport === 'biralo' ? 'selected' : ''}>Bíráló</option>
                    <option value="zsuri" ${felhasznalo.csoport === 'zsuri' ? 'selected' : ''}>Zsűri</option>
                    <option value="rendszergazda" ${felhasznalo.csoport === 'rendszergazda' ? 'selected' : ''}>Rendszergazda</option>
                </select>
            </td>
            <td>
                <button onclick="saveFelhasznalo('${id}')">Mentés</button>
                <button onclick="renderTable()">Mégse</button>
            </td>
        `;
    };

    window.saveFelhasznalo = async function(id) {
        const updatedFelhasznalo = {
            nev: document.getElementById(`edit-nev-${id}`).value,
            neptun: document.getElementById(`edit-neptun-${id}`).value,
            email: document.getElementById(`edit-email-${id}`).value,
            csoport: document.getElementById(`edit-csoport-${id}`).value
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

    window.toggleSearch = function () {
        searchInput.style.display = searchInput.style.display === 'none' ? 'inline' : 'none';
        searchInput.value = '';
        filteredFelhasznalok = [...felhasznalok];
        renderTable();
    };

    window.searchFelhasznalok = function () {
        const query = searchInput.value.toLowerCase();
        filteredFelhasznalok = felhasznalok.filter(felhasznalo => {
            return (
                felhasznalo.nev.toLowerCase().includes(query) ||
                felhasznalo.neptun.toLowerCase().includes(query) ||
                felhasznalo.email.toLowerCase().includes(query) ||
                felhasznalo.csoport.toLowerCase().includes(query)
            );
        });
        currentPage = 1;
        renderTable();
    };

    loadFelhasznalok();
});

