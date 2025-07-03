/**
 * Telegram Domino Oyunu Botu (Node.js)
 *
 * Bu bot, Telegram gruplarında sıra tabanlı bir domino oyunu oynamanızı sağlar.
 *
 * Nasıl Çalışır?
 * 1. Botu grubunuza ekleyin.
 * 2. Birisi oyunu başlatmak için `/domino` yazar.
 * 3. Diğer oyuncular "Oyuna Katıl" düğmesiyle katılır.
 * 4. Kurucu, "Oyunu Başlat" düğmesiyle oyunu başlatır.
 * 5. Bot, oyunculara taşlarını dağıtır ve ilk oyuncuyu belirler.
 * 6. Sırası gelen oyuncu, botun gönderdiği klavyeden oynamak istediği taşı seçer.
 * 7. Oyuncunun oynayacak taşı yoksa "Taş Çek" veya "Pas Geç" seçeneklerini kullanır.
 * 8. Elindeki taşları ilk bitiren oyuncu oyunu kazanır.
 */

const TelegramBot = require('node-telegram-bot-api');

// --- BOT AYARLARI ---
// TODO: Aşağıdaki token'ı kendi Telegram Bot Token'ınız ile değiştirin.
const TOKEN = '6720135042:AAE7Cnx-UTKY1RKpP9iJvc2xEMf3k3hF8o8';
const bot = new TelegramBot(TOKEN, { polling: true });

// Aktif oyunları ve durumlarını saklamak için bir nesne.
// Her anahtar, bir sohbet (grup) ID'sini temsil eder.
const games = {};

// --- DOMİNO OYUN MANTIĞI ---

/**
 * Standart bir 28'lik domino setini oluşturur.
 * @returns {Array<Array<number>>} Domino taşlarından oluşan bir dizi. Örn: [[0,0], [0,1], ...]
 */
function createDominoSet() {
    const tiles = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            tiles.push([i, j]);
        }
    }
    return tiles;
}

/**
 * Verilen bir diziyi karıştırır (Fisher-Yates algoritması).
 * @param {Array} array Karıştırılacak dizi.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Oyunun mevcut durumunu ve tahtayı gösteren bir metin mesajı oluşturur.
 * @param {object} game - Mevcut oyun nesnesi.
 * @returns {string} Oyun durumu metni.
 */
function getGameStatusText(game) {
    if (!game) return "Oyun bulunamadı.";

    let text = "--- DOMİNO OYUNU ---\n\n";
    text += "OYUN TAHTASI:\n";

    if (game.board.length === 0) {
        text += "Henüz taş oynanmadı.\n\n";
    } else {
        const boardString = game.board.map(tile => `[${tile[0]}|${tile[1]}]`).join(' - ');
        text += `${boardString}\n\n`;
    }

    text += "OYUNCULAR:\n";
    game.players.forEach(p => {
        const isCurrentPlayer = game.currentPlayerIndex !== null && game.players[game.currentPlayerIndex].id === p.id;
        text += `${isCurrentPlayer ? '➡️ ' : '👤 '}${p.username} (${p.hand.length} taş)\n`;
    });

    if (game.state === 'waiting') {
        text += "\nOyuncu bekleniyor... Kurucu oyunu başlatabilir.";
    } else if (game.state === 'finished') {
        const winner = game.players.find(p => p.id === game.winnerId);
        text += `\n\n🎉 OYUN BİTTİ! 🎉\nKazanan: ${winner.username}`;
    }

    return text;
}

/**
 * Sıradaki oyuncuya, oynaması için elindeki taşları ve diğer seçenekleri içeren bir inline klavye gönderir.
 * @param {number} chatId - Sohbet ID'si.
 * @param {object} player - Sıradaki oyuncu nesnesi.
 */
