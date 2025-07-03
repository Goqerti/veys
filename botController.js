/**
 * @file botController.js
 * Telegram botunun bütün interaktiv məntiqini idarə edir.
 * Bu fayl botun əmrlərini, mesajlarını və inline düymə (callback) sorğularını emal edir.
 */

const TelegramBot = require('node-telegram-bot-api');
const fileStore = require('./services/fileStore');
const { bot } = require('./services/telegramService');

// Admin şifrəsini .env faylından götürürük. Bu, təhlükəsizlik üçün vacibdir.
const BOT_ADMIN_PASSWORD = process.env.TELEGRAM_BOT_ADMIN_PASSWORD;

/**
 * Hər bir istifadəçinin bot ilə dialoq vəziyyətini yadda saxlayır.
 * Bu, çoxmərhələli əməliyyatlar (giriş, reklam göndərmə) üçün istifadə olunur.
 * @type {Map<number, {state: string, [key: string]: any}>}
 */
const userDialogStates = new Map();

// Əsas menyunun inline düymələrini bir obyektdə saxlayırıq.
const mainMenuKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🛠️ Təmir Rejimi (Aktiv/Deaktiv)', callback_data: 'toggle_maintenance' }],
            [{ text: '🟢 Live Online İstifadəçilər', callback_data: 'get_live_users' }],
            [{ text: '🗂️ Databazanı Göndər', callback_data: 'send_database' }],
            [{ text: '📢 Anlıq Reklam Göndər', callback_data: 'start_broadcast' }]
        ]
    }
};

/**
 * Botun bütün hadisə dinləyicilərini (event listeners) başladan əsas funksiya.
 * Bu funksiya server.js-dən çağırılmalıdır.
 * @param {() => number} getLiveUserCount - Aktiv istifadəçi sayını qaytaran funksiya.
 * @param {() => boolean} toggleMaintenanceMode - Təmir rejimini dəyişən funksiya.
 * @param {(message: string, target: string) => void} triggerBroadcast - Anlıq reklamı başlayan funksiya.
 */
