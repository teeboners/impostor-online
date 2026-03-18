const roomController = require('../controllers/roomController');
const gameController = require('../controllers/gameController');
const fs = require('fs');

function logDebug(msg) {
    fs.appendFileSync('debug_server.log', `[${new Date().toISOString()}] ${msg}\n`);
}
logDebug("--- SERVER HANDLER STARTED ---");

module.exports = (io) => {
    io.on('connection', (socket) => {
        logDebug(`CLIENT CONNECTED: ${socket.id}`);

        socket.onAny((event, ...args) => {
            logDebug(`SOCKET_EVENT: [${event}] from ${socket.id}`);
        });

        // Send current global visuals to the new client immediately
        socket.emit('sync_visuals', roomController.getGlobalVisuals());

        // --- ROOM MANAGEMENT ---

        // Create Room (Manual)
        socket.on('create_room', () => {
            const { room, player } = roomController.createRoom(socket);
            socket.join(room.code);
            socket.emit('session_created', {
                roomCode: room.code,
                playerName: player.name,
                avatar: player.avatar
            });
            io.to(room.code).emit('update_players', room.players);
        });

        // Quick Join (Auto find or create)
        socket.on('quick_join', () => {
            logDebug(`EVENT: quick_join received from ${socket.id}`);
            try {
                const quickRoomCode = roomController.findQuickRoom();
                logDebug(`QUICK_JOIN: findQuickRoom returned ${quickRoomCode}`);

                if (quickRoomCode) {
                    const result = roomController.joinRoom(socket, quickRoomCode);
                    logDebug(`QUICK_JOIN: joinRoom status: ${result.error ? 'ERROR' : 'SUCCESS'}`);
                    if (!result.error) {
                        const { room, player } = result;
                        socket.join(room.code);
                        socket.emit('session_created', {
                            roomCode: room.code,
                            playerName: player.name,
                            avatar: player.avatar
                        });
                        socket.emit('joined_room', { roomCode: room.code, player });
                        io.to(room.code).emit('update_players', room.players);
                        logDebug(`QUICK_JOIN: Join flow completed for ${room.code}`);
                        return;
                    }
                }

                logDebug("QUICK_JOIN: Creating new room...");
                const createResult = roomController.createRoom(socket);
                const { room, player } = createResult;
                logDebug(`QUICK_JOIN: createRoom success. Code: ${room.code}`);

                socket.join(room.code);
                socket.emit('session_created', {
                    roomCode: room.code,
                    playerName: player.name,
                    avatar: player.avatar
                });
                io.to(room.code).emit('update_players', room.players);
                logDebug(`QUICK_JOIN: Create flow completed for ${room.code}`);
            } catch (err) {
                logDebug(`CRITICAL ERROR in quick_join: ${err.message}\n${err.stack}`);
            }
        });

        // Join Room (Enhanced with Rejoin)
        socket.on('join_room', (payload) => {
            console.log("DEBUG: join_room payload received:", JSON.stringify(payload));
            // Support object input for Rejoin or string for legacy
            let roomCode, playerName;

            if (typeof payload === 'object' && payload !== null) {
                roomCode = payload.roomCode;
                playerName = payload.playerName;
            } else {
                roomCode = payload;
            }

            const finalCode = roomCode ? roomCode.toUpperCase() : '';

            if (!finalCode) {
                socket.emit('error', 'Código inválido');
                return;
            }

            const result = roomController.joinRoom(socket, finalCode, playerName);

            if (result.error) {
                socket.emit('error', result.error);
                return;
            }

            const { room, player, action } = result;

            // Allow client to save session for rejoin
            socket.emit('session_created', { roomCode: room.code, playerName: player.name });

            if (action === 'rejoin') {
                console.log(`Jugador ${player.name} RECONECTADO a ${room.code}`);
                // Send Full Sync
                const gameState = gameController.getGameState(room);
                socket.emit('sync_state', gameState);

                // Re-send private role if needed
                if (room.status === 'playing') {
                    socket.emit('role_assigned', {
                        role: player.role,
                        word: player.word,
                        impostorMessage: player.impostorMessage, // NEW
                        category: room.category
                    });
                }
            } else {
                console.log(`Jugador ${player.name} unido a ${room.code}`);
                socket.emit('joined_room', { roomCode: room.code, player });
            }

            io.to(room.code).emit('update_players', room.players);
        });

        socket.on('leave_room', (roomCode) => {
            const result = roomController.leaveRoom(socket);
            if (result && result.room) {
                io.to(result.roomCode).emit('update_players', result.room.players);
            } else if (result && result.action === 'host_changed' && result.room) {
                io.to(result.roomCode).emit('update_players', result.room.players);
            }
            socket.leave(roomCode);
        });

        // --- GAME LOGIC ---

        socket.on('kick_player', (targetId) => {
            const player = roomController.getPlayer(socket.id);
            if (!player) return;
            const result = roomController.kickPlayer(player.roomCode, socket.id, targetId);

            if (!result.error) {
                // Inform the kicked player specifically
                io.to(targetId).emit('kicked');
                // Update the rest of the room
                io.to(player.roomCode).emit('update_players', result.room.players);
            } else {
                socket.emit('error', result.error);
            }
        });

        socket.on('debug_add_bot', (roomCode) => {
            const result = roomController.addBot(roomCode);
            if (!result.error) {
                io.to(roomCode).emit('update_players', result.room.players);
            }
        });

        socket.on('request_sync', () => {
            const player = roomController.getPlayer(socket.id);
            if (player) {
                const room = roomController.getRoom(player.roomCode);
                if (room) {
                    const gameState = gameController.getGameState(room);
                    socket.emit('sync_state', gameState);

                    // FIX: Re-send private role data on sync request if playing
                    if (room.status === 'playing') {
                        console.log(`[SYNC] Sending role to ${player.name}:`, player.role, player.word);
                        socket.emit('role_assigned', {
                            role: player.role,
                            word: player.word,
                            impostorMessage: player.impostorMessage,
                            category: room.category
                        });
                    }
                }
            }
        });

        socket.on('start_game', (payload) => {
            const actualCode = typeof payload === 'object' && payload !== null ? payload.roomCode : payload;
            // Pass io for individual role emissions
            const result = gameController.startGame(actualCode, io);

            if (result.error) {
                socket.emit('error', result.error);
                return;
            }

            const { room, action } = result;

            if (action === 'start_intro') {
                // 1. INTRO PHASE
                io.to(actualCode).emit('phase_intro_started');

                // 2. REVEAL PHASE (After 3s)
                setTimeout(() => {
                    // Send roles individually
                    room.players.forEach(p => {
                        io.to(p.id).emit('role_assigned', {
                            role: p.role,
                            word: p.word,
                            impostorMessage: p.impostorMessage, // NEW
                            category: room.category
                        });
                    });

                    io.to(actualCode).emit('phase_reveal_started');

                    // 3. GAME PHASE (After 5s Reveal)
                    setTimeout(() => {
                        try {
                            gameController.startTurnPhase(actualCode, io);
                        } catch (err) {
                            console.error("Error starting turn phase:", err);
                        }
                        room.voteTimeout = setTimeout(() => {
                            const currentRoom = roomController.getRoom(roomCode); // Fix: verify strict access
                            if (currentRoom && currentRoom.phase === 'voting') {
                                // Force end
                                // We need a way to force result from controller without direct access if possible, or just reimplement wrap
                                // Actually, gameController.startVote sets a timeout that calls calculateResults internaly and emits... 
                                // Wait, looking at gameController.js:216 it emits 'game_over'. We need to fix that too.
                                // gameController.js handles the timeout internally and emits. 
                                // We should check gameController.js emission logic.
                            }
                        }, 60000); // This is the vote timeout, not 5s Reveal.
                    }, 5000); // 5s Reveal
                }, 3000); // 3s Intro
            }
        });

        socket.on('submit_clue', ({ roomCode, clue }) => {
            // ... existing clue logic ... (no changes needed locally if controller handles it)
            const result = gameController.submitClue(roomCode, socket.id, clue);
            if (result.error) return socket.emit('error', result.error);

            const { room, action } = result;
            io.to(roomCode).emit('clue_submitted', {
                playerId: socket.id,
                playerName: room.clues[room.clues.length - 1].playerName,
                clue: clue
            });

            if (action === 'start_reveal') {
                // Trigger Reveal Phase
                gameController.startRevealPhase(roomCode, io, result.clueData);
            } else if (action === 'start_discussion') {
                // Legacy fallback or future use
                io.to(roomCode).emit('discussion_started');
                gameController.handleBotVoting(roomCode, io);
            } else {
                // Fallback
                const nextPlayer = room.players.find(p => p.id === room.currentTurn);
                io.to(roomCode).emit('turn_changed', {
                    currentTurn: room.currentTurn,
                    currentTurnName: nextPlayer ? nextPlayer.name : 'Desconocido'
                });
                gameController.handleBotTurn(roomCode, io);
            }
        });

        socket.on('start_vote', (roomCode) => {
            const result = gameController.startVote(roomCode);
            if (result && result.room) {
                // Include skip option info? Handled by frontend awareness
                io.to(roomCode).emit('voting_started', result.room.players);
                gameController.processBotVotes(roomCode, io);
            }
        });

        socket.on('submit_vote', ({ roomCode, targetId }) => {
            const result = gameController.submitVote(roomCode, socket.id, targetId, io);

            if (result.error) return socket.emit('error', result.error);

            if (result.action === 'game_over' || result.action === 'round_end') {
                io.to(roomCode).emit('round_end', result.result);
                io.to(roomCode).emit('update_players', result.room.players);

                // Start Timer for next round
                gameController.startNextRoundTimer(roomCode, io);
            }
        });

        socket.on('skip_vote', (roomCode) => {
            const result = gameController.skipVote(roomCode, socket.id);
            if (result.error) return socket.emit('error', result.error);

            if (result.action === 'round_skipped_continue') {
                // Notify back to clues
                io.to(roomCode).emit('round_skipped');
                // Restart turn phase logic
                gameController.startTurnPhase(roomCode, io);
            }
        });

        socket.on('submit_decision', ({ roomCode, decision }) => {
            const result = gameController.submitDecision(roomCode, socket.id, decision, io);
            if (result && result.error) return socket.emit('error', result.error);

            // If result is returned, it might be { room } from startVote
            if (result && result.room && result.room.phase === 'voting') {
                io.to(roomCode).emit('voting_started', result.room.players);
                gameController.processBotVotes(roomCode, io);
            }
        });

        // HOST TOOLS
        socket.on('update_settings', ({ roomCode, settings }) => {
            const result = roomController.updateSettings(roomCode, socket.id, settings);
            if (result.error) return socket.emit('error', result.error);

            // Notify room of settings change
            io.to(roomCode).emit('settings_updated', result.room.settings);
        });

        socket.on('update_profile', (payload) => {
            const result = roomController.updateProfile(socket.id, payload);
            if (result.error) return socket.emit('error', result.error);

            io.to(result.room.code).emit('update_players', result.room.players);
            // Removed session_created emit to prevent client view reset
        });


        // Debug: Add Bot
        socket.on('debug_add_bot', (roomCode) => {
            const result = roomController.addBot(roomCode);
            if (result.error) return socket.emit('error', result.error);
            io.to(roomCode).emit('update_players', result.room.players);
        });

        // --- ADMIN DESIGN TOOLS ---
        socket.on('admin_visual_update', ({ roomCode, visuals }) => {
            // Update global settings and broadcast to EVERYONE on the server
            const updatedVisuals = roomController.updateGlobalVisuals(visuals);
            io.emit('sync_visuals', updatedVisuals);
        });

        socket.on('admin_pause_game', (roomCode) => {
            // Logic to pause timers would go here (e.g., roomCtx.paused = true)
            // For now, toggle a global UI notification
            io.to(roomCode).emit('admin_notification', { message: "⚠️ JUEGO PAUSADO POR ADMIN", type: "warning" });
            io.to(roomCode).emit('pause_timers');
        });

        socket.on('admin_skip_turn', (roomCode) => {
            // Force continue turn logic
            gameController.advanceTurn(roomCode, io);
        });

        socket.on('admin_reset_room', (roomCode) => {
            const room = roomController.getRoom(roomCode);
            if (room) {
                room.status = 'lobby';
                room.players.forEach(p => {
                    p.role = null;
                    p.word = null;
                    p.clues = [];
                });
                io.to(roomCode).emit('session_created', { roomCode: room.code }); // Triggers lobby view
                io.to(roomCode).emit('update_players', room.players);
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            // Use new timeout logic
            roomController.handleDisconnect(socket, io);
        });
    });
};
