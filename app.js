document.addEventListener('DOMContentLoaded', function () {
    const dolgozatForm = document.getElementById('dolgozat-form');
    const dolgozatTbody = document.getElementById('dolgozat-tbody');
    const searchInput = document.getElementById('dolgozat-search-input');
    const paginationContainer = document.getElementById('dolgozat-pagination');
    let dolgozatok = [];
    let currentPage = 1;
    const itemsPerPage = 10;

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
            dolgozat.hallgato_id.toLowerCase().includes(searchInput.value.toLowerCase()) ||
            dolgozat.temavezeto_id.toLowerCase().includes(searchInput.value.toLowerCase()) ||
            dolgozat.allapot.toLowerCase().includes(searchInput.value.toLowerCase())
        );

        const start = (currentPage - 1) * itemsPerPage;
        const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);
        
        dolgozatTbody.innerHTML = '';
        paginatedDolgozatok.forEach(dolgozat => {
            const tr = document.createElement('tr');
            tr.dataset.id = dolgozat._id;
            tr.innerHTML = `
                <td>${dolgozat.cím || 'N/A'}</td>
                <td>${dolgozat.hallgato_id || 'N/A'}</td>
                <td>${dolgozat.temavezeto_id || 'N/A'}</td>
                <td>${dolgozat.allapot || 'N/A'}</td>
                <td>
                    <button onclick="editDolgozat('${dolgozat._id}')">Módosítás</button>
                    <button onclick="deleteDolgozat('${dolgozat._id}')">Törlés</button>
                </td>
            `;
            dolgozatTbody.appendChild(tr);
        });

        frissitPaginacio(filteredDolgozatok.length);
    }

    // Új dolgozat hozzáadása
    if (dolgozatForm) {
        dolgozatForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = {
                cím: document.getElementById('dolgozat-cim').value,
                hallgato_id: document.getElementById('dolgozat-hallgato-id').value,
                temavezeto_id: document.getElementById('dolgozat-temavezeto-id').value,
                allapot: "benyújtva"
            };

            if (!formData.cím || !formData.hallgato_id || !formData.temavezeto_id) {
                alert('Kérlek, töltsd ki az összes mezőt!');
                return;
            }

            try {
                const response = await fetch('/api/dolgozatok/feltoltes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    const ujDolgozat = await response.json();
                    dolgozatok.push(ujDolgozat); // Hozzáadjuk az új dolgozatot a listához
                    megjelenitDolgozatok(); // Frissítjük a megjelenítést
                    dolgozatForm.reset();
                } else {
                    console.error('Hiba történt a dolgozat hozzáadása során');
                }
            } catch (error) {
                console.error('Hiba történt a dolgozat mentése során:', error);
            }
        });
    }

    // Dolgozat szerkesztése
    window.editDolgozat = function (id) {
        const dolgozat = dolgozatok.find(d => d._id === id);
        const tr = document.querySelector(`tr[data-id="${id}"]`);
        
        if (tr) {
            const cells = tr.querySelectorAll('td');
            cells[0].innerHTML = `<input type="text" value="${dolgozat.cím}">`;
            cells[1].innerHTML = `<input type="text" value="${dolgozat.hallgato_id}">`;
            cells[2].innerHTML = `<input type="text" value="${dolgozat.temavezeto_id}">`;
            cells[3].innerHTML = `
                <select id="allapot-${id}">
                    <option value="benyújtva" ${dolgozat.allapot === 'benyújtva' ? 'selected' : ''}>Benyújtva</option>
                    <option value="bírálás alatt" ${dolgozat.allapot === 'bírálás alatt' ? 'selected' : ''}>Bírálás alatt</option>
                    <option value="elfogadva" ${dolgozat.allapot === 'elfogadva' ? 'selected' : ''}>Elfogadva</option>
                    <option value="elutasítva" ${dolgozat.allapot === 'elutasítva' ? 'selected' : ''}>Elutasítva</option>
                </select>
            `;

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Mentés';
            saveBtn.addEventListener('click', async () => saveDolgozat(id, cells));
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Mégse';
            cancelBtn.addEventListener('click', megjelenitDolgozatok);

            cells[4].innerHTML = '';
            cells[4].appendChild(saveBtn);
            cells[4].appendChild(cancelBtn);
        }
    }

    // Dolgozat mentése szerkesztés után
    async function saveDolgozat(id, cells) {
        const updatedDolgozat = {
            cím: cells[0].querySelector('input').value,
            hallgato_id: cells[1].querySelector('input').value,
            temavezeto_id: cells[2].querySelector('input').value,
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

    // Keresés
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        megjelenitDolgozatok();
    });

    // Indításkor dolgozatok betöltése
    listazDolgozatok();
});

