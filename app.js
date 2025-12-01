document.addEventListener('DOMContentLoaded', function () {
    const dolgozatForm = document.getElementById('dolgozat-form');
    const dolgozatTbody = document.getElementById('dolgozat-tbody');

    // Új dolgozat hozzáadása
    if (dolgozatForm) {
        dolgozatForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = {
                cím: document.getElementById('dolgozat-cim').value,
                hallgato_id: document.getElementById('dolgozat-hallgato-id').value,
                temavezeto_id: document.getElementById('dolgozat-temavezeto-id').value,
                allapot: document.getElementById('dolgozat-allapot').value
            };

            const response = await fetch('/api/dolgozatok/feltoltes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const dolgozat = await response.json();
                addDolgozatToTable(dolgozat);
                dolgozatForm.reset();
            } else {
                console.error('Hiba történt a dolgozat hozzáadása során');
            }
        });
    }

    // Dolgozatok listázása
    async function listazDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok');
            const dolgozatok = await response.json();

            dolgozatTbody.innerHTML = ''; // Ürítjük a táblázatot
            dolgozatok.forEach(dolgozat => {
                addDolgozatToTable(dolgozat);
            });
        } catch (err) {
            console.error('Hiba történt a dolgozatok listázása során:', err);
        }
    }

    // Dolgozat hozzáadása a táblázathoz
    function addDolgozatToTable(dolgozat) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dolgozat.cím || 'N/A'}</td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td>${dolgozat.allapot || 'N/A'}</td>
            <td>
                <button class="delete-btn" data-id="${dolgozat._id}">Törlés</button>
                <button class="edit-btn" data-id="${dolgozat._id}">Módosítás</button>
            </td>
        `;
        dolgozatTbody.appendChild(tr);

        // Törlés funkció
        const deleteBtn = tr.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async () => {
            const id = deleteBtn.getAttribute('data-id');
            const response = await fetch(`/api/dolgozatok/${id}`, { method: 'DELETE' });
            if (response.ok) {
                tr.remove(); // Sor eltávolítása a táblázatból
            } else {
                console.error('Hiba történt a dolgozat törlése során');
            }
        });

        // Módosítás funkció
        const editBtn = tr.querySelector('.edit-btn');
        editBtn.addEventListener('click', () => {
            editDolgozat(tr, dolgozat); // Módosítás kezdeményezése
        });
    }

    // Dolgozat módosítása
    function editDolgozat(tr, dolgozat) {
        const cells = tr.querySelectorAll('td');
        const originalData = { ...dolgozat }; // Az eredeti dolgozat adatok elmentése
        cells[0].innerHTML = `<input type="text" value="${dolgozat.cím}">`;
        cells[1].innerHTML = `<input type="text" value="${dolgozat.hallgato_id}">`;
        cells[2].innerHTML = `<input type="text" value="${dolgozat.temavezeto_id}">`;
        cells[3].innerHTML = `
            <select>
                <option value="benyújtva" ${dolgozat.allapot === 'benyújtva' ? 'selected' : ''}>Benyújtva</option>
                <option value="bírálás alatt" ${dolgozat.allapot === 'bírálás alatt' ? 'selected' : ''}>Bírálás alatt</option>
                <option value="elfogadva" ${dolgozat.allapot === 'elfogadva' ? 'selected' : ''}>Elfogadva</option>
            </select>
        `;

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Mentés';
        cells[4].innerHTML = ''; // Törlés és módosítás gomb eltávolítása
        cells[4].appendChild(saveBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Mégse';
        cells[4].appendChild(cancelBtn);

        saveBtn.addEventListener('click', async () => {
            const updatedDolgozat = {
                cím: cells[0].querySelector('input').value,
                hallgato_id: cells[1].querySelector('input').value,
                temavezeto_id: cells[2].querySelector('input').value,
                allapot: cells[3].querySelector('select').value
            };

            const response = await fetch(`/api/dolgozatok/${dolgozat._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedDolgozat)
            });

            if (response.ok) {
                // Frissített adatok visszaírása a táblázatba
                cells[0].textContent = updatedDolgozat.cím;
                cells[1].textContent = updatedDolgozat.hallgato_id;
                cells[2].textContent = updatedDolgozat.temavezeto_id;
                cells[3].textContent = updatedDolgozat.allapot;
                cells[4].innerHTML = `
                    <button class="delete-btn" data-id="${dolgozat._id}">Törlés</button>
                    <button class="edit-btn" data-id="${dolgozat._id}">Módosítás</button>
                `;

                // Újra hozzárendeljük az eseményeket
                tr.querySelector('.delete-btn').addEventListener('click', () => deleteDolgozat(tr, dolgozat._id));
                tr.querySelector('.edit-btn').addEventListener('click', () => editDolgozat(tr, updatedDolgozat));
            } else {
                console.error('Hiba történt a dolgozat módosítása során');
            }
        });

        cancelBtn.addEventListener('click', () => {
            // Ha a felhasználó megszakítja a szerkesztést, visszaállítjuk az eredeti adatokat
            cells[0].textContent = originalData.cím;
            cells[1].textContent = originalData.hallgato_id;
            cells[2].textContent = originalData.temavezeto_id;
            cells[3].textContent = originalData.allapot;
            cells[4].innerHTML = `
                <button class="delete-btn" data-id="${originalData._id}">Törlés</button>
                <button class="edit-btn" data-id="${originalData._id}">Módosítás</button>
            `;

            // Események újbóli hozzárendelése
            tr.querySelector('.delete-btn').addEventListener('click', () => deleteDolgozat(tr, originalData._id));
            tr.querySelector('.edit-btn').addEventListener('click', () => editDolgozat(tr, originalData));
        });
    }

    // Dolgozatok listázása indításkor
    listazDolgozatok();
});

