// controllers/userController.js
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const fileStore = require('../services/fileStore');
const telegram = require('../services/telegramService');

// --- Mail Service Setup ---
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: parseInt(process.env.EMAIL_PORT || "587") === 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// --- Authentication ---
exports.login = (req, res) => {
    const { username, password, department } = req.body;
    if (!username || !password || !department) {
        return res.redirect(`/login.html?error=generic&department=${department || ''}`);
    }

    const users = fileStore.getUsers();
    const user = users[username];

    // Addım 1: İstifadəçi adı yoxlanılır
    if (!user) {
        return res.redirect(`/login.html?error=1&department=${department}`); // Xəta 1: İstifadəçi tapılmadı
    }
    // Addım 2: Şifrə yoxlanılır
    if (!bcrypt.compareSync(password, user.password)) {
        return res.redirect(`/login.html?error=2&department=${department}`); // Xəta 2: Şifrə yanlışdır
    }
    // Addım 3: Şöbə yoxlanılır
    if (user.department !== department) {
        return res.redirect(`/login.html?error=3&department=${department}&expected=${user.department}`); // Xəta 3: Şöbə yanlışdır
    }

    // Uğurlu giriş: Sessiya məlumatlarını təyin et
    req.session.user = { 
        username, 
        role: user.role, 
        displayName: user.displayName,
        department: user.department
    };
    telegram.sendLog(telegram.formatLog(req.session.user, `sistemə (${department}) daxil oldu.`));

    // VACİB HİSSƏ: Sessiyanı məcburi yadda saxla və sonra yönləndir
    req.session.save(err => {
        if (err) {
            console.error('Session save error:', err);
            return res.redirect('/login.html?error=4'); // Xəta 4: Sessiya yadda saxlanmadı
        }
        // Uğurlu halda ana səhifəyə yönləndir
        res.redirect('/');
    });
};

exports.logout = (req, res) => {
    if (req.session.user) {
        telegram.sendLog(telegram.formatLog(req.session.user, 'sistemdən çıxış etdi.'));
    }
    req.session.destroy(err => {
        if (err) return res.redirect('/?logoutFailed=true');
        res.clearCookie('connect.sid');
        res.redirect('/login.html');
    });
};

exports.getCurrentUser = (req, res) => res.json(req.session.user);

