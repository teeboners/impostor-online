const { getRoom } = require('./roomController');
const { getRandomWord } = require('../utils/wordList');

// Fisher-Yates Shuffle
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
}

function startGame(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return { error: 'Sala no encontrada' };
    if (room.players.length < 3) return { error: 'Se necesitan mínimo 3 jugadores' };

    room.status = 'playing';
    room.clues = [];
    room.votes = {};
    room.turnIndex = 0;

    const players = room.players;
    const impostorIndex = Math.floor(Math.random() * players.length);
    const wordData = getRandomWord();

    room.secretWord = wordData.word;
    room.category = wordData.category;
    room.targetClues = wordData.clues;
    room.categoryClues = wordData.allCluesInCategory;
    room.impostorId = players[impostorIndex].id;

    players.forEach((p, index) => {
        if (index === impostorIndex) {
            p.role = 'impostor';
            p.word = null;
            p.impostorMessage = "No tienes palabra secreta. Eres el impostor.";
        } else {
            p.role = 'crewmate';
            p.word = wordData.word;
            p.impostorMessage = null;
        }
        p.hasVoted = false;

        if (io) {
            io.to(p.id).emit('role_assigned', {
                role: p.role,
                word: p.word,
                impostorMessage: p.impostorMessage,
                category: null
            });
        }
    });

    room.turnOrder = shuffle(players.map(p => p.id));
    room.currentTurn = room.turnOrder[0];
    room.phase = 'intro';

    if (io) io.to(roomCode).emit('game_started');

    return { room, action: 'start_intro' };
}

function startTurnPhase(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;

    room.phase = 'clue_input';
    const currentPlayer = room.players.find(p => p.id === room.currentTurn);

    io.to(roomCode).emit('phase_input_started', {
        currentTurn: room.currentTurn,
        currentTurnName: currentPlayer ? currentPlayer.name : 'Desconocido',
        duration: 20
    });

    handleBotTurn(roomCode, io);

    startTurnTimer(roomCode, io, 20, () => {
        // Force refresh room state
        const r = getRoom(roomCode);
        if (!r || r.phase !== 'clue_input') return;

        const p = r.players.find(curr => curr.id === r.currentTurn);
        if (p) {
            console.log(`[Turn Timer] Force submitting for ${p.name} (Penalty applied)`);

            // Penalty: -10 pts
            p.score = Math.max(0, (p.score || 0) - 10);

            // Notification Message
            const penaltyMsg = `[CHAT] El jugador ${p.name} no ha puesto una pista. Penalización: -10 pts`;

            let result = submitClue(roomCode, p.id, "(Sin tiempo...)");

            // Fallback: If submitClue failed (e.g. somehow ID mismatch), force advance
            if (result.error) {
                console.warn(`[Turn Timer] Submit failed: ${result.error}. Forcing advance.`);
                r.clues.push({ playerId: p.id, playerName: p.name, text: "(Tiempo agotado)" });
                p.lastClue = "(Tiempo agotado)";
                result = { room: r, action: 'start_reveal', clueData: { playerName: p.name, clue: "(Tiempo agotado)" } };
            }

            if (result && result.action === 'start_reveal') {
                // Send penalty message to chat
                io.to(roomCode).emit('clue_submitted', { playerName: "SISTEMA", clue: penaltyMsg });

                io.to(roomCode).emit('clue_submitted', result.clueData);
                io.to(roomCode).emit('update_players', getGameState(r).players); // Update ranking with new scores
                startRevealPhase(roomCode, io, result.clueData);
            }
        } else {
            advanceTurn(roomCode, io);
        }
    });
}

function submitClue(roomCode, playerId, clue) {
    const room = getRoom(roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'clue_input') return { error: 'No es momento de pistas' };
    if (room.currentTurn !== playerId) return { error: 'No es tu turno' };

    const player = room.players.find(p => p.id === playerId);
    room.clues.push({ playerId: player.id, playerName: player.name, text: clue });
    player.lastClue = clue;

    if (room.turnTimer) clearTimeout(room.turnTimer);

    return {
        room,
        action: 'start_reveal',
        clueData: { playerName: player.name, clue }
    };
}