function sendPlayerTurnNotification(chatId, player) {
    const game = games[chatId];
    if (!game || !player) return;

    const handButtons = player.hand.map((tile, index) => {
        return {
            text: `[${tile[0]}|${tile[1]}]`,
            callback_data: `play:${chatId}:${index}`
        };
    });

    const actionButtons = [
        { text: 'Taş Çek', callback_data: `draw:${chatId}` },
        { text: 'Pas Geç', callback_data: `pass:${chatId}` }
    ];

    // Butonları satırlara bölmek için
    const keyboardRows = [];
    for (let i = 0; i < handButtons.length; i += 3) {
        keyboardRows.push(handButtons.slice(i, i + 3));
    }
    keyboardRows.push(actionButtons);


    bot.sendMessage(player.id, `Sıra sende! Oynamak için bir taş seç veya bir eylem gerçekleştir.\n\nTahta: ${game.board.map(t => `[${t[0]}|${t[1]}]`).join(' ')}`, {
        reply_markup: {
            inline_keyboard: keyboardRows
        }
    }).catch(error => {
        // Bot kullanıcıya özel mesaj gönderemiyorsa (kullanıcı botu engellemişse)
        console.error(`Kullanıcıya mesaj gönderilemedi: ${player.id}`, error.message);
        bot.sendMessage(chatId, `${player.username}, sıra sende ama sana özel mesaj gönderemiyorum. Lütfen bot ile sohbeti başlat ve tekrar dene.`);
    });
}


// --- BOT KOMUTLARI ---

// `/domino` komutu: Yeni bir oyun başlatır.
bot.onText(/\/domino/, (msg) => {
    const chatId = msg.chat.id;

    if (games[chatId] && games[chatId].state !== 'finished') {
        bot.sendMessage(chatId, "Bu sohbette zaten devam eden bir oyun var.");
        return;
    }

    games[chatId] = {
        state: 'waiting', // 'waiting', 'playing', 'finished'
        players: [],
        board: [],
        stock: [],
        currentPlayerIndex: null,
        starterId: msg.from.id, // Oyunu başlatan kişi
        messageId: null, // Oyun durumu mesajının ID'si
        ends: [] // Tahtanın iki ucu: [uç1, uç2]
    };

    const text = getGameStatusText(games[chatId]);

    bot.sendMessage(chatId, text, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Oyuna Katıl', callback_data: `join:${chatId}` },
                    { text: 'Oyunu Başlat', callback_data: `start:${chatId}` }
                ]
            ]
        }
    }).then(sentMessage => {
        games[chatId].messageId = sentMessage.message_id;
    });
});

// --- INLINE KLAVYE BUTON İŞLEMLERİ ---

bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const from = callbackQuery.from;
    const [action, chatIdStr, value] = callbackQuery.data.split(':');
    const chatId = parseInt(chatIdStr, 10);

    const game = games[chatId];
    if (!game) {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Bu oyun artık aktif değil.' });
        return;
    }

    // "Oyuna Katıl" butonu
    if (action === 'join') {
        if (game.state !== 'waiting') {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Oyun çoktan başladı!' });
            return;
        }
        if (game.players.find(p => p.id === from.id)) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Zaten oyundasın.' });
            return;
        }
        if (game.players.length >= 4) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Oyun dolu! (Maks. 4 oyuncu)' });
            return;
        }

        game.players.push({ id: from.id, username: from.first_name, hand: [] });
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Oyuna katıldın!' });

        const text = getGameStatusText(game);
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: game.messageId,
            reply_markup: msg.reply_markup
        });
    }

    // "Oyunu Başlat" butonu
    else if (action === 'start') {
        if (from.id !== game.starterId) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Sadece oyunu kuran kişi başlatabilir.' });
            return;
        }
        if (game.players.length < 2) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Oyunu başlatmak için en az 2 oyuncu gerekir.' });
            return;
        }
        if (game.state !== 'waiting') {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Oyun zaten başladı.' });
            return;
        }

        game.state = 'playing';
        game.stock = createDominoSet();
        shuffleArray(game.stock);

        // Taşları dağıt
        const tilesPerPlayer = game.players.length <= 2 ? 7 : 6;
        game.players.forEach(player => {
            player.hand = game.stock.splice(0, tilesPerPlayer);
        });

        // Başlangıç oyuncusunu bul (en yüksek çiftli taş)
        let startingPlayerIndex = -1;
        let highestDouble = -1;
        let startingTileIndex = -1;

        for (let i = 6; i >= 0; i--) {
            for (let p_idx = 0; p_idx < game.players.length; p_idx++) {
                const player = game.players[p_idx];
                const tile_idx = player.hand.findIndex(t => t[0] === i && t[1] === i);
                if (tile_idx !== -1) {
                    highestDouble = i;
                    startingPlayerIndex = p_idx;
                    startingTileIndex = tile_idx;
                    break;
                }
            }
            if (startingPlayerIndex !== -1) break;
        }

        // Kimsede çiftli yoksa, en yüksek taşla başla
        if (startingPlayerIndex === -1) {
             let highestTileValue = -1;
             for (let p_idx = 0; p_idx < game.players.length; p_idx++) {
                const player = game.players[p_idx];
                 for(let t_idx = 0; t_idx < player.hand.length; t_idx++){
                     const tileValue = player.hand[t_idx][0] + player.hand[t_idx][1];
                     if(tileValue > highestTileValue){
                         highestTileValue = tileValue;
                         startingPlayerIndex = p_idx;
                     }
                 }
             }
        }
        
        game.currentPlayerIndex = startingPlayerIndex;
        const startingPlayer = game.players[startingPlayerIndex];

        // Eğer başlangıç taşı çiftli ise, onu tahtaya koy
        if(startingTileIndex !== -1){
            const startingTile = startingPlayer.hand.splice(startingTileIndex, 1)[0];
            game.board.push(startingTile);
            game.ends = [startingTile[0], startingTile[1]];
            // Sıradaki oyuncuya geç
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        }


        // Oyun durumu mesajını güncelle
        const text = getGameStatusText(game);
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: game.messageId,
            reply_markup: {} // Butonları kaldır
        });
        
        bot.sendMessage(chatId, `${startingPlayer.username} oyuna başlıyor!`);
        
        // Sıradaki oyuncuya bildirim gönder
        const nextPlayer = game.players[game.currentPlayerIndex];
        sendPlayerTurnNotification(chatId, nextPlayer);
        bot.answerCallbackQuery(callbackQuery.id);
    }

    // "Taş Oyna" butonu
    else if (action === 'play') {
        const player = game.players[game.currentPlayerIndex];
        if (!player || from.id !== player.id) {
            bot.answerCallbackQuery(callbackQuery.id, { text: "Sıra sende değil!", show_alert: true });
            return;
        }

        const tileIndex = parseInt(value, 10);
        const tile = player.hand[tileIndex];
        let played = false;

        // Tahtanın boş olup olmadığını kontrol et
        if (game.board.length === 0) {
            game.board.push(tile);
            game.ends = [tile[0], tile[1]];
            played = true;
        } else {
            const [end1, end2] = game.ends;
            if (tile.includes(end1)) {
                // Taşı uc1'e ekle
                game.board.unshift(tile[0] === end1 ? [tile[1], tile[0]] : tile);
                game.ends[0] = tile[0] === end1 ? tile[1] : tile[0];
                played = true;
            } else if (tile.includes(end2)) {
                // Taşı uc2'ye ekle
                game.board.push(tile[0] === end2 ? tile : [tile[1], tile[0]]);
                game.ends[1] = tile[0] === end2 ? tile[1] : tile[0];
                played = true;
            }
        }

        if (played) {
            player.hand.splice(tileIndex, 1); // Oynanan taşı elden çıkar

            // Oyuncunun taşı bitti mi diye kontrol et
            if (player.hand.length === 0) {
                game.state = 'finished';
                game.winnerId = player.id;
                bot.answerCallbackQuery(callbackQuery.id, { text: `[${tile[0]}|${tile[1]}] oynadın!` });
                const text = getGameStatusText(game);
                bot.editMessageText(text, { chat_id: chatId, message_id: game.messageId });
                // Özel mesajdaki klavyeyi kaldır
                bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: from.id, message_id: msg.message_id });
                return;
            }

            // Sıradaki oyuncuya geç
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;

            bot.answerCallbackQuery(callbackQuery.id, { text: `[${tile[0]}|${tile[1]}] oynadın!` });
            
            // Grup mesajını ve oyuncu bildirimini güncelle
            const gameStatusText = getGameStatusText(game);
            bot.editMessageText(gameStatusText, { chat_id: chatId, message_id: game.messageId });
            
            // Özel mesajdaki klavyeyi kaldır
             bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: from.id, message_id: msg.message_id });

            const nextPlayer = game.players[game.currentPlayerIndex];
            sendPlayerTurnNotification(chatId, nextPlayer);

        } else {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Bu taşı oynayamazsın!', show_alert: true });
        }
    }

    // "Taş Çek" butonu
    else if (action === 'draw') {
        const player = game.players[game.currentPlayerIndex];
        if (!player || from.id !== player.id) {
            bot.answerCallbackQuery(callbackQuery.id, { text: "Sıra sende değil!", show_alert: true });
            return;
        }
        if (game.stock.length === 0) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Çekilecek taş kalmadı. Pas geçmelisin.', show_alert: true });
            return;
        }

        const newTile = game.stock.pop();
        player.hand.push(newTile);
        
        bot.answerCallbackQuery(callbackQuery.id, { text: `[${newTile[0]}|${newTile[1]}] çektin.` });

        // Oyuncu bildirimini yeni eliyle güncelle
        bot.deleteMessage(from.id, msg.message_id).catch(() => {}); // Eski mesajı sil
        sendPlayerTurnNotification(chatId, player); // Yenisini gönder

        // Grup mesajını güncelle (oyuncunun el sayısı değişti)
        const gameStatusText = getGameStatusText(game);
        bot.editMessageText(gameStatusText, { chat_id: chatId, message_id: game.messageId });
    }
    
    // "Pas Geç" butonu
    else if (action === 'pass') {
         const player = game.players[game.currentPlayerIndex];
        if (!player || from.id !== player.id) {
            bot.answerCallbackQuery(callbackQuery.id, { text: "Sıra sende değil!", show_alert: true });
            return;
        }

        // Oyuncunun gerçekten oynayacak taşı olup olmadığını kontrol et
        const [end1, end2] = game.ends;
        const hasPlayableTile = player.hand.some(tile => tile.includes(end1) || tile.includes(end2));

        if(game.board.length > 0 && hasPlayableTile){
             bot.answerCallbackQuery(callbackQuery.id, { text: 'Oynayabileceğin bir taş var!', show_alert: true });
             return;
        }
        
        if (game.stock.length > 0) {
             bot.answerCallbackQuery(callbackQuery.id, { text: 'Önce taş çekmelisin!', show_alert: true });
             return;
        }
        
        // Pas geçme işlemi
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Pas geçtin.' });
        
        bot.sendMessage(chatId, `${player.username} pas geçti.`);
        
        // Özel mesajdaki klavyeyi kaldır
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: from.id, message_id: msg.message_id });
        
        // Sıradaki oyuncuya bildirim gönder
        const nextPlayer = game.players[game.currentPlayerIndex];
        sendPlayerTurnNotification(chatId, nextPlayer);
    }
});


// Bot başlatıldığında konsola bilgi yazdır
bot.on('polling_error', console.error);
console.log('Domino Botu çalışıyor...');
