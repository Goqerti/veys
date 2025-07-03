// routes/api.js (Bütün Düzəlişlər Edilmiş Final Versiya)
const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const permissionController = require('../controllers/permissionController');
const orderController = require('../controllers/orderController');
const musicController = require('../controllers/musicController');
const financeController = require('../controllers/financeController'); // YENİ
const { requireLogin, requireOwnerRole } = require('../middleware/authMiddleware');


// --- Status & Broadcast (STABİL VERSİYA) ---
router.get('/status', (req, res) => {
    const state = require('../services/fileStore').getState();
    res.json({ maintenance_mode: state.maintenance_mode });
});

router.get('/broadcast/active', (req, res) => {
    const state = require('../services/fileStore').getState();
    if (state.broadcast_message && state.broadcast_message.id) {
        // Sessiyada 'seen_broadcasts' siyahısı var mı və bu ID-ni ehtiva edir mi yoxlayırıq.
        if (req.session.seen_broadcasts && req.session.seen_broadcasts.includes(state.broadcast_message.id)) {
            return res.json(null); // Artıq görülüb, boş cavab qaytar.
        }
        return res.json(state.broadcast_message); // Görülməyib, bildirişi göndər.
    }
    res.json(null); // Aktiv bildiriş yoxdur.
});

router.post('/broadcast/seen', (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ message: 'ID tələb olunur.' });
    }
    
    // Sessiyada 'seen_broadcasts' siyahısı yoxdursa, boş bir siyahı yaradırıq.
    if (!Array.isArray(req.session.seen_broadcasts)) {
        req.session.seen_broadcasts = [];
    }
    
    // Əgər bu ID artıq siyahıda yoxdursa, əlavə edirik.
    if (!req.session.seen_broadcasts.includes(id)) {
        req.session.seen_broadcasts.push(id);
    }
    
    // Sessiyanı məcburi olaraq yadda saxlayırıq ki, dəyişikliklər dərhal qeydə alınsın.
    req.session.save((err) => {
        if (err) {
            console.error('Sessiyanı yadda saxlayarkən xəta:', err);
            return res.status(500).json({ message: 'Sessiya yadda saxlanılmadı.' });
        }
        res.status(200).json({ message: 'Görüldü olaraq qeyd edildi.' });
    });
});


// YENİ, SESSİYASIZ ENDPOINTLƏR (permissions.html üçün)
router.post('/permissions/get-by-password', permissionController.getPermissionsByPassword);
router.put('/permissions/save-by-password', permissionController.savePermissionsByPassword);


// --- Public routes (no login required) ---
router.post('/verify-owner', userController.verifyOwner);
router.post('/login-as-owner', userController.loginAsOwner); // Owner girişi üçün
router.post('/users/create', userController.createUser);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// BƏLƏDÇİ GİRİŞİ ÜÇÜN PUBLIC ROUTE
router.get('/public/tour/:accessCode', orderController.getTourByAccessCode);


// --- Authenticated routes (login required) ---
router.use(requireLogin);

// User & Permissions
router.get('/user/me', userController.getCurrentUser);
router.get('/user/permissions', permissionController.getUserPermissions);
router.get('/permissions', requireOwnerRole, permissionController.getAllPermissions);
router.put('/permissions', requireOwnerRole, permissionController.updateAllPermissions);

// User Management (Owner only)
router.get('/users', requireOwnerRole, userController.getAllUsers);
router.put('/users/:username', requireOwnerRole, userController.updateUser);
router.delete('/users/:username', requireOwnerRole, userController.deleteUser);

// Orders
router.get('/orders', orderController.getAllOrders);
router.post('/orders', orderController.createOrder);
router.put('/orders/:satisNo', orderController.updateOrder);
router.delete('/orders/:satisNo', orderController.deleteOrder);
router.put('/orders/:satisNo/note', orderController.updateOrderNote);
router.get('/orders/search/rez/:rezNomresi', orderController.searchOrderByRezNo);

// Other resources
router.get('/reservations', orderController.getReservations);
router.get('/reports', orderController.getReports);
router.get('/debts', orderController.getDebts);
router.get('/notifications', orderController.getNotifications);

// Music (New)
router.get('/music/play', musicController.playSong);

// Finance (YENİ)
router.get('/finance/transactions', financeController.getAllTransactions);
router.post('/finance/transactions', financeController.createTransaction);


module.exports = router;