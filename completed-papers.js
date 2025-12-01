document.addEventListener('DOMContentLoaded', function () {
    const keszDolgozatokTbody = document.getElementById('kesz-dolgozatok-tbody');

    // Kész dolgozatok listázása
    async function listazKeszDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok/kesz');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const keszDolgozatok = await response.json();

            keszDolgozatokTbody.innerHTML = '';
            keszDolgozatok.forEach(dolgozat => {
                addDolgozatToTable(dolgozat);
            });
        } catch (err) {
            console.error('Hiba történt a kész dolgozatok listázása során:', err);
        }
    }

    // Kész dolgozat hozzáadása a táblázathoz
    function addDolgozatToTable(dolgozat) {
        const tr = document.createElement('tr');
        tr.dataset.id = dolgozat._id;

        // Feltöltve vagy értékelve állapot esetén csak a megtekintés gomb jelenik meg, és a fájl tallózás eltűnik
        const isFeltoltveVagyErtekelve = dolgozat.allapot === 'feltöltve' || dolgozat.allapot === 'értékelve';

        tr.innerHTML = `
            <td>${dolgozat.cím || 'N/A'}</td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td>${dolgozat.allapot || 'N/A'}</td>
            <td>
                ${isFeltoltveVagyErtekelve ? 
                    `<button class="megtekintes-btn" data-path="${dolgozat.filePath}">Megtekintés</button>` :
                    `<input type="file" id="file-${dolgozat._id}" required>
                    <button class="upload-btn">Feltöltés</button>`
                }
            </td>
        `;
        keszDolgozatokTbody.appendChild(tr);

        // Feltöltés gomb funkció hozzárendelése, ha még nem "feltöltve" vagy "értékelve" az állapot
        if (!isFeltoltveVagyErtekelve) {
            const uploadBtn = tr.querySelector('.upload-btn');
            uploadBtn.addEventListener('click', async () => {
                await feltoltDolgozat(dolgozat._id);
            });
        }

        // Megtekintés gomb funkció hozzárendelése
        if (isFeltoltveVagyErtekelve) {
            const megtekintesBtn = tr.querySelector('.megtekintes-btn');
            megtekintesBtn.addEventListener('click', () => {
                const filePath = megtekintesBtn.dataset.path;
                if (filePath) {
                    window.open(filePath, '_blank');
                } else {
                    alert('Nincs feltöltött fájl a megtekintéshez.');
                }
            });
        }
    }

    // Fájl feltöltése az adott dolgozathoz
    async function feltoltDolgozat(dolgozatId) {
        const fileInput = document.getElementById(`file-${dolgozatId}`);
        
        if (!fileInput) {
            console.error(`Fájl input nem található: file-${dolgozatId}`);
            return;
        }

        const file = fileInput.files[0];
        if (!file) {
            alert('Kérlek, válassz ki egy fájlt a feltöltéshez!');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`/api/dolgozatok/feltoltes/${dolgozatId}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Hiba történt a fájl feltöltése során');
            }

            alert('Fájl sikeresen feltöltve!');
            listazKeszDolgozatok(); // Frissítjük a táblázatot a státusz miatt
        } catch (error) {
            console.error('Hiba történt a fájl feltöltése során:', error);
        }
    }

    // Kész dolgozatok listázása indításkor
    listazKeszDolgozatok();
});

