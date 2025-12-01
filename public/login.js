document.addEventListener("DOMContentLoaded", () => {
    const openRegister = document.getElementById("open-register-modal");
    const closeRegister = document.getElementById("close-register-modal");
    const loginContainer = document.getElementById("login-container");
    const registerContainer = document.getElementById("register-container");
  
    openRegister.addEventListener("click", (e) => {
      e.preventDefault();
      loginContainer.style.display = "none";
      registerContainer.style.display = "block";
    });
  
    closeRegister.addEventListener("click", () => {
      registerContainer.style.display = "none";
      loginContainer.style.display = "block";
    });
  });
  

// 🔹 Regisztráció kezelése
const registerForm = document.getElementById('register-form');
registerForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    const nev = document.getElementById('reg-nev').value;
    const neptun = document.getElementById('reg-neptun').value || null;
    const email = document.getElementById('reg-email').value;
    const jelszo = document.getElementById('reg-jelszo').value;

    try {
        const response = await fetch('/api/regisztracio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nev, neptun, email, jelszo })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('felhasznalo', JSON.stringify(data.felhasznalo));
            window.location.href = 'index.html'; // sikeres reg után bejelentkezés
        } else {
            const err = await response.json();
            document.getElementById('register-error').textContent = err.error || 'Hiba történt.';
            document.getElementById('register-error').style.display = 'block';
        }
    } catch (error) {
        console.error('Regisztrációs hiba:', error);
    }
});

    // Bejelentkezés
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const neptun = document.getElementById('neptun').value;
        const jelszo = document.getElementById('jelszo').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ neptun, jelszo })
            });

            
            if (!response.ok) {
                document.getElementById('login-error').style.display = 'block';
                return;
            }

            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('felhasznalo', JSON.stringify(data.felhasznalo));

            // Átirányítás a főoldalra
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Hiba történt a bejelentkezés során:', error);
        }
    });

