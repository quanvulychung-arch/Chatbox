/**
 * HỘI QUÁN NÉT - CHATBOX CORE ENGINE (V3.1 - Cloud History Retention & Sync)
 * - Tự động tải và đồng bộ toàn bộ lịch sử tin nhắn cho người mới vào
 * - MQTT Retained Cloud Storage + Peer State Gossip
 * - Tin nhắn mới nhất nằm ở TRÊN CÙNG
 * - Đăng ký / Đăng nhập thành viên
 * - Đầy đủ lệnh quản trị: /clear (xóa sạch đám mây), /notice, /ban, /unban, /prune
 */

// Global State
let currentUser = null;
let registeredUsers = {};
let messagesList = [];
let activeCloudPresence = new Map();
let soundEnabled = true;
let bannedUsers = new Set();
let mqttClient = null;
const CLIENT_ID = 'hqn_' + Math.random().toString(36).substr(2, 9);

// MQTT Topics
const TOPIC_MESSAGES = 'hoiquannet_global_chat_v3/messages';
const TOPIC_HISTORY = 'hoiquannet_global_chat_v3/history'; // Retained Cloud Storage
const TOPIC_SYNC = 'hoiquannet_global_chat_v3/sync'; // P2P Peer Sync
const TOPIC_PRESENCE = 'hoiquannet_global_chat_v3/presence';
const TOPIC_ADMIN = 'hoiquannet_global_chat_v3/admin';

// Default Admin Password
const DEFAULT_ADMIN_PASSWORD = "admin123";

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
    initUserAccounts();
    initEmojiGrid();
    setupColorPicker();

    // Check current tab session
    loadCurrentSession();
    updateAuthUI();

    // Start Realtime Cloud Engine
    initRealtimeEngine();

    // Keydown in chat input (Enter to send)
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('chatForm').dispatchEvent(new Event('submit'));
        }
    });

    // Close emoji picker on outside click
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('emojiPickerPanel');
        if (!e.target.closest('.input-container') && !e.target.closest('.tb-btn')) {
            panel.style.display = 'none';
        }
    });

    // Heartbeat for presence across all browsers & devices
    setInterval(sendPresenceHeartbeat, 3000);
    setInterval(cleanStalePresence, 4000);
});

// ================= USER DATABASE & AUTH SYSTEM =================
function initUserAccounts() {
    const saved = localStorage.getItem('hoiquannet_accounts');
    if (saved) {
        try {
            registeredUsers = JSON.parse(saved);
        } catch (e) {
            registeredUsers = {};
        }
    }

    // Default Admin Account
    if (!registeredUsers['admin']) {
        registeredUsers['admin'] = {
            username: 'Admin',
            password: DEFAULT_ADMIN_PASSWORD,
            role: 'admin',
            color: '#d63031',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin',
            isAdmin: true
        };
        saveAccounts();
    }
}

function saveAccounts() {
    localStorage.setItem('hoiquannet_accounts', JSON.stringify(registeredUsers));
}

function loadCurrentSession() {
    const session = sessionStorage.getItem('hoiquannet_current_session');
    if (session) {
        try {
            currentUser = JSON.parse(session);
        } catch (e) {
            currentUser = null;
        }
    }
}

function saveCurrentSession(user) {
    currentUser = user;
    if (user) {
        sessionStorage.setItem('hoiquannet_current_session', JSON.stringify(user));
    } else {
        sessionStorage.removeItem('hoiquannet_current_session');
    }
    updateAuthUI();
    sendPresenceHeartbeat();
}