function startRevealPhase(roomCode, io, clueData) {
    const room = getRoom(roomCode);
    if (!room) return;

    room.phase = 'clue_reveal';
    io.to(roomCode).emit('phase_reveal_started', { ...clueData, duration: 8 }); // 8 seconds (to allow for the 5s spotlight)
    io.to(roomCode).emit('update_players', getGameState(room).players);

    startTurnTimer(roomCode, io, 8, () => {
        advanceTurn(roomCode, io);
    });
}

function advanceTurn(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;

    room.turnIndex++;
    if (room.turnIndex >= room.turnOrder.length) {
        startRoundDecision(roomCode, io);
    } else {
        room.currentTurn = room.turnOrder[room.turnIndex];
        startTurnPhase(roomCode, io);
    }
}

function startRoundDecision(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;

    room.phase = 'round_decision';
    room.votes = {};
    room.players.forEach(p => p.hasVoted = false);

    io.to(roomCode).emit('phase_decision_started', { duration: 45 });

    handleBotDecision(roomCode, io);

    if (room.decisionTimeout) clearTimeout(room.decisionTimeout);
    room.decisionTimeout = setTimeout(() => {
        const currentRoom = getRoom(roomCode);
        if (!currentRoom || currentRoom.phase !== 'round_decision') return;

        let voteCount = 0;
        let continueCount = 0;
        Object.values(currentRoom.votes).forEach(v => {
            if (v === 'VOTE') voteCount++;
            else continueCount++;
        });

        const outcome = voteCount > continueCount ? 'VOTE' : 'CONTINUE';
        io.to(roomCode).emit('decision_result', { outcome, voteCount, continueCount });

        // Wait 5 seconds to show result
        setTimeout(() => {
            if (outcome === 'VOTE') startVote(roomCode, io);
            else startNextRoundClues(roomCode, io);
        }, 5000);
    }, 46000);
}

function submitDecision(roomCode, playerId, decision, io) {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'round_decision') return { error: 'No es momento de decidir' };

    const player = room.players.find(p => p.id === playerId);
    if (!player || player.hasVoted) return { error: 'Ya has decidido' };

    room.votes[playerId] = decision;
    player.hasVoted = true;

    io.to(roomCode).emit('decision_update', { playerId, decision });

    const onlinePlayers = room.players.filter(p => p.isOnline);
    const votesReceived = Object.keys(room.votes).length;

    if (votesReceived >= onlinePlayers.length) {
        if (room.decisionTimeout) clearTimeout(room.decisionTimeout);

        let voteCount = 0;
        let continueCount = 0;
        Object.values(room.votes).forEach(v => {
            if (v === 'VOTE') voteCount++;
            else if (v === 'CONTINUE') continueCount++;
        });

        const outcome = voteCount > continueCount ? 'VOTE' : 'CONTINUE';

        // Use a flag to prevent multiple triggers if logic overlaps
        if (room.phase === 'round_decision') {
            room.phase = 'decision_processed'; // Transitional state
            io.to(roomCode).emit('decision_result', { outcome, voteCount, continueCount });

            setTimeout(() => {
                if (outcome === 'VOTE') {
                    startVote(roomCode, io);
                } else {
                    startNextRoundClues(roomCode, io);
                }
            }, 5000);
        }
        return { room, action: 'decision_processed' };
    }
    return { room, action: 'decision_cast' };
}

function startVote(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;
    room.phase = 'voting';
    room.votes = {};
    room.players.forEach(p => p.hasVoted = false);

    io.to(roomCode).emit('voting_started', room.players);
    processBotVotes(roomCode, io);

    if (room.voteTimeout) clearTimeout(room.voteTimeout);
    room.voteTimeout = setTimeout(() => {
        const currentRoom = getRoom(roomCode);
        if (currentRoom && currentRoom.phase === 'voting') {
            const res = calculateResults(currentRoom);
            if (io) {
                io.to(roomCode).emit('round_end', res.result);
                io.to(roomCode).emit('update_players', res.room.players);
                startNextRoundTimer(roomCode, io);
            }
        }
    }, 60000);

    return { room };
}

