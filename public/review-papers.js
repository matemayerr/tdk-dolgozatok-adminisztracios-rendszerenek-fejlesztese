document.addEventListener('DOMContentLoaded', function () {
    const ertekelesTbody = document.getElementById('ertekeles-tbody');
    const searchInput = document.getElementById('search-input');
    const paginationContainer = document.getElementById('pagination-container');
    const modal = document.getElementById('ertekeles-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalPontszam = document.getElementById('modal-pontszam');
    const modalSzoveg = document.getElementById('modal-szoveg');
    const modalMentes = document.getElementById('modal-mentes');
    const modalBezár = document.getElementById('modal-bezar');

    let dolgozatok = [];
    let aktualisDolgozatId = null;
    let currentPage = 1;
    const itemsPerPage = 10;

    // Dolgozatok lekérdezése
    async function listazErtekelesDolgozatok() {
        try {
            const response = await fetch('/api/dolgozatok/kesz');
            dolgozatok = await response.json();
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba a dolgozatok lekérdezésekor:', err);
        }
    }

    // Megjelenítés
    function megjelenitDolgozatok() {
        const filtered = dolgozatok.filter(d =>
            d.cím.toLowerCase().includes(searchInput.value.toLowerCase())
        );

        const start = (currentPage - 1) * itemsPerPage;
        const paginated = filtered.slice(start, start + itemsPerPage);

        ertekelesTbody.innerHTML = '';
        paginated.forEach(d => {
            const gombFelirat = d.pontszam ? 'Megtekintés' : 'Értékelés';
            tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.cím}</td>
                <td>${d.hallgato_id}</td>
                <td>${d.temavezeto_id}</td>
                <td>${d.allapot}</td>
                <td>${d.pontszam || ''}</td>
                <td><button onclick="nyisdErtekeles('${d._id}')">${gombFelirat}</button></td>
            `;
            ertekelesTbody.appendChild(tr);
        });

        frissitPaginacio(filtered.length);
    }

    // Modál megnyitása
window.nyisdErtekeles = function (id) {
    aktualisDolgozatId = id;
    const dolgozat = dolgozatok.find(d => d._id === id);

    // Frissítsd mindig az értékeket!
    modalPontszam.value = dolgozat.pontszam || '';
    modalSzoveg.value = dolgozat.szovegesErtekeles || '';

    const modositGomb = document.getElementById('modositGomb');
    if (modositGomb) modositGomb.remove();  // Esetleges régi gomb eltávolítása

    if (dolgozat.pontszam) {
        // Megtekintés mód
        modalTitle.textContent = 'Értékelés megtekintése';
        modalPontszam.style.display = 'none';
        modalSzoveg.disabled = true;
        modalMentes.style.display = 'none';

        const modosit = document.createElement('button');
        modosit.id = 'modositGomb';
        modosit.textContent = 'Módosítás';
        modosit.addEventListener('click', () => {
            // Átvált módosító módba
            modalTitle.textContent = 'Értékelés módosítása';
            modalPontszam.style.display = 'block';
            modalSzoveg.disabled = false;
            modalMentes.style.display = 'inline-block';
            modosit.remove();
        });

        modal.querySelector('.modal-content').appendChild(modosit);
    } else {
        // Új értékelés mód
        modalTitle.textContent = 'Értékelés hozzáadása';
        modalPontszam.style.display = 'block';
        modalSzoveg.disabled = false;
        modalMentes.style.display = 'inline-block';
    }

    modal.style.display = 'block';
};


    // Értékelés mentése
    modalMentes.addEventListener('click', async () => {
        const pontszam = modalPontszam.value;
        const szoveg = modalSzoveg.value;

        if (!pontszam || !szoveg) {
            alert('Minden mezőt ki kell tölteni!');
            return;
        }

        try {
            await fetch(`/api/dolgozatok/ertekeles/${aktualisDolgozatId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pontszam, szovegesErtekeles: szoveg })
            });

            modal.style.display = 'none';
            listazErtekelesDolgozatok(); // Frissítjük a listát
        } catch (err) {
            console.error('Hiba az értékelés mentése során:', err);
        }
    });

    // Modal bezárása
    modalBezár.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Kereső logika
    window.toggleSearchInput = function () {
        if (searchInput.style.display === 'none') {
            searchInput.style.display = 'block';
            searchInput.focus();
        } else {
            searchInput.style.display = 'none';
            searchInput.value = '';
            megjelenitDolgozatok();
        }
    };

    window.searchDolgozatok = function () {
        currentPage = 1;
        megjelenitDolgozatok();
    };

    // Pagináció
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

    // Betöltés
    listazErtekelesDolgozatok();
});

