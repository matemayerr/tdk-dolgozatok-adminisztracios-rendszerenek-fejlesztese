document.addEventListener("DOMContentLoaded", () => {
    const token = new URLSearchParams(window.location.search).get("token");
    const gomb = document.getElementById("jelszo-visszaallit-gomb");
    const uzenet = document.getElementById("reset-uzenet");
  
    gomb.addEventListener("click", async () => {
      const jelszo = document.getElementById("uj-jelszo").value;
      const jelszoIsmet = document.getElementById("uj-jelszo-ismet").value;
  
      if (!jelszo || jelszo !== jelszoIsmet) {
        uzenet.textContent = "A jelszavak nem egyeznek.";
        uzenet.style.color = "red";
        uzenet.style.display = "block";
        return;
      }
  
      try {
        const res = await fetch("/api/reset-jelszo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, jelszo })
        });
  
        const data = await res.json();
        if (res.ok) {
          uzenet.textContent = "A jelszavad sikeresen frissítve lett!";
          uzenet.style.color = "green";
        } else {
          uzenet.textContent = data.error || "Hiba történt.";
          uzenet.style.color = "red";
        }
        uzenet.style.display = "block";
      } catch (err) {
        uzenet.textContent = "Szerverhiba.";
        uzenet.style.color = "red";
        uzenet.style.display = "block";
      }
    });
  });
  