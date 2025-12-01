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
            const response = await fetch('/api/dolgozatok/ertekeleshez');
            dolgozatok = await response.json();
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba a dolgozatok lekérdezésekor:', err);
        }
    }

    // Megjelenítés
    function megjelenitDolgozatok() {
        const filtered = dolgozatok
            .filter(d => ['feltöltve', 'értékelve'].includes(d.allapot))
            .filter(d =>
                d.cím.toLowerCase().includes(searchInput.value.toLowerCase()) ||
                d.hallgato_id?.toLowerCase().includes(searchInput.value.toLowerCase()) ||
                d.temavezeto_id?.toLowerCase().includes(searchInput.value.toLowerCase()) ||
                d.allapot?.toLowerCase().includes(searchInput.value.toLowerCase())
            );
    
        const start = (currentPage - 1) * itemsPerPage;
        const paginated = filtered.slice(start, start + itemsPerPage);
    
        ertekelesTbody.innerHTML = '';
        paginated.forEach(d => {
            const gombFelirat = d.pontszam ? 'Megtekintés' : 'Értékelés';
            const tr = document.createElement('tr');
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

    // Alaphelyzet: inputmezők láthatóak
    modalPontszam.value = dolgozat.pontszam || '';
    modalSzoveg.value = dolgozat.szovegesErtekeles || '';
    modalPontszam.style.display = 'block';
    modalSzoveg.style.display = 'block';
    modalSzoveg.disabled = false;
    modalMentes.style.display = 'inline-block';
    modalTitle.textContent = 'Értékelés hozzáadása';

    document.getElementById('megtekintesSzoveg')?.remove();
    document.getElementById('modositGomb')?.remove();
    


    // Ha már létezik értékelés → csak szöveg, Módosítás + Mégse
    if (dolgozat.pontszam && dolgozat.szovegesErtekeles) {
        modalPontszam.style.display = 'none';
        modalSzoveg.style.display = 'none';
        modalMentes.style.display = 'none';
        modalTitle.textContent = 'Értékelés megtekintése';
        modalBezár.style.display = 'none';

         // Eltüntetjük a label-eket
    document.querySelector('label[for="modal-pontszam"]').style.display = 'none';
    document.querySelector('label[for="modal-szoveg"]').style.display = 'none';

        const megtekintesSzoveg = document.createElement('div');
        megtekintesSzoveg.id = 'megtekintesSzoveg';
        megtekintesSzoveg.style.marginTop = '10px';
        megtekintesSzoveg.style.backgroundColor = '#f4f4f4';
        megtekintesSzoveg.style.padding = '10px';
        megtekintesSzoveg.style.borderRadius = '5px';
        megtekintesSzoveg.innerHTML = `
    <p style="margin-bottom: 20px;">${dolgozat.szovegesErtekeles}</p>
    <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button id="modositGomb">Módosítás</button>
        <button id="megtekintesMegseGomb">Mégse</button>
    </div>
`;

        modal.querySelector('.modal-content').appendChild(megtekintesSzoveg);

        document.getElementById('modositGomb').addEventListener('click', () => {
            megtekintesSzoveg.remove();
            modalPontszam.style.display = 'block';
            modalSzoveg.style.display = 'block';
            modalSzoveg.disabled = false;
            modalMentes.style.display = 'inline-block';
            modalTitle.textContent = 'Értékelés módosítása'
            modalBezár.style.display = 'inline-block';
          
            // Label-eket újra láthatóvá tesszük
        document.querySelector('label[for="modal-pontszam"]').style.display = 'block';
        document.querySelector('label[for="modal-szoveg"]').style.display = 'block';
        });

        document.getElementById('megtekintesMegseGomb').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    modal.style.display = 'block';
    modal.scrollTop = 0;
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
        document.getElementById('megtekintesSzoveg')?.remove();
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