function updateAuthUI() {
    const authContainer = document.getElementById('authHeaderContainer');
    const currentUserTag = document.getElementById('currentUserTag');
    const chatInput = document.getElementById('chatInput');

    if (currentUser) {
        const adminBadge = currentUser.isAdmin ? '<i class="fa-solid fa-crown" style="color: #f1c40f;" title="Admin"></i> ' : '';
        authContainer.innerHTML = `
            <div class="user-logged-info">
                <img src="${currentUser.avatar}" class="user-logged-avatar" alt="avatar">
                <span style="font-weight: 700; color: ${currentUser.color};">${adminBadge}${escapeHTML(currentUser.username)}</span>
                <button class="btn btn-danger" style="padding: 3px 8px; font-size: 11px; margin-left: 6px;" onclick="handleLogout()" title="Đăng xuất">
                    <i class="fa-solid fa-right-from-bracket"></i> Đăng xuất
                </button>
            </div>
        `;

        currentUserTag.innerHTML = `Đang chat: <b style="color: ${currentUser.color}">${adminBadge}${escapeHTML(currentUser.username)}</b>`;
        chatInput.placeholder = "Gõ tiếng Việt có dấu, không rao vặt trên chatbox...";
    } else {
        authContainer.innerHTML = `
            <button class="btn btn-primary" onclick="openAuthModal('login')"><i class="fa-solid fa-right-to-bracket"></i> Đăng nhập</button>
            <button class="btn btn-outline" onclick="openAuthModal('register')"><i class="fa-solid fa-user-plus"></i> Đăng ký</button>
        `;

        currentUserTag.innerHTML = `<span style="color: #e74c3c;"><i class="fa-solid fa-circle-exclamation"></i> Chưa đăng nhập</span>`;
        chatInput.placeholder = "Vui lòng đăng nhập hoặc đăng ký để gửi tin nhắn...";
    }

    renderOnlineUsers();
    renderMessages();
}

// ================= AUTH MODAL HANDLING =================
let currentAuthMode = 'login';

function openAuthModal(mode = 'login') {
    switchAuthTab(mode);
    document.getElementById('authErrorMsg').style.display = 'none';
    document.getElementById('authModal').classList.add('active');
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    const title = document.getElementById('authModalTitle');
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabRegister = document.getElementById('tabRegisterBtn');
    const confirmPassGroup = document.getElementById('confirmPassGroup');
    const userColorGroup = document.getElementById('userColorGroup');
    const submitBtn = document.getElementById('authSubmitBtn');
    const errorMsg = document.getElementById('authErrorMsg');

    errorMsg.style.display = 'none';

    if (mode === 'login') {
        title.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Đăng nhập';
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        confirmPassGroup.style.display = 'none';
        userColorGroup.style.display = 'none';
        submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Đăng nhập';
    } else {
        title.innerHTML = '<i class="fa-solid fa-user-plus"></i> Đăng ký thành viên';
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        confirmPassGroup.style.display = 'block';
        userColorGroup.style.display = 'block';
        submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Hoàn tất đăng ký';
    }
}

