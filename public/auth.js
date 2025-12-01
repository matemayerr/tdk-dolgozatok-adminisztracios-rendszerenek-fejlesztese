// public/auth.js

// Kijelentkezés logika – több helyről is hívható
function doLogout() {
  console.log("🚪 Kijelentkezés...");
  localStorage.removeItem('token');
  localStorage.removeItem('felhasznalo');
  window.location.href = 'login.html';
}

// Admin menü láthatóságának beállítása
// ❗ CSak akkor rejtsük el, ha a felhasználó PONTOSAN egy csoportban van
// és az a 'hallgato'. Ha hallgato + temavezeto / biralo / bármi más, akkor lássa.
async function initAdminMenuVisibility() {
  const adminMenu = document.getElementById('menu-adminisztraciok');
  if (!adminMenu) return;

  const token = localStorage.getItem('token');

  if (!token) {
    adminMenu.style.display = 'none';
    return;
  }

  try {
    const res = await fetch('/api/felhasznalok/jelenlegi', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      adminMenu.style.display = 'none';
      return;
    }

    const user = await res.json();
    const csoportok = user.csoportok || [];

    const csakHallgato = (csoportok.length === 1 && csoportok[0] === 'hallgato');

    if (csakHallgato) {
      adminMenu.style.display = 'none';
    } else {
      // ha a nav elemeid flex-ben vannak, akkor:
      adminMenu.style.display = 'block'; // vagy 'flex', ahogy a navbarod használja
    }
  } catch (err) {
    console.error('Hiba a jelenlegi felhasználó lekérésekor:', err);
    adminMenu.style.display = 'none';
  }
}


// 🔹 MINDEN OLDALON: auth inicializálás
document.addEventListener('DOMContentLoaded', function () {
  const token = localStorage.getItem('token');
  const loginLink = document.getElementById('login-link');
  const logoutLink = document.getElementById('logout-link');

  // Ha nincs bejelentkezve, irány a login (kivéve, ha már ott van)
  if (!token && window.location.pathname !== '/login.html') {
    console.log("🔒 Nincs bejelentkezve - átirányítás a bejelentkezési oldalra");
    window.location.href = 'login.html';
    return;
  }

  // Kijelentkezés gomb kezelése
  if (logoutLink) {
    if (token) {
      logoutLink.style.display = 'block';
      logoutLink.style.visibility = 'visible';
    } else {
      logoutLink.style.display = 'none';
    }

    logoutLink.addEventListener('click', function (e) {
      e.preventDefault();
      doLogout();
    });
  } else {
    console.warn("⚠️ A kijelentkezés gomb nem található az oldalon!");
  }

  // Bejelentkezés link elrejtése, ha már be van jelentkezve
  if (loginLink) {
    if (token) {
      loginLink.style.display = 'none';
    } else {
      loginLink.style.display = 'block';
    }
  }

  // 👉 Admin menü elrejtése / megjelenítése szerepkör alapján
  initAdminMenuVisibility();
});
