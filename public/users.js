// public/users.js
document.addEventListener('DOMContentLoaded', () => {
    const usersTableBody = document.getElementById('usersTableBody');
    const editUserModal = document.getElementById('editUserModal');
    const editUserForm = document.getElementById('editUserForm');
    const closeModalBtn = editUserModal.querySelector('.close-button');

    const fetchAndRenderUsers = async () => {
        try {
            const response = await fetch('/api/users');
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'İstifadəçiləri yükləmək mümkün olmadı.');
            }
            const users = await response.json();
            renderUsersTable(users);
        } catch (error) {
            usersTableBody.innerHTML = `<tr><td colspan="6" class="error-message">${error.message}</td></tr>`;
        }
    };

    const renderUsersTable = (users) => {
        usersTableBody.innerHTML = '';
        users.forEach(user => {
            const row = usersTableBody.insertRow();
            row.insertCell().textContent = user.displayName;
            row.insertCell().textContent = user.username;
            row.insertCell().textContent = user.email;
            row.insertCell().textContent = user.role;
            row.insertCell().textContent = user.department; // Şöbəni cədvələ əlavə et
            
            const actionsCell = row.insertCell();
            const editButton = document.createElement('button');
            editButton.className = 'action-btn edit';
            editButton.innerHTML = '✏️';
            editButton.title = 'Düzəliş et';
            editButton.onclick = () => openEditModal(user);
            actionsCell.appendChild(editButton);

            // Owner rolundakı istifadəçinin silinməsinin qarşısını al
            if (user.role !== 'owner') {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'action-btn delete';
                deleteButton.innerHTML = '🗑️';
                deleteButton.title = 'Sil';
                deleteButton.onclick = () => deleteUser(user.username, user.displayName);
                actionsCell.appendChild(deleteButton);
            }
        });
    };

    const openEditModal = (user) => {
        document.getElementById('editUsernameHidden').value = user.username;
        document.getElementById('editDisplayName').value = user.displayName;
        document.getElementById('editEmail').value = user.email;
        document.getElementById('editRole').value = user.role;
        document.getElementById('editDepartment').value = user.department; // Modal açıldıqda şöbə seçimini doldur
        document.getElementById('editNewPassword').value = '';
        editUserModal.style.display = 'flex';
    };

    const deleteUser = async (username, displayName) => {
        if (!confirm(`'${displayName}' adlı istifadəçini silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.`)) {
            return;
        }
        try {
            const response = await fetch(`/api/users/${username}`, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message);
            }
            alert('İstifadəçi uğurla silindi.');
            fetchAndRenderUsers();
        } catch (error) {
            alert(`İstifadəçi silinərkən xəta baş verdi: ${error.message}`);
        }
    };

    closeModalBtn.addEventListener('click', () => editUserModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === editUserModal) {
            editUserModal.style.display = 'none';
        }
    });

    editUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('editUsernameHidden').value;
        const data = {
            displayName: document.getElementById('editDisplayName').value,
            email: document.getElementById('editEmail').value,
            role: document.getElementById('editRole').value,
            department: document.getElementById('editDepartment').value, // Formadan şöbə dəyərini al
            newPassword: document.getElementById('editNewPassword').value,
        };

        // Əgər parol boşdursa, serverə göndərmə
        if (!data.newPassword) {
            delete data.newPassword;
        }

        try {
            const response = await fetch(`/api/users/${username}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                 const err = await response.json();
                throw new Error(err.message);
            }
            alert('İstifadəçi məlumatları uğurla yeniləndi.');
            editUserModal.style.display = 'none';
            fetchAndRenderUsers();
        } catch(error) {
             alert(`Yeniləmə zamanı xəta: ${error.message}`);
        }
    });

    // Səhifə yüklənəndə istifadəçiləri çək
    fetchAndRenderUsers();
});