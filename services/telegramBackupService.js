// services/telegramBackupService.js
const fs = require('fs');
const path = require('path');
const telegramService = require('./telegramService');

const bot = telegramService.bot;
const chatId = telegramService.chatId;

// Göndəriləcək faylların siyahısı
const filesToBackup = [
    { name: 'users.txt', path: path.join(__dirname, '..', 'users.txt') },
    { name: 'sifarişlər.txt', path: path.join(__dirname, '..', 'sifarişlər.txt') }
];

/**
 * Faylları bir-bir Telegram-a göndərən funksiya.
 */
const sendBackupFiles = () => {
    console.log('Running scheduled task: Sending backup files to Telegram...');

    filesToBackup.forEach(fileInfo => {
        if (fs.existsSync(fileInfo.path)) {
            bot.sendDocument(chatId, fileInfo.path)
                .then(() => {
                    console.log(`✅ ${fileInfo.name} successfully sent to Telegram.`);
                })
                .catch(error => {
                    console.error(`❌ Error sending ${fileInfo.name} to Telegram:`, error.code, error.response?.body);
                });
        } else {
            console.warn(`⚠️ Scheduled task warning: File not found at ${fileInfo.path}`);
        }
    });
};

/**
 * Planlanmış görevi başladan əsas funksiya.
 * @param {number} intervalMinutes - Göndərmə intervalı (dəqiqə ilə).
 */
const startBackupSchedule = (intervalMinutes = 10) => {
    if (!bot || !chatId) {
        console.warn('⚠️ Scheduled task for Telegram is not active because bot token or chat ID is not configured.');
        return;
    }

    const intervalMilliseconds = intervalMinutes * 60 * 1000;

    // Faylları dərhal ilk dəfə göndər
    sendBackupFiles(); 
    
    // Sonra müəyyən edilmiş interval ilə göndərməyə davam et
    setInterval(sendBackupFiles, intervalMilliseconds);

    console.log(`✅ Scheduled task for sending files to Telegram is active. It will run every ${intervalMinutes} minutes.`);
};

module.exports = { startBackupSchedule };
