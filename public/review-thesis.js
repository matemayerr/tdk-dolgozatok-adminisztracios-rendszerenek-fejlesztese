const id = window.location.pathname.split('/').pop();

fetch(`/api/dolgozatok/${id}`)
  .then(res => res.json())
  .then(data => {
    document.getElementById("title").innerText = data.cim;
    document.getElementById("hallgato").innerText = data.hallgato_nev;
    document.getElementById("neptun").innerText = data.neptun;
    document.getElementById("btn-view-pdf").addEventListener("click", () => {
      window.open(data.fileUrl, '_blank');
    });


    document.getElementById("btn-accept").addEventListener("click", () => {
  fetch(`/api/dolgozatok/${id}/temavezeto-nyilatkozat`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dontes: "elfogadva" })
  })
  .then(res => res.json())
  .then(updated => {
    alert("Dolgozat elfogadva");
    showStatus(updated.allapot);
  });
});

document.getElementById("btn-reject").addEventListener("click", () => {
  const indok = document.getElementById("indoklas").value;

  fetch(`/api/dolgozatok/${id}/temavezeto-nyilatkozat`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dontes: "elutasítva", elutasitas_oka: indok })
  })
  .then(res => res.json())
  .then(updated => {
    alert("Dolgozat elutasítva");
    showStatus(updated.allapot, updated.elutasitas_oka);
  });
});



    document.getElementById("btn-show-reject").addEventListener("click", () => {
      document.getElementById("reject-section").style.display = 'block';
    });

    document.getElementById("btn-reject").addEventListener("click", () => {
      const indok = document.getElementById("indoklas").value;
      fetch(`/dolgozatok/${id}/elfogadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dontes: "elutasit", indoklas: indok })
      }).then(() => alert("Dolgozat elutasítva"));
    });
  });


  function showStatus(allapot, elutasitasOka = '') {
  let statusElem = document.getElementById("status-eredmeny");
  if (!statusElem) {
    statusElem = document.createElement("p");
    statusElem.id = "status-eredmeny";
    document.body.appendChild(statusElem);
  }

  statusElem.innerHTML = `<strong>Állapot:</strong> ${allapot}`;

  if (allapot.includes('elutasítva') && elutasitasOka) {
    const indokElem = document.createElement("p");
    indokElem.innerHTML = `<strong>Elutasítás oka:</strong> ${elutasitasOka}`;
    document.body.appendChild(indokElem);
  }
}
