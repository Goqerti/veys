// services/telegramService.js (Düzəliş Edilmiş və Tam Versiya)
const TelegramBot = require('node-telegram-bot-api');
const fileStore = require('./fileStore');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_CHAT_ID;
let bot;

const authenticatedUsers = new Set();
const userStates = {};

// Dairəvi asılılığı aradan qaldırmaq üçün funksiya qəbuledici
let getActiveUserCount = () => 0; 

if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log('Telegram bot service is active with polling.');
} else {
    console.warn('Telegram bot token is not configured.');
}

const sendLog = (message) => {
    if (bot && adminChatId) {
        bot.sendMessage(adminChatId, message, { parse_mode: 'HTML' }).catch(error => {
            console.error('Error sending Telegram log:', error.code, error.response?.body);
        });
    }
};

const formatLog = (user, action) => {
    const now = new Date();
    const date = now.toLocaleDateString('az-AZ');
    const time = now.toLocaleTimeString('az-AZ');
    const userName = user ? (user.displayName || user.username) : 'System';
    const userRole = user ? (user.role || 'N/A') : '';
    return `❗Diqqət:\n🚹 <b>İstifadəçi:</b> ${userName} (${userRole})\n⏳ <b>Tarix:</b> ${date}\n⏳ <b>Saat:</b> ${time}\n📝 <b>Hərəkət:</b> ${action}`;
};

if (bot) {
    bot.onText(/\/start/, (msg) => {
        const userId = msg.chat.id;
        if (authenticatedUsers.has(userId)) {
            sendMainMenu(userId);
        } else {
            userStates[userId] = { awaiting: 'password' };
            bot.sendMessage(userId, 'Sistemə daxil olmaq üçün "Owner" şifrəsini daxil edin:');
        }
    });

    bot.on('message', (msg) => {
        const userId = msg.chat.id;
        if (!msg.text || msg.text.startsWith('/start')) return;

        const currentState = userStates[userId]?.awaiting;

        if (currentState === 'password') {
            const password = msg.text;
            const users = fileStore.getUsers();
            const owner = Object.values(users).find(u => u.role === 'owner');
            if (owner && bcrypt.compareSync(password, owner.password)) {
                authenticatedUsers.add(userId);
                delete userStates[userId];
                bot.sendMessage(userId, `🎉 Xoş gəldiniz, ${owner.displayName}! Sistemə giriş uğurludur.`);
                sendMainMenu(userId);
            } else {
                bot.sendMessage(userId, '❌ Şifrə yanlışdır. Yenidən cəhd edin.');
            }
            return;
        }

        if (currentState === 'broadcast_message') {
            const broadcastMessage = msg.text;
            const state = fileStore.getState();
            state.broadcast_message = {
                id: Date.now(),
                text: broadcastMessage,
            };
            fileStore.saveState(state);
            delete userStates[userId];
            bot.sendMessage(userId, `✅ Mesajınız bütün aktiv istifadəçilərə anlıq bildiriş kimi göndəriləcək.`);
            return;
        }
    });

    bot.on('callback_query', (callbackQuery) => {
        const msg = callbackQuery.message;
        const userId = msg.chat.id;
        const data = callbackQuery.data;

        if (!authenticatedUsers.has(userId)) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Zəhmət olmasa, əvvəlcə /start yazaraq giriş edin.' });
            return;
        }

        switch (data) {
            case 'maintenance_toggle':
                toggleMaintenanceMode(userId, msg.message_id);
                break;
            case 'live_online':
                sendLiveUsers(userId);
                break;
            case 'get_database':
                sendDatabaseFiles(userId);
                break;
            case 'broadcast':
                askForBroadcastMessage(userId);
                break;
        }
        bot.answerCallbackQuery(callbackQuery.id);
    });

    function getMainMenuButtons() {
        const state = fileStore.getState();
        const maintenanceButtonText = state.maintenance_mode ? "Təmir Modunu Söndür 🟢" : "Təmir Modunu Aktiv Et 🔴";
        return {
            inline_keyboard: [
                [{ text: maintenanceButtonText, callback_data: 'maintenance_toggle' }],
                [{ text: 'Aktiv İstifadəçilər 👥', callback_data: 'live_online' }],
                [{ text: 'Məlumat Bazasını Yüklə 💾', callback_data: 'get_database' }],
                [{ text: 'Anlıq Bildiriş Göndər 📢', callback_data: 'broadcast' }]
            ]
        };
    }

    function sendMainMenu(userId) {
        bot.sendMessage(userId, 'Musa Admin Botuna xoş gəldiniz. Aşağıdakı menyudan seçim edin:', {
            reply_markup: getMainMenuButtons()
        });
    }

    function toggleMaintenanceMode(userId, messageId) {
        const state = fileStore.getState();
        state.maintenance_mode = !state.maintenance_mode;
        fileStore.saveState(state);
        
        const status = state.maintenance_mode ? "AKTİV EDİLDİ" : "SÖNDÜRÜLDÜ";
        bot.sendMessage(userId, `Təmir modu uğurla ${status}.`);
        bot.editMessageReplyMarkup(getMainMenuButtons(), { chat_id: userId, message_id: messageId });
    }

    function sendLiveUsers(userId) {
        const userCount = getActiveUserCount();
        bot.sendMessage(userId, `Hal-hazırda sistemdə ${userCount} aktiv istifadəçi var.`);
    }

    function sendDatabaseFiles(userId) {
        bot.sendMessage(userId, 'Məlumat bazası faylları hazırlanır...');
        bot.sendDocument(userId, path.join(__dirname, '..', 'sifarişlər.txt')).catch(err => bot.sendMessage(userId, `sifarişlər.txt göndərilə bilmədi: ${err.message}`));
        bot.sendDocument(userId, path.join(__dirname, '..', 'users.txt')).catch(err => bot.sendMessage(userId, `users.txt göndərilə bilmədi: ${err.message}`));
    }

    function askForBroadcastMessage(userId) {
        userStates[userId] = { awaiting: 'broadcast_message' };
        bot.sendMessage(userId, 'Zəhmət olmasa, bütün istifadəçilərə göndərmək istədiyiniz mesajı yazın:');
    }
}

module.exports = {
    sendLog,
    formatLog,
    bot,
    chatId: adminChatId,
    setClientInfoFunction: (func) => {
        getActiveUserCount = func;
    }
};