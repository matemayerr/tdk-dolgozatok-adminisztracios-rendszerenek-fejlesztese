document.addEventListener('DOMContentLoaded', function () {
    const dolgozatTbody = document.getElementById('dolgozat-tbody');
    const searchInput = document.getElementById('dolgozat-search-input');
    const paginationContainer = document.getElementById('dolgozat-pagination');
    let dolgozatok = [];
    let currentPage = 1;
    let itemsPerPage = 25;

    // Dolgozatok lekérdezése
    async function listazDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok/feltoltheto');
            dolgozatok = await response.json();
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba történt a dolgozatok lekérése során:', err);
        }
    }

    // Dolgozatok megjelenítése
    function megjelenitDolgozatok() {
        const filteredDolgozatok = dolgozatok.filter(dolgozat => 
            (dolgozat.cím && dolgozat.cím.toLowerCase().includes(searchInput.value.toLowerCase())) ||
            (dolgozat.hallgato_ids && dolgozat.hallgato_ids.join(', ').toLowerCase().includes(searchInput.value.toLowerCase())) ||
            (dolgozat.temavezeto_ids && dolgozat.temavezeto_ids.join(', ').toLowerCase().includes(searchInput.value.toLowerCase())) ||
            (dolgozat.allapot && dolgozat.allapot.toLowerCase().includes(searchInput.value.toLowerCase()))
        );

        const start = (currentPage - 1) * itemsPerPage;
        const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);
        
        dolgozatTbody.innerHTML = '';
        paginatedDolgozatok.forEach(dolgozat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
    <td>${dolgozat.cím || 'N/A'}</td>
    <td>${dolgozat.hallgato_ids ? dolgozat.hallgato_ids.join(', ') : 'N/A'}</td>
    <td>${dolgozat.temavezeto_ids ? dolgozat.temavezeto_ids.join(', ') : 'N/A'}</td>
    <td>${dolgozat.allapot || 'N/A'}</td>
    <td class="actions-cell">
        ${dolgozat.allapot === 'jelentkezett' ? 
            `<button class="jelentkezes-btn" onclick="feltoltes('${dolgozat._id}')">Feltöltés</button>` : 
            ''
        }
        ${dolgozat.filePath && (dolgozat.allapot === 'feltöltve' || dolgozat.allapot === 'értékelve') ? 
            `<button class="view-button" onclick="megtekintes('${dolgozat.filePath}')">Megtekintés</button>` : 
            ''
        }
    </td>
`;

            dolgozatTbody.appendChild(tr);
        });

        frissitPaginacio(filteredDolgozatok.length);
    }

    // Lapozó gombok frissítése
    function frissitPaginacio(totalItems) {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            if (i === currentPage) btn.classList.add('active');
            btn.addEventListener('click', () => {
                currentPage = i;
                megjelenitDolgozatok();
            });
            paginationContainer.appendChild(btn);
        }
    }

    // Feltöltés művelet
    window.feltoltes = async function (id) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = ".pdf";
        fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await fetch(`/api/dolgozatok/feltoltes/${id}`, {
                    method: 'POST',
                    body: formData
                });
                if (response.ok) {
                    alert('Fájl sikeresen feltöltve');
                    listazDolgozatok(); // Frissítjük a listát
                } else {
                    console.error('Hiba történt a feltöltés során');
                }
            } catch (error) {
                console.error('Hiba történt a feltöltés során:', error);
            }
        };
        fileInput.click();
    }

    // Megtekintés művelet
    window.megtekintes = function (filePath) {
        window.open(filePath, '_blank');
    }

    // Keresőmező megjelenítése
    window.toggleDolgozatSearch = function() {
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

    // Indításkor dolgozatok betöltése
    listazDolgozatok();

    const sorokSzamaSelect = document.getElementById('sorokSzama');
    if (sorokSzamaSelect) {
        sorokSzamaSelect.addEventListener('change', function () {
            itemsPerPage = parseInt(this.value);
            currentPage = 1;
            megjelenitDolgozatok();
        });
    }
});
