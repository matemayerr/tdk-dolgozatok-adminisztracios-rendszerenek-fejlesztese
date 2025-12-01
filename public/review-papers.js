document.addEventListener('DOMContentLoaded', function () {
    const tabla = document.getElementById("dolgozatokTabla");
    const searchInput = document.getElementById('search-input');
    const sorokSzamaSelect = document.getElementById('items-per-page');

    let dolgozatok = [];
    let filteredDolgozatok = [];
    let currentPage = 1;
    let itemsPerPage = 25;

    // 🔹 Bejelentkezett felhasználó (bíráló / admin / hallgató stb.)
    let currentUser = null;
    let isStudentUser = false;

    // Név + Neptun formázása: "Mayer Máté (AQAWC1)"
    function formatUser(u) {
        if (!u) return '';
        const nev = u.nev || '';
        const neptun = u.neptun || '';
        if (nev && neptun) return `${nev} (${neptun})`;
        return nev || neptun || '';
    }

    // 🔹 Aktuális felhasználó lekérése (JWT alapján)
    async function loadCurrentUser() {
        const token = localStorage.getItem('token');
        if (!token) return null;

        try {
            const res = await fetch('/api/felhasznalok/jelenlegi', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) return null;
            return await res.json();   // várható: { _id, nev, csoportok: [...] , ... }
        } catch (err) {
            console.error('Hiba a jelenlegi felhasználó lekérésekor:', err);
            return null;
        }
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

            // 🔹 Elfogadott bírálók és elkészült bírálatok száma
            const osszesElfogadott = dolgozat.reviewCounter
                ? dolgozat.reviewCounter.osszesElfogadottBiralo
                : (dolgozat.biralok || []).filter(b => b.allapot === 'Elfogadva').length;

            const befejezett = dolgozat.reviewCounter
                ? dolgozat.reviewCounter.befejezettBiralat
                : ((dolgozat.ertekelesek || []).length > 0 ? (dolgozat.ertekelesek || []).length : 0);

            const biralatStatusz = osszesElfogadott > 0
                ? `${befejezett}/${osszesElfogadott}`
                : '-';

            const nagyElteres = !!dolgozat.nagyElteres12;

            // 🔹 Van-e legalább egy bármilyen értékelés?
            const vanLegalabbEgyErtekeles =
                (dolgozat.ertekelesek && dolgozat.ertekelesek.length > 0) ||
                (dolgozat.ertekeles && Object.keys(dolgozat.ertekeles).length > 0);

            // 🔹 Művelet gomb (Bírálás / Megtekintés / -)
            let gomb = '-';

            if (!currentUser) {
                // Ha nincs bejelentkezett user (vagy hiba volt), régi alaplogika:
                const vanErtekeles = dolgozat.ertekeles && Object.keys(dolgozat.ertekeles).length > 0;
                gomb = vanErtekeles
                    ? `<a href="import_form.html?id=${dolgozat._id}&readonly=true" class="modosit-btn">Megtekintés</a>`
                    : `<a href="import_form.html?id=${dolgozat._id}" class="jelentkezes-btn">Bírálás</a>`;
            } else {
                const currentUserId = String(currentUser._id || currentUser.id || '');
                const biraloQuery = `&biraloId=${encodeURIComponent(currentUserId)}`;

                if (isStudentUser) {
                    // 🔹 HALLGATÓI FELHASZNÁLÓ
                    // Hallgató NEM bírálhat, csak megtekinthet,
                    // és csak akkor, ha már van legalább egy bírálat.
                    if (vanLegalabbEgyErtekeles) {
                        gomb = `<a href="import_form.html?id=${dolgozat._id}&readonly=true&student=1" class="modosit-btn">Megtekintés</a>`;
                    } else {
                        gomb = '-';
                    }
                } else {
                    // 🔹 NEM HALLGATÓ (bíráló / admin / egyéb)
                    // Saját bírálói bejegyzés keresése
                    const sajatBiraloEntry = (dolgozat.biralok || []).find(b => {
                        const biraloId =
                            b.felhasznaloId ||
                            b.id ||
                            (b.felhasznalo && (b.felhasznalo._id || b.felhasznalo.id));
                        return String(biraloId || '') === currentUserId;
                    });

                    const sajatElfogadva = sajatBiraloEntry && sajatBiraloEntry.allapot === 'Elfogadva';

                    // Van-e saját értékelésünk?
                    const sajatErtekelesMegvan = (dolgozat.ertekelesek || []).some(e => {
                        const ertekeloId = e.biraloId || e.biralo || e.biralo_id;
                        return String(ertekeloId || '') === currentUserId;
                    });

                    if (sajatElfogadva && !sajatErtekelesMegvan) {
                        // 👉 Elfogadott bíráló, de még nincs saját bírálata → BÍRÁLÁS
                        gomb = `<a href="import_form.html?id=${dolgozat._id}${biraloQuery}" class="jelentkezes-btn">Bírálás</a>`;
                    } else if (sajatErtekelesMegvan) {
                        // 👉 Van saját bírálat → saját űrlap MEGTEKINTÉSE
                        gomb = `<a href="import_form.html?id=${dolgozat._id}&readonly=true${biraloQuery}" class="modosit-btn">Megtekintés</a>`;
                    } else if (vanLegalabbEgyErtekeles) {
                        // 👉 Van már bármilyen bírálat, de nem tőled – általános megtekintés
                        gomb = `<a href="import_form.html?id=${dolgozat._id}&readonly=true" class="modosit-btn">Megtekintés</a>`;
                    } else {
                        // Nincs elfogadott bírálói státusz és nincs értékelés sem
                        // (pl. admin, aki még nem csinált semmit) → régi szokás szerint Bírálás engedhető,
                        // de már biraloId-vel, hogy hozzád kötődjön a bírálat
                        gomb = `<a href="import_form.html?id=${dolgozat._id}${biraloQuery}" class="jelentkezes-btn">Bírálás</a>`;
                    }
                }
            }

            foSor.innerHTML = `
                <td>
                    <span class="clickable-title">
                        <span class="cim-szoveg">${dolgozat.cim}</span>
                        <span class="toggle-arrow">▼</span>
                    </span>
                </td>
                <td>${dolgozat.allapot || '-'}</td>
                <td>
                    ${biralatStatusz}
                    ${nagyElteres ? '<span style="margin-left:6px;color:#c00;font-size:0.8rem;">⚠ nagy eltérés</span>' : ''}
                </td>
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

    // 🔹 Inicializálás: aktuális user + dolgozatok betöltése
    (async () => {
        currentUser = await loadCurrentUser();

        if (currentUser && Array.isArray(currentUser.csoportok)) {
            const csoportok = currentUser.csoportok;

            // csak akkor hallgatói nézet, ha tényleg CSAK hallgato/hallgató csoportja van
            const tartalmazHallgatot =
                csoportok.includes('hallgato') ||
                csoportok.includes('hallgató');

            const csakHallgato =
                csoportok.every(c => c === 'hallgato' || c === 'hallgató');

            isStudentUser = tartalmazHallgatot && csakHallgato;
        }

        fetch('/api/papers')
            .then(res => res.json())
            .then(adatok => {
                // Csak az értékeléshez kapcsolódó állapotú dolgozatok
                const baseReviewStates = [
                    'elfogadva - témavezető által',
                    'bírálat alatt',
                    'bírálva'
                ];

                // 🔹 Hallgatók csak a "bírálva" állapotú dolgozatokat látják
                const allowedStates = isStudentUser
                    ? ['bírálva']
                    : baseReviewStates;

                dolgozatok = adatok.filter(d => allowedStates.includes(d.allapot));
                filteredDolgozatok = dolgozatok;
                megjelenitDolgozatok();
            })
            .catch(err => {
                console.error('Hiba a dolgozatok betöltésekor:', err);
            });
    })();
});
