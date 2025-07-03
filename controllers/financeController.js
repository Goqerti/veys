// controllers/financeController.js
const fileStore = require('../services/fileStore');
const { v4: uuidv4 } = require('uuid');

// Bütün maliyyə əməliyyatlarını gətirir
exports.getAllTransactions = (req, res) => {
    try {
        const transactions = fileStore.getTransactions();
        // Tarixə görə ən yenidən ən köhnəyə sıralayaq
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Əməliyyatları gətirərkən xəta baş verdi.' });
    }
};

// Yeni maliyyə əməliyyatı yaradır
exports.createTransaction = (req, res) => {
    try {
        const { type, date, amount, currency, category, description } = req.body;

        if (!type || !date || !amount || !currency || !category) {
            return res.status(400).json({ message: 'Bütün vacib sahələr doldurulmalıdır.' });
        }

        const newTransaction = {
            id: uuidv4(),
            type, // 'mədaxil' və ya 'məxaric'
            date,
            amount: parseFloat(amount),
            currency,
            category,
            description: description || '',
            createdBy: req.session.user.displayName,
            createdAt: new Date().toISOString()
        };

        fileStore.addTransaction(newTransaction);
        res.status(201).json({ message: 'Əməliyyat uğurla əlavə edildi.', transaction: newTransaction });

    } catch (error) {
        console.error("Əməliyyat yaradarkən xəta:", error);
        res.status(500).json({ message: 'Serverdə daxili xəta baş verdi.' });
    }
};