function handleAuthSubmit(e) {
    e.preventDefault();
    initUserAccounts();

    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const lowerUser = username.toLowerCase();

    if (!username || !password) {
        showAuthError('Vui lòng nhập đầy đủ tên tài khoản và mật khẩu!');
        return;
    }

    if (currentAuthMode === 'login') {
        // LOGIN
        const account = registeredUsers[lowerUser];
        if (!account) {
            showAuthError('Tên tài khoản không tồn tại!');
            return;
        }
        if (account.password !== password) {
            showAuthError('Mật khẩu không chính xác!');
            return;
        }

        saveCurrentSession(account);
        closeModal('authModal');
    } else {
        // REGISTER
        const confirmPass = document.getElementById('authPasswordConfirm').value;
        const color = document.getElementById('authColor').value;

        if (password.length < 3) {
            showAuthError('Mật khẩu phải có ít nhất 3 ký tự!');
            return;
        }

        if (password !== confirmPass) {
            showAuthError('Mật khẩu xác nhận không trùng khớp!');
            return;
        }

        if (registeredUsers[lowerUser]) {
            showAuthError('Tên tài khoản này đã được sử dụng! Vui lòng chọn tên khác.');
            return;
        }

        const newAccount = {
            username: username,
            password: password,
            role: 'member',
            color: color || '#006699',
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`,
            isAdmin: false
        };

        registeredUsers[lowerUser] = newAccount;
        saveAccounts();
        saveCurrentSession(newAccount);
        closeModal('authModal');
    }
}

function showAuthError(msg) {
    const el = document.getElementById('authErrorMsg');
    el.textContent = msg;
    el.style.display = 'block';
}

function handleLogout() {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        saveCurrentSession(null);
    }
}

function setupColorPicker() {
    const colorInput = document.getElementById('authColor');
    const preview = document.getElementById('authColorPreview');
    if (colorInput && preview) {
        colorInput.addEventListener('input', (e) => {
            preview.textContent = e.target.value;
        });
    }
}

// ================= REALTIME ENGINE WITH CLOUD STORAGE =================
function initRealtimeEngine() {
    // 1. Load cached local messages first
    const cached = localStorage.getItem('hoiquannet_clean_messages');
    if (cached) {
        try {
            messagesList = JSON.parse(cached);
        } catch (e) {
            messagesList = [];
        }
    }
    renderMessages();

    // 2. Connect to Public High-Speed Secure MQTT WebSocket Broker
    if (typeof mqtt !== 'undefined') {
        const brokerUrl = 'wss://broker.emqx.io:8084/mqtt';
        const modeLabel = document.getElementById('modeLabel');

        try {
            mqttClient = mqtt.connect(brokerUrl, {
                clientId: CLIENT_ID,
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 3000
            });

            mqttClient.on('connect', () => {
                if (modeLabel) {
                    modeLabel.textContent = "Hệ thống sẵn sàng";
                    modeLabel.style.background = "#dcfce7";
                    modeLabel.style.color = "#166534";
                }

                // Subscribe to all topics (including RETAINED HISTORY)
                mqttClient.subscribe(TOPIC_MESSAGES, { qos: 1 });
                mqttClient.subscribe(TOPIC_HISTORY, { qos: 1 });
                mqttClient.subscribe(TOPIC_SYNC, { qos: 1 });
                mqttClient.subscribe(TOPIC_PRESENCE, { qos: 0 });
                mqttClient.subscribe(TOPIC_ADMIN, { qos: 1 });

                // Request Peer Sync from live active clients
                requestPeerHistorySync();

                // Announce presence immediately
                sendPresenceHeartbeat();
            });

            mqttClient.on('message', (topic, message) => {
                try {
                    const text = message.toString();
                    if (!text) return;
                    const data = JSON.parse(text);
                    handleIncomingCloudData(topic, data);
                } catch (e) {
                    console.error('MQTT payload parse error:', e);
                }
            });

            mqttClient.on('error', (err) => {
                console.warn('MQTT connection warning:', err);
            });
        } catch (err) {
            console.warn('MQTT Init fallback:', err);
        }
    }
}

function handleIncomingCloudData(topic, data) {
    if (topic === TOPIC_HISTORY) {
        // Cloud Retained History Loaded!
        if (data && Array.isArray(data.messages)) {
            // Update messages list if cloud has more or fresher content
            mergeCloudHistory(data.messages);
            if (data.notice) showNotice(data.notice);
        }
    } else if (topic === TOPIC_MESSAGES) {
        const { action, payload } = data;
        if (action === 'NEW_MESSAGE') {
            if (!messagesList.some(m => m.id === payload.id)) {
                messagesList.push(payload);
                if (messagesList.length > 100) messagesList = messagesList.slice(-100);
                localStorage.setItem('hoiquannet_clean_messages', JSON.stringify(messagesList));
                renderMessages();
                playNotifySound();
            }
        }
    } else if (topic === TOPIC_SYNC) {
        const { action, senderId, targetId, messages, notice } = data;
        if (action === 'REQUEST_HISTORY' && senderId !== CLIENT_ID) {
            // Another peer asked for history, send them our current messages if we have any
            if (messagesList.length > 0) {
                const packet = JSON.stringify({
                    action: 'PROVIDE_HISTORY',
                    senderId: CLIENT_ID,
                    targetId: senderId,
                    messages: messagesList,
                    notice: document.getElementById('pinnedNoticeContent').innerHTML || ''
                });
                mqttClient.publish(TOPIC_SYNC, packet);
            }
        } else if (action === 'PROVIDE_HISTORY' && targetId === CLIENT_ID) {
            if (Array.isArray(messages) && messages.length > 0) {
                mergeCloudHistory(messages);
                if (notice) showNotice(notice);
            }
        }
    } else if (topic === TOPIC_PRESENCE) {
        if (data && data.clientId && data.username) {
            activeCloudPresence.set(data.clientId, data);
            renderOnlineUsers();
        }
    } else if (topic === TOPIC_ADMIN) {
        const { action, payload } = data;
        if (action === 'CLEAR_CHAT') {
            messagesList = [];
            localStorage.removeItem('hoiquannet_clean_messages');
            renderMessages();
        } else if (action === 'DELETE_MESSAGE') {
            messagesList = messagesList.filter(m => m.id !== payload);
            localStorage.setItem('hoiquannet_clean_messages', JSON.stringify(messagesList));
            renderMessages();
        } else if (action === 'NOTICE') {
            if (payload) showNotice(payload);
            else hideNotice();
        }
    }
}

function mergeCloudHistory(incomingMessages) {
    if (!Array.isArray(incomingMessages)) return;

    const existingMap = new Map();
    messagesList.forEach(m => existingMap.set(m.id, m));
    incomingMessages.forEach(m => existingMap.set(m.id, m));

    messagesList = Array.from(existingMap.values());
    if (messagesList.length > 100) {
        messagesList = messagesList.slice(-100);
    }

    localStorage.setItem('hoiquannet_clean_messages', JSON.stringify(messagesList));
    renderMessages();
}

function requestPeerHistorySync() {
    if (mqttClient && mqttClient.connected) {
        const packet = JSON.stringify({ action: 'REQUEST_HISTORY', senderId: CLIENT_ID });
        mqttClient.publish(TOPIC_SYNC, packet);
    }
}

function syncFullHistoryToCloud() {
    if (mqttClient && mqttClient.connected) {
        const noticeText = document.getElementById('pinnedNoticeContent').innerHTML || '';
        const historyPacket = JSON.stringify({
            messages: messagesList,
            notice: noticeText,
            timestamp: Date.now()
        });

        // Publish with retain: true so any newly entering visitor gets the full history immediately
        mqttClient.publish(TOPIC_HISTORY, historyPacket, { retain: true, qos: 1 });
    }
}

function broadcastCloudMessage(action, payload) {
    if (mqttClient && mqttClient.connected) {
        const packet = JSON.stringify({ action, payload, senderId: CLIENT_ID });
        mqttClient.publish(TOPIC_MESSAGES, packet, { qos: 1 });
    }
}

function broadcastAdminAction(action, payload) {
    if (mqttClient && mqttClient.connected) {
        const packet = JSON.stringify({ action, payload, senderId: CLIENT_ID });
        mqttClient.publish(TOPIC_ADMIN, packet, { qos: 1 });
    }
}

// ================= LIVE ONLINE PRESENCE =================
function sendPresenceHeartbeat() {
    if (!currentUser) return;

    const presenceInfo = {
        clientId: CLIENT_ID,
        username: currentUser.username,
        role: currentUser.role,
        color: currentUser.color,
        avatar: currentUser.avatar,
        lastSeen: Date.now()
    };

    activeCloudPresence.set(CLIENT_ID, presenceInfo);

    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(TOPIC_PRESENCE, JSON.stringify(presenceInfo));
    }

    renderOnlineUsers();
}

function cleanStalePresence() {
    const now = Date.now();
    let changed = false;

    activeCloudPresence.forEach((info, cid) => {
        if (cid !== CLIENT_ID && (now - info.lastSeen > 8000)) {
            activeCloudPresence.delete(cid);
            changed = true;
        }
    });

    if (changed) {
        renderOnlineUsers();
    }
}

function renderOnlineUsers() {
    const container = document.getElementById('onlineUsersList');
    container.innerHTML = '';

    const uniqueUsers = new Map();
    activeCloudPresence.forEach(info => {
        if (info.username) {
            uniqueUsers.set(info.username.toLowerCase(), info);
        }
    });

    if (currentUser && !uniqueUsers.has(currentUser.username.toLowerCase())) {
        uniqueUsers.set(currentUser.username.toLowerCase(), {
            username: currentUser.username,
            role: currentUser.role,
            color: currentUser.color,
            avatar: currentUser.avatar
        });
    }

    const list = Array.from(uniqueUsers.values());

    document.getElementById('onlineCountBadge').textContent = list.length;
    document.getElementById('onlineCountSide').textContent = list.length;

    if (list.length === 0) {
        container.innerHTML = `<div class="online-empty-hint">Chưa có ai online. Hãy đăng nhập để bắt đầu!</div>`;
        return;
    }

    list.forEach(user => {
        const item = document.createElement('a');
        item.href = 'javascript:void(0)';
        item.className = 'online-user-item';
        item.onclick = () => tagUser(user.username);

        let roleBadgeClass = 'author-member';
        if (user.role === 'admin') roleBadgeClass = 'author-admin';
        else if (user.role === 'mod') roleBadgeClass = 'author-mod';
        else if (user.role === 'vip') roleBadgeClass = 'author-vip';

        item.innerHTML = `
            <img src="${user.avatar}" class="online-avatar-small" alt="user">
            <span class="online-name ${roleBadgeClass}" style="color: ${user.color || ''}">${escapeHTML(user.username)}</span>
            <span class="online-status-dot" title="Đang online"></span>
        `;
        container.appendChild(item);
    });
}

// ================= MESSAGE RENDERING (NEWEST FIRST AT THE TOP) =================
function renderMessages() {
    const stream = document.getElementById('messagesStream');
    stream.innerHTML = '';

    if (messagesList.length === 0) {
        stream.innerHTML = `
            <div class="chat-msg-system">
                <i class="fa-solid fa-comments"></i> Chưa có tin nhắn nào trong Chatbox. Hãy đăng nhập và gửi lời chào đầu tiên!
            </div>
        `;
        return;
    }

    // Sort descending by timestamp (NEWEST AT TOP)
    const sortedMessages = [...messagesList].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sortedMessages.forEach((msg) => {
        const msgEl = createMessageElement(msg);
        stream.appendChild(msgEl);
    });
}

function createMessageElement(msg) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.id = `msg_${msg.id}`;

    if (currentUser && msg.text && msg.text.includes(`@${currentUser.username}`)) {
        div.classList.add('msg-highlight');
    }

    let badgeIcon = '';
    let roleClass = 'author-member';
    if (msg.role === 'admin') {
        badgeIcon = '<i class="fa-solid fa-crown user-badge-icon" title="Quản trị viên" style="color: #f1c40f;"></i>';
        roleClass = 'author-admin';
    } else if (msg.role === 'mod') {
        badgeIcon = '<i class="fa-solid fa-shield-halved user-badge-icon" title="Điều hành viên" style="color: #0984e3;"></i>';
        roleClass = 'author-mod';
    } else if (msg.role === 'vip') {
        badgeIcon = '<i class="fa-solid fa-star user-badge-icon" title="VIP Member" style="color: #2ecc71;"></i>';
        roleClass = 'author-vip';
    }

    let quoteHtml = '';
    if (msg.quote && msg.quote.text) {
        quoteHtml = `
            <div class="quote-box">
                <div class="quote-header">${escapeHTML(msg.quote.author || 'Thành viên')} nói:</div>
                <div class="quote-content">${escapeHTML(msg.quote.text)}</div>
            </div>
        `;
    }

    const formattedText = parseMessageFormatting(msg.text);
    const timeAgo = formatTimeAgo(msg.timestamp || Date.now());

    const isUserAdmin = currentUser && currentUser.isAdmin;
    const deleteBtn = isUserAdmin ? `
        <button class="msg-action-btn btn-del-msg" onclick="deleteSingleMessage('${msg.id}')" title="Xóa tin nhắn này (Admin)">
            <i class="fa-regular fa-trash-can"></i>
        </button>
    ` : '';

    div.innerHTML = `
        <img src="${msg.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(msg.author)}" class="msg-avatar" alt="avatar">
        <div class="msg-body">
            <div class="msg-author-row">
                ${badgeIcon}
                <a href="javascript:void(0)" class="author-name ${roleClass}" style="color: ${msg.color || ''}" onclick="tagUser('${escapeHTML(msg.author)}')">
                    ${escapeHTML(msg.author)}:
                </a>
            </div>
            ${quoteHtml}
            <div class="msg-text">${formattedText}</div>
        </div>
        <div class="msg-meta-right">
            <span class="msg-time">${timeAgo}</span>
            <div class="msg-actions">
                <button class="msg-action-btn" onclick="quoteMessage('${escapeHTML(msg.author)}', '${encodeURIComponent(msg.text)}')" title="Trích dẫn">
                    <i class="fa-solid fa-quote-right"></i>
                </button>
                <button class="msg-action-btn" onclick="tagUser('${escapeHTML(msg.author)}')" title="Tag tên">
                    <i class="fa-solid fa-at"></i>
                </button>
                ${deleteBtn}
            </div>
        </div>
    `;

    return div;
}

// ================= MESSAGE FORMATTING & BBCODE =================
function parseMessageFormatting(text) {
    if (!text) return '';
    let parsed = escapeHTML(text);

    // Mentions @Username
    parsed = parsed.replace(/@([\w\p{L}\d_\s-]+?)(?=[\s,.:;!?]|$)/gu, (match, username) => {
        return `<span class="user-mention" onclick="tagUser('${username.trim()}')">@${username.trim()}</span>`;
    });

    // BBCode [b]...[/b]
    parsed = parsed.replace(/\[b\](.*?)\[\/b\]/gi, '<b>$1</b>');
    parsed = parsed.replace(/\[i\](.*?)\[\/i\]/gi, '<i>$1</i>');
    parsed = parsed.replace(/\[u\](.*?)\[\/u\]/gi, '<u>$1</u>');
    parsed = parsed.replace(/\[color=(#[0-9a-f]{3,6}|[a-z]+)\](.*?)\[\/color\]/gi, '<span style="color: $1;">$2</span>');
    parsed = parsed.replace(/\[url=(https?:\/\/[^\s\]]+)\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #0984e3; text-decoration: underline;">$2</a>');
    parsed = parsed.replace(/\[url\](https?:\/\/[^\s\]]+)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #0984e3; text-decoration: underline;">$1</a>');
    parsed = parsed.replace(/\[img\](https?:\/\/[^\s\]]+|data:image\/[a-zA-Z]+;base64,[^\s\]]+)\[\/img\]/gi, '<img src="$1" class="chat-embedded-img" alt="image" onclick="window.open(this.src)">');

    // Convert raw URLs
    parsed = parsed.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
        if (url.includes('<img') || url.includes('href=')) return url;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #0984e3; text-decoration: underline;">${url}</a>`;
    });

    return parsed;
}

