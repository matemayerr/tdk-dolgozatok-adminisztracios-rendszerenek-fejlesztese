document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('upload-form');
    const feltoltottDolgozatokTbody = document.getElementById('feltoltott-dolgozatok-tbody');

    if (uploadForm) {
        uploadForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData();
            const fileInput = document.getElementById('dolgozat-file');
            const cím = document.getElementById('dolgozat-cim').value;

            formData.append('dolgozatFile', fileInput.files[0]);
            formData.append('cím', cím);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                addUploadedDolgozatToTable(cím, result.fájl);
            } else {
                console.error('Hiba történt a dolgozat feltöltése során');
            }
        });
    }

    function addUploadedDolgozatToTable(cím, fájl) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${cím}</td>
            <td><a href="/uploads/${fájl}" target="_blank">Megtekintés</a></td>
        `;
        feltoltottDolgozatokTbody.appendChild(tr);
    }
});

