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

        tr.innerHTML = `
            <td>${dolgozat.cím || 'N/A'}</td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td>${dolgozat.allapot || 'N/A'}</td>
            <td>
                <input type="file" id="file-${dolgozat._id}" required>
                <button class="upload-btn">Feltöltés</button>
            </td>
            <td class="upload-status" id="status-${dolgozat._id}">Nincs feltöltve</td>
        `;
        keszDolgozatokTbody.appendChild(tr);

        // Feltöltési funkció hozzárendelése
        const uploadBtn = tr.querySelector('.upload-btn');
        uploadBtn.addEventListener('click', async () => {
            await feltoltDolgozat(dolgozat._id);
        });
    }

    // Fájl feltöltése az adott dolgozathoz
    async function feltoltDolgozat(dolgozatId) {
        const fileInput = document.getElementById(`file-${dolgozatId}`);
        
        // Ellenőrizzük, hogy a fileInput létezik
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

            const result = await response.json();
            alert('Fájl sikeresen feltöltve!');

            // Frissítjük a táblázatot, hogy jelezze a feltöltést
            const statusCell = document.getElementById(`status-${dolgozatId}`);
            if (statusCell) {
                statusCell.textContent = 'Feltöltve';
            }
        } catch (error) {
            console.error('Hiba történt a fájl feltöltése során:', error);
        }
    }

    // Kész dolgozatok listázása indításkor
    listazKeszDolgozatok();
});