// ================= COMMAND PROCESSING & SEND =================
function handleSendMessage(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('chatInput');
    const rawText = input.value.trim();

    if (!rawText) return;

    if (!currentUser) {
        openAuthModal('login');
        return;
    }

    if (bannedUsers.has(currentUser.username.toLowerCase())) {
        alert('Tài khoản của bạn đã bị khóa quyền chatbox bởi Quản trị viên!');
        return;
    }

    // Process Slash Commands
    if (rawText.startsWith('/')) {
        const isHandled = processCommand(rawText);
        if (isHandled) {
            input.value = '';
            return;
        }
    }

    // Check for [quote] tags inside input
    let quoteData = null;
    let cleanText = rawText;
    const quoteMatch = rawText.match(/\[quote=(.*?)\]([\s\S]*?)\[\/quote\]/i);
    if (quoteMatch) {
        quoteData = {
            author: quoteMatch[1],
            text: quoteMatch[2].trim()
        };
        cleanText = rawText.replace(quoteMatch[0], '').trim();
    }

    const newMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        author: currentUser.username,
        role: currentUser.role,
        color: currentUser.color,
        avatar: currentUser.avatar,
        text: cleanText,
        quote: quoteData,
        timestamp: Date.now()
    };

    // Save locally
    messagesList.push(newMessage);
    if (messagesList.length > 100) messagesList = messagesList.slice(-100);
    localStorage.setItem('hoiquannet_clean_messages', JSON.stringify(messagesList));
    renderMessages();

    // Broadcast message to live users
    broadcastCloudMessage('NEW_MESSAGE', newMessage);

    // Persist full history to Cloud Storage (Retained Message)
    syncFullHistoryToCloud();

    input.value = '';
    playNotifySound();
}

