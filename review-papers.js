document.addEventListener('DOMContentLoaded', function () {
    const ertekelesTbody = document.getElementById('ertekeles-tbody');

    // Dolgozatok értékelése
    async function listazErtekelesDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok/kesz');
            const dolgozatok = await response.json();

            ertekelesTbody.innerHTML = ''; // Ürítjük a táblázatot
            dolgozatok.forEach(dolgozat => {
                addDolgozatToErtekelesTable(dolgozat);
            });
        } catch (err) {
            console.error('Hiba történt a dolgozatok értékelése során:', err);
        }
    }

    // Dolgozat hozzáadása az értékelési táblázathoz (lenyitható formátumban)
    function addDolgozatToErtekelesTable(dolgozat) {
        const tr = document.createElement('tr');
        tr.classList.add('dolgozat-row');
        tr.dataset.id = dolgozat._id;

        // Alapértelmezett, összecsukott nézet, csak a cím látszik
        tr.innerHTML = `
            <td class="toggle-details">${dolgozat.cím || 'N/A'}</td>
        `;
        ertekelesTbody.appendChild(tr);

        // Lenyíló rész a többi adat megjelenítéséhez, alapértelmezésben rejtve
        const detailsRow = document.createElement('tr');
        detailsRow.classList.add('details-row');
        detailsRow.style.display = 'none';
        detailsRow.innerHTML = `
            <td colspan="1"></td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td>${dolgozat.allapot || 'N/A'}</td>
            <td>
                <input type="number" id="pontszam-${dolgozat._id}" value="${dolgozat.pontszam || 0}">
            </td>
            <td>
                <input type="text" id="ertekeles-${dolgozat._id}" value="${dolgozat.ertekeles || ''}">
            </td>
            <td>
                <button class="ertekeles-btn" data-id="${dolgozat._id}">Értékelés</button>
                <button class="modositas-btn" data-id="${dolgozat._id}">Módosítás</button>
                <button class="view-btn" data-path="${dolgozat.filePath}">Megtekintés</button>
            </td>
        `;
        ertekelesTbody.appendChild(detailsRow);

        // Lenyitó funkció
        const toggleCell = tr.querySelector('.toggle-details');
        toggleCell.addEventListener('click', () => {
            if (detailsRow.style.display === 'none') {
                detailsRow.style.display = 'table-row';
            } else {
                detailsRow.style.display = 'none';
            }
        });

        // Értékelés gomb funkciója
        const ertekelesBtn = detailsRow.querySelector('.ertekeles-btn');
        ertekelesBtn.addEventListener('click', async () => {
            const dolgozatId = ertekelesBtn.dataset.id;
            const pontszam = detailsRow.querySelector(`#pontszam-${dolgozatId}`).value;
            const ertekeles = detailsRow.querySelector(`#ertekeles-${dolgozatId}`).value;

            try {
                const response = await fetch(`/api/dolgozatok/ertekeles/${dolgozatId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pontszam, ertekeles })
                });

                if (!response.ok) {
                    throw new Error('Hiba történt az értékelés mentése során');
                }

                alert('Értékelés sikeresen mentve!');
            } catch (error) {
                console.error('Hiba történt az értékelés mentése során:', error);
            }
        });

        // Módosítás gomb funkciója
        const modositasBtn = detailsRow.querySelector('.modositas-btn');
        modositasBtn.addEventListener('click', async () => {
            const dolgozatId = modositasBtn.dataset.id;
            const pontszam = detailsRow.querySelector(`#pontszam-${dolgozatId}`).value;
            const ertekeles = detailsRow.querySelector(`#ertekeles-${dolgozatId}`).value;

            try {
                const response = await fetch(`/api/dolgozatok/ertekeles/${dolgozatId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pontszam, ertekeles })
                });

                if (!response.ok) {
                    throw new Error('Hiba történt a módosítás mentése során');
                }

                alert('Értékelés sikeresen módosítva!');
            } catch (error) {
                console.error('Hiba történt az értékelés módosítása során:', error);
            }
        });

        // Megtekintés gomb funkciója
        const viewBtn = detailsRow.querySelector('.view-btn');
        viewBtn.addEventListener('click', () => {
            const filePath = viewBtn.dataset.path;
            if (filePath) {
                window.open(filePath, '_blank');
            } else {
                alert('Nincs feltöltött fájl a megtekintéshez.');
            }
        });
    }

    // Dolgozatok értékelése indításkor
    listazErtekelesDolgozatok();
});

