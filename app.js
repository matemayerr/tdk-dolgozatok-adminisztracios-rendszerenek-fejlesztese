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

            // Ellenőrizzük, hogy minden mező ki van-e töltve
            if (!formData.cím || !formData.hallgato_id || !formData.temavezeto_id || !formData.allapot) {
                alert('Kérlek, töltsd ki az összes mezőt!');
                return;
            }

            const response = await fetch('/api/dolgozatok/feltoltes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json' // JSON formátum
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const dolgozat = await response.json();
                addDolgozatToTable(dolgozat); // Táblázat frissítése
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
        tr.dataset.id = dolgozat._id; // Tároljuk a dolgozat azonosítóját

        tr.innerHTML = `
            <td>${dolgozat.cím || 'N/A'}</td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td>${dolgozat.allapot || 'N/A'}</td>
            <td>
                <button class="delete-btn">Törlés</button>
                <button class="edit-btn">Módosítás</button>
            </td>
        `;
        dolgozatTbody.appendChild(tr);

        // Események hozzárendelése
        attachEventHandlers(tr, dolgozat);
    }

    // Eseménykezelők hozzárendelése a sorhoz
    function attachEventHandlers(tr, dolgozat) {
        const deleteBtn = tr.querySelector('.delete-btn');
        const editBtn = tr.querySelector('.edit-btn');

        // Törlés funkció
        deleteBtn.addEventListener('click', async () => {
            const id = tr.dataset.id;
            const response = await fetch(`/api/dolgozatok/${id}`, { method: 'DELETE' });
            if (response.ok) {
                tr.remove(); // Sor eltávolítása a táblázatból
            } else {
                console.error('Hiba történt a dolgozat törlése során');
            }
        });

        // Módosítás funkció
        editBtn.addEventListener('click', () => {
            editDolgozat(tr, dolgozat); // Módosítás kezdeményezése
        });
    }

    // Dolgozat módosítása
    function editDolgozat(tr, dolgozat) {
        const cells = tr.querySelectorAll('td');
        const originalData = { ...dolgozat }; // Az eredeti dolgozat adatok elmentése

        // Ellenőrizzük, hogy van-e azonosító (ID)
        if (!dolgozat._id) {
            console.error("Dolgozat ID hiányzik!");
            return;
        }

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
        cells[4].innerHTML = '';
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
                const updatedDolgozatResponse = await response.json();
                dolgozat._id = updatedDolgozatResponse._id; // Frissítjük az ID-t a frissített objektumból

                // Frissített adatok visszaírása a táblázatba
                cells[0].textContent = updatedDolgozat.cím;
                cells[1].textContent = updatedDolgozat.hallgato_id;
                cells[2].textContent = updatedDolgozat.temavezeto_id;
                cells[3].textContent = updatedDolgozat.allapot;
                cells[4].innerHTML = `
                    <button class="delete-btn">Törlés</button>
                    <button class="edit-btn">Módosítás</button>
                `;

                // Újra hozzárendeljük az eseményeket
                attachEventHandlers(tr, updatedDolgozatResponse);
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
                <button class="delete-btn">Törlés</button>
                <button class="edit-btn">Módosítás</button>
            `;

            // Események újbóli hozzárendelése
            attachEventHandlers(tr, originalData);
        });
    }

    // Dolgozatok listázása indításkor
    listazDolgozatok();
});

