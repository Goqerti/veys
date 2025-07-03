// server.js (Düzəliş Edilmiş və Tam Versiya)
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const fileStore = require('./services/fileStore');
const apiRoutes = require('./routes/api');
const { requireLogin } = require('./middleware/authMiddleware');
const telegramService = require('./services/telegramService');
const { startBackupSchedule } = require('./services/telegramBackupService');

const app = express();
const PORT = process.env.PORT || 3000;

// Proxy arxasında (məsələn, Render, Heroku) işləyərkən sessiyaların düzgün çalışması üçün
app.set('trust proxy', 1); 

const sessionParser = session({
    secret: process.env.SESSION_SECRET || 'super-gizli-ve-unikal-acar-sozunuzu-bura-yazin-mutləq-dəyişin!',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // 'true' yalnız HTTPS-də işləyir
        httpOnly: true, 
        maxAge: 24 * 60 * 60 * 1000 
    }
});

app.use(sessionParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Təmir modunu yoxlayan middleware
app.use((req, res, next) => {
    const state = fileStore.getState();
    if (state.maintenance_mode && req.session.user?.role !== 'owner') { // Owner təmir rejiminə baxa bilər
        const allowedPaths = ['/api/status', '/login.html', '/style.css', '/forgot-password.html', '/reset-password.html'];
        if (allowedPaths.includes(req.path) || req.path.startsWith('/locales/') || req.path.endsWith('.js')) {
            return next();
        }
        return res.status(503).send('<html><head><title>Təmir</title><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; } .container { text-align: center; padding: 40px; background-color: #fff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); } h1 { color: #d9534f; } p { color: #555; }</style></head><body><div class="container"><h1>Sistemdə Təmir İşləri Aparılır</h1><p>Anlayışınız üçün təşəkkür edirik. Zəhmət olmasa bir az sonra yenidən cəhd edin.</p></div></body></html>');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', require('./controllers/userController').login);
app.get('/logout', require('./controllers/userController').logout);


// --- YENİLƏNMİŞ MARŞRUTLAR (ROUTES) ---

// Kök URL üçün yönləndirmə
app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        // Əgər istifadəçi giriş edibsə, onu öz şöbəsinin səhifəsinə yönləndir
        const department = req.session.user.department;
        if (department === 'altgoing') {
            res.redirect('/altgoing.html');
        } else {
            // "owner" və "incoming" üçün standart olaraq incoming səhifəsinə yönləndir
            res.redirect('/incoming.html');
        }
    } else {
        // Giriş etməyibsə, login səhifəsinə yönləndir
        res.redirect('/login.html');
    }
});

// Incoming səhifəsi
app.get('/incoming.html', requireLogin, (req, res) => {
    // Yalnız owner və ya incoming işçiləri bu səhifəyə baxa bilər
    if (req.session.user.role !== 'owner' && req.session.user.department !== 'incoming') {
        return res.status(403).send('Bu səhifəyə giriş icazəniz yoxdur.');
    }
    res.sendFile(path.join(__dirname, 'public', 'incoming.html'));
});

// Altgoing səhifəsi
app.get('/altgoing.html', requireLogin, (req, res) => {
    // Yalnız owner və ya altgoing işçiləri bu səhifəyə baxa bilər
    if (req.session.user.role !== 'owner' && req.session.user.department !== 'altgoing') {
        return res.status(403).send('Bu səhifəyə giriş icazəniz yoxdur.');
    }
    res.sendFile(path.join(__dirname, 'public', 'altgoing.html'));
});

app.get('/users', requireLogin, require('./middleware/authMiddleware').requireOwnerRole, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'users.html'));
});

// Finance səhifəsi
app.get('/finance', requireLogin, (req, res) => {
    // Gələcəkdə yalnız "finance" roluna icazə vermək üçün yoxlama əlavə edilə bilər
    if(req.session.user.role !== 'owner' && req.session.user.role !== 'finance') {
         return res.status(403).send('Bu səhifəyə giriş icazəniz yoxdur.');
    }
    res.sendFile(path.join(__dirname, 'public', 'finance.html'));
});

app.use('/api', apiRoutes);

// --- TƏTBİQİN BAŞLADILMASI VƏ WEBSOCKET ---

const initializeApp = () => {
    const filesToInit = ['sifarişlər.txt', 'users.txt', 'permissions.json', 'chat_history.txt', 'state.json', 'transactions.txt'];
    filesToInit.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (!fs.existsSync(filePath)) {
            let initialContent = '';
            if (file.endsWith('.json')) {
                initialContent = file === 'state.json' ? '{"maintenance_mode":false,"broadcast_message":null}' : '{}';
            }
            fs.writeFileSync(filePath, initialContent, 'utf-8');
            console.log(`Created missing file: ${file}`);
        }
    });
};

const server = app.listen(PORT, () => {
    initializeApp();
    console.log(`Server http://localhost:${PORT} ünvanında işləyir`);
});

const wss = new WebSocket.Server({ noServer: true });
const clients = new Map();

telegramService.setClientInfoFunction(() => clients.size);

wss.on('connection', (ws, request) => {
    const user = request.session.user;
    if (!user) { ws.close(); return; }
    const clientId = uuidv4();
    clients.set(clientId, { ws, user });
    console.log(`${user.displayName} chat-a qoşuldu. Aktiv istifadəçi sayı: ${clients.size}`);
    const history = fileStore.getChatHistory().slice(-50);
    ws.send(JSON.stringify({ type: 'history', data: history }));
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            const messageData = { id: uuidv4(), sender: user.displayName, role: user.role, text: parsedMessage.text, timestamp: new Date().toISOString() };
            fileStore.appendToChatHistory(messageData);
            for (const client of clients.values()) {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify({ type: 'message', data: messageData }));
                }
            }
        } catch (e) { console.error("Gələn mesaj parse edilə bilmədi:", e); }
    });
    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`${user.displayName} chat-dan ayrıldı. Aktiv istifadəçi sayı: ${clients.size}`);
    });
});

server.on('upgrade', (request, socket, head) => {
    sessionParser(request, {}, () => {
        if (!request.session.user) { socket.destroy(); return; }
        wss.handleUpgrade(request, socket, head, (ws) => { wss.emit('connection', ws, request); });
    });
});

const PING_URL = process.env.RENDER_EXTERNAL_URL;
if (PING_URL) {
    setInterval(() => {
        console.log("Pinging self to prevent sleep...");
        fetch(PING_URL).catch(err => console.error("Ping error:", err));
    }, 14 * 60 * 1000);
}

startBackupSchedule(2);