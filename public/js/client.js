console.log("CLIENT.JS LOADED [FINAL-GAME-STABLE-V5]");

// -- CONEXIÓN CON SERVIDOR CENTRAL --
// Si corremos en una App Nativa de Capacitor (http://localhost o file:// pero sin puerto explícito de dev)
// necesitamos conectarnos explícitamente a la IP/Dominio de la VPS. ¡CAMBIAR ESTA URL LUEGO A LA IP DE VPS REAL!
const isNativeApp = (window.location.protocol === 'file:' || window.location.hostname === 'localhost') && !window.location.port;
const SERVER_URL = isNativeApp ? 'https://tuvps-dominio-o-ip.com' : ''; 

const socket = io(SERVER_URL || undefined, {
    transports: ['websocket', 'polling'],
    reconnection: true
});

// State
let roomCode = null;
let isAdmin = false;
let isHost = false;
let myName = "";
let myToken = localStorage.getItem('pixo_token') || null;
let currentTurn = null;
let myPoints = 0;
let myGames = 0; // Placeholder for future 
let myWins = 0;  // Placeholder for future
let playerClues = {}; // { [playerId]: clueText }
const availableAvatars = [
    'alien.png', 'bear.png', 'cat.png', 'robot.png',
    'dog.png', 'tiger.png', 'panda.png', 'monkey.png',
    'koala.png', 'fox.png', 'owl.png', 'astronaut.png',
    'penguin.png', 'dragon.png'
];
let myAvatar = `/assets/avatars/${availableAvatars[Math.floor(Math.random() * availableAvatars.length)]}`;

const randomNames = ["SussusAmogus", "PixoMaster", "Incognito", "RedSpy", "BlueBoi", "Ghost", "Matrix", "Cipher", "Shadow", "Rogue", "Ninja", "Wizard", "Chaos", "Zen", "Alpha", "Omega", "Echo", "Delta", "Raven", "Phoenix"];

