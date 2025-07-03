document.addEventListener('DOMContentLoaded', () => {
    const transactionForm = document.getElementById('transactionForm');
    const transactionsTableBody = document.getElementById('transactionsTableBody');
    const formMessage = document.getElementById('formMessage');

    // Əməliyyatları çəkib cədvələ yerləşdirən funksiya
    const fetchAndRenderTransactions = async () => {
        try {
            const response = await fetch('/api/finance/transactions');
            if (!response.ok) {
                throw new Error('Əməliyyatları yükləmək mümkün olmadı.');
            }
            const transactions = await response.json();
            renderTable(transactions);
        } catch (error) {
            transactionsTableBody.innerHTML = `<tr><td colspan="6" class="error-message">${error.message}</td></tr>`;
        }
    };

    // Cədvəli render edən funksiya
    const renderTable = (transactions) => {
        transactionsTableBody.innerHTML = '';
        if (transactions.length === 0) {
            transactionsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Heç bir əməliyyat tapılmadı.</td></tr>';
            return;
        }

        transactions.forEach(t => {
            const row = transactionsTableBody.insertRow();
            const amountCell = row.insertCell();
            
            row.insertCell().textContent = new Date(t.date).toLocaleDateString('az-AZ');
            row.insertCell().textContent = t.type;
            row.insertCell().textContent = t.category;
            row.insertCell().textContent = t.description;
            
            amountCell.textContent = `${t.amount.toFixed(2)} ${t.currency}`;
            amountCell.style.color = t.type === 'mədaxil' ? 'green' : 'red';
            amountCell.style.fontWeight = 'bold';

            row.insertCell().textContent = t.createdBy;
        });
    };

    // Forma submit olduqda
    transactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formMessage.textContent = '';

        const data = {
            type: document.getElementById('transType').value,
            date: document.getElementById('transDate').value,
            amount: document.getElementById('transAmount').value,
            currency: document.getElementById('transCurrency').value,
            category: document.getElementById('transCategory').value,
            description: document.getElementById('transDescription').value
        };

        try {
            const response = await fetch('/api/finance/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message);
            }

            formMessage.style.color = 'green';
            formMessage.textContent = result.message;
            transactionForm.reset();
            fetchAndRenderTransactions(); // Cədvəli yenilə

        } catch (error) {
            formMessage.style.color = 'red';
            formMessage.textContent = `Xəta: ${error.message}`;
        }
    });

    // Səhifə yüklənəndə ilk dəfə əməliyyatları çək
    fetchAndRenderTransactions();
});