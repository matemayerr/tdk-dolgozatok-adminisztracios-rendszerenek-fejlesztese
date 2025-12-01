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

        // Ellenőrizzük, hogy az állapot "értékelve"-e
        const isErtekelve = dolgozat.allapot === 'értékelve';

        tr.innerHTML = `
            <td>${dolgozat.cím || 'N/A'}</td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td>${dolgozat.allapot || 'N/A'}</td>
            <td>
                ${isErtekelve ? 
                    `<span style="font-weight: bold;">${dolgozat.pontszam || '-'}</span>` :
                    `<select id="pontszam-${dolgozat._id}">
                        <option value="" ${!dolgozat.pontszam ? 'selected' : ''}>Válasszon érdemjegyet</option>
                        <option value="Elégtelen" ${dolgozat.pontszam === 'Elégtelen' ? 'selected' : ''}>Elégtelen</option>
                        <option value="Elégséges" ${dolgozat.pontszam === 'Elégséges' ? 'selected' : ''}>Elégséges</option>
                        <option value="Közepes" ${dolgozat.pontszam === 'Közepes' ? 'selected' : ''}>Közepes</option>
                        <option value="Jó" ${dolgozat.pontszam === 'Jó' ? 'selected' : ''}>Jó</option>
                        <option value="Jeles" ${dolgozat.pontszam === 'Jeles' ? 'selected' : ''}>Jeles</option>
                    </select>
                    <input type="file" id="ertekeles-file-${dolgozat._id}" accept=".pdf" />`
                }
            </td>
            <td class="action-buttons" data-id="${dolgozat._id}">
                ${isErtekelve ? 
                    `<button class="megtekintes-btn" data-path="${dolgozat.ertekelesFilePath}">Megtekintés</button>` :
                    `<button class="ertekeles-btn">Értékelés</button>`
                }
            </td>
        `;
        ertekelesTbody.appendChild(tr);

        // Értékelés gomb funkciója csak akkor érhető el, ha az állapot nem "értékelve"
        if (!isErtekelve) {
            const ertekelesBtn = tr.querySelector('.ertekeles-btn');
            ertekelesBtn.addEventListener('click', async () => {
                const dolgozatId = dolgozat._id;
                const pontszam = tr.querySelector(`#pontszam-${dolgozatId}`).value;
                const fileInput = tr.querySelector(`#ertekeles-file-${dolgozatId}`);
                const file = fileInput.files[0];

                if (!pontszam || !file) {
                    alert('Kérlek, válaszd ki az érdemjegyet és a fájlt!');
                    return;
                }

                const formData = new FormData();
                formData.append('pontszam', pontszam);
                formData.append('file', file);

                try {
                    const response = await fetch(`/api/dolgozatok/ertekeles-feltoltes/${dolgozatId}`, {
                        method: 'POST',
                        body: formData
                    });
                    if (!response.ok) throw new Error('Hiba történt a feltöltés során');
                    
                    alert('Értékelés és feltöltés sikeresen mentve!');
                    listazErtekelesDolgozatok(); // Frissítjük a listát a megtekintés gomb megjelenítéséhez
                } catch (error) {
                    console.error('Hiba történt az értékelés mentése során:', error);
                }
            });
        }

        // Megtekintés gomb funkciója, ha már van feltöltött fájl
        if (isErtekelve && dolgozat.ertekelesFilePath) {
            const megtekintesBtn = tr.querySelector('.megtekintes-btn');
            megtekintesBtn.addEventListener('click', () => {
                window.open(dolgozat.ertekelesFilePath, '_blank');
            });
        }
    }

    // Dolgozatok listázása indításkor
    listazErtekelesDolgozatok();
});

