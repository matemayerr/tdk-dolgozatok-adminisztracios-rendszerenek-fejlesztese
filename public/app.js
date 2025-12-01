document.addEventListener('DOMContentLoaded', function () {
    const dolgozatForm = document.getElementById('uj-dolgozat-form');
    const dolgozatTbody = document.getElementById('dolgozat-tbody');
    const searchInput = document.getElementById('dolgozat-search-input');
    const paginationContainer = document.getElementById('dolgozat-pagination');
    const hallgatoSelect = document.getElementById('dolgozat-hallgato-id');
    const temavezetoSelect = document.getElementById('dolgozat-temavezeto-id');
    let dolgozatok = [];
    let currentPage = 1;
    let aktualisModositandoId = null;
    let itemsPerPage = 25;
    let loggedInUser = null; // 🔹 bejelentkezett felhasználó adatai


//sor kiválasztás
    const sorSzamSelect = document.getElementById('sorok-szama-dolgozat');
    if (sorSzamSelect) {
        sorSzamSelect.addEventListener('change', () => {
            const ertek = sorSzamSelect.value;
            if (ertek === 'all') {
                itemsPerPage = dolgozatok.length || 1000;
            } else {
                itemsPerPage = parseInt(ertek, 25);
            }
            currentPage = 1;
            megjelenitDolgozatok();
        });
    }


// Felhasználók betöltése csoportok szerint
async function betoltFelhasznalok() {
    try {
        const response = await fetch('/api/felhasznalok/csoportok');
        const { hallgatok, temavezetok } = await response.json();

        // Hallgató-listát itt már nem használjuk az ÚJ dolgozat formnál

        // Témavezetők betöltése (ez marad)
        const temavezetoLista = document.getElementById('temavezeto-lista');
        if (temavezetoLista) {
            temavezetoLista.innerHTML = temavezetok.map(t => `
                <label>
                    <input type="checkbox" value="${t.neptun}">
                    ${t.nev} (${t.neptun})
                </label>
            `).join('');
        }

    } catch (error) {
        console.error('Hiba történt a felhasználók betöltése során:', error);
    }
}


// Hallgatói kereső szűrés – most már opcionális, mert lehet, hogy nincs ilyen elem
const hallgatoKereso = document.getElementById('hallgato-kereso');
if (hallgatoKereso) {
    hallgatoKereso.addEventListener('input', function () {
        const keres = this.value.toLowerCase();
        document.querySelectorAll('#hallgato-lista label').forEach(label => {
            label.style.display = label.textContent.toLowerCase().includes(keres) ? '' : 'none';
        });
    });
}

// Témavezető kereső szűrés – itt is védekezünk, ha nincs input
const temavezetoKereso = document.getElementById('temavezeto-kereso');
if (temavezetoKereso) {
    temavezetoKereso.addEventListener('input', function () {
        const keres = this.value.toLowerCase();
        document.querySelectorAll('#temavezeto-lista label').forEach(label => {
            label.style.display = label.textContent.toLowerCase().includes(keres) ? '' : 'none';
        });
    });
}



    // Dolgozatok lekérdezése
    async function listazDolgozatok() {
        try {
            const response = await fetch('/api/papers');
            dolgozatok = await response.json();
            megjelenitDolgozatok();
        } catch (err) {
            console.error('Hiba történt a dolgozatok listázása során:', err);
        }
    }

// Dolgozatok megjelenítése
async function megjelenitDolgozatok() {
    const searchText = searchInput.value.toLowerCase();

    // Felhasználók nevének betöltése (lokálisan cache-elt)
    let felhasznalokNevek = {};
    try {
        const response = await fetch('/api/felhasznalok');
        const felhasznalok = await response.json();
        felhasznalok.forEach(f => {
            felhasznalokNevek[f.neptun] = f.nev;
        });
    } catch (error) {
        console.error("Nem sikerült lekérni a felhasználókat", error);
    }


    // Szűrés a keresőszöveg alapján
const filteredDolgozatok = dolgozatok.filter(dolgozat => {
    const cim = (dolgozat.cim || dolgozat.cím || '').toLowerCase();
    const allapot = dolgozat.allapot?.toLowerCase() || '';
    const temavezetoNev = (dolgozat.temavezeto || [])
        .map(t => (t.nev || '').toLowerCase()).join(' ');
    const hallgatokNevek = (dolgozat.szerzok || [])
        .map(s => (s.nev || '').toLowerCase()).join(' ');

    return cim.includes(searchText)
        || allapot.includes(searchText)
        || temavezetoNev.includes(searchText)
        || hallgatokNevek.includes(searchText);
});

    const start = (currentPage - 1) * itemsPerPage;
    const paginatedDolgozatok = filteredDolgozatok.slice(start, start + itemsPerPage);
    
    dolgozatTbody.innerHTML = '';
    paginatedDolgozatok.forEach(dolgozat => {
        const roviditettCim = dolgozat.cim || dolgozat.cím
        
        /* .length > 110 ? dolgozat.cim.substring(0, 110) + '...' : dolgozat.cim; */
        
        const tr = document.createElement('tr');
        tr.dataset.id = dolgozat._id;
        tr.innerHTML = `
        <td class="clickable-title" onclick="toggleDetails('${dolgozat._id}')">
    <div class="cim-es-ikon">
        <span class="cim-szoveg" title="${dolgozat.cim || dolgozat.cím}">${roviditettCim}</span>
        <span class="toggle-icon" id="toggle-icon-${dolgozat._id}">▼</span>
    </div>
</td>


</td>   
    <td>${dolgozat.allapot || 'N/A'}</td>
    <td>
        <button class="modosit-btn" onclick="editDolgozat('${dolgozat._id}')">Módosítás</button>
        <button class="delete-btn" onclick="deleteDolgozat('${dolgozat._id}')">Törlés</button>
    </td>
`;

const detailTr = document.createElement('tr');
detailTr.classList.add('dolgozat-details-row');
detailTr.id = `details-${dolgozat._id}`;
detailTr.style.display = 'none';   // 🔹 alapból legyen rejtve a SOR

detailTr.innerHTML = `
  <td colspan="3">
    <div class="dolgozat-details-panel">

      <p class="dolgozat-leiras">
        <span class="leiras-cimke">Tartalmi összefoglaló:</span><br>
        <span class="leiras-szoveg">${dolgozat.leiras || '—'}</span>
      </p>

      <p><strong>Hallgatók:</strong> ${
        (dolgozat.szerzok || []).map(s => `${s.nev} (${s.neptun})`).join(', ') || '—'
      }</p>

      <p><strong>Témavezetők:</strong> ${
        (dolgozat.temavezeto || []).map(t => `${t.nev} (${t.neptun})`).join(', ') || '—'
      }</p>

    </div>
  </td>
`;



dolgozatTbody.appendChild(tr);        // A dolgozat fő sora felül
dolgozatTbody.appendChild(detailTr);  // Először a részletek jönnek alulra

    });

    frissitPaginacio(filteredDolgozatok.length);
}


// Új dolgozat hozzáadása
if (dolgozatForm) {
  dolgozatForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!loggedInUser || !loggedInUser.neptun) {
      alert('Nem sikerült azonosítani a bejelentkezett hallgatót. Jelentkezz be újra!');
      return;
    }

    const selectedTemavezetok = Array
      .from(document.querySelectorAll('#temavezeto-lista input[type="checkbox"]:checked'))
      .map(cb => cb.value);

    if (selectedTemavezetok.length === 0) {
      alert('Válassz legalább egy témavezetőt!');
      return;
    }

    const cim = document.getElementById('dolgozat-cim').value.trim();
    const leiras = document.getElementById('dolgozat-leiras').value.trim();

    if (!cim || !leiras) {
      alert('Kérlek, töltsd ki a címet és az összefoglalót!');
      return;
    }

    const formData = {
      cím: cim,
      leiras,
      hallgato_ids: [loggedInUser.neptun],
      temavezeto_ids: selectedTemavezetok
    };

    try {
      const response = await fetch('/api/dolgozatok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const ujDolgozat = await response.json();
        console.log('Sikeres POST:', ujDolgozat);

        // ⬇️ EZ A LÉNYEG: frissítsd a listát a /api/papers-ből
        await listazDolgozatok();

        dolgozatForm.reset();
        document.getElementById('uj-dolgozat-form').style.display = 'none';
        document.getElementById('homalyositas').style.display = 'none';
      } else {
        console.error('Hiba történt a dolgozat hozzáadása során');
      }
    } catch (error) {
      console.error('Hiba történt a dolgozat mentése során:', error);
    }
  });
}

    // Dolgozat szerkesztése
    window.editDolgozat = async function (id) {
    aktualisModositandoId = id;
    const dolgozat = dolgozatok.find(d => d._id === id);
    if (!dolgozat) {
        console.error('Nem találom a dolgozatot:', id);
        return;
    }

    // Inputmezők feltöltése
    document.getElementById('modosit-dolgozat-cim').value = dolgozat.cim || dolgozat.cím || '';
    document.getElementById('modosit-dolgozat-leiras').value = dolgozat.leiras || '';
    document.getElementById('modosit-allapot').value = dolgozat.allapot || 'benyújtva';

    // Felhasználók lekérése
    const response = await fetch('/api/felhasznalok');
    const felhasznalok = await response.json();
    const hallgatok = felhasznalok.filter(f => (f.csoportok || []).includes('hallgato'));
    const temavezetok = felhasznalok.filter(f => (f.csoportok || []).includes('temavezeto'));

    // ✅ Dolgozat hallgató- és témavezető Neptun-kódjai a frontend objektumból
    const dolgozatHallgatoNeptunok = (dolgozat.szerzok || [])
        .map(s => s.neptun)
        .filter(Boolean);

    const dolgozatTemavezetoNeptunok = (dolgozat.temavezeto || [])
        .map(t => t.neptun)
        .filter(Boolean);

    // Hallgatók listája (előre kipipálva)
    const hallgatoLista = document.getElementById('modosit-hallgato-lista');
    hallgatoLista.innerHTML = hallgatok.map(h => `
        <label>
            <input type="checkbox" value="${h.neptun}"
                ${dolgozatHallgatoNeptunok.includes(h.neptun) ? 'checked' : ''}>
            ${h.nev} (${h.neptun})
        </label>
    `).join('');

    // Témavezetők listája (előre kipipálva)
    const temavezetoLista = document.getElementById('modosit-temavezeto-lista');
    temavezetoLista.innerHTML = temavezetok.map(t => `
        <label>
            <input type="checkbox" value="${t.neptun}"
                ${dolgozatTemavezetoNeptunok.includes(t.neptun) ? 'checked' : ''}>
            ${t.nev} (${t.neptun})
        </label>
    `).join('');

    // Modal megjelenítése
    document.getElementById('modosit-dolgozat-form').style.display = 'block';
    document.getElementById('homalyositas').style.display = 'block';
};

    


    // Dolgozat mentése szerkesztés után
    document.getElementById('modosit-megse-gomb').addEventListener('click', () => {
        document.getElementById('modosit-dolgozat-form').style.display = 'none';
        document.getElementById('homalyositas').style.display = 'none';
    });    
    
    document.getElementById('modosit-mentes-gomb').addEventListener('click', async () => {
        const cim = document.getElementById('modosit-dolgozat-cim').value;
        const leiras = document.getElementById('modosit-dolgozat-leiras').value;
        const allapot = document.getElementById('modosit-allapot').value;
        const hallgato_ids = Array.from(document.querySelectorAll('#modosit-hallgato-lista input[type="checkbox"]:checked')).map(cb => cb.value);
        const temavezeto_ids = Array.from(document.querySelectorAll('#modosit-temavezeto-lista input[type="checkbox"]:checked')).map(cb => cb.value);

        if (!cim || !leiras || !hallgato_ids.length || !temavezeto_ids.length) {
            alert('Minden mező kitöltése kötelező!');
            return;
        }
        
        const formData = {
            cím: cim,
            leiras: leiras,
            hallgato_ids,
            temavezeto_ids,
            allapot
        };

    
        try {
            const response = await fetch(`/api/dolgozatok/${aktualisModositandoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
    
            if (response.ok) {
                document.getElementById('modosit-dolgozat-modal').style.display = 'none';
                document.getElementById('modosit-homalyositas').style.display = 'none';
                listazDolgozatok(); // újralistázás
            } else {
                console.error('Hiba történt a mentésnél.');
            }
        } catch (err) {
            console.error('Mentési hiba:', err);
        }
    });
    

    // Dolgozat törlése
    window.deleteDolgozat = async function (id) {
        if (confirm("Biztosan törölni szeretnéd ezt a dolgozatot?")) {
            try {
                const response = await fetch(`/api/dolgozatok/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    dolgozatok = dolgozatok.filter(d => d._id !== id);
                    megjelenitDolgozatok();
                } else {
                    console.error('Hiba történt a dolgozat törlése során');
                }
            } catch (error) {
                console.error('Hiba történt a törlés során:', error);
            }
        }
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

    // Kereső megjelenítése/elrejtése
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
   searchInput.addEventListener('input', () => {
    currentPage = 1;
    megjelenitDolgozatok();
});

    
    const ujDolgozatGomb = document.getElementById('uj-dolgozat-gomb');
const ujDolgozatForm = document.getElementById('uj-dolgozat-form');
const homalyositas = document.getElementById('homalyositas');
const megseGomb = document.getElementById('megse-gomb');

ujDolgozatGomb.addEventListener('click', () => {
    ujDolgozatForm.style.display = 'block';
    homalyositas.style.display = 'block';
});

megseGomb.addEventListener('click', () => {
    ujDolgozatForm.style.display = 'none';
    homalyositas.style.display = 'none';
});

async function betoltAktualisFelhasznalo() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.warn('Nincs token, nem tudom betölteni a bejelentkezett felhasználót.');
        return;
    }

    try {
        const res = await fetch('/api/felhasznalok/jelenlegi', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            console.error('Nem sikerült betölteni a bejelentkezett felhasználót.');
            return;
        }

        loggedInUser = await res.json();

        const nevSpan = document.getElementById('aktualis-hallgato-nev');
        if (nevSpan && loggedInUser.nev) {
            const neptun = loggedInUser.neptun || 'nincs Neptun-kód';
            nevSpan.textContent = `${loggedInUser.nev} (${neptun})`;
        }
    } catch (err) {
        console.error('Hiba az aktuális felhasználó lekérésekor:', err);
    }
}


    // Indításkor: bejelentkezett felhasználó, dolgozatok, témavezetők
    betoltAktualisFelhasznalo();
    listazDolgozatok();
    betoltFelhasznalok();
});