function processCommand(cmdText) {
    const parts = cmdText.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    const isUserAdmin = currentUser && currentUser.isAdmin;

    switch (command) {
        case '/clear':
        case '/cls':
            if (!isUserAdmin) {
                alert('⛔ Lỗi: Bạn cần đăng nhập bằng tài khoản Quản trị viên (Admin) để xóa chat!');
                return true;
            }
            if (confirm('⚠️ Bạn có chắc chắn muốn XÓA SẠCH toàn bộ lịch sử tin nhắn của Chatbox?')) {
                executeClearChat();
            }
            return true;

        case '/notice':
            if (!isUserAdmin) {
                alert('⛔ Lỗi: Bạn cần có quyền Admin để ghim thông báo!');
                return true;
            }
            if (args.trim() === '') {
                hideNotice();
                broadcastAdminAction('NOTICE', '');
                syncFullHistoryToCloud();
                alert('Đã tắt thông báo ghim!');
            } else {
                showNotice(args.trim());
                broadcastAdminAction('NOTICE', args.trim());
                syncFullHistoryToCloud();
            }
            return true;

        case '/ban':
            if (!isUserAdmin) {
                alert('⛔ Bạn cần có quyền Admin để thực hiện lệnh ban!');
                return true;
            }
            const banTarget = args.replace('@', '').trim().toLowerCase();
            if (banTarget) {
                bannedUsers.add(banTarget);
                alert(`🚫 Đã khóa chat của người dùng: @${banTarget}`);
            }
            return true;

        case '/unban':
            if (!isUserAdmin) {
                alert('⛔ Bạn cần có quyền Admin để thực hiện lệnh unban!');
                return true;
            }
            const unbanTarget = args.replace('@', '').trim().toLowerCase();
            if (unbanTarget) {
                bannedUsers.delete(unbanTarget);
                alert(`✅ Đã mở khóa chat cho: @${unbanTarget}`);
            }
            return true;

        case '/prune':
            if (!isUserAdmin) {
                alert('⛔ Bạn cần có quyền Admin để rút gọn tin nhắn!');
                return true;
            }
            const count = parseInt(args) || 20;
            if (messagesList.length > count) {
                messagesList = messagesList.slice(-count);
                localStorage.setItem('hoiquannet_clean_messages', JSON.stringify(messagesList));
                renderMessages();
                syncFullHistoryToCloud();
                alert(`Đã dọn dẹp và chỉ giữ lại ${count} tin nhắn.`);
            }
            return true;

        case '/color':
            if (args.trim() && currentUser) {
                currentUser.color = args.trim();
                saveCurrentSession(currentUser);
                if (registeredUsers[currentUser.username.toLowerCase()]) {
                    registeredUsers[currentUser.username.toLowerCase()].color = currentUser.color;
                    saveAccounts();
                }
                alert(`Đã đổi màu tên thành: ${currentUser.color}`);
            }
            return true;

        case '/help':
            showHelpModal();
            return true;

        default:
            return false;
    }
}

