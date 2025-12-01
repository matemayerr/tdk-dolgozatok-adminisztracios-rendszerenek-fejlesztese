document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    const form = document.getElementById("complete-registration-form");
    const emailInput = document.getElementById("email");
    const hibaUzenet = document.getElementById("hiba-uzenet");

    // 1. Lekérjük a tokenhez tartozó e-mail címet
    try {
        const response = await fetch(`/api/regisztracios-email?token=${token}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Ismeretlen hiba");

        emailInput.value = data.email;
    } catch (err) {
        hibaUzenet.textContent = err.message;
        form.style.display = "none";
        return;
    }

    // 2. Form submit esemény
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nev = document.getElementById("nev").value;
        const jelszo = document.getElementById("jelszo").value;
        const jelszo2 = document.getElementById("jelszo2").value;

        if (jelszo !== jelszo2) {
            hibaUzenet.textContent = "A jelszavak nem egyeznek!";
            return;
        }

        try {
            const response = await fetch("/api/regisztracio-befejezes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, nev, jelszo })
            });

            const result = await response.json();

            if (response.ok) {
                alert("Sikeres regisztráció! Most már bejelentkezhetsz.");
                window.location.href = "/login.html";
            } else {
                hibaUzenet.textContent = result.error || "Hiba történt";
            }
        } catch (err) {
            hibaUzenet.textContent = "Szerverhiba történt.";
        }
    });
});
