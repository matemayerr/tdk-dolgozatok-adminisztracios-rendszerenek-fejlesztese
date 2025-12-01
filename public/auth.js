document.addEventListener('DOMContentLoaded', function () {
    const token = localStorage.getItem('token');
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');

    // Ha nincs bejelentkezve, irányítsa át a login.html-re (kivéve, ha már ott van)
    if (!token && window.location.pathname !== '/login.html') {
        console.log("🔒 Nincs bejelentkezve - átirányítás a bejelentkezési oldalra");
        window.location.href = 'login.html';
        return;
    }

    // Ha van kijelentkezés gomb, akkor jelenítsük meg bejelentkezve
    if (logoutLink) {
        if (token) {
            logoutLink.style.display = 'block';
            logoutLink.style.visibility = 'visible';
        } else {
            logoutLink.style.display = 'none';
        }

        logoutLink.addEventListener('click', function () {
            console.log("🚪 Kijelentkezés...");
            localStorage.removeItem('token');
            localStorage.removeItem('felhasznalo');
            window.location.href = 'login.html';
        });
    } else {
        console.warn("⚠️ A kijelentkezés gomb nem található az oldalon!");
    }

    // Ha van bejelentkezési gomb, rejtsük el ha be van jelentkezve
    if (loginLink) {
        if (token) {
            loginLink.style.display = 'none';
        } else {
            loginLink.style.display = 'block';
        }
    }
});