function executeClearChat() {
    messagesList = [];
    localStorage.removeItem('hoiquannet_clean_messages');
    renderMessages();

    // Clear on Cloud retained topic and notify everyone
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(TOPIC_HISTORY, JSON.stringify({ messages: [], timestamp: Date.now() }), { retain: true, qos: 1 });
    }
    broadcastAdminAction('CLEAR_CHAT', null);
    alert('🧹 Đã xóa sạch toàn bộ lịch sử tin nhắn Chatbox thành công!');
}

function deleteSingleMessage(id) {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm('Bạn có chắc muốn xóa tin nhắn này?')) {
        messagesList = messagesList.filter(m => m.id !== id);
        localStorage.setItem('hoiquannet_clean_messages', JSON.stringify(messagesList));
        renderMessages();
        syncFullHistoryToCloud();
        broadcastAdminAction('DELETE_MESSAGE', id);
    }
}

// ================= NOTICE BANNER =================
function showNotice(text) {
    const banner = document.getElementById('pinnedNoticeBanner');
    const content = document.getElementById('pinnedNoticeContent');
    content.innerHTML = text;
    banner.style.display = 'flex';
}

function hideNotice() {
    const banner = document.getElementById('pinnedNoticeBanner');
    banner.style.display = 'none';
}

function dismissNotice() {
    hideNotice();
}

