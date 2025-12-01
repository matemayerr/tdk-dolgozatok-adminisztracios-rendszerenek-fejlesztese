document.addEventListener('DOMContentLoaded', function () {
    const ertekelesTbody = document.getElementById('ertekeles-tbody');

    // Dolgozatok listázása értékeléshez
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

    // Dolgozat hozzáadása az értékelési táblázathoz
    function addDolgozatToErtekelesTable(dolgozat) {
        const tr = document.createElement('tr');
        tr.dataset.id = dolgozat._id;

        tr.innerHTML = `
            <td>${dolgozat.cím || 'N/A'}</td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td>${dolgozat.allapot || 'N/A'}</td>
            <td>
                <select id="pontszam-${dolgozat._id}">
                    <option value="" ${!dolgozat.pontszam ? 'selected' : ''}></option>
                    <option value="elégtelen" ${dolgozat.pontszam === 'elégtelen' ? 'selected' : ''}>Elégtelen</option>
                    <option value="elégséges" ${dolgozat.pontszam === 'elégséges' ? 'selected' : ''}>Elégséges</option>
                    <option value="közepes" ${dolgozat.pontszam === 'közepes' ? 'selected' : ''}>Közepes</option>
                    <option value="jó" ${dolgozat.pontszam === 'jó' ? 'selected' : ''}>Jó</option>
                    <option value="jeles" ${dolgozat.pontszam === 'jeles' ? 'selected' : ''}>Jeles</option>
                </select>
            </td>
            <td><input type="text" id="ertekeles-${dolgozat._id}" value="${dolgozat.ertekeles || ''}"></td>
            <td class="action-buttons" data-id="${dolgozat._id}">
                ${!dolgozat.pontszam ? `
                    <button class="ertekeles-btn">Értékelés</button>
                ` : `
                    <button class="modositas-btn">Módosítás</button>
                `}
                <button class="view-btn">Megtekintés</button>
            </td>
        `;
        ertekelesTbody.appendChild(tr);

        const actionButtonsCell = tr.querySelector('.action-buttons');

        // Értékelés gomb feltételesen
        if (!dolgozat.pontszam) {
            const ertekelesBtn = actionButtonsCell.querySelector('.ertekeles-btn');
            ertekelesBtn.addEventListener('click', async () => {
                const pontszam = tr.querySelector(`#pontszam-${dolgozat._id}`).value;
                const ertekeles = tr.querySelector(`#ertekeles-${dolgozat._id}`).value;

                try {
                    const response = await fetch(`/api/dolgozatok/ertekeles/${dolgozat._id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pontszam, ertekeles })
                    });

                    if (!response.ok) throw new Error('Hiba történt az értékelés mentése során');

                    alert('Értékelés sikeresen mentve!');
                    // Értékelés gomb cseréje Módosítás gombra
                    actionButtonsCell.innerHTML = `
                        <button class="modositas-btn">Módosítás</button>
                        <button class="view-btn">Megtekintés</button>
                    `;
                    addModositasHandler(dolgozat._id);
                    addViewHandler(dolgozat.filePath);
                } catch (error) {
                    console.error('Hiba történt az értékelés mentése során:', error);
                }
            });
        } else {
            // Módosítás gomb hozzáadása, ha már van pontszám
            addModositasHandler(dolgozat._id);
        }

        // Megtekintés gomb
        addViewHandler(dolgozat.filePath);
    }

    // Módosítás gomb handler hozzáadása
    function addModositasHandler(dolgozatId) {
        const modositasBtn = document.querySelector(`.action-buttons[data-id="${dolgozatId}"] .modositas-btn`);
        modositasBtn.addEventListener('click', async () => {
            const pontszam = document.querySelector(`#pontszam-${dolgozatId}`).value;
            const ertekeles = document.querySelector(`#ertekeles-${dolgozatId}`).value;

            try {
                const response = await fetch(`/api/dolgozatok/ertekeles/${dolgozatId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pontszam, ertekeles })
                });

                if (!response.ok) throw new Error('Hiba történt a módosítás mentése során');

                alert('Értékelés sikeresen módosítva!');
            } catch (error) {
                console.error('Hiba történt az értékelés módosítása során:', error);
            }
        });
    }

    // Megtekintés gomb handler hozzáadása
    function addViewHandler(filePath) {
        const viewBtn = document.querySelector(`.action-buttons [data-path="${filePath}"] .view-btn`);
        viewBtn.addEventListener('click', () => {
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

