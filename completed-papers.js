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

// A kész dolgozatok listázását elindítjuk
listazKeszDolgozatok();

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
                <button class="upload-btn">Feltöltés</button>
            </td>
        `;
        keszDolgozatokTbody.appendChild(tr);

        // Eseménykezelő hozzárendelése a feltöltési gombhoz
        const uploadBtn = tr.querySelector('.upload-btn');
        uploadBtn.addEventListener('click', async () => {
            // Feltöltési funkció implementálása
        });
    }

    // Kész dolgozatok listázása indításkor
    listazKeszDolgozatok();
});