// --- Password Reset ---
exports.forgotPassword = (req, res) => {
    const { username } = req.body;
    const users = fileStore.getUsers();
    const user = users[username];

    if (!user || !user.email) {
        return res.status(404).json({ message: "Bu istifadəçi adı ilə əlaqəli e-poçt ünvanı tapılmadı." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000;
    req.session.otpData = { username, otp, expires };

    const mailOptions = {
        from: `"Azerweys Admin Panel" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Şifrə Sıfırlama Kodu',
        html: `<p>Salam, ${user.displayName}.</p><p>Şifrənizi sıfırlamaq üçün təsdiq kodunuz: <b>${otp}</b></p><p>Bu kod 10 dəqiqə ərzində etibarlıdır.</p>`
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("!!! MAIL GÖNDƏRMƏ XƏTASI !!!\n", error);
            return res.status(500).json({ message: "OTP kodu göndərilərkən xəta baş verdi." });
        }
        res.status(200).json({ message: `Təsdiq kodu ${user.email} ünvanına göndərildi.` });
    });
};

exports.resetPassword = (req, res) => {
    const { username, otp, newPassword } = req.body;
    const otpData = req.session.otpData;

    if (!otpData || otpData.username !== username || otpData.otp !== otp) {
        return res.status(400).json({ message: "OTP kod yanlışdır." });
    }
    if (Date.now() > otpData.expires) {
        return res.status(400).json({ message: "OTP kodunun vaxtı bitib." });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "Yeni şifrə ən az 6 simvoldan ibarət olmalıdır." });
    }

    try {
        const users = fileStore.getUsers();
        if (!users[username]) return res.status(404).json({ message: "İstifadəçi tapılmadı." });
        
        const salt = bcrypt.genSaltSync(10);
        users[username].password = bcrypt.hashSync(newPassword, salt);
        
        fileStore.saveAllUsers(users);
        
        delete req.session.otpData;
        
        telegram.sendLog(telegram.formatLog({displayName: username, role: users[username].role}, `mail vasitəsilə şifrəsini yenilədi.`));
        res.status(200).json({ message: "Şifrəniz uğurla yeniləndi." });

    } catch (error) {
        res.status(500).json({ message: "Şifrə yenilənərkən server xətası baş verdi." });
    }
};

// --- User Management (Owner only) ---
exports.verifyOwner = (req, res) => {
    const { password } = req.body;
    const users = fileStore.getUsers();
    
    const ownerEntry = Object.entries(users).find(([_, u]) => u.role === 'owner');
    
    if (ownerEntry) {
        const [username, ownerData] = ownerEntry;
        if (bcrypt.compareSync(password, ownerData.password)) {
            req.session.isOwnerVerified = true;
            req.session.ownerUsername = username;
            return res.status(200).json({ success: true });
        }
    }
    
    res.status(401).json({ message: 'Parol yanlışdır' });
};

exports.loginAsOwner = (req, res) => {
    if (!req.session.isOwnerVerified || !req.session.ownerUsername) {
        return res.status(403).json({ message: 'İcazə yoxdur. Zəhmət olmasa, parolu yenidən daxil edin.' });
    }

    const { department } = req.body;
    if (!department) {
        return res.status(400).json({ message: 'Şöbə seçilməyib.' });
    }

    const users = fileStore.getUsers();
    const ownerUsername = req.session.ownerUsername;
    const ownerData = users[ownerUsername];

    if (!ownerData) {
        return res.status(404).json({ message: 'Owner hesabı tapılmadı.' });
    }

    req.session.user = {
        username: ownerUsername,
        role: ownerData.role,
        displayName: ownerData.displayName,
        department: department
    };
    
    req.session.save(err => {
        if (err) {
            console.error('Owner login session save error:', err);
            return res.status(500).json({ message: 'Sessiya yadda saxlanmadı.'});
        }
        telegram.sendLog(telegram.formatLog(req.session.user, `OWNER olaraq sistemə (${department}) daxil oldu.`));
        res.status(200).json({ success: true, message: 'Sistemə yönləndirilir...' });
    });
};

exports.createUser = (req, res) => {
    if (!req.session.isOwnerVerified) {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    const { username, password, displayName, email, role, department } = req.body;
    if (!username || !password || !displayName || !role || !email || !department) {
        return res.status(400).json({ message: 'Bütün xanaları doldurun.' });
    }
    try {
        const users = fileStore.getUsers();
        if (users[username]) {
            return res.status(409).json({ message: 'Bu istifadəçi adı artıq mövcuddur.' });
        }
        fileStore.addUser({ username, password, displayName, email, role, department });

        const permissions = fileStore.getPermissions();
        if (!permissions[role]) {
            permissions[role] = { canEditOrder: false, canEditFinancials: false, canDeleteOrder: false };
            fileStore.savePermissions(permissions);
        }
        
        telegram.sendLog(telegram.formatLog(req.session.user, `<b>${displayName} (${role})</b> adlı yeni istifadəçi (${department} şöbəsi) yaratdı.`));
        res.status(201).json({ message: 'Yeni istifadəçi uğurla yaradıldı!' });

    } catch (error) {
        console.error("İstifadəçi yaradarkən xəta:", error);
        res.status(500).json({ message: 'İstifadəçi yaradılarkən server xətası baş verdi.' });
    }
};

exports.getAllUsers = (req, res) => {
    if (req.session.user?.role !== 'owner') {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    const users = fileStore.getUsers();
    const safeUsers = Object.entries(users).map(([username, data]) => ({
        username,
        displayName: data.displayName,
        email: data.email,
        role: data.role,
        department: data.department
    }));
    res.json(safeUsers);
};

exports.updateUser = (req, res) => {
    if (req.session.user?.role !== 'owner') {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    const { username } = req.params;
    const { displayName, email, role, newPassword, department } = req.body;

    try {
        let users = fileStore.getUsers();
        if (!users[username]) {
            return res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
        }

        users[username].displayName = displayName || users[username].displayName;
        users[username].email = email || users[username].email;
        users[username].role = role || users[username].role;
        users[username].department = department || users[username].department;

        if (newPassword && newPassword.length >= 6) {
            const salt = bcrypt.genSaltSync(10);
            users[username].password = bcrypt.hashSync(newPassword, salt);
        }
        
        fileStore.saveAllUsers(users);
        telegram.sendLog(telegram.formatLog(req.session.user, `<b>${username}</b> adlı istifadəçinin məlumatlarını yenilədi.`));
        res.status(200).json({ message: 'İstifadəçi məlumatları yeniləndi.' });
    } catch (error) {
        res.status(500).json({ message: 'Server xətası baş verdi.' });
    }
};

exports.deleteUser = (req, res) => {
    if (req.session.user?.role !== 'owner') {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    const { username } = req.params;
    
    if (username === req.session.user.username) {
        return res.status(400).json({ message: 'Owner öz hesabını silə bilməz.' });
    }

    try {
        let users = fileStore.getUsers();
        if (!users[username]) {
            return res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
        }
        const deletedUserDisplayName = users[username].displayName;
        delete users[username];
        fileStore.saveAllUsers(users);
        telegram.sendLog(telegram.formatLog(req.session.user, `<b>${deletedUserDisplayName} (${username})</b> adlı istifadəçini sildi.`));
        res.status(200).json({ message: 'İstifadəçi silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Server xətası baş verdi.' });
    }
};