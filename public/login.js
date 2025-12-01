document.addEventListener("DOMContentLoaded", () => {
  const openRegister = document.getElementById("open-register-modal");
  const closeRegister = document.getElementById("close-register-modal");
  const registerContainer = document.getElementById("register-container");
  
  if (openRegister && closeRegister && registerContainer) {
    openRegister.addEventListener("click", (e) => {
      e.preventDefault();
      registerContainer.style.display = "block";
      document.getElementById("register-blur").style.display = "block";
    });
  
    closeRegister.addEventListener("click", () => {
      registerContainer.style.display = "none";
      document.getElementById("register-blur").style.display = "none";
    });
  }
  
  
    //Regisztráció kezelése
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', async function (event) {
        event.preventDefault();
  
        const nev = document.getElementById('reg-nev').value;
        const email = document.getElementById('reg-email').value;
        const jelszo = document.getElementById('reg-jelszo').value;
  
        try {
          const response = await fetch('/api/regisztracio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nev, email, jelszo })
          });
  
          if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('felhasznalo', JSON.stringify(data.felhasznalo));
            window.location.href = 'index.html';
          } else {
            const err = await response.json();
            document.getElementById('register-error').textContent = err.error || 'Hiba történt.';
            document.getElementById('register-error').style.display = 'block';
          }
        } catch (error) {
          console.error('Regisztrációs hiba:', error);
        }
      });
    }
  
    //Bejelentkezés
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
  
        const email = document.getElementById('email').value;
        const jelszo = document.getElementById('jelszo').value;
  
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, jelszo })
          });
  
          if (!response.ok) {
            document.getElementById('login-error').style.display = 'block';
            return;
          }
  
          const data = await response.json();
          localStorage.setItem('token', data.token);
          localStorage.setItem('felhasznalo', JSON.stringify(data.felhasznalo));
  
          window.location.href = 'index.html';
        } catch (error) {
          console.error('Hiba történt a bejelentkezés során:', error);
        }
      });
    }
  
    //Jelszó visszaállítás
    const forgotPasswordLink = document.getElementById("forgot-password-link");
    const closeResetModal = document.getElementById("close-reset-modal");
    const sendResetLink = document.getElementById("send-reset-link");
  
    if (forgotPasswordLink && closeResetModal && sendResetLink) {
      forgotPasswordLink.addEventListener("click", () => {
        document.getElementById("forgot-password-modal").style.display = "flex";
        document.getElementById("reset-blur").style.display = "block";
      });
  
      closeResetModal.addEventListener("click", () => {
        document.getElementById("forgot-password-modal").style.display = "none";
        document.getElementById("reset-blur").style.display = "none";
      });
  
      sendResetLink.addEventListener("click", async () => {
        const email = document.getElementById("reset-email").value;
        const feedback = document.getElementById("reset-feedback");
        feedback.style.display = "none";
  
        try {
          const res = await fetch("/api/reset-jelszo-kerelem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          });
  
          const data = await res.json();
          if (res.ok) {
            feedback.textContent = "Küldtünk egy jelszó-visszaállító linket.";
            feedback.style.color = "green";
          } else {
            feedback.textContent = data.error || "Hiba történt.";
            feedback.style.color = "red";
          }
          feedback.style.display = "block";
        } catch (error) {
          feedback.textContent = "Szerverhiba történt.";
          feedback.style.color = "red";
          feedback.style.display = "block";
        }
      });
    }
  
    //Elküldjük a regisztrációs e-mailt
    const regLinkGomb = document.getElementById("reg-link-gomb");
    if (regLinkGomb) {
      regLinkGomb.addEventListener("click", async () => {
        const email = document.getElementById("reg-email").value;
        if (!email) return alert("Kérlek, adj meg egy e-mail címet.");
  
        try {
            const response = await fetch("/api/emailes-regisztracio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          });
  
          const data = await response.json();
          alert(data.message);
        } catch (err) {
          console.error("Hiba történt a regisztrációs link küldésekor", err);
          alert("Hiba történt, próbáld újra.");
        }
      });
    }
  });
  