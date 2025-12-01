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

        const isFeltoltve = dolgozat.allapot === 'feltöltve';

        tr.innerHTML = `
            <td>${dolgozat.cím || 'N/A'}</td>
            <td>${dolgozat.hallgato_id || 'N/A'}</td>
            <td>${dolgozat.temavezeto_id || 'N/A'}</td>
            <td class="upload-status" id="status-${dolgozat._id}">${isFeltoltve ? 'Feltöltve' : 'Feltöltésre vár'}</td>
            <td>
                <input type="file" id="file-${dolgozat._id}" ${isFeltoltve ? 'disabled' : ''}>
                <button class="upload-btn" ${isFeltoltve ? 'disabled' : ''}>Feltöltés</button>
            </td>
        `;
        keszDolgozatokTbody.appendChild(tr);

        const uploadBtn = tr.querySelector('.upload-btn');
        uploadBtn.addEventListener('click', async () => {
            await feltoltDolgozat(dolgozat._id, uploadBtn);
        });
    }

    // Fájl feltöltése az adott dolgozathoz
    async function feltoltDolgozat(dolgozatId, uploadBtn) {
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
            document.getElementById(`status-${dolgozatId}`).textContent = 'Feltöltve';
            fileInput.disabled = true;
            uploadBtn.disabled = true;
        } catch (error) {
            console.error('Hiba történt a fájl feltöltése során:', error);
        }
    }

    listazKeszDolgozatok();
});