// --- UTILS ---
window.showNotification = (msg, type = 'info') => {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `notification-toast toast-${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
};

const showView = (id) => {
    console.log("[UI] View Switch ->", id);
    document.querySelectorAll('.view').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });

    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
    
    if (id === 'game-view') {
        document.body.classList.add('in-game');
    } else {
        document.body.classList.remove('in-game');
    }
};

const renderPlayersRing = (players) => {
    const ring = document.getElementById('players-ring');
    if (!ring) return;
    ring.innerHTML = '';

    // Ellipse parameters for positioning around the table image
    const isMobile = window.innerWidth <= 768;
    const rx = isMobile ? 35 : 42; // Narrower horizontal radius for mobile
    const ry = isMobile ? 40 : 32; // Taller vertical radius for mobile
    const total = players.length;

    players.forEach((p, i) => {
        // Calculate angle (starting from bottom center, clockwise)
        const angle = (i / total) * Math.PI * 2 + Math.PI / 2;
        const x = 50 + rx * Math.cos(angle);
        const y = 50 + ry * Math.sin(angle);

        const spot = document.createElement('div');
        spot.className = 'player-spot';
        if (p.id === currentTurn) spot.classList.add('active-turn');
        spot.style.left = `${x}%`;
        spot.style.top = `${y}%`;

        // Mark active turn
        // Note: we'll check currentTurn state if available
        // spot.classList.add('active-turn'); 

        const lastClue = playerClues[p.id] || "";

        const avatarUrl = p.avatar ? (p.avatar.startsWith('/') ? p.avatar : `/assets/avatars/${p.avatar}`) : '/assets/avatars/cat.png';

        spot.innerHTML = `
            <img src="${avatarUrl}" alt="Avatar">
            <div class="player-info-text">
                <span class="p-name">${p.name}</span>
                <span class="p-clue">${lastClue}</span>
            </div>
        `;

        ring.appendChild(spot);
    });
};

const updateUI = () => {
    const finalName = isAdmin ? "admin" : (myName || "Usuario");

    document.querySelectorAll('#my-name-pill, #dash-name').forEach(el => el.innerText = finalName);
    document.querySelectorAll('#my-avatar-pill, #dash-avatar, #my-avatar-room').forEach(el => el.src = myAvatar);

    // FIX NAVBAR ON LOGIN
    if (localStorage.getItem('pixo_token') || myToken) {
        const authContainer = document.getElementById('auth-buttons-container');
        if (authContainer) authContainer.classList.add('hidden');
        const userPills = document.getElementById('user-pills');
        if (userPills) userPills.classList.remove('hidden');
        
        // Update dashboard stats
        const dp = document.getElementById('dash-points');
        if (dp) dp.innerText = myPoints;
        const dg = document.getElementById('dash-games');
        if (dg) dg.innerText = myGames;
        const dw = document.getElementById('dash-wins');
        if (dw) dw.innerText = myWins;
    }

    const nameInput = document.getElementById('my-name-input');
    if (nameInput) {
        nameInput.value = finalName;
        if (isAdmin) nameInput.disabled = true;
    }

    if (isAdmin) {
        const adminTools = document.getElementById('admin-only-tools');
        if (adminTools) adminTools.classList.remove('hidden');
        const dashRole = document.getElementById('dash-role');
        if (dashRole) dashRole.innerText = "Nivel: ADMINISTRADOR";
    }

    // Host Controls
    const hostControls = document.getElementById('host-controls');
    if (hostControls) {
        if (isHost) hostControls.classList.remove('hidden');
        else hostControls.classList.add('hidden');
    }
};

// --- ADMIN DESIGNER ---
class AdminManager {
    constructor() {
        this.currentVisuals = {
            bg: "",
            bgMobile: "",
            zoom: "1.0",
            posX: "50",
            posY: "50",
            playerSize: "180",
            rankingSize: "340",
            lobbyBg: "",
            bodyBg: ""
        };
        this.init();
    }

    init() {
        const btnOpen = document.getElementById('btn-login-open');
        if (btnOpen) btnOpen.onclick = () => document.getElementById('login-modal').classList.remove('hidden');

        const btnSubmit = document.getElementById('btn-login-submit');
        if (btnSubmit) {
            btnSubmit.onclick = async () => {
                const u = document.getElementById('login-user').value;
                const p = document.getElementById('login-pass').value;
                const e = document.getElementById('login-email') ? document.getElementById('login-email').value : '';
                const isRegister = document.getElementById('btn-login-submit').innerText === 'CREA MI CUENTA YA';

                const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
                
                const payload = { username: u, password: p };
                if (isRegister) payload.email = e;

                try {
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();

                    if (res.ok) {
                        myToken = data.token;
                        localStorage.setItem('pixo_token', myToken);
                        myName = data.user.username;
                        myPoints = data.user.points || 0;
                        
                        // FIX AVATAR PATH BUG
                        if (data.user.avatar && !data.user.avatar.includes('/')) {
                            myAvatar = '/assets/avatars/' + data.user.avatar;
                        } else {
                            myAvatar = data.user.avatar || myAvatar;
                        }
                        
                        if (myName === 'admin') this.unlock();
                        
                        updateUI();
                        socket.emit('update_profile', { name: myName, avatar: myAvatar });
                        document.getElementById('login-modal').classList.add('hidden');
                        showNotification(data.message || 'Exito', 'success');
                    } else {
                        showNotification(data.error || 'Ocurrió un error', 'error');
                    }
                } catch (e) {
                    showNotification("Problema de conexión al servidor", 'error');
                }
            };
        }

        const btnClose = document.getElementById('btn-login-close');
        if (btnClose) btnClose.onclick = () => document.getElementById('login-modal').classList.add('hidden');

        const setEpicMode = (mode) => {
            const tabLogin = document.getElementById('tab-login');
            const tabReg = document.getElementById('tab-register');
            const btnSubmit = document.getElementById('btn-login-submit');
            const subtitle = document.getElementById('epic-subtitle');
            const wrapperEmail = document.getElementById('wrapper-email');
            
            if (mode === 'login') {
                tabLogin.classList.add('active');
                tabReg.classList.remove('active');
                subtitle.innerText = "Inicia sesión en tu cuenta";
                btnSubmit.innerText = "ENTRAR A JUGAR";
                if (wrapperEmail) wrapperEmail.classList.add('hidden');
            } else {
                tabReg.classList.add('active');
                tabLogin.classList.remove('active');
                subtitle.innerText = "Crea tu cuenta nueva y elegante";
                btnSubmit.innerText = "CREA MI CUENTA YA";
                if (wrapperEmail) wrapperEmail.classList.remove('hidden');
            }
        };

        const tabLoginBtn = document.getElementById('tab-login');
        if (tabLoginBtn) tabLoginBtn.onclick = () => setEpicMode('login');
        
        const tabRegBtn = document.getElementById('tab-register');
        if (tabRegBtn) tabRegBtn.onclick = () => setEpicMode('register');

        // Toggle Login/Register modes (Navbar Buttons)
        const btnRegTab = document.querySelector('.btn-auth.disabled'); // The second button in top right
        const btnLogTab = document.getElementById('btn-login-open');
        
        if (btnRegTab && btnLogTab) {
            btnRegTab.classList.remove('disabled');
            btnRegTab.removeAttribute('disabled');
            
            btnRegTab.onclick = () => {
                document.getElementById('login-modal').classList.remove('hidden');
                setEpicMode('register');
            };
            
            btnLogTab.onclick = () => {
                document.getElementById('login-modal').classList.remove('hidden');
                setEpicMode('login');
            }
        }

        const accPill = document.getElementById('account-pill');
        if (accPill) accPill.onclick = () => document.getElementById('account-dashboard').classList.toggle('hidden');

        const btnDesigner = document.getElementById('btn-open-designer');
        if (btnDesigner) {
            btnDesigner.onclick = () => {
                document.getElementById('admin-panel').classList.remove('hidden');
                document.getElementById('account-dashboard').classList.add('hidden');
            };
        }

        const btnCloseDesigner = document.getElementById('btn-close-admin');
        if (btnCloseDesigner) btnCloseDesigner.onclick = () => document.getElementById('admin-panel').classList.add('hidden');

        const inputs = ['admin-bg-url', 'admin-bg-mobile', 'admin-zoom', 'admin-posx', 'admin-posy',
            'admin-player-size', 'admin-ranking-size', 'admin-lobby-bg', 'admin-body-bg'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = () => this.updateLive();
        });

        const btnReset = document.getElementById('btn-admin-reset');
        if (btnReset) btnReset.onclick = () => { if (confirm("¿Reiniciar sala?")) socket.emit('admin_reset_room', roomCode); };

        this.initAvatarGrid();
    }

    initAvatarGrid() {
        const grid = document.getElementById('avatar-grid');
        if (!grid) return;
        grid.innerHTML = '';

        availableAvatars.forEach(av => {
            const img = document.createElement('img');
            img.src = `/assets/avatars/${av}`;
            img.className = 'avatar-option';
            if (myAvatar.includes(av)) img.classList.add('selected');

            img.onclick = () => {
                document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
                img.classList.add('selected');
                myAvatar = `/assets/avatars/${av}`;
                updateUI();
                socket.emit('update_profile', { name: myName, avatar: myAvatar });
            };
            grid.appendChild(img);
        });

        const btnEdit = document.getElementById('btn-edit-profile');
        if (btnEdit) btnEdit.onclick = () => document.getElementById('profile-modal').classList.remove('hidden');

        const btnEditDash = document.getElementById('btn-edit-profile-dash');
        if (btnEditDash) btnEditDash.onclick = () => {
            document.getElementById('profile-modal').classList.remove('hidden');
            document.getElementById('account-dashboard').classList.add('hidden');
        };

        const btnCloseModal = document.getElementById('btn-close-modal');
        if (btnCloseModal) btnCloseModal.onclick = () => document.getElementById('profile-modal').classList.add('hidden');
    }

    unlock() {
        isAdmin = true;
        document.getElementById('btn-login-open').classList.add('hidden');
        document.querySelector('.btn-auth:not(#btn-login-open)').classList.add('hidden'); // Hide register too
        document.getElementById('user-pills').classList.remove('hidden');
        updateUI();
    }

    updateLive() {
        const bg = document.getElementById('admin-bg-url').value;
        const bgMobile = document.getElementById('admin-bg-mobile').value;
        const zoom = document.getElementById('admin-zoom').value;
        const x = document.getElementById('admin-posx').value;
        const y = document.getElementById('admin-posy').value;
        const playerSize = document.getElementById('admin-player-size').value;
        const rankingSize = document.getElementById('admin-ranking-size').value;
        const lobbyBg = document.getElementById('admin-lobby-bg').value;
        const bodyBg = document.getElementById('admin-body-bg').value;

        this.currentVisuals = { bg, bgMobile, zoom, posX: x, posY: y, playerSize, rankingSize, lobbyBg, bodyBg };

        // Update labels
        ['zoom', 'posx', 'posy', 'player-size', 'ranking-size'].forEach(k => {
            const label = document.getElementById(`val-${k}`);
            if (label) {
                if (k === 'zoom') label.innerText = zoom;
                else if (k === 'posx') label.innerText = x;
                else if (k === 'posy') label.innerText = y;
                else if (k === 'player-size') label.innerText = playerSize;
                else if (k === 'ranking-size') label.innerText = rankingSize;
            }
        });

        this.apply();
        socket.emit('admin_visual_update', { visuals: this.currentVisuals });
    }

    apply() {
        const v = this.currentVisuals;
        const bgLayer = document.getElementById('game-bg-layer');
        if (bgLayer) {
            // Apply variables to CSS for easier handling of media queries if needed
            // Ensure we use quotes for URLs that might have spaces (though we already encoded the default one)
            const bgUrl = v.bg ? `url('${v.bg}')` : 'var(--bg-desktop)';
            const bgMobileUrl = v.bgMobile ? `url('${v.bgMobile}')` : (v.bg ? `url('${v.bg}')` : 'var(--bg-mobile)');

            document.documentElement.style.setProperty('--bg-desktop', bgUrl);
            document.documentElement.style.setProperty('--bg-mobile', bgMobileUrl);

            bgLayer.style.backgroundPosition = `${v.posX}% ${v.posY}%`;
            bgLayer.style.backgroundSize = `${parseFloat(v.zoom) * 100}%`;
        }

        // Apply player spot size
        if (v.playerSize) {
            document.documentElement.style.setProperty('--player-spot-width', `${v.playerSize}px`);
        }

        // Apply ranking sidebar width
        if (v.rankingSize) {
            document.documentElement.style.setProperty('--ranking-sidebar-width', `${v.rankingSize}px`);
        }

        // Apply lobby background
        if (v.lobbyBg) {
            document.documentElement.style.setProperty('--lobby-bg', `url('${v.lobbyBg}')`);
        }

        // Apply body background
        if (v.bodyBg) {
            document.body.style.backgroundImage = `url('${v.bodyBg}')`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
        } else {
            // Reset to default gradient if no custom background
            document.body.style.backgroundImage = '';
        }

        const tableArea = document.querySelector('.table-area');
        if (tableArea) {
            // We can also apply some zoom to the table area contents if needed, 
            // but the user mostly wanted to move the image.
            // tableArea.style.transform = `scale(${v.zoom})`;
        }

        // Apply global background only if NOT in game-view (optional, user wanted localized)
        if (!document.getElementById('game-view').classList.contains('active')) {
            if (v.bg && !v.bodyBg) {
                document.body.style.backgroundImage = `url('${v.bg}')`;
                document.body.style.backgroundPosition = `${v.posX}% ${v.posY}%`;
            }
        }
    }
}

// --- SOCKETS ---
socket.on('connect', () => console.log("CONNECTED:", socket.id));

socket.on('session_created', (data) => {
    roomCode = data.roomCode;
    if (data.playerName && !isAdmin) myName = data.playerName;
    const display = document.getElementById('room-code-display');
    if (display) display.innerText = roomCode;
    updateUI();
    showView('room-view');
});

socket.on('update_players', (players) => {
    const me = players.find(p => p.id === socket.id);
    if (me) isHost = me.isHost;

    const list = document.getElementById('players-list');
    if (list) {
        list.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<img src="${p.avatar || ''}" class="avatar-pill" style="width:20px;height:20px;margin-right:8px"> ${p.name} ${p.isHost ? '👑' : ''}`;
            list.appendChild(li);
        });
    }
    const count = document.getElementById('player-count');
    if (count) count.innerText = players.length;

    // Update Sidebar Ranking
    const sidebarList = document.getElementById('sidebar-players-list');
    if (sidebarList) {
        sidebarList.innerHTML = '';
        players.forEach(p => {
            const pAvatar = p.avatar ? (p.avatar.startsWith('/') ? p.avatar : `/assets/avatars/${p.avatar}`) : '/assets/avatars/cat.png';
            const li = document.createElement('li');
            li.className = 'ranking-item';
            li.innerHTML = `
                <img src="${pAvatar}" class="ranking-avatar">
                <span class="ranking-name">${p.name}</span>
                <span class="ranking-score">${p.score || 0} pts</span>
            `;
            sidebarList.appendChild(li);
        });
    }

    // Render the table seating
    window.lastPlayersList = players;
    renderPlayersRing(players);

    updateUI();
});