function submitVote(roomCode, voterId, targetId, io) {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'voting') return { error: 'No es momento de votar' };

    const voter = room.players.find(p => p.id === voterId);
    if (!voter || voter.hasVoted) return { error: 'Ya has votado' };

    room.votes[voterId] = targetId;
    voter.hasVoted = true;

    const tally = {};
    Object.values(room.votes).forEach(tid => {
        tally[tid] = (tally[tid] || 0) + 1;
    });
    if (io) io.to(roomCode).emit('vote_update', { tally });

    const onlinePlayers = room.players.filter(p => p.isOnline);
    if (Object.keys(room.votes).length >= onlinePlayers.length) {
        if (room.voteTimeout) clearTimeout(room.voteTimeout);
        return calculateResults(room);
    }
    return { room, action: 'vote_cast' };
}

function calculateResults(room) {
    room.phase = 'results';
    const voteCounts = {};
    Object.values(room.votes).forEach(tid => { voteCounts[tid] = (voteCounts[tid] || 0) + 1; });

    let maxVotes = 0, eliminatedId = null, tie = false;
    Object.entries(voteCounts).forEach(([id, count]) => {
        if (count > maxVotes) { maxVotes = count; eliminatedId = id; tie = false; }
        else if (count === maxVotes) { tie = true; }
    });

    if (eliminatedId === 'SKIP') {
        room.phase = 'clue_input';
        room.votes = {};
        room.players.forEach(p => p.hasVoted = false);
        return { room, action: 'round_skipped_continue' };
    }

    let winner = 'impostor', message = '';
    const impostor = room.players.find(p => p.id === room.impostorId);
    const impostorName = impostor ? impostor.name : 'Desconocido';

    if (tie) {
        message = 'Empate en votos. ¡El Impostor sobrevive y gana!';
        winner = 'impostor';
        if (impostor) impostor.score += 10;
    } else if (eliminatedId === room.impostorId) {
        message = '¡Impostor eliminado! Ganan los Tripulantes.';
        winner = 'crewmate';
        room.players.forEach(p => { if (p.role === 'crewmate') p.score += 5; });
    } else {
        const eliminatedName = room.players.find(p => p.id === eliminatedId)?.name || 'Desconocido';
        message = `${eliminatedName} no era el Impostor. ¡El Impostor gana!`;
        winner = 'impostor';
        if (impostor) impostor.score += 10;
    }

    return {
        room,
        action: 'round_end', // Changed from game_over
        result: {
            winner, message, impostorName,
            secretWord: room.secretWord,
            votes: voteCounts,
            scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, avatar: p.avatar }))
        }
    };
}

// NEW: Start Next Round Logic
function startNextRoundTimer(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;

    room.phase = 'round_cooldown';
    // Reset round-specific state immediately or wait? 
    // Let's notify front-end first.

    // We already sent 'game_over' (which we'll rename/reuse or specific round_end event)
    // Actually, calculateResults returns the data, socketHandler emits it.
    // We need to tell socketHandler to call this.

    // Timer for 15s
    setTimeout(() => {
        const r = getRoom(roomCode);
        if (r && r.phase === 'round_cooldown') {
            startNewRound(roomCode, io);
        }
    }, 15000);
}

function startNewRound(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;

    // Reset Game State but keep players/scores
    room.clues = [];
    room.votes = {};
    room.turnIndex = 0;

    // New Word & Roles
    const players = room.players;
    if (players.length < 3) {
        room.status = 'waiting';
        room.phase = 'lobby';
        io.to(roomCode).emit('error', 'No hay suficientes jugadores para continuar.');
        // Maybe go back to lobby?
        return;
    }

    const impostorIndex = Math.floor(Math.random() * players.length);
    const wordData = getRandomWord();

    room.secretWord = wordData.word;
    room.category = wordData.category;
    room.targetClues = wordData.clues;
    room.categoryClues = wordData.allCluesInCategory;
    room.impostorId = players[impostorIndex].id;

    players.forEach((p, index) => {
        if (index === impostorIndex) {
            p.role = 'impostor';
            p.word = null;
            p.impostorMessage = "No tienes palabra secreta. Eres el impostor.";
        } else {
            p.role = 'crewmate';
            p.word = wordData.word; // Corrected variable
            p.impostorMessage = null;
        }
        p.hasVoted = false;
        p.lastClue = null;
    });

    // Re-shuffle turn order
    room.turnOrder = shuffle(players.map(p => p.id));
    room.currentTurn = room.turnOrder[0];
    room.phase = 'intro';

    // Emit Start
    io.to(roomCode).emit('new_round_started');

    // Send new roles
    players.forEach(p => {
        io.to(p.id).emit('role_assigned', {
            role: p.role,
            word: p.word,
            impostorMessage: p.impostorMessage,
            category: null
        });
    });

    handleGameStartFlow(roomCode, io);
}

