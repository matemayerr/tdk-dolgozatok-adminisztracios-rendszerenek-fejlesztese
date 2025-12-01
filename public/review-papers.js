document.addEventListener('DOMContentLoaded', function () {
    const ertekelesTbody = document.getElementById('ertekeles-tbody');
    const searchInput = document.getElementById('search-input');
    const paginationContainer = document.getElementById('pagination-container');
    let dolgozatok = [];
    let currentPage = 1;
    const itemsPerPage = 10;

    // Dolgozatok listázása értékeléshez
    async function listazErtekelesDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok/kesz');
            dolgozatok = await response.json();
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba történt a dolgozatok értékelése során:', err);
        }
    }

    // Dolgozatok megjelenítése
    function megjelenitDolgozatok() {
        const filteredDolgozatok = dolgozatok.filter(dolgozat => 
            dolgozat.cím.toLowerCase().includes(searchInput.value.toLowerCase()) ||
            dolgozat.hallgato_id.toLowerCase().includes(searchInput.value.toLowerCase()) ||
            dolgozat.temavezeto_id.toLowerCase().includes(searchInput.value.toLowerCase()) ||
            dolgozat.allapot.toLowerCase().includes(searchInput.value.toLowerCase())
        );

        const start = (currentPage - 1) * itemsPerPage;
        const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);
        
        ertekelesTbody.innerHTML = '';
        paginatedDolgozatok.forEach(dolgozat => {
            addDolgozatToErtekelesTable(dolgozat);
        });

        frissitPaginacio(filteredDolgozatok.length);
    }

    // Dolgozat hozzáadása az értékelési táblázathoz
    function addDolgozatToErtekelesTable(dolgozat) {
        const tr = document.createElement('tr');
        tr.dataset.id = dolgozat._id;
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
            <td>
                ${isErtekelve ? 
                    `<button onclick="megtekintes('${dolgozat.ertekelesFilePath}')">Megtekintés</button>` :
                    `<button onclick="ertekeles('${dolgozat._id}')">Értékelés</button>`
                }
            </td>
        `;
        ertekelesTbody.appendChild(tr);
    }

    // Értékelés funkció
    window.ertekeles = async function (id) {
        const pontszamSelect = document.getElementById(`pontszam-${id}`);
        const fileInput = document.getElementById(`ertekeles-file-${id}`);
        const pontszam = pontszamSelect.value;
        const file = fileInput.files[0];

        if (!pontszam || !file) {
            alert('Kérlek, válaszd ki az érdemjegyet és a fájlt!');
            return;
        }

        const formData = new FormData();
        formData.append('pontszam', pontszam);
        formData.append('file', file);

        try {
            const response = await fetch(`/api/dolgozatok/ertekeles-feltoltes/${id}`, {
                method: 'POST',
                body: formData
            });
            if (!response.ok) throw new Error('Hiba történt a feltöltés során');
            
            alert('Értékelés és feltöltés sikeresen mentve!');
            listazErtekelesDolgozatok();
        } catch (error) {
            console.error('Hiba történt az értékelés mentése során:', error);
        }
    };

    // Megtekintés funkció
    window.megtekintes = function (filePath) {
        window.open(filePath, '_blank');
    }

    // Keresőmező megjelenítése
    window.toggleSearchInput = function() {
        if (searchInput.style.display === 'none') {
            searchInput.style.display = 'block';
            searchInput.focus();
        } else {
            searchInput.style.display = 'none';
            searchInput.value = '';
            megjelenitDolgozatok();
        }
    }

    // Keresés
    window.searchDolgozatok = function() {
        currentPage = 1;
        megjelenitDolgozatok();
    }

    // Lapozás frissítése
    function frissitPaginacio(totalItems) {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        for (let i = 1; i <= totalPages; i++) {
            const button = document.createElement('button');
            button.textContent = i;
            if (i === currentPage) button.classList.add('active');
            button.addEventListener('click', () => {
                currentPage = i;
                megjelenitDolgozatok();
            });
            paginationContainer.appendChild(button);
        }
    }

    // Indításkor dolgozatok betöltése
    listazErtekelesDolgozatok();
});

