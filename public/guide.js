document.addEventListener('DOMContentLoaded', () => {
    const tourListContainer = document.getElementById('tour-list');
    const tourDataString = sessionStorage.getItem('current_tour_data');
    const tourCode = sessionStorage.getItem('current_tour_code');

    if (!tourDataString || !tourCode) {
        alert("Giriş üçün kod tələb olunur. Zəhmət olmasa, kodu daxil edin.");
        window.location.href = '/guide-access.html';
        return;
    }

    const tour = JSON.parse(tourDataString);
    renderTour(tour);

    function renderTour(tour) {
        tourListContainer.innerHTML = '';
        const tourCard = document.createElement('div');
        tourCard.className = 'tour-card';
        tourCard.id = `tour-${tour.satisNo}`;

        tourCard.innerHTML = `
            <div class="tour-header">
                <h2>${tour.turist} (#${tour.satisNo})</h2>
                <span class="tour-status status-${tour.tourStatus.replace(' ', '-')}">${tour.tourStatus}</span>
            </div>
            <div class="info-group">
                <label><i class="fas fa-users"></i> Qonaq Sayı</label>
                <p>${tour.adultGuests} Böyük, ${tour.childGuests} Uşaq</p>
                ${tour.touristPhone ? `<a href="tel:${tour.touristPhone}"><i class="fas fa-phone"></i> Turistlə Əlaqə</a>` : ''}
            </div>
            <div class="info-group">
                <label><i class="fas fa-hotel"></i> Otellər</label>
                <ul>${tour.hotels.map(h => `<li><strong>${h.otelAdi}</strong><br><small>Giriş: ${new Date(h.girisTarixi).toLocaleDateString('az-AZ')}</small>${h.address ? ` <a href="https://maps.google.com/?q=${encodeURIComponent(h.address)}" target="_blank" style="text-decoration: underline; font-size:0.9em;">(Xəritə)</a>` : ''}</li>`).join('')}</ul>
            </div>
            <div class="info-group">
                <label><i class="fas fa-route"></i> Tur Proqramı</label>
                <p>${tour.turTevsiri || 'Təyin edilməyib'}</p>
            </div>
        `;
        tourListContainer.appendChild(tourCard);
    }
});