// Lebegő menü dropdownok kezeléséhez
document.querySelectorAll('.dropdown-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
        e.stopPropagation();  // Ne záródjon be
        const dropdown = this.parentElement;
        dropdown.classList.toggle('active');
    });
});

// Ne zárja be a menüt, ha a felhasználó a checkboxra vagy radiogombra kattint
document.querySelectorAll('.user-dropdown .dropdown-content').forEach(content => {
    content.addEventListener('click', function (e) {
        e.stopPropagation(); // Ne terjedjen fel
    });
});

// Ha ESC-et nyom a felhasználó, bezárja az összeset (opcionális)
document.addEventListener('keydown', function (e) {
    if (e.key === "Escape") {
        document.querySelectorAll('.user-dropdown').forEach(drop => drop.classList.remove('active'));
    }
});


// Ha a felhasználó máshova kattint, zárjuk be a dropdownokat
document.addEventListener('click', () => {
    document.querySelectorAll('.user-dropdown').forEach(drop => drop.classList.remove('active'));
});

window.toggleDetails = function (dolgozatId) {
  const detailRow = document.getElementById(`details-${dolgozatId}`);
  const icon = document.getElementById(`toggle-icon-${dolgozatId}`);

  if (!detailRow) return;
  const isVisible = detailRow.style.display === 'table-row';
  detailRow.style.display = isVisible ? 'none' : 'table-row';
  if (icon) icon.textContent = isVisible ? '▼' : '▲';
};

    // ─────────────────────────────
    // TÉMAVEZETŐ MODAL LOGIKA
    // ─────────────────────────────
    const temavezetoModal = document.getElementById('temavezeto-modal');
    const temavezetoOpenBtn = document.getElementById('temavezeto-open-modal');
    const temavezetoMentesBtn = document.getElementById('temavezeto-mentes-gomb');
    const temavezetoMegseBtn = document.getElementById('temavezeto-megse-gomb');
    const temavezetoKivonat = document.getElementById('temavezeto-kivonat');

    // Modal megnyitása
    if (temavezetoOpenBtn && temavezetoModal) {
        temavezetoOpenBtn.addEventListener('click', () => {
            temavezetoModal.style.display = 'block';
            if (homalyositas) homalyositas.style.display = 'block';
        });
    }

    // Mégse gomb
    if (temavezetoMegseBtn && temavezetoModal) {
        temavezetoMegseBtn.addEventListener('click', () => {
            temavezetoModal.style.display = 'none';
            if (homalyositas) homalyositas.style.display = 'none';
        });
    }

    // OK gomb – kivonat frissítése
    if (temavezetoMentesBtn && temavezetoModal) {
        temavezetoMentesBtn.addEventListener('click', () => {
            const selected = Array.from(
                document.querySelectorAll('#temavezeto-lista input[type="checkbox"]:checked')
            );

            if (selected.length === 0) {
                temavezetoKivonat.textContent = 'Nincs kiválasztott témavezető.';
            } else {
                const nevek = selected.map(cb => cb.parentElement.textContent.trim());
                temavezetoKivonat.textContent = nevek.join(', ');
            }

            temavezetoModal.style.display = 'none';
            if (homalyositas) homalyositas.style.display = 'none';
        });
    }