socket.on('game_started', () => {
    console.log("GAME STARTING!");
    showView('game-view');
});

socket.on('role_assigned', (data) => {
    console.log("ROLE:", data.role);
    const display = document.getElementById('secret-word-display');
    if (display) {
        display.innerText = data.role === 'impostor' ? "ERES EL IMPOSTOR" : `PALABRA: ${data.word}`;
    }
});

socket.on('phase_input_started', (data) => {
    currentTurn = data.currentTurn;

    // Refresh the ring to highlight the active spot
    if (window.lastPlayersList) {
        renderPlayersRing(window.lastPlayersList);
    }

    const inputArea = document.getElementById('clue-input-area');
    if (inputArea) {
        if (data.currentTurn === socket.id) inputArea.classList.remove('hidden');
        else inputArea.classList.add('hidden');
    }
    const mainText = document.getElementById('main-display-text');
    if (mainText) mainText.innerText = `TURNO DE: ${data.currentTurnName}`;
});

socket.on('clue_submitted', (data) => {
    // Record clue for the individual slot
    if (data.playerId) {
        playerClues[data.playerId] = data.clue;
    } else {
        const players = window.lastPlayersList || [];
        const player = players.find(p => p.name === data.playerName);
        if (player) playerClues[player.id] = data.clue;
    }

    if (window.lastPlayersList) {
        renderPlayersRing(window.lastPlayersList);
    }

    const list = document.getElementById('clues-list');
    if (list) {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${data.playerName}:</strong> ${data.clue}`;
        list.appendChild(li);
    }
});

socket.on('sync_visuals', (v) => {
    if (v) {
        const bgLayer = document.getElementById('game-bg-layer');
        if (bgLayer) {
            const bgUrl = v.bg ? `url('${v.bg}')` : 'var(--bg-desktop)';
            const bgMobileUrl = v.bgMobile ? `url('${v.bgMobile}')` : (v.bg ? `url('${v.bg}')` : 'var(--bg-mobile)');

            document.documentElement.style.setProperty('--bg-desktop', bgUrl);
            document.documentElement.style.setProperty('--bg-mobile', bgMobileUrl);

            bgLayer.style.backgroundPosition = `${v.posX || 50}% ${v.posY || 50}%`;
            bgLayer.style.backgroundSize = `${parseFloat(v.zoom || 1) * 100}%`;
        }

        // Apply new visual settings
        if (v.playerSize) {
            document.documentElement.style.setProperty('--player-spot-width', `${v.playerSize}px`);
        }
        if (v.rankingSize) {
            document.documentElement.style.setProperty('--ranking-sidebar-width', `${v.rankingSize}px`);
        }
        if (v.lobbyBg) {
            document.documentElement.style.setProperty('--lobby-bg', `url('${v.lobbyBg}')`);
        }
        if (v.bodyBg) {
            document.body.style.backgroundImage = `url('${v.bodyBg}')`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
        }

        // Update global body only if not in game
        if (!document.getElementById('game-view').classList.contains('active')) {
            if (v.bg && !v.bodyBg) {
                document.body.style.backgroundImage = `url('${v.bg}')`;
                document.body.style.backgroundPosition = `${v.posX || 50}% ${v.posY || 50}%`;
            }
        }
    }
});

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    // Lobby
    const bQuick = document.getElementById('btn-quick-game');
    if (bQuick) bQuick.onclick = () => socket.emit('quick_join');

    const bPrivate = document.getElementById('btn-private-game');
    const privateModal = document.getElementById('private-modal');
    if (bPrivate) bPrivate.onclick = () => {
        if (privateModal) privateModal.classList.remove('hidden');
    };

    const bPrivateClose = document.getElementById('btn-private-close');
    if (bPrivateClose) bPrivateClose.onclick = () => privateModal.classList.add('hidden');

    const bPrivateJoin = document.getElementById('btn-private-join');
    if (bPrivateJoin) bPrivateJoin.onclick = () => {
        const codeInput = document.getElementById('private-code-input');
        const c = codeInput ? codeInput.value.trim() : '';
        if (c !== "") {
            socket.emit('join_room', { roomCode: c.toUpperCase() });
            privateModal.classList.add('hidden');
            if(codeInput) codeInput.value = '';
        } else {
            showNotification('Ingresa un código válido para unirte', 'warning');
        }
    };

    const bPrivateCreate = document.getElementById('btn-private-create');
    if (bPrivateCreate) bPrivateCreate.onclick = () => {
        socket.emit('create_room');
        privateModal.classList.add('hidden');
    };

    const bRandom = document.getElementById('btn-random-name');
    if (bRandom) bRandom.onclick = () => {
        if (isAdmin) return;
        const randomStr = randomNames[Math.floor(Math.random() * randomNames.length)];
        myName = randomStr.substring(0, 15);
        updateUI();
        socket.emit('update_profile', { name: myName, avatar: myAvatar });
    };

    const nameInput = document.getElementById('my-name-input');
    if (nameInput) {
        nameInput.onchange = (e) => {
            if (isAdmin) return;
            const newName = e.target.value.trim().substring(0, 15);
            if (newName) {
                myName = newName;
                document.getElementById('my-name-input').value = myName; // Force truncation visually
                updateUI();
                socket.emit('update_profile', { name: myName, avatar: myAvatar });
            }
        };
    }

    const bExplore = document.getElementById('btn-explore');
    if (bExplore) bExplore.onclick = () => showNotification("Explorador de salas llegará pronto...", "info");

    const bHowTo = document.getElementById('btn-how-to-scroll');
    if (bHowTo) bHowTo.onclick = () => {
        const section = document.getElementById('how-to-play');
        if (section) section.scrollIntoView({ behavior: 'smooth' });
    };

    // Room
    const bStart = document.getElementById('btn-start-game');
    if (bStart) bStart.onclick = () => socket.emit('start_game', roomCode);

    const bBot = document.getElementById('btn-add-bot');
    if (bBot) bBot.onclick = () => socket.emit('debug_add_bot', roomCode);

    const bLeave = document.getElementById('btn-leave');
    if (bLeave) bLeave.onclick = () => {
        socket.emit('leave_room', roomCode);
        showView('lobby-view');
    };

    const bClue = document.getElementById('btn-submit-clue');
    if (bClue) bClue.onclick = () => {
        const clue = document.getElementById('input-clue').value;
        if (clue) {
            socket.emit('submit_clue', { roomCode, clue });
            document.getElementById('input-clue').value = '';
        }
    };

    new AdminManager();
    // Check Session on Load
    if (myToken) {
        fetch('/api/auth/me', {
            headers: { 'Authorization': 'Bearer ' + myToken }
        }).then(res => res.json()).then(data => {
            if (data.user) {
                myName = data.user.username;
                myPoints = data.user.points || 0;
                
                if (data.user.avatar && !data.user.avatar.includes('/')) {
                    myAvatar = '/assets/avatars/' + data.user.avatar;
                } else {
                    myAvatar = data.user.avatar || myAvatar;
                }
                
                if (data.user.username === 'admin') {
                    isAdmin = true;
                    const adminTools = document.getElementById('admin-only-tools');
                    if (adminTools) adminTools.classList.remove('hidden');
                }
                updateUI();
                socket.emit('update_profile', { name: myName, avatar: myAvatar });
            }
        }).catch(err => {
            console.error("Token expirado o inválido", err);
            localStorage.removeItem('pixo_token');
            myToken = null;
        });
    }

    if (!isAdmin && !myName) myName = randomNames[Math.floor(Math.random() * randomNames.length)].substring(0, 15);
    updateUI();
});

// Logout and Dashboard handlers
document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-logout')) {
        localStorage.removeItem('pixo_token');
        location.reload();
    }

    // Toggle stats in dashboard
    if (e.target.closest('#btn-toggle-stats')) {
        const statsContainer = document.getElementById('dashboard-stats-container');
        if (statsContainer) statsContainer.classList.toggle('hidden');
    }
    
    // Edit profile wrapper
    if (e.target.closest('#btn-edit-profile-dash')) {
        showNotification("Editor de perfiles avanzado en construcción...", "info");
    }
    
    // Wire up account dash button in navbar
    const accountPill = document.getElementById('account-pill');
    const dashboard = document.getElementById('account-dashboard');
    if (accountPill && (e.target === accountPill || accountPill.contains(e.target))) {
        if (dashboard) dashboard.classList.remove('hidden');
    }
    
    // Close dashboard
    if (e.target.closest('#btn-close-dash') || e.target === dashboard) {
        if (dashboard) dashboard.classList.add('hidden');
    }
});