// ================= TOOLBAR & BBCODE HELPERS =================
function insertBBCode(tag) {
    const input = document.getElementById('chatInput');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.substring(start, end);
    const replacement = `[${tag}]${selected}[/${tag}]`;
    input.value = input.value.substring(0, start) + replacement + input.value.substring(end);
    input.focus();
    input.setSelectionRange(start + tag.length + 2, end + tag.length + 2);
}

function insertColorCode(hex) {
    const input = document.getElementById('chatInput');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.substring(start, end);
    const replacement = `[color=${hex}]${selected || 'nội dung'}[/color]`;
    input.value = input.value.substring(0, start) + replacement + input.value.substring(end);
    input.focus();
}

function insertLinkPrompt() {
    const url = prompt('Nhập địa chỉ liên kết (URL):', 'https://');
    if (url) {
        const text = prompt('Nhập tiêu đề hiển thị:', 'Bấm vào đây');
        const input = document.getElementById('chatInput');
        input.value += `[url=${url}]${text || url}[/url] `;
        input.focus();
    }
}

function insertImagePrompt() {
    openUploadModal();
}

function insertQuoteTemplate() {
    const author = prompt('Tên người muốn trích dẫn:', 'Admin');
    if (author) {
        const text = prompt('Nội dung cần trích dẫn:');
        if (text) {
            const input = document.getElementById('chatInput');
            input.value = `[quote=${author}]${text}[/quote] ` + input.value;
            input.focus();
        }
    }
}