// Logic extracted from socketHandler to be reusable
function handleGameStartFlow(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;

    io.to(roomCode).emit('phase_intro_started');

    // 2. REVEAL PHASE (After 3s)
    setTimeout(() => {
        io.to(roomCode).emit('phase_reveal_started');

        // 3. GAME PHASE (After 5s Reveal)
        setTimeout(() => {
            try {
                startTurnPhase(roomCode, io);
            } catch (err) {
                console.error("Error starting turn phase:", err);
            }
        }, 5000); // 5s Reveal

    }, 3000); // 3s Intro
}

function skipVote(roomCode, playerId) {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'voting') return { error: 'No es momento de votar' };
    const voter = room.players.find(p => p.id === playerId);
    if (voter.hasVoted) return { error: 'Ya has votado' };
    room.votes[playerId] = 'SKIP';
    voter.hasVoted = true;
    if (Object.keys(room.votes).length >= room.players.filter(p => p.isOnline).length) return calculateResults(room);
    return { room, action: 'vote_skipped' };
}

function startNextRoundClues(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room) return;
    room.turnIndex = 0;
    room.currentTurn = room.turnOrder[0];
    startTurnPhase(roomCode, io);
}

function startTurnTimer(roomCode, io, duration, callback) {
    const room = getRoom(roomCode);
    if (!room) return;
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = setTimeout(callback, duration * 1000);
}

function getGameState(room) {
    return {
        roomCode: room.code,
        players: room.players.map(p => ({
            id: p.id, name: p.name, isHost: p.isHost, isOnline: p.isOnline,
            hasVoted: p.hasVoted, lastClue: p.lastClue, score: p.score, avatar: p.avatar
        })),
        status: room.status, phase: room.phase, currentTurn: room.currentTurn, clues: room.clues
    };
}

function handleBotTurn(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room || !room.currentTurn) return;
    const currentPlayer = room.players.find(p => p.id === room.currentTurn);
    if (currentPlayer && currentPlayer.isBot) {
        setTimeout(() => {
            const currentRoom = getRoom(roomCode);
            if (currentRoom && currentRoom.status === 'playing' && currentRoom.phase === 'clue_input') {
                let clue = "";
                if (currentPlayer.role === 'impostor') {
                    // Impostor bot picks a random clue from the entire category to try and blend in
                    const pool = currentRoom.categoryClues || ["Misterioso", "Rápido", "Comida", "Grande"];
                    clue = pool[Math.floor(Math.random() * pool.length)];
                } else {
                    // Crewmate bot picks a coherent clue
                    const pool = currentRoom.targetClues || ["Especial", "Único", "Clave"];
                    clue = pool[Math.floor(Math.random() * pool.length)];
                }

                const result = submitClue(roomCode, currentPlayer.id, clue);
                if (!result.error) {
                    io.to(roomCode).emit('clue_submitted', { playerName: currentPlayer.name, clue });

                    // Small chance of additional bot chat
                    if (Math.random() > 0.7) {
                        setTimeout(() => {
                            const chatMsgs = ["Listo.", "Ahí va mi pista.", "Espero que ayude.", "¿Qué opinan?"];
                            const msg = chatMsgs[Math.floor(Math.random() * chatMsgs.length)];
                            io.to(roomCode).emit('clue_submitted', { playerName: currentPlayer.name, clue: `[CHAT] ${msg}` });
                        }, 1000);
                    }

                    if (result.action === 'start_reveal') startRevealPhase(roomCode, io, result.clueData);
                }
            }
        }, 3000 + Math.random() * 3000);
    }
}

