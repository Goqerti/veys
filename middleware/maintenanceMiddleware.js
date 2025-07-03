/**
 * @file maintenanceMiddleware.js
 * Bütün daxil olan sorğuları yoxlayaraq sistemin təmir rejimində olub-olmadığını təyin edir.
 * Əgər rejim aktivdirsə, istifadəçiyə müvafiq mesaj göstərərək sorğuları bloklayır.
 */

// Fayl sistemindən sistemin vəziyyətini oxumaq üçün fileStore servisini import edirik.
const fileStore = require('../services/fileStore');

module.exports = (req, res, next) => {
    // system_state.json faylından hazırkı vəziyyəti oxuyuruq.
    const state = fileStore.getSystemState();
    
    // Əgər "maintenance_mode" aktivdirsə (true-dursa):
    if (state && state.maintenance_mode) {
        
        // Sorğu API üçün göndərilibsə (məsələn, /api/orders), JSON formatında xəta qaytarırıq.
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(503).json({ 
                message: 'Sistemdə təmir işləri aparılır. Zəhmət olmasa, daha sonra yenidən cəhd edin.' 
            });
        }
        
        // Sorğu adi bir səhifə üçün göndərilibsə (məsələn, ana səhifə), brauzerdə göstərmək üçün HTML mesajı qaytarırıq.
        return res.send(
            '<h1 style="font-family: sans-serif; text-align: center; margin-top: 50px;">Sistemdə təmir işləri aparılır. Anlayışınız üçün təşəkkür edirik.</h1>'
        );
    }
    
    // Əgər təmir rejimi aktiv deyilsə, heç bir müdaxilə etmirik və sorğunun növbəti mərhələyə keçməsinə icazə veririk.
    next();
};