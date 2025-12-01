document.addEventListener('DOMContentLoaded', function () {
    const tabla = document.getElementById("dolgozatokTabla");
    const searchInput = document.getElementById('search-input');
    const sorokSzamaSelect = document.getElementById('items-per-page');

    let dolgozatok = [];
    let filteredDolgozatok = [];
    let currentPage = 1;
    let itemsPerPage = 25;

    // Név + Neptun formázása: "Mayer Máté (AQAWC1)"
    function formatUser(u) {
        if (!u) return '';
        const nev = u.nev || '';
        const neptun = u.neptun || '';
        if (nev && neptun) return `${nev} (${neptun})`;
        return nev || neptun || '';
    }

    function megjelenitDolgozatok() {
        tabla.innerHTML = "";

        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = itemsPerPage === 'összes'
            ? filteredDolgozatok.length
            : startIndex + itemsPerPage;

        filteredDolgozatok.slice(startIndex, endIndex).forEach(dolgozat => {
            const foSor = document.createElement("tr");
            foSor.classList.add("dolgozat-row");

            // Van-e már értékelés?
            const vanErtekeles = dolgozat.ertekeles && Object.keys(dolgozat.ertekeles).length > 0;

            const gomb = vanErtekeles
                ? `<a href="import_form.html?id=${dolgozat._id}&readonly=true" class="modosit-btn">Megtekintés</a>`
                : `<a href="import_form.html?id=${dolgozat._id}" class="jelentkezes-btn">Bírálás</a>`;

            foSor.innerHTML = `
    <td>
      <span class="clickable-title">
        <span class="cim-szoveg">${dolgozat.cim}</span>
        <span class="toggle-arrow">▼</span>
      </span>
    </td>
    <td>${dolgozat.allapot || '-'}</td>
    <td>${gomb}</td>
`;


            // LENYÍLÓ SOR
            const reszletekSor = document.createElement("tr");
            reszletekSor.classList.add("dolgozat-details-row", "hidden");

            const szerzokSzoveg =
                dolgozat.szerzok?.map(formatUser).join(", ") || "-";

            const temavezetoSzoveg =
                dolgozat.temavezeto?.map(formatUser).join(", ") || "-";

            // Csak SZÖVEGES értékelés, érdemjegy NÉLKÜL
            let szovegesErtekeles = "";
            if (dolgozat.ertekeles) {
                szovegesErtekeles =
                    dolgozat.ertekeles.szovegesErtekeles ||
                    dolgozat.ertekeles.szoveges ||
                    dolgozat.ertekeles.szoveges_ertekeles ||
                    dolgozat.ertekeles.ertekelesSzoveg ||
                    "";
            }

            let ertekelesHTML = "";
            if (szovegesErtekeles) {
                ertekelesHTML = `
                    <p class="leiras-cimke"><strong>Szöveges értékelés:</strong></p>
                    <div class="dolgozat-leiras">${szovegesErtekeles}</div>
                `;
            }

            // Ugyanolyan felépítés, mint papers.html lenyitó
            reszletekSor.innerHTML = `
                <td colspan="3">
                    <div class="dolgozat-details-panel">
                        ${dolgozat.leiras
                            ? `
                                <p><strong>Tartalmi összefoglaló:</strong></p>
                                <div class="dolgozat-leiras">${dolgozat.leiras}</div>
                              `
                            : ""
                        }
                        <p><strong>Hallgatók:</strong> ${szerzokSzoveg}</p>
                        <p><strong>Témavezetők:</strong> ${temavezetoSzoveg}</p>
                        ${ertekelesHTML}
                    </div>
                </td>
            `;

            // Cím kattintására lenyit / becsuk + nyíl csere
            const cimElem = foSor.querySelector('.clickable-title');
            const arrowElem = foSor.querySelector('.toggle-arrow');

            cimElem.addEventListener('click', () => {
                const hidden = reszletekSor.classList.toggle('hidden');
                if (arrowElem) {
                    arrowElem.textContent = hidden ? '▼' : '▲';
                }
            });

            tabla.appendChild(foSor);
            tabla.appendChild(reszletekSor);
        });
    }

    function searchDolgozatok() {
        const keresett = (searchInput.value || "").toLowerCase();

        filteredDolgozatok = dolgozatok.filter(d =>
            d.cim.toLowerCase().includes(keresett) ||
            (d.szerzok && d.szerzok.some(s => (s.nev || "").toLowerCase().includes(keresett))) ||
            (d.temavezeto && d.temavezeto.some(t => (t.nev || "").toLowerCase().includes(keresett)))
        );

        currentPage = 1;
        megjelenitDolgozatok();
    }

    function frissitItemsPerPage() {
        const valasztott = sorokSzamaSelect.value;
        itemsPerPage = valasztott === 'összes' ? 'összes' : parseInt(valasztott, 10);
        currentPage = 1;
        megjelenitDolgozatok();
    }

    window.searchDolgozatok = searchDolgozatok;
    window.frissitItemsPerPage = frissitItemsPerPage;

    fetch('/api/papers')
        .then(res => res.json())
        .then(adatok => {
            // Csak az elfogadott dolgozatokat listázzuk
            dolgozatok = adatok.filter(d => d.allapot === 'elfogadva - témavezető által');
            filteredDolgozatok = dolgozatok;
            megjelenitDolgozatok();
        })
        .catch(err => {
            console.error('Hiba a dolgozatok betöltésekor:', err);
        });
});