function handleBotDecision(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'round_decision') return;
    room.players.filter(p => p.isBot && !p.hasVoted).forEach(bot => {
        setTimeout(() => {
            const currentRoom = getRoom(roomCode);
            if (currentRoom && currentRoom.phase === 'round_decision') {
                // Bots now vote to kick if someone was suspicious last round, or randomly with higher chance
                // Check if any player has high suspicion (for now, random but weighted)
                let decision = 'CONTINUE';
                if (Math.random() > 0.4) { // Increased chance to VOTE (60%)
                    decision = 'VOTE';
                }
                submitDecision(roomCode, bot.id, decision, io);
            }
        }, 2000 + Math.random() * 5000);
    });
}

function processBotVotes(roomCode, io) {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'voting') return;

    room.players.filter(p => p.isBot && !p.hasVoted).forEach(bot => {
        setTimeout(() => {
            const currentRoom = getRoom(roomCode);
            if (currentRoom && currentRoom.phase === 'voting') {
                let targetId = null;

                if (bot.role === 'impostor') {
                    // Impostor bot votes for a random crewmate
                    const crewmates = currentRoom.players.filter(p => p.id !== bot.id && p.role !== 'impostor');
                    if (crewmates.length > 0) {
                        targetId = crewmates[Math.floor(Math.random() * crewmates.length)].id;
                    }
                } else {
                    // Crewmate bot tries to vote for the most suspicious player (least coherent clues)
                    const suspicionScores = {};
                    currentRoom.players.forEach(p => { if (p.id !== bot.id) suspicionScores[p.id] = 0; });

                    currentRoom.clues.forEach(clue => {
                        if (clue.playerId !== bot.id) {
                            const isCoherent = currentRoom.targetClues?.some(tc => tc.toLowerCase() === clue.text.toLowerCase());
                            if (!isCoherent) {
                                suspicionScores[clue.playerId] = (suspicionScores[clue.playerId] || 0) + 1;
                            }
                        }
                    });

                    // Find player with highest suspicion
                    let maxSuspicion = -1;
                    Object.entries(suspicionScores).forEach(([id, score]) => {
                        if (score > maxSuspicion) {
                            maxSuspicion = score;
                            targetId = id;
                        }
                    });

                    // Tie breaker or no suspicion: random other player
                    if (!targetId || maxSuspicion === 0) {
                        const others = currentRoom.players.filter(p => p.id !== bot.id);
                        targetId = others[Math.floor(Math.random() * others.length)].id;
                    }
                }

                if (targetId) {
                    // Small chat interaction before voting
                    if (Math.random() > 0.6) {
                        const chatMsgs = ["Tengo mis dudas de alguien...", "Voto por sospecha.", "No me convencen esas pistas.", "Creo saber quién es."];
                        io.to(roomCode).emit('clue_submitted', { playerName: bot.name, clue: `[CHAT] ${chatMsgs[Math.floor(Math.random() * chatMsgs.length)]}` });
                    }

                    const result = submitVote(roomCode, bot.id, targetId, io);
                    if (result && result.action === 'game_over') io.to(roomCode).emit('game_over', result.result);
                } else {
                    // If no target, try to skip less frequently or just pick random to ensure movement
                    // OLD: skip
                    // NEW: Force vote random if no strong suspicion to avoid stalling
                    // But allow SKIP sometimes
                    if (Math.random() > 0.8) {
                        skipVote(roomCode, bot.id);
                    } else {
                        // Vote random other
                        const others = currentRoom.players.filter(p => p.id !== bot.id);
                        const rnd = others[Math.floor(Math.random() * others.length)];
                        if (rnd) submitVote(roomCode, bot.id, rnd.id, io);
                    }
                }
            }
        }, 3000 + Math.random() * 7000);
    });
}

module.exports = {
    startGame, startTurnPhase, submitClue, startVote, submitVote, skipVote,
    submitDecision, getGameState, handleBotTurn, handleBotVoting: processBotVotes,
    processBotVotes, startRevealPhase, startRoundDecision, startNextRoundTimer, startNewRound
};
