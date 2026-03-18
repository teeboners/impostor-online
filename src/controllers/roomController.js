const generateRandomName = require('../utils/randomName');
const generateRoomCode = require('../utils/randomCode');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

let globalVisuals = {
    zoom: "1",
    posX: "50%",
    posY: "50%",
    blur: "0px",
    bg: ""
};

// Load visuals on startup
function loadVisuals() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            globalVisuals = JSON.parse(data);
            console.log("✅ Visual settings loaded from config.json");
        }
    } catch (err) {
        console.error("Error loading visuals:", err);
    }
}
loadVisuals();

function saveVisuals() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(globalVisuals, null, 2));
    } catch (err) {
        console.error("Error saving visuals:", err);
    }
}

// In-memory storage for rooms
const rooms = {};

// In-memory player mapping
const players = {};

// Disconnect timers map: { [socketId]: TimeoutID }
const disconnectTimers = {};

const AVATARS = ['cat.png', 'robot.png', 'alien.png', 'bear.png'];

function getRandomAvatar() {
    return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

function createRoom(socket) {
    const roomCode = generateRoomCode();
    const playerName = generateRandomName().substring(0, 15);

    rooms[roomCode] = {
        code: roomCode,
        players: [],
        hostId: socket.id,
        status: 'waiting',
        settings: {
            roundTime: 60, // seconds per turn/discussion (Legacy, will be override by phase timers)
            gameMode: 'classic' // FORCE CLASSIC MODE
        },
        gameState: {
            phase: 'lobby',
            // ... other game state props will be added by gameController
        }
    };

    const player = {
        id: socket.id,
        name: playerName,
        roomCode: roomCode,
        isHost: true,
        isOnline: true,
        score: 0,
        avatar: getRandomAvatar()
    };

    rooms[roomCode].players.push(player);
    players[socket.id] = player;

    socket.join(roomCode);

    return { room: rooms[roomCode], player };
}

function joinRoom(socket, roomCode, requestedName = null) {
    const room = rooms[roomCode];

    if (!room) {
        return { error: 'Sala no encontrada' };
    }

    // --- REJOIN LOGIC ---
    if (requestedName) {
        const existingPlayer = room.players.find(p => p.name === requestedName);
        if (existingPlayer) {
            if (disconnectTimers[existingPlayer.id]) {
                clearTimeout(disconnectTimers[existingPlayer.id]);
                delete disconnectTimers[existingPlayer.id];
            }

            const oldId = existingPlayer.id;
            delete players[oldId];

            existingPlayer.id = socket.id;
            existingPlayer.isOnline = true;
            players[socket.id] = existingPlayer;

            socket.join(roomCode);

            return { room, player: existingPlayer, action: 'rejoin' };
        }
    }

    if (room.status !== 'waiting') {
        return { error: 'La partida ya ha comenzado' };
    }

    const playerName = generateRandomName().substring(0, 15);
    const player = {
        id: socket.id,
        name: playerName,
        roomCode: roomCode,
        isHost: false,
        isOnline: true,
        score: 0,
        avatar: getRandomAvatar()
    };

    room.players.push(player);
    players[socket.id] = player;

    socket.join(roomCode);

    return { room, player };
}

function updateProfile(socketId, { name, avatar }) {
    const player = players[socketId];
    if (!player) return { error: 'Jugador no encontrado' };

    const room = rooms[player.roomCode];
    if (!room) return { error: 'Sala no encontrada' };

    // Check if name is taken in this room
    if (name && name !== player.name) {
        const nameTaken = room.players.some(p => p.name === name);
        if (nameTaken) return { error: 'Nombre ya en uso' };
        player.name = name;
    }

    if (avatar && AVATARS.includes(avatar)) {
        player.avatar = avatar;
    }

    return { room, player };
}


function handleDisconnect(socket, io) {
    const player = players[socket.id];
    if (!player) return null;

    const room = rooms[player.roomCode];
    if (!room) return null;

    console.log(`Jugador ${player.name} desconectado. Iniciando temporizador de eliminación.`);

    // Mark as offline immediately
    player.isOnline = false;

    // Notify room of status change (for red dot UI)
    io.to(room.code).emit('update_players', room.players);

    // Start 20s timer to remove permanently
    disconnectTimers[socket.id] = setTimeout(() => {
        console.log(`Tiempo agotado para ${player.name}. Eliminando...`);

        // Check if player is still offline (might have reconnected with new ID, but this timer is for the OLD ID)
        // If they reconnected, the timer would have been cleared in joinRoom.
        // So if we are here, they are definitely gone.

        leaveRoomPermanently(socket.id, io);

    }, 20000); // 20 seconds
}

function leaveRoomPermanently(socketId, io) {
    const player = players[socketId]; // Note: might be stale if remapped, but in timer case it's fine
    if (!player) return;

    const room = rooms[player.roomCode];
    if (!room) return;

    // Remove player from room
    room.players = room.players.filter(p => p.id !== player.id); // Use player.id to match current object ID
    delete players[player.id];

    // Cleanup timer reference
    if (disconnectTimers[socketId]) delete disconnectTimers[socketId];

    // Handle host leaving
    if (room.players.length === 0) {
        delete rooms[room.code];
        console.log(`Sala ${room.code} eliminada por inactividad.`);
    } else {
        if (player.isHost) {
            room.players[0].isHost = true;
            room.hostId = room.players[0].id;
        }
        // Notify room
        io.to(room.code).emit('update_players', room.players);
    }
}

// Wrapper for manual leave (btn click)
function leaveRoom(socket) {
    // If user explicitly clicks leave, we remove immediately without timer
    if (disconnectTimers[socket.id]) {
        clearTimeout(disconnectTimers[socket.id]);
        delete disconnectTimers[socket.id];
    }
    // We can reuse the logic, passing a mock io or refactoring. 
    // For simplicity, let's just return a struct like before or call internal helpers.
    // Given the requirement "No romper base", let's adapt the previous return style but use our new logic data.

    const player = players[socket.id];
    if (!player) return null;
    const room = rooms[player.roomCode];

    room.players = room.players.filter(p => p.id !== socket.id);
    delete players[socket.id];
    socket.leave(room.code);

    if (room.players.length === 0) {
        delete rooms[room.code];
        return { roomCode: room.code, action: 'room_deleted' };
    } else if (player.isHost) {
        room.players[0].isHost = true;
        room.hostId = room.players[0].id;
        return { roomCode: room.code, action: 'host_changed', newHostId: room.hostId, room };
    }
    return { roomCode: room.code, action: 'player_left', room };
}


// Debug Bot Logic
function addBot(roomCode) {
    const room = rooms[roomCode];
    if (!room) return { error: 'Sala no encontrada' };

    // Safety cap
    if (room.players.length >= 10) return { error: 'Sala llena' };

    // Prevent duplicate names
    let botName = generateRandomName();
    let attempts = 0;
    while (room.players.some(p => p.name === botName) && attempts < 10) {
        botName = generateRandomName() + (Math.floor(Math.random() * 99) + 1); // Fallback: add number
        attempts++;
    }

    const botId = `bot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const bot = {
        id: botId,
        name: botName, // Use unique name
        avatar: getRandomAvatar(),
        isHost: false,
        roomCode: roomCode,
        isBot: true,
        isOnline: true,
        score: 0
    };

    room.players.push(bot);
    players[botId] = bot;

    return { room, bot };
}

function getRoom(roomCode) {
    return rooms[roomCode];
}

function findQuickRoom() {
    // Find a room that is waiting and has space (less than 10 players)
    const availableRoom = Object.values(rooms).find(room =>
        room.status === 'waiting' && room.players.length < 10
    );
    return availableRoom ? availableRoom.code : null;
}

function getPlayer(socketId) {
    return players[socketId];
}

function kickPlayer(roomCode, hostId, targetId) {
    const room = rooms[roomCode];
    if (!room) return { error: 'Sala no encontrada' };
    if (room.hostId !== hostId) return { error: 'No tienes permiso' };

    // Validate target
    const target = room.players.find(p => p.id === targetId);
    if (!target) return { error: 'Jugador no encontrado' };
    if (target.id === hostId) return { error: 'No puedes expulsarte a ti mismo' };

    // Remove logic (similar to leave)
    room.players = room.players.filter(p => p.id !== targetId);
    delete players[targetId];
    if (disconnectTimers[targetId]) {
        clearTimeout(disconnectTimers[targetId]);
        delete disconnectTimers[targetId];
    }

    return { room, kickedId: targetId };
}

function updateSettings(roomCode, hostId, newSettings) {
    const room = rooms[roomCode];
    if (!room) return { error: 'Sala no encontrada' };
    if (room.hostId !== hostId) return { error: 'Solo el anfitrión puede cambiar ajustes' };

    // Merge settings
    room.settings = {
        ...room.settings,
        ...newSettings
    };

    return { room };
}

function updateGlobalVisuals(visuals) {
    globalVisuals = { ...globalVisuals, ...visuals };
    saveVisuals();
    return globalVisuals;
}

function getGlobalVisuals() {
    return globalVisuals;
}

module.exports = {
    createRoom,
    joinRoom,
    leaveRoom,
    kickPlayer,
    handleDisconnect,
    addBot,
    getRoom,
    getPlayer,
    rooms,
    updateSettings,
    updateProfile,
    findQuickRoom,
    updateGlobalVisuals,
    getGlobalVisuals
};