function startBotListeners(getLiveUserCount, toggleMaintenanceMode, triggerBroadcast) {
    if (!bot) {
        console.warn('Telegram bot konfiqurasiya edilməyib. Bot dinləyiciləri aktiv deyil.');
        return;
    }

    // --- /start ƏMRİ ---
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userState = userDialogStates.get(chatId);

        if (userState && userState.state === 'authenticated') {
            bot.sendMessage(chatId, 'Menyuya xoş gəlmisiniz!', mainMenuKeyboard);
        } else {
            userDialogStates.set(chatId, { state: 'awaiting_password' });
            bot.sendMessage(chatId, 'Zəhmət olmasa, admin panelinə giriş üçün şifrəni daxil edin:');
        }
    });

    // --- MESAJLARIN EMALI ---
    bot.on('message', (msg) => {
        // Botun özünə göndərdiyi mesajları və ya əmrləri ignor et
        if (msg.text && msg.text.startsWith('/')) return;

        const chatId = msg.chat.id;
        const userState = userDialogStates.get(chatId);

        if (!userState) return;

        // 1. Şifrənin yoxlanılması
        if (userState.state === 'awaiting_password') {
            if (msg.text === BOT_ADMIN_PASSWORD) {
                userDialogStates.set(chatId, { state: 'authenticated' });
                bot.sendMessage(chatId, '✅ Giriş uğurludur! Xoş gəlmisiniz, Admin.', mainMenuKeyboard);
            } else {
                bot.sendMessage(chatId, '❌ Şifrə yanlışdır. Yenidən cəhd edin və ya /start yazaraq başlayın.');
            }
            return;
        }

        // 2. Anlıq reklam mətninin alınması
        if (userState.state === 'awaiting_broadcast_message') {
            const messageText = msg.text;
            userDialogStates.set(chatId, {
                state: 'awaiting_broadcast_target',
                message: messageText
            });

            const users = fileStore.getUsers();
            const userButtons = Object.keys(users).map(username => ([{
                text: users[username].displayName,
                callback_data: `broadcast_target_${username}`
            }]));

            bot.sendMessage(chatId, 'Bu mesajı kimə göndərmək istəyirsiniz?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ HƏRKƏSƏ GÖNDƏR', callback_data: 'broadcast_target_all' }],
                        ...userButtons,
                        [{ text: '❌ Ləğv Et', callback_data: 'cancel_broadcast' }]
                    ]
                }
            });
        }
    });

    // --- INLINE DÜYMƏLƏRİN (CALLBACK) EMALI ---
    bot.on('callback_query', (callbackQuery) => {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;

        // Yalnız autentifikasiya olmuş istifadəçilər davam edə bilər
        if (!userDialogStates.has(chatId) || userDialogStates.get(chatId).state !== 'authenticated') {
            const userState = userDialogStates.get(chatId);
            // Reklam prosesində olan istifadəçi üçün istisna
            if (!userState || userState.state !== 'awaiting_broadcast_target') {
                 bot.answerCallbackQuery(callbackQuery.id, { text: 'Bu əməliyyat üçün giriş etməlisiniz. Zəhmət olmasa /start yazın.' });
                 return;
            }
        }
        
        // Sadə callback sorğuları
        if (data === 'toggle_maintenance') {
            const newState = toggleMaintenanceMode();
            const statusText = newState ? 'AKTİVDİR' : 'DEAKTİVDİR';
            bot.answerCallbackQuery(callbackQuery.id, { text: `Təmir rejimi indi ${statusText}` });
            bot.sendMessage(chatId, `Sistem üçün təmir rejimi uğurla dəyişdirildi.\n\nHazırkı vəziyyət: **${statusText}**`, { parse_mode: 'Markdown' });

        } else if (data === 'get_live_users') {
            const userCount = getLiveUserCount();
            bot.answerCallbackQuery(callbackQuery.id, { text: `Hazırda sistemdə ${userCount} istifadəçi aktivdir.` });

        } else if (data === 'send_database') {
            bot.answerCallbackQuery(callbackQuery.id);
            bot.sendMessage(chatId, 'Fayllar hazırlanır və göndərilir...');
            bot.sendDocument(chatId, './sifarişlər.txt').catch(e => bot.sendMessage(chatId, `sifarişlər.txt göndərilərkən xəta: ${e.message}`));
            bot.sendDocument(chatId, './users.txt').catch(e => bot.sendMessage(chatId, `users.txt göndərilərkən xəta: ${e.message}`));
        
        } else if (data === 'start_broadcast') {
            userDialogStates.set(chatId, { state: 'awaiting_broadcast_message' });
            bot.editMessageText('Zəhmət olmasa, reklam üçün mətninizi daxil edin:', {
                 chat_id: chatId,
                 message_id: msg.message_id
            });
            bot.answerCallbackQuery(callbackQuery.id);
        
        } else if (data.startsWith('broadcast_target_')) {
            const target = data.replace('broadcast_target_', '');
            const broadcastData = userDialogStates.get(chatId);

            if (broadcastData && broadcastData.state === 'awaiting_broadcast_target') {
                triggerBroadcast(broadcastData.message, target);
                const targetName = target === 'all' ? 'bütün istifadəçilərə' : fileStore.getUsers()[target]?.displayName || target;
                bot.editMessageText(`✅ Mesajınız uğurla "${targetName}" hədəfinə göndərildi.`, {
                    chat_id: chatId,
                    message_id: msg.message_id
                });
                userDialogStates.set(chatId, { state: 'authenticated' }); // Vəziyyəti sıfırla
            }
             bot.answerCallbackQuery(callbackQuery.id);

        } else if (data === 'cancel_broadcast') {
            userDialogStates.set(chatId, { state: 'authenticated' });
            bot.editMessageText('Reklam göndərmə əməliyyatı ləğv edildi.', {
                 chat_id: chatId,
                 message_id: msg.message_id
            });
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Ləğv edildi' });
        }
    });

    console.log('✅ Telegram Bot Listeners has been successfully started.');
}

module.exports = { startBotListeners };