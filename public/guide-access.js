document.addEventListener('DOMContentLoaded', () => {
    const accessForm = document.getElementById('accessForm');
    const accessCodeInput = document.getElementById('accessCodeInput');
    const errorMessage = document.getElementById('error-message');

    accessForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const accessCode = accessCodeInput.value.trim().toUpperCase();
        if (!accessCode) return;

        errorMessage.style.display = 'none';

        try {
            const response = await fetch(`/api/public/tour/${accessCode}`);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Server xətası');
            }
            
            // Tur məlumatını sessiya yaddaşında saxlayıb panelə yönləndiririk
            sessionStorage.setItem('current_tour_data', JSON.stringify(result));
            sessionStorage.setItem('current_tour_code', accessCode);
            window.location.href = '/guide.html';

        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        }
    });
});