document.addEventListener('DOMContentLoaded', function () {
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
});

