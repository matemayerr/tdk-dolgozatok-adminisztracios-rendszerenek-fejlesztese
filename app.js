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
                allapot: "benyújtva"  // Alapértelmezett állapot hozzáadáskor
            };

            if (!formData.cím || !formData.hallgato_id || !formData.temavezeto_id) {
                alert('Kérlek, töltsd ki az összes mezőt!');
                return;
            }

            const response = await fetch('/api/dolgozatok/feltoltes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    async function listazDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok');
            const dolgozatok = await response.json();
            dolgozatTbody.innerHTML = '';
            dolgozatok.forEach(dolgozat => {
                addDolgozatToTable(dolgozat);
            });
        } catch (err) {
            console.error('Hiba történt a dolgozatok listázása során:', err);
        }
    }

    function addDolgozatToTable(dolgozat) {
    const tr = document.createElement('tr');
    tr.dataset.id = dolgozat._id;

    let elutasitasOka = dolgozat.elutasitasOka && dolgozat.elutasitasOka !== 'undefined' 
        ? dolgozat.elutasitasOka 
        : 'Nincs megadva elutasítási ok';

    tr.innerHTML = `
        <td>${dolgozat.cím || 'N/A'}</td>
        <td>${dolgozat.hallgato_id || 'N/A'}</td>
        <td>${dolgozat.temavezeto_id || 'N/A'}</td>
        <td>
            <span class="allapot-text" 
                  title="${dolgozat.allapot === 'elutasítva' ? elutasitasOka : ''}"
                  data-allapot="${dolgozat.allapot}">
                ${dolgozat.allapot}
            </span>
        </td>
        <td>
            <button class="delete-btn">Törlés</button>
            <button class="edit-btn">Módosítás</button>
        </td>
    `;
    dolgozatTbody.appendChild(tr);

    attachEventHandlers(tr, dolgozat);
}

    function attachEventHandlers(tr, dolgozat) {
        const deleteBtn = tr.querySelector('.delete-btn');
        const editBtn = tr.querySelector('.edit-btn');

        deleteBtn.addEventListener('click', async () => {
            const id = dolgozat._id;
            const response = await fetch(`/api/dolgozatok/${id}`, { method: 'DELETE' });
            if (response.ok) {
                tr.remove();
            } else {
                console.error('Hiba történt a dolgozat törlése során');
            }
        });

        editBtn.addEventListener('click', () => {
            editDolgozat(tr, dolgozat);
        });
    }

    function editDolgozat(tr, dolgozat) {
        const cells = tr.querySelectorAll('td');
        const originalData = { ...dolgozat };

        cells[0].innerHTML = `<input type="text" value="${dolgozat.cím}">`;
        cells[1].innerHTML = `<input type="text" value="${dolgozat.hallgato_id}">`;
        cells[2].innerHTML = `<input type="text" value="${dolgozat.temavezeto_id}">`;
        cells[3].innerHTML = `
            <select id="allapot-${dolgozat._id}">
                <option value="benyújtva" ${dolgozat.allapot === 'benyújtva' ? 'selected' : ''}>Benyújtva</option>
                <option value="bírálás alatt" ${dolgozat.allapot === 'bírálás alatt' ? 'selected' : ''}>Bírálás alatt</option>
                <option value="elfogadva" ${dolgozat.allapot === 'elfogadva' ? 'selected' : ''}>Elfogadva</option>
                <option value="elutasítva" ${dolgozat.allapot === 'elutasítva' ? 'selected' : ''}>Elutasítva</option>
            </select>
        `;

        const elutasitasOkaInput = document.createElement('input');
        elutasitasOkaInput.type = 'text';
        elutasitasOkaInput.placeholder = 'Elutasítás oka';
        elutasitasOkaInput.value = dolgozat.elutasitasOka || '';
        elutasitasOkaInput.id = `elutasitasOka-${dolgozat._id}`;
        elutasitasOkaInput.style.display = dolgozat.allapot === 'elutasítva' ? 'inline' : 'none';
        cells[4].innerHTML = '';
        cells[4].appendChild(elutasitasOkaInput);

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Mentés';
        cells[4].appendChild(saveBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Mégse';
        cells[4].appendChild(cancelBtn);

        document.getElementById(`allapot-${dolgozat._id}`).addEventListener('change', (event) => {
            elutasitasOkaInput.style.display = event.target.value === 'elutasítva' ? 'inline' : 'none';
        });

        saveBtn.addEventListener('click', async () => {
            const allapot = document.getElementById(`allapot-${dolgozat._id}`).value;
            const elutasitasOka = allapot === 'elutasítva' ? elutasitasOkaInput.value : '';

            const updatedDolgozat = {
                cím: cells[0].querySelector('input').value,
                hallgato_id: cells[1].querySelector('input').value,
                temavezeto_id: cells[2].querySelector('input').value,
                allapot,
                elutasitasOka: allapot === 'elutasítva' ? elutasitasOka : null
            };

            const response = await fetch(`/api/dolgozatok/${dolgozat._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedDolgozat)
            });

            if (response.ok) {
                const updatedDolgozatResponse = await response.json();
                dolgozat.cím = updatedDolgozatResponse.cím;
                dolgozat.hallgato_id = updatedDolgozatResponse.hallgato_id;
                                dolgozat.temavezeto_id = updatedDolgozatResponse.temavezeto_id;
                dolgozat.allapot = updatedDolgozatResponse.allapot;
                dolgozat.elutasitasOka = updatedDolgozatResponse.elutasitasOka;

                cells[0].textContent = dolgozat.cím;
                cells[1].textContent = dolgozat.hallgato_id;
                cells[2].textContent = dolgozat.temavezeto_id;
                cells[3].innerHTML = `
                    <span class="allapot-text" data-oka="${dolgozat.elutasitasOka || ''}" title="${dolgozat.elutasitasOka || ''}">
                        ${dolgozat.allapot}
                    </span>
                `;
                cells[4].innerHTML = `
                    <button class="delete-btn">Törlés</button>
                    <button class="edit-btn">Módosítás</button>
                `;

                attachEventHandlers(tr, updatedDolgozatResponse);
            } else {
                console.error('Hiba történt a dolgozat módosítása során');
            }
        });

        cancelBtn.addEventListener('click', () => {
            cells[0].textContent = originalData.cím;
            cells[1].textContent = originalData.hallgato_id;
            cells[2].textContent = originalData.temavezeto_id;
            cells[3].innerHTML = `
                <span class="allapot-text" data-oka="${originalData.elutasitasOka || ''}" title="${originalData.elutasitasOka || ''}">
                    ${originalData.allapot}
                </span>
            `;
            cells[4].innerHTML = `
                <button class="delete-btn">Törlés</button>
                <button class="edit-btn">Módosítás</button>
            `;

            attachEventHandlers(tr, originalData);
        });
    }

    listazDolgozatok();
});
