document.addEventListener('DOMContentLoaded', function () {
    const tabla = document.getElementById("dolgozatokTabla");
    const searchInput = document.getElementById('search-input');
    const sorokSzamaSelect = document.getElementById('items-per-page');

    let dolgozatok = [];
    let filteredDolgozatok = [];
    let currentPage = 1;
    let itemsPerPage = 25;

    function megjelenitDolgozatok() {
        tabla.innerHTML = "";

        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = itemsPerPage === 'összes' ? filteredDolgozatok.length : startIndex + itemsPerPage;

        filteredDolgozatok.slice(startIndex, endIndex).forEach(dolgozat => {
            const sor = document.createElement("tr");

            // Ha már van értékelés mentve, akkor "Megtekintés", különben "Értékelés"
            const vanErtekeles = dolgozat.ertekeles && Object.keys(dolgozat.ertekeles).length > 0;
            const gomb = vanErtekeles
                ? `<a href="import_form.html?id=${dolgozat._id}&readonly=true" class="custom-button view-button">Megtekintés</a>`
                : `<a href="import_form.html?id=${dolgozat._id}" class="custom-button eval-button">Értékelés</a>`;

            sor.innerHTML = `
                <td>${dolgozat.cim}</td>
                <td>${dolgozat.szerzok?.map(s => s.nev).join(", ") || '-'}</td>
                <td>${dolgozat.temavezeto?.map(t => t.nev).join(", ") || '-'}</td>
                <td>${dolgozat.allapot || '-'}</td>
                <td>${gomb}</td>
`;


            tabla.appendChild(sor);
        });
    }

    function searchDolgozatok() {
        const keresett = searchInput.value.toLowerCase();
        filteredDolgozatok = dolgozatok.filter(d =>
            d.cim.toLowerCase().includes(keresett) ||
            (d.szerzok && d.szerzok.some(s => s.nev.toLowerCase().includes(keresett))) ||
            (d.temavezeto && d.temavezeto.nev.toLowerCase().includes(keresett))
        );
        currentPage = 1;
        megjelenitDolgozatok();
    }

    function frissitItemsPerPage() {
        const valasztott = sorokSzamaSelect.value;
        itemsPerPage = valasztott === 'összes' ? 'összes' : parseInt(valasztott);
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