function quoteMessage(author, encodedText) {
    const text = decodeURIComponent(encodedText);
    const input = document.getElementById('chatInput');
    input.value = `[quote=${author}]${text}[/quote] ` + input.value;
    input.focus();
}

function tagUser(userName) {
    const input = document.getElementById('chatInput');
    input.value += `@${userName} `;
    input.focus();
}

// ================= EMOJI PICKER =================
const POPULAR_EMOJIS = [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘',
    '🥰','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏',
    '😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤',
    '😒','😓','😔','😕','🙃','🤑','😲','🙁','😖','😞','😟','😤','😢','😭',
    '😦','😧','😨','😩','🤯','😬','🥺','😱','🥵','🥶','😳','🤪','😵','🥴',
    '😠','😡','🤬','😷','🤒','🤕','🤢','🤮','🤧','😇','🥳','🤠','🤡','💩',
    '👍','👎','👏','🙌','👐','🤲','🤝','🙏','✍️','💪','🎮','🖥️','💻','🔥',
    '⚡','✨','🎉','🌐','💯','❤️','💥'
];

function initEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    POPULAR_EMOJIS.forEach((emo) => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = emo;
        span.onclick = () => insertEmoji(emo);
        grid.appendChild(span);
    });
}

function toggleEmojiPicker() {
    const panel = document.getElementById('emojiPickerPanel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function insertEmoji(emo) {
    const input = document.getElementById('chatInput');
    input.value += emo;
    input.focus();
    document.getElementById('emojiPickerPanel').style.display = 'none';
}

function showHelpModal() {
    document.getElementById('helpModal').classList.add('active');
}

function openUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
}

function openPrivateChatModal() {
    if (!currentUser) {
        openAuthModal('login');
        return;
    }
    const target = prompt('Nhập tên thành viên bạn muốn gửi tin nhắn riêng:');
    if (target) {
        const msg = prompt(`Nội dung tin nhắn gửi riêng cho @${target}:`);
        if (msg) {
            const input = document.getElementById('chatInput');
            input.value = `[b][color=#9b59b6][Chat Riêng tới @${target}][/color][/b] ${msg}`;
            handleSendMessage();
        }
    }
}

function switchRoom(roomName) {
    alert(`Bạn đang ở phòng chat: [Chung - Diễn đàn Hội Quán Nét].`);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ================= UPLOAD IMAGE / FILE =================
let selectedBase64Image = '';

function previewLocalImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedBase64Image = e.target.result;
            const preview = document.getElementById('imagePreview');
            preview.src = selectedBase64Image;
            document.getElementById('imagePreviewContainer').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function confirmUploadImage() {
    const urlInput = document.getElementById('directImageUrl').value.trim();
    const finalImg = urlInput || selectedBase64Image;

    if (!finalImg) {
        alert('Vui lòng nhập link ảnh hoặc chọn file ảnh từ máy!');
        return;
    }

    const input = document.getElementById('chatInput');
    input.value += `[img]${finalImg}[/img] `;
    closeModal('uploadModal');
    input.focus();
}

// ================= AUDIO NOTIFICATION =================
function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('soundToggleBtn');
    if (soundEnabled) {
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
        btn.style.opacity = '1';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
        btn.style.opacity = '0.6';
    }
}

function playNotifySound() {
    if (!soundEnabled) return;
    const audio = document.getElementById('chatNotifySound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
}

// ================= UTILITIES =================
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatTimeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 15) return 'vừa xong';
    if (diff < 60) return `${diff} giây trước`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min} phút trước`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour} giờ trước`;
    return `${Math.floor(hour / 24)} ngày trước`;
}
