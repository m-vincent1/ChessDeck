/* ===================================================
   ÉchecDeck – Game Logic v5
   =================================================== */

// ===== PIECE GLYPHS =====
const PIECE_GLYPH = {
    K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟',
    k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'
};

// ===== CARD DEFINITIONS =====
const NORMAL_CARDS = [
    { id:'transformation', name:'Transformation', icon:'🔄', desc:'Transforme une pièce alliée en Tour, Fou ou Cavalier pendant 2 tours.' },
    { id:'gel', name:'Gel', icon:'❄️', desc:'Gèle une pièce ennemie pendant 1 tour. Elle ne peut ni bouger ni être capturée.' },
    { id:'agrandissement', name:'Agrandissement', icon:'📐', desc:'Ajoute 1 ligne ou 1 colonne au plateau. Jouée immédiatement !' },
    { id:'murale', name:'Murale', icon:'🧱', desc:'Place un mur sur 1 à 3 cases alignées pendant 1 tour.' },
    { id:'echange', name:'Échange', icon:'🔀', desc:'Échangez la position de deux pièces alliées.' },
    { id:'vision', name:'Vision', icon:'👁️', desc:'Révèle la prochaine carte qui sera tirée.' },
    { id:'bouclier', name:'Bouclier', icon:'🛡️', desc:'Protège une pièce alliée contre la capture pendant 1 tour.' },
    { id:'brouillard', name:'Brouillard', icon:'🌫️', desc:"Cache vos pièces à l'adversaire pendant 1 tour." },
    { id:'resurrection', name:'Résurrection', icon:'💀', desc:'Ramène une pièce capturée sur vos 2 premières lignes pendant 3 tours.' },
];

const SECRET_CARDS_DEF = [
    { id:'teleportation', name:'Téléportation du Roi', icon:'👑', desc:"Déplacez votre roi sur n'importe quelle case libre de votre moitié du plateau." },
    { id:'transform_perm', name:'Transformation Permanente', icon:'⚗️', desc:'Transforme définitivement un pion allié en Tour, Fou ou Cavalier.' },
    { id:'ajout_pions', name:'Ajout de Pions', icon:'♟️', desc:'Ajoute 2 pions sur la ligne de départ (si 2+ pions perdus).' },
];

// ===== GAME STATE =====
let G = {
    board: [],
    rows: 8, cols: 8,
    currentTurn: 'white',
    selectedCell: null,
    validMoves: [],
    timers: { white:0, black:0 },
    timerInterval: null,
    timersPaused: false,
    gameActive: false,
    fullTurnCount: 0,
    halfMoveCount: 0,
    drawCountdown: 4,
    hand: { white:[], black:[] },
    cardPlayedThisTurn: false,
    cardPhase: null,
    activeCard: null,
    cardCountdown: 0,
    cardCountdownInterval: null,
    cardTargets: [],
    activeEffects: [],
    graveyardWhite: [],
    graveyardBlack: [],
    secretCards: { white:null, black:null },
    secretUsed: { white:false, black:false },
    nextCard: null,
    visionActive: false,
    gameMinutes: 10,
    movesWhite: 0,
    movesBlack: 0,
    _expandInterval: null,
    vsAI: false,
    aiColor: 'black',
    aiDifficulty: 'normal',
    pendingDraw: { white: false, black: false },
};

let _boardZoomed = false;

// ===== AUDIO =====
function playMoveSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        const sr  = ctx.sampleRate;

        // Couche 1 : bruit filtré grave (résonance bois)
        const buf = ctx.createBuffer(1, Math.floor(sr * 0.18), sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++)
            d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.03));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.setValueAtTime(700, now);
        lpf.frequency.exponentialRampToValueAtTime(120, now + 0.14);
        lpf.Q.value = 3;
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.45, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        src.connect(lpf); lpf.connect(g1); g1.connect(ctx.destination);
        src.start(now);

        // Couche 2 : choc initial (fréquence grave descendante)
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(210, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.06);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.25, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(g2); g2.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.06);
    } catch(e) {}
}

function playCardSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
}

// ===== MENU =====
function showGameModeSelect() {
    document.getElementById('menu-main').style.display = 'none';
    document.getElementById('menu-opponent').style.display = 'flex';
}
function showOpponentSelect() {
    document.getElementById('menu-mode').style.display = 'none';
    document.getElementById('menu-difficulty').style.display = 'none';
    document.getElementById('menu-main').style.display = 'none';
    document.getElementById('menu-opponent').style.display = 'flex';
}
function showMainMenu() {
    document.getElementById('menu-opponent').style.display = 'none';
    document.getElementById('menu-difficulty').style.display = 'none';
    document.getElementById('menu-mode').style.display = 'none';
    document.getElementById('menu-main').style.display = 'flex';
}
function selectOpponent(type) {
    G.vsAI = (type === 'ai');
    document.getElementById('menu-opponent').style.display = 'none';
    if (G.vsAI) {
        document.getElementById('menu-difficulty').style.display = 'flex';
    } else {
        document.getElementById('menu-mode').style.display = 'flex';
    }
}
function selectDifficulty(diff) {
    G.aiDifficulty = diff;
    document.getElementById('menu-difficulty').style.display = 'none';
    document.getElementById('menu-mode').style.display = 'flex';
}

// ===== START GAME =====
function startGame(minutes) {
    G.gameMinutes = minutes;
    G.timers.white = minutes * 60;
    G.timers.black = minutes * 60;
    G.currentTurn = 'white';
    G.selectedCell = null; G.validMoves = [];
    G.gameActive = false; G.timersPaused = false;
    G.fullTurnCount = 0; G.halfMoveCount = 0;
    G.drawCountdown = 4;
    G.hand = { white:[], black:[] };
    G.cardPlayedThisTurn = false;
    G.cardPhase = null; G.activeCard = null; G.cardTargets = [];
    G.activeEffects = [];
    G.graveyardWhite = []; G.graveyardBlack = [];
    G.secretCards = { white:null, black:null };
    G.secretUsed = { white:false, black:false };
    G.nextCard = null; G.visionActive = false;
    G.rows = 8; G.cols = 8;
    G.movesWhite = 0; G.movesBlack = 0;
    G._expandInterval = null;
    G.pendingDraw = { white: false, black: false };
    _boardZoomed = false;
    document.documentElement.style.setProperty('--cell-size', '78px');

    if (G.timerInterval) clearInterval(G.timerInterval);
    if (G.cardCountdownInterval) clearInterval(G.cardCountdownInterval);

    document.getElementById('menu-screen').style.display = 'none';

    // Adapter l'UI pour le mode IA
    const blackName = document.getElementById('player-black-name');
    const forfeitBlack = document.getElementById('forfeit-btn-black');
    if (G.vsAI) {
        if (blackName) blackName.textContent = '🤖 IA';
        if (forfeitBlack) forfeitBlack.style.display = 'none';
    } else {
        if (blackName) blackName.textContent = 'Joueur Noir';
        if (forfeitBlack) forfeitBlack.style.display = '';
    }

    // Afficher le plateau de jeu flouté en arrière-plan pendant la sélection des cartes secrètes
    initBoard();
    document.getElementById('game-screen').style.display = 'flex';
    renderBoard();
    renderHandCards();
    updateTimerDisplay();
    updateTurnIndicator();
    updateActivePlayer();
    updateDrawCounter();
    clearGraveyardsUI();

    showSecretCardSelection('white');
}

function backToMenu() {
    if (G.timerInterval) clearInterval(G.timerInterval);
    if (G.cardCountdownInterval) clearInterval(G.cardCountdownInterval);
    if (G._expandInterval) clearInterval(G._expandInterval);
    G.gameActive = false; G.cardPhase = null;
    _boardZoomed = false;
    document.documentElement.style.setProperty('--cell-size', '78px');
    document.getElementById('game-screen').classList.remove('board-zoom-active');
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('secret-selection-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
    document.getElementById('menu-main').style.display = 'flex';
    document.getElementById('menu-mode').style.display = 'none';
    document.getElementById('menu-opponent').style.display = 'none';
    document.getElementById('menu-difficulty').style.display = 'none';
    document.getElementById('view-board-overlay').style.display = 'none';
    hideAllOverlays();
}

function hideAllOverlays() {
    ['drawn-card-panel','card-action-overlay','transform-picker','expand-picker',
     'resurrection-overlay','secret-card-modal','gameover-modal','forfeit-modal',
     'card-gallery-modal','card-draw-overlay','view-board-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

// ===== SECRET CARD SELECTION =====
let ssTimer = null, ssSeconds = 10;

function showSecretCardSelection(player) {
    const screen = document.getElementById('secret-selection-screen');
    screen.style.display = 'flex';
    document.getElementById('ss-title').textContent =
        (player === 'white' ? 'Joueur Blanc' : 'Joueur Noir') + ' — Choisissez votre carte secrète';

    const container = document.getElementById('ss-cards');
    container.innerHTML = '';
    SECRET_CARDS_DEF.forEach(card => {
        const div = document.createElement('div');
        div.className = 'ss-card';
        div.innerHTML = `<div class="ss-card-icon">${card.icon}</div>
            <div class="ss-card-name">${card.name}</div>
            <div class="ss-card-desc">${card.desc}</div>`;
        div.onclick = () => selectSecretCard(player, card, div);
        container.appendChild(div);
    });

    ssSeconds = 10;
    document.getElementById('ss-countdown').textContent = ssSeconds;
    if (ssTimer) clearInterval(ssTimer);
    ssTimer = setInterval(() => {
        ssSeconds--;
        document.getElementById('ss-countdown').textContent = ssSeconds;
        if (ssSeconds <= 0) {
            clearInterval(ssTimer);
            if (!G.secretCards[player]) G.secretCards[player] = SECRET_CARDS_DEF[0];
            finishSecretSelection(player);
        }
    }, 1000);
}

function selectSecretCard(player, card, el) {
    G.secretCards[player] = card;
    el.parentElement.querySelectorAll('.ss-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    setTimeout(() => { clearInterval(ssTimer); finishSecretSelection(player); }, 600);
}

function finishSecretSelection(player) {
    if (player === 'white') {
        if (G.vsAI) {
            // L'IA choisit une carte secrète aléatoire
            G.secretCards.black = SECRET_CARDS_DEF[Math.floor(Math.random() * SECRET_CARDS_DEF.length)];
            _startGameAfterSelection();
        } else {
            showSecretCardSelection('black');
        }
    } else {
        _startGameAfterSelection();
    }
}

function _startGameAfterSelection() {
    document.getElementById('secret-selection-screen').style.display = 'none';
    updateSecretCardUI();
    G.gameActive = true;
    renderBoard();
    renderHandCards();
    updateTimerDisplay();
    updateTurnIndicator();
    updateActivePlayer();
    updateDrawCounter();
    clearGraveyardsUI();
    startTimer();
}

function updateSecretCardUI() {
    const wCard = G.secretCards.white;
    if (wCard) {
        document.getElementById('sc-front-icon-white').textContent = wCard.icon;
        document.getElementById('sc-front-name-white').textContent = wCard.name;
        document.getElementById('sc-front-type-white').textContent = 'Secrète';
    }
}

// ===== BOARD INIT =====
function initBoard() {
    G.rows = 8; G.cols = 8;
    G.board = [
        ['r','n','b','q','k','b','n','r'],
        ['p','p','p','p','p','p','p','p'],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        ['P','P','P','P','P','P','P','P'],
        ['R','N','B','Q','K','B','N','R']
    ];
}

// ===== RENDER =====
function renderBoard() {
    const boardEl = document.getElementById('chessboard');
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${G.cols}, var(--cell-size))`;
    boardEl.style.gridTemplateRows = `repeat(${G.rows}, var(--cell-size))`;

    renderLabels();

    for (let r = 0; r < G.rows; r++) {
        for (let c = 0; c < G.cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.row = r; cell.dataset.col = c;

            const effects = getEffectsAt(r, c);
            effects.forEach(eff => {
                if (eff.type === 'freeze')    cell.classList.add('cell-frozen');
                if (eff.type === 'shield')    cell.classList.add('cell-shielded');
                if (eff.type === 'wall')      cell.classList.add('cell-walled');
                if (eff.type === 'fog')       cell.classList.add('cell-fogged');
                if (eff.type === 'transform') cell.classList.add('cell-transformed');
                if (eff.type === 'resurrect') cell.classList.add('cell-resurrected');
            });

            // Résurrection : surligner zones valides / invalides
            if (G.activeCard && G.activeCard.id === 'resurrection_place') {
                const _isW = G.activeCard.pieceChar === G.activeCard.pieceChar.toUpperCase();
                const _validRows = _isW ? [G.rows - 2, G.rows - 1] : [0, 1];
                if (_validRows.includes(r) && !G.board[r][c]) cell.classList.add('res-target-row');
                else if (!_validRows.includes(r)) cell.classList.add('res-invalid-zone');
            }

            // Ajout de pions secret : même surlignage
            if (G.activeCard && G.activeCard.id === 'secret_pions_place') {
                const _isW2 = G.activeCard.color === 'white';
                const _startRow = _isW2 ? G.rows - 2 : 1;
                if (r === _startRow && !G.board[r][c]) cell.classList.add('res-target-row');
                else if (r !== _startRow) cell.classList.add('res-invalid-zone');
            }

            if (G.cardPhase === 'TARGETING' &&
                !(G.activeCard && (G.activeCard.id === 'resurrection_place' || G.activeCard.id === 'secret_pions_place'))) {
                cell.classList.add('card-target');
            }

            const piece = G.board[r][c];
            if (piece) {
                const pieceEl = document.createElement('span');
                pieceEl.className = 'piece ' + (piece === piece.toUpperCase() ? 'white-piece' : 'black-piece');
                pieceEl.textContent = PIECE_GLYPH[piece];
                cell.appendChild(pieceEl);
            }

            if (G.selectedCell && G.selectedCell.r === r && G.selectedCell.c === c) cell.classList.add('selected');
            if (G.validMoves.some(m => m.r === r && m.c === c)) {
                cell.classList.add('move-target');
                if (piece) cell.classList.add('has-enemy');
            }

            cell.addEventListener('click', () => onCellClick(r, c));
            boardEl.appendChild(cell);
        }
    }
}

function renderLabels() {
    const cols = 'abcdefghijklmnop';
    ['board-labels-top','board-labels-bottom'].forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = '<span class="label-spacer"></span>';
        for (let c = 0; c < G.cols; c++) {
            const s = document.createElement('span');
            s.textContent = cols[c] || (c+1);
            el.appendChild(s);
        }
    });
    ['row-labels-left','row-labels-right'].forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        for (let r = 0; r < G.rows; r++) {
            const s = document.createElement('span');
            s.textContent = G.rows - r;
            el.appendChild(s);
        }
    });
}

// ===== HAND CARDS =====
function renderHandCards() {
    ['white','black'].forEach(color => {
        const el = document.getElementById('hand-' + color);
        if (!el) return;
        el.innerHTML = '';
        const hand = G.hand[color];
        const isActive = G.currentTurn === color;
        const canPlay = isActive && !G.cardPlayedThisTurn && !G.cardPhase && G.gameActive
                        && !G.pendingDraw[color];

        if (!isActive) {
            // Main adverse : cartes face cachée
            hand.forEach(() => {
                const cardEl = document.createElement('div');
                cardEl.className = 'hand-card hand-card-down';
                cardEl.innerHTML = '<div class="hc-back-icon">🏰</div>';
                el.appendChild(cardEl);
            });
        } else {
            hand.forEach((card, i) => {
                const cardEl = document.createElement('div');
                cardEl.className = 'hand-card hand-card-up' + (canPlay ? ' hand-card-playable' : '');
                cardEl.innerHTML = `<div class="hc-icon">${card.icon}</div><div class="hc-name">${card.name}</div>`;
                if (canPlay) {
                    cardEl.onclick = () => playCardFromHand(color, i);
                    cardEl.title = 'Jouer : ' + card.name;
                }
                el.appendChild(cardEl);
            });
        }
    });
    updateZoomHandPreview();
}

function playCardFromHand(color, index) {
    if (!G.gameActive || G.currentTurn !== color || G.cardPlayedThisTurn || G.cardPhase) return;
    if (G.pendingDraw[color]) { showActionMessage('Tirez une carte d\'abord — cliquez sur le deck !'); return; }
    const card = G.hand[color][index];
    if (!card) return;
    G.hand[color].splice(index, 1);
    G.activeCard = card;
    G.cardPhase = 'TARGETING';
    G.cardPlayedThisTurn = true;
    G.selectedCell = null;
    G.validMoves = [];
    pauseTimers();
    playCardSound();
    showActionMessage(card.name + ' — sélectionnez une cible');
    beginCardTargeting(card);
    renderHandCards();
}

// ===== BOARD ZOOM (C7) =====
function toggleBoardZoom() {
    _boardZoomed = !_boardZoomed;
    const gs = document.getElementById('game-screen');
    if (_boardZoomed) {
        gs.classList.add('board-zoom-active');
        document.documentElement.style.setProperty('--cell-size', '90px');
    } else {
        gs.classList.remove('board-zoom-active');
        document.documentElement.style.setProperty('--cell-size', '78px');
        closeZoomPanel();
    }
    renderBoard();
}

let _zoomPanelOpen = false;
function toggleZoomPanel() {
    if (!_boardZoomed) return;
    _zoomPanelOpen = !_zoomPanelOpen;
    const panel = document.getElementById('zoom-hand-panel');
    if (_zoomPanelOpen) {
        updateZoomHandPreview();
        panel.classList.add('open');
    } else {
        panel.classList.remove('open');
    }
}

function closeZoomPanel() {
    _zoomPanelOpen = false;
    const panel = document.getElementById('zoom-hand-panel');
    if (panel) panel.classList.remove('open');
}

function updateZoomHandPreview() {
    const el = document.getElementById('zhp-cards');
    if (!el) return;
    el.innerHTML = '';
    const color = G.currentTurn;
    const opponent = color === 'white' ? 'black' : 'white';
    const canPlay = !G.cardPlayedThisTurn && !G.cardPhase && G.gameActive;

    // Label ma main
    const myLabel = document.createElement('div');
    myLabel.className = 'zhp-section-label';
    myLabel.textContent = 'Votre main (' + (color === 'white' ? 'Blanc' : 'Noir') + ')';
    el.appendChild(myLabel);

    // Cartes en main (jouables)
    if (G.hand[color].length === 0) {
        const empty = document.createElement('div');
        empty.className = 'zhp-empty';
        empty.textContent = 'Aucune carte';
        el.appendChild(empty);
    } else {
        G.hand[color].forEach((card, i) => {
            const d = document.createElement('div');
            d.className = 'zhp-card' + (canPlay ? ' zhp-card-playable' : '');
            d.innerHTML = `<span class="zhp-icon">${card.icon}</span><span class="zhp-name">${card.name}</span>`;
            if (canPlay) {
                d.onclick = () => { closeZoomPanel(); playCardFromHand(color, i); };
                d.title = 'Jouer : ' + card.name;
            }
            el.appendChild(d);
        });
    }

    // Carte secrète
    const secret = G.secretCards[color];
    if (secret && !G.secretUsed[color]) {
        const secDiv = document.createElement('div');
        secDiv.className = 'zhp-secret-card' + (canPlay ? ' zhp-card-playable' : '');
        secDiv.innerHTML = `<span class="zhp-icon">${secret.icon}</span><span class="zhp-name">${secret.name} 🔴</span>`;
        if (canPlay) {
            secDiv.onclick = () => { closeZoomPanel(); activateSecretCard(color); };
            secDiv.title = 'Jouer carte secrète : ' + secret.name;
        }
        el.appendChild(secDiv);
    }

    // Main adverse (dos)
    const oppLabel = document.createElement('div');
    oppLabel.className = 'zhp-section-label zhp-opp-label';
    oppLabel.textContent = 'Adversaire (' + (opponent === 'white' ? 'Blanc' : 'Noir') + ')';
    el.appendChild(oppLabel);

    const oppCount = G.hand[opponent].length;
    const oppDiv = document.createElement('div');
    oppDiv.className = 'zhp-opp-count';
    oppDiv.innerHTML = Array(Math.min(oppCount, 5)).fill('🏰').join('') + ` <span>${oppCount} carte${oppCount !== 1 ? 's' : ''}</span>`;
    el.appendChild(oppDiv);

    const turns = Math.ceil(G.drawCountdown / 2);
    const dc = document.getElementById('zhp-draw-counter');
    if (dc) dc.textContent = turns > 0 ? turns + (turns > 1 ? ' tours' : ' tour') : 'Maintenant !';
}

// ===== CELL CLICK =====
function onCellClick(r, c) {
    if (!G.gameActive) return;
    if (G.vsAI && G.currentTurn === G.aiColor && !G.cardPhase) return;
    if (G.pendingDraw[G.currentTurn]) { showActionMessage('Tirez une carte d\'abord — cliquez sur le deck !'); return; }
    if (G.cardPhase === 'TARGETING') { handleCardTarget(r, c); return; }
    if (G.cardPhase) return;

    const piece = G.board[r][c];
    const isWhite = piece && piece === piece.toUpperCase();
    const isBlack = piece && piece === piece.toLowerCase();
    const isMine = (G.currentTurn === 'white' && isWhite) || (G.currentTurn === 'black' && isBlack);

    if (G.selectedCell && G.validMoves.some(m => m.r === r && m.c === c)) {
        makeMove(G.selectedCell.r, G.selectedCell.c, r, c);
        return;
    }
    if (isMine) {
        if (isEffectAt(r, c, 'freeze')) return;
        G.selectedCell = { r, c };
        G.validMoves = getValidMoves(r, c, piece);
        renderBoard(); return;
    }
    G.selectedCell = null; G.validMoves = [];
    renderBoard();
}

// ===== MOVE =====
function makeMove(fromR, fromC, toR, toC) {
    if (isEffectAt(toR, toC, 'wall')) return;
    const moving = G.board[fromR][fromC];
    const captured = G.board[toR][toC];
    if (captured && isEffectAt(toR, toC, 'shield')) return;
    if (captured && isEffectAt(toR, toC, 'freeze')) return;

    playMoveSound();

    if (captured) {
        // Supprimer les effets de la pièce capturée (ils ne se transfèrent pas)
        G.activeEffects = G.activeEffects.filter(e => {
            if (e.type === 'wall') return true;
            return !(e.data.r === toR && e.data.c === toC);
        });
        addToGraveyard(captured);
        if (captured === 'K' || captured === 'k') {
            G.board[toR][toC] = moving; G.board[fromR][fromC] = null;
            G.selectedCell = null; G.validMoves = [];
            renderBoard();
            endGame(captured === 'K' ? 'black' : 'white', 'Roi capturé !');
            return;
        }
    }

    G.board[toR][toC] = moving;
    G.board[fromR][fromC] = null;

    // Effets suivent la pièce qui bouge
    G.activeEffects.forEach(e => {
        if (e.data.r === fromR && e.data.c === fromC) { e.data.r = toR; e.data.c = toC; }
    });

    if (moving === 'P' && toR === 0) G.board[toR][toC] = 'Q';
    if (moving === 'p' && toR === G.rows - 1) G.board[toR][toC] = 'q';

    G.selectedCell = null; G.validMoves = [];
    G.halfMoveCount++;
    if (G.currentTurn === 'black') G.fullTurnCount++;

    // Comptage de coups
    if (G.currentTurn === 'white') G.movesWhite++; else G.movesBlack++;

    tickEffects();
    G.drawCountdown--;
    G.currentTurn = G.currentTurn === 'white' ? 'black' : 'white';
    G.cardPlayedThisTurn = false;

    updateTurnIndicator(); updateActivePlayer();
    renderBoard(); renderHandCards();

    if (G.drawCountdown <= 0) {
        G.drawCountdown = 4;
        G.pendingDraw.white = true;
        G.pendingDraw.black = true;
    }
    updateDrawCounter();

    if (G.vsAI && G.gameActive && G.currentTurn === G.aiColor) {
        triggerAITurn();
    }
}

// ===== VALID MOVES =====
function getValidMoves(r, c, piece) {
    const moves = [];
    const type = piece.toLowerCase();
    const isW = piece === piece.toUpperCase();
    const enemy = (row, col) => {
        if (row < 0 || row >= G.rows || col < 0 || col >= G.cols) return false;
        const p = G.board[row][col];
        return p ? (isW ? p === p.toLowerCase() : p === p.toUpperCase()) : false;
    };
    const empty = (row, col) => row >= 0 && row < G.rows && col >= 0 && col < G.cols && !G.board[row][col];
    const inB   = (row, col) => row >= 0 && row < G.rows && col >= 0 && col < G.cols;
    const canGo = (row, col) => {
        if (!inB(row,col)) return false;
        if (isEffectAt(row,col,'wall')) return false;
        if (empty(row,col)) return true;
        if (enemy(row,col) && !isEffectAt(row,col,'shield') && !isEffectAt(row,col,'freeze')) return true;
        return false;
    };
    const slide = (dr, dc) => {
        let nr=r+dr, nc=c+dc;
        while (inB(nr,nc)) {
            if (isEffectAt(nr,nc,'wall')) break;
            if (empty(nr,nc)) { moves.push({r:nr,c:nc}); }
            else if (enemy(nr,nc) && !isEffectAt(nr,nc,'shield') && !isEffectAt(nr,nc,'freeze')) { moves.push({r:nr,c:nc}); break; }
            else break;
            nr+=dr; nc+=dc;
        }
    };
    switch (type) {
        case 'p':
            const dir = isW ? -1 : 1;
            const startRow = isW ? G.rows - 2 : 1;
            if (inB(r+dir,c) && empty(r+dir,c) && !isEffectAt(r+dir,c,'wall')) {
                moves.push({r:r+dir,c});
                if (r===startRow && empty(r+2*dir,c) && !isEffectAt(r+2*dir,c,'wall')) moves.push({r:r+2*dir,c});
            }
            [-1,1].forEach(dc => {
                if (inB(r+dir,c+dc) && enemy(r+dir,c+dc) && !isEffectAt(r+dir,c+dc,'shield') && !isEffectAt(r+dir,c+dc,'freeze'))
                    moves.push({r:r+dir,c:c+dc});
            });
            break;
        case 'r': slide(0,1);slide(0,-1);slide(1,0);slide(-1,0); break;
        case 'n': [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>{ if(canGo(r+dr,c+dc)) moves.push({r:r+dr,c:c+dc}); }); break;
        case 'b': slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1); break;
        case 'q': slide(0,1);slide(0,-1);slide(1,0);slide(-1,0);slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1); break;
        case 'k': [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{ if(canGo(r+dr,c+dc)) moves.push({r:r+dr,c:c+dc}); }); break;
    }
    return moves;
}

// ===== GRAVEYARD =====
function clearGraveyardsUI() {
    document.getElementById('graveyard-black-pieces').innerHTML = '';
    document.getElementById('graveyard-white-pieces').innerHTML = '';
}
function addToGraveyard(piece) {
    (piece === piece.toUpperCase() ? G.graveyardWhite : G.graveyardBlack).push(piece);
    renderGraveyards();
}
function renderGraveyards() {
    ['white','black'].forEach(color => {
        const arr = color === 'white' ? G.graveyardWhite : G.graveyardBlack;
        const el = document.getElementById(`graveyard-${color}-pieces`);
        el.innerHTML = '';
        arr.forEach(p => {
            const span = document.createElement('span');
            span.className = 'graveyard-piece';
            span.textContent = PIECE_GLYPH[p];
            span.style.setProperty('--rot', (Math.random()*30-15).toFixed(1)+'deg');
            el.appendChild(span);
        });
    });
}

// ===== TIMERS =====
function startTimer() {
    if (G.timerInterval) clearInterval(G.timerInterval);
    G.timerInterval = setInterval(() => {
        if (!G.gameActive || G.timersPaused) return;
        G.timers[G.currentTurn]--;
        updateTimerDisplay();
        if (G.timers[G.currentTurn] <= 0) {
            G.timers[G.currentTurn] = 0;
            updateTimerDisplay();
            endGame(G.currentTurn === 'white' ? 'black' : 'white', 'Temps écoulé !');
        }
    }, 1000);
}
function pauseTimers()  { G.timersPaused = true; }
function resumeTimers() { G.timersPaused = false; }

function updateTimerDisplay() {
    const fmt = s => Math.floor(s/60) + ':' + (s%60<10?'0':'') + (s%60);
    const wEl = document.getElementById('timer-white');
    const bEl = document.getElementById('timer-black');
    wEl.textContent = fmt(G.timers.white);
    bEl.textContent = fmt(G.timers.black);
    wEl.classList.toggle('active-timer', G.currentTurn==='white' && !G.timersPaused);
    bEl.classList.toggle('active-timer', G.currentTurn==='black' && !G.timersPaused);
    wEl.classList.toggle('low-time', G.timers.white<=30 && G.timers.white>0);
    bEl.classList.toggle('low-time', G.timers.black<=30 && G.timers.black>0);
    // Zoom timers
    const ztw = document.getElementById('ztb-timer-white');
    const ztb = document.getElementById('ztb-timer-black');
    if (ztw && ztb) {
        ztw.textContent = fmt(G.timers.white);
        ztb.textContent = fmt(G.timers.black);
        ztw.className = 'ztb-time' + (G.currentTurn==='white' && !G.timersPaused ? ' active-timer' : '') + (G.timers.white<=30 && G.timers.white>0 ? ' low-time' : '');
        ztb.className = 'ztb-time' + (G.currentTurn==='black' && !G.timersPaused ? ' active-timer' : '') + (G.timers.black<=30 && G.timers.black>0 ? ' low-time' : '');
    }
}
function updateTurnIndicator() {
    document.getElementById('turn-indicator').textContent = 'Tour : ' + (G.currentTurn==='white' ? 'Blanc ♚' : 'Noir ♚');
}
function updateActivePlayer() {
    document.getElementById('player-black-card').classList.toggle('active-player', G.currentTurn==='black');
    document.getElementById('player-white-card').classList.toggle('active-player', G.currentTurn==='white');
    updateDeckUI();
}
function updateDrawCounter() {
    const el = document.getElementById('draw-counter');
    if (G.pendingDraw && (G.pendingDraw[G.currentTurn])) {
        el.textContent = 'Tirez !';
        el.style.color = '#ffff00';
    } else {
        const turns = Math.ceil(G.drawCountdown / 2);
        el.textContent = turns > 0 ? turns + ' tour' + (turns>1?'s':'') : 'Tirez !';
        el.style.color = '';
    }
    updateZoomHandPreview();
    updateDeckUI();
}

// ===== END GAME =====
function endGame(winner, reason) {
    G.gameActive = false;
    if (G.timerInterval) clearInterval(G.timerInterval);
    if (G.cardCountdownInterval) clearInterval(G.cardCountdownInterval);
    if (G._expandInterval) clearInterval(G._expandInterval);

    const fmt = s => Math.floor(s/60) + ':' + (s%60<10?'0':'') + (s%60);

    const blackLabel = G.vsAI ? '🤖 IA gagne !' : '♚ Joueur Noir gagne !';
    document.getElementById('gameover-title').textContent = (winner==='white' ? '♚ Joueur Blanc gagne !' : blackLabel);
    document.getElementById('gameover-reason').textContent = reason;

    // Remplir le tableau de stats
    document.getElementById('go-white-captured').textContent = G.graveyardBlack.length;
    document.getElementById('go-black-captured').textContent = G.graveyardWhite.length;
    document.getElementById('go-white-moves').textContent = G.movesWhite;
    document.getElementById('go-black-moves').textContent = G.movesBlack;
    document.getElementById('go-white-time').textContent = fmt(G.timers.white);
    document.getElementById('go-black-time').textContent = fmt(G.timers.black);

    document.getElementById('gameover-modal').style.display = 'flex';
}

function viewFinalBoard() {
    document.getElementById('gameover-modal').style.display = 'none';
    document.getElementById('view-board-overlay').style.display = 'flex';
}

// ===== EFFECT SYSTEM =====
function addEffect(type, owner, data, duration) {
    G.activeEffects.push({ type, owner, data, turnsLeft: duration });
}
function getEffectsAt(r, c) {
    return G.activeEffects.filter(e => {
        if (e.data.r===r && e.data.c===c) return true;
        if (e.data.cells && e.data.cells.some(cell=>cell.r===r&&cell.c===c)) return true;
        return false;
    });
}
function isEffectAt(r, c, type) {
    return G.activeEffects.some(e => {
        if (e.type!==type) return false;
        if (e.data.r===r && e.data.c===c) return true;
        if (e.data.cells && e.data.cells.some(cell=>cell.r===r&&cell.c===c)) return true;
        return false;
    });
}
function tickEffects() {
    if (G.currentTurn!=='black') return;
    G.activeEffects.forEach(e => e.turnsLeft--);
    G.activeEffects = G.activeEffects.filter(e => {
        if (e.turnsLeft<=0) { onEffectExpire(e); return false; }
        return true;
    });
}
function onEffectExpire(effect) {
    if (effect.type==='transform' && effect.data.originalPiece) {
        const {r,c,originalPiece} = effect.data;
        if (G.board[r][c]) G.board[r][c] = originalPiece;
    }
    if (effect.type==='resurrect') {
        const {r,c} = effect.data;
        if (G.board[r][c]) G.board[r][c] = null;
    }
}

// ===== CARD DRAW → ANIMATION → MAIN =====
function getRandomCard() {
    return { ...NORMAL_CARDS[Math.floor(Math.random() * NORMAL_CARDS.length)] };
}

// Affiche la carte en grand puis exécute le callback
function showDrawnCardAnimation(card, color, callback) {
    const overlay = document.getElementById('card-draw-overlay');
    const playerLabel = color === 'white' ? '♚ Joueur Blanc' : (G.vsAI ? '🤖 IA' : '♚ Joueur Noir');
    document.getElementById('cdo-player').textContent = playerLabel + ' tire une carte !';
    document.getElementById('cdo-icon').textContent  = card.icon;
    document.getElementById('cdo-name').textContent  = card.name;
    document.getElementById('cdo-desc').textContent  = card.desc;

    overlay.style.display = 'flex';
    overlay.classList.remove('cdo-fade-out');
    pauseTimers();

    setTimeout(() => {
        overlay.classList.add('cdo-fade-out');
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.remove('cdo-fade-out');
            resumeTimers();
            callback();
        }, 450);
    }, 2200);
}

// ===== DECK CLICK — tirage manuel =====
function handleDeckClick() {
    if (!G.gameActive || !G.pendingDraw[G.currentTurn] || G.cardPhase) return;
    if (G.vsAI && G.currentTurn === G.aiColor) return; // l'IA tire automatiquement
    drawCardForPlayer(G.currentTurn);
}

function drawCardForPlayer(color) {
    if (!G.pendingDraw[color]) return;
    G.pendingDraw[color] = false;
    updateDeckUI();

    playCardSound();
    const card = G.nextCard || getRandomCard();
    G.nextCard = getRandomCard();

    showDrawnCardAnimation(card, color, () => {
        if (card.id === 'agrandissement') {
            if (G.vsAI && color === G.aiColor) {
                const dirs = ['top','bottom','left','right'];
                executeExpand(dirs[Math.floor(Math.random()*dirs.length)]);
                renderHandCards();
                if (G.gameActive && G.currentTurn === G.aiColor)
                    setTimeout(() => triggerAITurn(), 300);
            } else {
                executeExpandDirect();
            }
            return;
        }
        G.hand[color].push(card);
        renderHandCards();
        if (G.vsAI && G.gameActive && G.currentTurn === G.aiColor) {
            triggerAITurn();
        }
    });
}

function updateDeckUI() {
    const stack = document.getElementById('deck-card-stack');
    if (!stack) return;
    if (G.gameActive && G.pendingDraw[G.currentTurn]) {
        stack.classList.add('deck-must-draw');
    } else {
        stack.classList.remove('deck-must-draw');
    }
}

// ===== CARD TARGETING =====
function beginCardTargeting(card) {
    G.cardPhase = 'TARGETING';
    G.cardTargets = [];

    switch (card.id) {
        case 'transformation': showActionMessage('Cliquez sur une pièce alliée à transformer'); break;
        case 'gel':            showActionMessage('Cliquez sur une pièce ennemie à geler'); break;
        case 'agrandissement': showActionMessage('Choisissez où agrandir le plateau'); document.getElementById('expand-picker').style.display='block'; break;
        case 'murale':         showActionMessage('Cliquez sur 1 à 3 cases alignées (double-clic ou Échap pour valider)'); break;
        case 'echange':        showActionMessage('Sélectionnez la 1ère pièce alliée'); break;
        case 'vision':         executeVision(); return;
        case 'bouclier':       showActionMessage('Cliquez sur une pièce alliée à protéger (pas la Dame)'); break;
        case 'brouillard':     executeBrouillard(); return;
        case 'resurrection':   executeResurrection(); return;
    }
    renderBoard();
}

function showActionMessage(msg) {
    const overlay = document.getElementById('card-action-overlay');
    document.getElementById('cao-message').textContent = msg;
    overlay.style.display = 'block';
    clearTimeout(showActionMessage._t);
    showActionMessage._t = setTimeout(() => overlay.style.display='none', 3200);
}

// ===== HANDLE CARD TARGETS =====
function handleCardTarget(r, c) {
    if (!G.activeCard) return;
    const card = G.activeCard;
    const piece = G.board[r][c];
    const isW = piece && piece===piece.toUpperCase();
    const isB = piece && piece===piece.toLowerCase();
    const isMine  = (G.currentTurn==='white'&&isW)||(G.currentTurn==='black'&&isB);
    const isEnemy = (G.currentTurn==='white'&&isB)||(G.currentTurn==='black'&&isW);

    switch (card.id) {
        case 'transformation':
            if (piece&&isMine&&piece.toLowerCase()!=='k'&&piece.toLowerCase()!=='q') showTransformPicker(r,c,false);
            break;
        case 'gel':
            if (piece&&isEnemy) { addEffect('freeze',G.currentTurn,{r,c},1); finishCard(); }
            break;
        case 'murale':  handleWallTarget(r,c); break;
        case 'echange': handleExchangeTarget(r,c); break;
        case 'bouclier':
            if (piece&&isMine&&piece.toLowerCase()!=='q') { addEffect('shield',G.currentTurn,{r,c},1); finishCard(); }
            break;
    }
}

function finishCard() {
    if (G.cardCountdownInterval) clearInterval(G.cardCountdownInterval);
    G.cardPhase = null; G.activeCard = null; G.cardTargets = [];
    document.getElementById('drawn-card-panel').style.display = 'none';
    document.getElementById('card-action-overlay').style.display = 'none';
    document.getElementById('transform-picker').style.display = 'none';
    document.getElementById('expand-picker').style.display = 'none';
    document.getElementById('resurrection-overlay').style.display = 'none';
    resumeTimers();
    renderBoard(); renderHandCards();
}

// ===== CARD: TRANSFORMATION =====
function showTransformPicker(r, c, permanent) {
    const picker = document.getElementById('transform-picker');
    picker.innerHTML = '';
    const isW = G.currentTurn==='white';
    ['R','B','N'].forEach(type => {
        const key = isW ? type : type.toLowerCase();
        const span = document.createElement('span');
        span.className = 'tp-option';
        span.textContent = PIECE_GLYPH[key];
        span.onclick = () => {
            const originalPiece = G.board[r][c];
            G.board[r][c] = key;
            if (!permanent) addEffect('transform',G.currentTurn,{r,c,originalPiece},2);
            picker.style.display='none'; finishCard();
        };
        picker.appendChild(span);
    });
    const boardEl = document.getElementById('chessboard');
    const cellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
    const boardRect = boardEl.getBoundingClientRect();
    picker.style.left = (boardRect.left + c*cellSize) + 'px';
    picker.style.top  = (boardRect.top  + r*cellSize - 60) + 'px';
    picker.style.display = 'flex';
}

// ===== CARD: AGRANDISSEMENT (joué directement avec countdown numérique) =====
function executeExpandDirect() {
    G.cardPhase = 'TARGETING';
    G.activeCard = { id:'agrandissement', name:'Agrandissement', icon:'📐' };
    pauseTimers();

    const picker = document.getElementById('expand-picker');
    picker.style.display = 'block';

    let remaining = 10;
    const countEl = document.getElementById('expand-countdown');
    if (countEl) countEl.textContent = remaining;

    if (G._expandInterval) clearInterval(G._expandInterval);
    G._expandInterval = setInterval(() => {
        remaining--;
        if (countEl) countEl.textContent = remaining;
        if (remaining <= 0) {
            clearInterval(G._expandInterval); G._expandInterval = null;
            const dirs = ['top','bottom','left','right'];
            executeExpand(dirs[Math.floor(Math.random()*dirs.length)]);
        }
    }, 1000);
}

function executeExpand(dir) {
    if (G._expandInterval) { clearInterval(G._expandInterval); G._expandInterval = null; }
    document.getElementById('expand-picker').style.display = 'none';

    if (dir==='top') {
        G.board.unshift(new Array(G.cols).fill(null)); G.rows++;
        G.activeEffects.forEach(e=>{
            if(e.data.r!==undefined) e.data.r++;
            if(e.data.cells) e.data.cells.forEach(c=>c.r++);
        });
    } else if (dir==='bottom') {
        G.board.push(new Array(G.cols).fill(null)); G.rows++;
    } else if (dir==='left') {
        G.board.forEach(row=>row.unshift(null)); G.cols++;
        G.activeEffects.forEach(e=>{
            if(e.data.c!==undefined) e.data.c++;
            if(e.data.cells) e.data.cells.forEach(c=>c.c++);
        });
    } else if (dir==='right') {
        G.board.forEach(row=>row.push(null)); G.cols++;
    }
    finishCard();
}

// ===== CARD: MURALE =====
function handleWallTarget(r, c) {
    const targets = G.cardTargets;
    if (targets.length>0) {
        const first = targets[0];
        const sameRow = targets.every(t=>t.r===r) && first.r===r;
        const sameCol = targets.every(t=>t.c===c) && first.c===c;
        if (!sameRow&&!sameCol) return;
    }
    if (targets.some(t=>t.r===r&&t.c===c)) { if(targets.length>=1){ executeWall(targets); return; } return; }
    targets.push({r,c});
    if (targets.length>=3) {
        executeWall(targets);
    } else {
        showActionMessage(`${targets.length}/3 cases — double-clic ou Échap pour valider`);
        renderBoard();
        targets.forEach(t=>{ const cell=document.querySelector(`.cell[data-row="${t.r}"][data-col="${t.c}"]`); if(cell) cell.classList.add('cell-walled'); });
    }
}
function executeWall(cells) {
    addEffect('wall',G.currentTurn,{cells:[...cells],r:cells[0].r,c:cells[0].c},1);
    finishCard();
}

// ===== CARD: ÉCHANGE =====
function handleExchangeTarget(r, c) {
    const piece = G.board[r][c];
    const isW = piece&&piece===piece.toUpperCase();
    const isB = piece&&piece===piece.toLowerCase();
    const isMine = (G.currentTurn==='white'&&isW)||(G.currentTurn==='black'&&isB);
    if (!piece||!isMine) return;
    G.cardTargets.push({r,c});
    if (G.cardTargets.length===1) {
        showActionMessage('Sélectionnez la 2ème pièce alliée');
        renderBoard();
        const cell=document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`); if(cell) cell.classList.add('selected');
    } else if (G.cardTargets.length===2) {
        const [a,b]=G.cardTargets;
        const temp=G.board[a.r][a.c]; G.board[a.r][a.c]=G.board[b.r][b.c]; G.board[b.r][b.c]=temp;
        G.activeEffects.forEach(e => {
            const onA = e.data.r===a.r && e.data.c===a.c;
            const onB = e.data.r===b.r && e.data.c===b.c;
            if (onA) { e.data.r=b.r; e.data.c=b.c; }
            else if (onB) { e.data.r=a.r; e.data.c=a.c; }
        });
        finishCard();
    }
}

// ===== CARD: VISION =====
function executeVision() {
    const nextCard = G.nextCard || getRandomCard();
    G.nextCard = nextCard;
    showActionMessage('Prochaine carte : ' + nextCard.name + ' ' + nextCard.icon);
    setTimeout(() => finishCard(), 3000);
}

// ===== CARD: BROUILLARD =====
function executeBrouillard() {
    for (let r=0;r<G.rows;r++) for (let c=0;c<G.cols;c++) {
        const p=G.board[r][c]; if(!p) continue;
        const isW=p===p.toUpperCase();
        if ((G.currentTurn==='white'&&isW)||(G.currentTurn==='black'&&!isW)) addEffect('fog',G.currentTurn,{r,c},1);
    }
    finishCard();
}

// ===== CARD: RÉSURRECTION =====
function executeResurrection() {
    const graveyard = G.currentTurn==='white' ? G.graveyardWhite : G.graveyardBlack;
    if (graveyard.length===0) { showActionMessage('Aucune pièce à ressusciter !'); setTimeout(()=>finishCard(),1500); return; }

    document.getElementById('resurrection-overlay').style.display = 'flex';
    document.getElementById('res-title').textContent = 'Choisissez une pièce à ressusciter';
    const container = document.getElementById('res-pieces');
    container.innerHTML = '';
    const pieceNames = {k:'Roi',q:'Dame',r:'Tour',b:'Fou',n:'Cavalier',p:'Pion'};

    graveyard.filter(p => p.toLowerCase() !== 'q').forEach(p => {
        const span = document.createElement('span');
        span.className = 'res-piece';
        span.textContent = PIECE_GLYPH[p];
        span.title = pieceNames[p.toLowerCase()]||p;
        span.onclick = () => {
            document.getElementById('resurrection-overlay').style.display='none';
            const gArr = G.currentTurn==='white' ? G.graveyardWhite : G.graveyardBlack;
            const idx=gArr.indexOf(p); if(idx>=0) gArr.splice(idx,1);
            renderGraveyards();
            showActionMessage('Cliquez sur une case libre (lignes rouges = zones valides)');
            G.cardPhase='TARGETING';
            G.activeCard={id:'resurrection_place', pieceChar:p};
            renderBoard();
        };
        container.appendChild(span);
    });
}

function placeResurrectedPiece(r, c) {
    const pieceChar = G.activeCard.pieceChar;
    const isW = pieceChar===pieceChar.toUpperCase();
    const validRows = isW ? [G.rows-2, G.rows-1] : [0,1];
    if (!validRows.includes(r)||G.board[r][c]!==null) {
        showActionMessage('Case invalide ! Choisissez une case libre sur vos 2 premières lignes'); return;
    }
    G.board[r][c]=pieceChar; addEffect('resurrect',G.currentTurn,{r,c},3); finishCard();
}

// ===== HANDLE CARD TARGET (modes spéciaux) =====
const _origHandleCardTarget = handleCardTarget;
handleCardTarget = function(r, c) {
    if (G.activeCard && G.activeCard.id==='resurrection_place') { placeResurrectedPiece(r,c); return; }
    if (G.activeCard && G.activeCard.id==='secret_teleport')    { executeSecretTeleport(r,c); return; }
    if (G.activeCard && G.activeCard.id==='secret_transform')   { showTransformPicker(r,c,true); return; }
    if (G.activeCard && G.activeCard.id==='secret_pions_place') { placeSecretPawn(r,c); return; }
    _origHandleCardTarget(r,c);
};

// ===== SECRET CARD ACTIVATION =====
function activateSecretCard(color) {
    if (!G.gameActive||G.currentTurn!==color||G.secretUsed[color]||G.cardPhase) return;
    const card = G.secretCards[color]; if(!card) return;
    G.secretUsed[color]=true; pauseTimers();
    document.getElementById(`secret-card-${color}`).classList.add('used');
    if (color==='black') {
        const el=document.getElementById('sc-back-black');
        if(el) el.innerHTML=`<div class="sc-front-icon">${card.icon}</div><div class="sc-front-name">${card.name}</div>`;
    }
    showActionMessage(card.name+' activée !');
    setTimeout(()=>executeSecretCard(color,card), 1200);
}

function executeSecretCard(color, card) {
    G.cardPhase = 'TARGETING';
    switch (card.id) {
        case 'teleportation':
            G.activeCard={id:'secret_teleport',color};
            showActionMessage('Cliquez sur une case libre de votre moitié du plateau');
            startCardCountdown(10,()=>{ G.cardPhase=null;G.activeCard=null;resumeTimers();renderBoard(); });
            renderBoard(); break;

        case 'transform_perm':
            G.activeCard={id:'secret_transform',color};
            showActionMessage('Cliquez sur un pion allié à transformer');
            startCardCountdown(10,()=>{ G.cardPhase=null;G.activeCard=null;resumeTimers();renderBoard(); });
            document.getElementById('drawn-card-panel').style.display='flex';
            document.getElementById('dcp-art').textContent=card.icon;
            document.getElementById('dcp-name').textContent=card.name;
            document.getElementById('dcp-desc').textContent=card.desc;
            document.getElementById('dcp-instructions').textContent='Cliquez sur un pion allié';
            renderBoard(); break;

        case 'ajout_pions':
            executeSecretAjoutPions(color); break;
    }
}

function startCardCountdown(seconds, onExpire) {
    G.cardCountdown = seconds;
    const bar = document.getElementById('dcp-timer-bar');
    if (bar) { bar.style.width='100%'; bar.classList.remove('low'); }
    if (G.cardCountdownInterval) clearInterval(G.cardCountdownInterval);
    const total = seconds;
    G.cardCountdownInterval = setInterval(()=>{
        G.cardCountdown--;
        const pct=(G.cardCountdown/total)*100;
        if(bar){ bar.style.width=pct+'%'; if(G.cardCountdown<=3) bar.classList.add('low'); }
        if(G.cardCountdown<=0){ clearInterval(G.cardCountdownInterval); onExpire(); }
    }, 1000);
}

// ===== SECRET: TÉLÉPORTATION =====
function executeSecretTeleport(r, c) {
    const isW = G.activeCard.color==='white';
    const halfStart = isW ? Math.floor(G.rows/2) : 0;
    const halfEnd   = isW ? G.rows : Math.floor(G.rows/2);
    if (r<halfStart||r>=halfEnd||G.board[r][c]!==null) { showActionMessage('Case invalide !'); return; }
    const kingChar = isW ? 'K' : 'k';
    for (let row=0;row<G.rows;row++) for (let col=0;col<G.cols;col++) {
        if (G.board[row][col]===kingChar) {
            G.board[row][col]=null; G.board[r][c]=kingChar;
            if(G.cardCountdownInterval) clearInterval(G.cardCountdownInterval);
            G.cardPhase=null; G.activeCard=null;
            document.getElementById('drawn-card-panel').style.display='none';
            resumeTimers(); renderBoard(); return;
        }
    }
}

// ===== SECRET: AJOUT DE PIONS =====
function executeSecretAjoutPions(color) {
    const isW = color==='white';
    const pawnChar = isW ? 'P' : 'p';
    const lostPawns = (isW ? G.graveyardWhite : G.graveyardBlack).filter(p=>p===pawnChar).length;
    if (lostPawns<2) {
        showActionMessage('Il faut avoir perdu au moins 2 pions !');
        setTimeout(()=>{ G.cardPhase=null;G.activeCard=null;resumeTimers();renderBoard(); },1500); return;
    }
    G.activeCard={id:'secret_pions_place',color,pawnsPlaced:0,pawnChar};
    showActionMessage('Placez 2 pions (lignes rouges = zones valides)');
    startCardCountdown(10,()=>{ G.cardPhase=null;G.activeCard=null;resumeTimers();renderBoard(); });
    document.getElementById('drawn-card-panel').style.display='flex';
    document.getElementById('dcp-art').textContent='♟️';
    document.getElementById('dcp-name').textContent='Ajout de Pions';
    document.getElementById('dcp-desc').textContent='Placez 2 pions sur votre ligne de départ';
    document.getElementById('dcp-instructions').textContent='Cliquez sur des cases libres (rouge)';
    renderBoard();
}

function placeSecretPawn(r, c) {
    const {color,pawnChar} = G.activeCard;
    const isW = color==='white';
    const startRow = isW ? G.rows-2 : 1;
    if (r!==startRow||G.board[r][c]!==null) { showActionMessage('Case invalide !'); return; }

    const enemyColor = isW ? 'black' : 'white';
    let canBeCaptured = false;
    for (let er=0;er<G.rows&&!canBeCaptured;er++) for (let ec=0;ec<G.cols&&!canBeCaptured;ec++) {
        const ep=G.board[er][ec]; if(!ep) continue;
        const eIsW=ep===ep.toUpperCase();
        if ((enemyColor==='white'&&eIsW)||(enemyColor==='black'&&!eIsW))
            if (getValidMoves(er,ec,ep).some(m=>m.r===r&&m.c===c)) canBeCaptured=true;
    }
    if (canBeCaptured) { showActionMessage('Cette case est menacée !'); return; }

    G.board[r][c]=pawnChar; G.activeCard.pawnsPlaced++;
    if (G.activeCard.pawnsPlaced>=2) {
        if(G.cardCountdownInterval) clearInterval(G.cardCountdownInterval);
        G.cardPhase=null; G.activeCard=null;
        document.getElementById('drawn-card-panel').style.display='none';
        resumeTimers(); renderBoard();
    } else { showActionMessage('Pion placé ! Placez le 2ème pion.'); renderBoard(); }
}

// ===== GALERIE DE CARTES =====
function showCardGallery() {
    ['gallery-normal','gallery-secret'].forEach(id=>document.getElementById(id).innerHTML='');
    NORMAL_CARDS.forEach(c=>document.getElementById('gallery-normal').appendChild(_makeGalleryCard(c,false)));
    SECRET_CARDS_DEF.forEach(c=>document.getElementById('gallery-secret').appendChild(_makeGalleryCard(c,true)));
    document.getElementById('card-gallery-modal').style.display='flex';
}
function _makeGalleryCard(card, isSecret) {
    const div = document.createElement('div');
    div.className = 'gallery-card'+(isSecret?' gallery-card-secret':'');
    div.innerHTML=`<div class="gc-icon">${card.icon}</div><div class="gc-name">${card.name}</div><div class="gc-desc">${card.desc}</div><div class="gc-time">${isSecret?'Usage unique':'Carte normale'}</div>`;
    return div;
}
function closeCardGallery() { document.getElementById('card-gallery-modal').style.display='none'; }

// ===== ABANDON =====
let _forfeitColor = null;
function showForfeitConfirm(color) {
    if (!G.gameActive||G.currentTurn!==color) return;
    _forfeitColor=color;
    document.getElementById('forfeit-message').textContent=(color==='white'?'Joueur Blanc':'Joueur Noir')+', voulez-vous vraiment abandonner ?';
    document.getElementById('forfeit-modal').style.display='flex';
    pauseTimers();
}
function confirmForfeit() {
    document.getElementById('forfeit-modal').style.display='none';
    if(_forfeitColor) endGame(_forfeitColor==='white'?'black':'white','Abandon !');
    _forfeitColor=null;
}
function cancelForfeit() {
    document.getElementById('forfeit-modal').style.display='none';
    _forfeitColor=null; resumeTimers();
}

// ===== SECRET CARD MODAL =====
function closeSecretCardModal() { document.getElementById('secret-card-modal').style.display='none'; }

// ===== MODULE IA =====

const AI_PIECE_VALUE = { p:100, n:320, b:330, r:500, q:900, k:20000 };

function aiEval(board) {
    let score = 0;
    for (let r = 0; r < G.rows; r++) {
        for (let c = 0; c < G.cols; c++) {
            const p = board[r][c];
            if (!p) continue;
            const val = AI_PIECE_VALUE[p.toLowerCase()] || 0;
            score += (p === p.toLowerCase()) ? val : -val;
        }
    }
    return score;
}

function aiGetMoves(board, color) {
    const saved = G.board;
    G.board = board;
    const moves = [];
    for (let r = 0; r < G.rows; r++) {
        for (let c = 0; c < G.cols; c++) {
            const p = board[r][c];
            if (!p) continue;
            const isW = p === p.toUpperCase();
            if ((color === 'white') !== isW) continue;
            getValidMoves(r, c, p).forEach(m => moves.push({fr:r, fc:c, tr:m.r, tc:m.c}));
        }
    }
    G.board = saved;
    return moves;
}

function aiSimMove(board, move) {
    const nb = board.map(row => [...row]);
    const p = nb[move.fr][move.fc];
    nb[move.tr][move.tc] = p;
    nb[move.fr][move.fc] = null;
    if (p === 'p' && move.tr === G.rows - 1) nb[move.tr][move.tc] = 'q';
    if (p === 'P' && move.tr === 0) nb[move.tr][move.tc] = 'Q';
    return nb;
}

function aiMinimax(board, depth, alpha, beta, maximizing) {
    if (depth === 0) return aiEval(board);
    const color = maximizing ? 'black' : 'white';
    const moves = aiGetMoves(board, color);
    if (!moves.length) return maximizing ? -15000 : 15000;

    if (maximizing) {
        let best = -Infinity;
        for (const m of moves) {
            const s = aiMinimax(aiSimMove(board, m), depth - 1, alpha, beta, false);
            if (s > best) best = s;
            if (s > alpha) alpha = s;
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const m of moves) {
            const s = aiMinimax(aiSimMove(board, m), depth - 1, alpha, beta, true);
            if (s < best) best = s;
            if (s < beta) beta = s;
            if (beta <= alpha) break;
        }
        return best;
    }
}

function aiChooseMove() {
    const depth = G.aiDifficulty === 'easy' ? 1 : 3;
    const moves = aiGetMoves(G.board, G.aiColor);
    if (!moves.length) return null;

    // Facile : 40% de chance de jouer aléatoirement
    if (G.aiDifficulty === 'easy' && Math.random() < 0.4) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    const noise = G.aiDifficulty === 'easy' ? 60 : 0;
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
        const s = aiMinimax(aiSimMove(G.board, m), depth - 1, -Infinity, Infinity, false)
                  + Math.random() * noise;
        if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
}

function triggerAITurn() {
    if (!G.gameActive || G.currentTurn !== G.aiColor || !G.vsAI) return;
    const delay = G.aiDifficulty === 'easy' ? 700 : 1000;
    setTimeout(() => {
        if (!G.gameActive || G.currentTurn !== G.aiColor) return;

        // Auto-tirer la carte si nécessaire (callback re-déclenche le tour)
        if (G.pendingDraw[G.aiColor]) {
            drawCardForPlayer(G.aiColor);
            return;
        }

        if (G.cardPhase) return;
        aiMaybePlayCard();
        setTimeout(() => {
            if (!G.gameActive || G.currentTurn !== G.aiColor || G.cardPhase) return;
            aiMaybePlaySecretCard();
            setTimeout(() => {
                if (!G.gameActive || G.currentTurn !== G.aiColor) return;
                const move = aiChooseMove();
                if (move) makeMove(move.fr, move.fc, move.tr, move.tc);
            }, 200);
        }, 300);
    }, delay);
}

// --- Helpers stratégiques ---

function aiGetThreatValue(er, ec, colorDefending) {
    // Valeur totale des pièces de colorDefending menacées par la pièce en (er,ec)
    const p = G.board[er][ec];
    if (!p) return 0;
    return getValidMoves(er, ec, p).reduce((sum, m) => {
        const t = G.board[m.r][m.c];
        if (!t) return sum;
        const tOwn = colorDefending === 'black' ? t === t.toLowerCase() : t === t.toUpperCase();
        return sum + (tOwn ? (AI_PIECE_VALUE[t.toLowerCase()] || 0) : 0);
    }, 0);
}

function aiCardStrategicValue(card, posScore) {
    const color = G.aiColor;
    const enemyColor = color === 'black' ? 'white' : 'black';
    const enemyIsUpper = color === 'black';

    switch (card.id) {
        case 'gel': {
            let best = 0;
            for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
                const p = G.board[r][c];
                if (!p) continue;
                const isEnemy = enemyIsUpper ? p === p.toUpperCase() : p === p.toLowerCase();
                if (!isEnemy || isEffectAt(r,c,'freeze') || isEffectAt(r,c,'shield')) continue;
                const pv = AI_PIECE_VALUE[p.toLowerCase()] || 0;
                const tv = aiGetThreatValue(r, c, color) * 0.6;
                best = Math.max(best, pv * 0.35 + tv);
            }
            return best > 120 ? best : 0;
        }
        case 'bouclier': {
            let best = 0;
            for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
                const p = G.board[r][c];
                if (!p) continue;
                const isOwn = enemyIsUpper ? p === p.toLowerCase() : p === p.toUpperCase();
                if (!isOwn || p.toLowerCase() === 'q' || p.toLowerCase() === 'k' || isEffectAt(r,c,'shield')) continue;
                const pv = AI_PIECE_VALUE[p.toLowerCase()] || 0;
                if (aiIsThreatened(r, c, enemyColor)) best = Math.max(best, pv * 0.65);
            }
            return best > 80 ? best : 0;
        }
        case 'resurrection': {
            const gArr = color === 'black' ? G.graveyardBlack : G.graveyardWhite;
            const best = gArr.filter(p => p.toLowerCase() !== 'q')
                .reduce((m, p) => Math.max(m, AI_PIECE_VALUE[p.toLowerCase()] || 0), 0);
            if (!best) return 0;
            return best * 0.55 + (posScore < -200 ? 120 : 0);
        }
        case 'transformation': {
            const pawnChar = color === 'black' ? 'p' : 'P';
            let hasPawn = false;
            for (let r = 0; r < G.rows && !hasPawn; r++)
                for (let c = 0; c < G.cols && !hasPawn; c++)
                    if (G.board[r][c] === pawnChar) hasPawn = true;
            if (!hasPawn) return 0;
            return posScore < -150 ? 260 : 160;
        }
        case 'brouillard': {
            if (G.aiDifficulty === 'easy') return 0;
            return posScore > 250 ? 210 : (posScore < -350 ? 140 : 60);
        }
        case 'echange': {
            return aiFindBestExchangeGain(color) * 0.7;
        }
        case 'vision': return 35;
        default: return 0;
    }
}

function aiFindBestExchangeGain(color) {
    const own = [];
    for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
        const p = G.board[r][c];
        if (!p) continue;
        const isOwn = color === 'black' ? p === p.toLowerCase() : p === p.toUpperCase();
        if (isOwn) own.push({r, c});
    }
    if (own.length < 2) return 0;
    const base = aiEval(G.board);
    let best = 0;
    for (let i = 0; i < own.length; i++) for (let j = i+1; j < own.length; j++) {
        const tb = G.board.map(row => [...row]);
        const {r:r1,c:c1} = own[i], {r:r2,c:c2} = own[j];
        tb[r1][c1] = G.board[r2][c2]; tb[r2][c2] = G.board[r1][c1];
        best = Math.max(best, aiEval(tb) - base);
    }
    return best;
}

function aiMaybePlayCard() {
    if (G.cardPlayedThisTurn || G.cardPhase) return;
    const hand = G.hand[G.aiColor];
    if (!hand.length) return;

    const posScore = aiEval(G.board);
    const threshold = G.aiDifficulty === 'easy' ? 140 : 75;
    const playChance = G.aiDifficulty === 'easy' ? 0.55 : 0.88;

    let bestIdx = -1, bestVal = threshold;
    for (let i = 0; i < hand.length; i++) {
        const v = aiCardStrategicValue(hand[i], posScore);
        if (v > bestVal) { bestVal = v; bestIdx = i; }
    }
    if (bestIdx >= 0 && Math.random() < playChance) {
        aiTryCard(hand[bestIdx], bestIdx);
    }
}

function aiMaybePlaySecretCard() {
    if (G.cardPlayedThisTurn || G.cardPhase || G.secretUsed[G.aiColor]) return;
    if (G.fullTurnCount < 3) return;
    const chance = G.aiDifficulty === 'easy' ? 0.15 : 0.4;
    if (Math.random() > chance) return;
    const card = G.secretCards[G.aiColor];
    if (!card) return;

    const color = G.aiColor;
    G.secretUsed[color] = true;
    G.cardPlayedThisTurn = true;
    document.getElementById(`secret-card-${color}`).classList.add('used');

    switch (card.id) {
        case 'teleportation': {
            // Déplacer le roi sur une case libre de sa moitié
            const isW = color === 'white';
            const halfStart = isW ? Math.floor(G.rows / 2) : 0;
            const halfEnd   = isW ? G.rows : Math.floor(G.rows / 2);
            const kingChar  = isW ? 'K' : 'k';
            let kingR = -1, kingC = -1;
            for (let r = 0; r < G.rows && kingR < 0; r++)
                for (let c = 0; c < G.cols && kingR < 0; c++)
                    if (G.board[r][c] === kingChar) { kingR = r; kingC = c; }
            if (kingR < 0) break;
            for (let r = halfStart; r < halfEnd; r++) {
                for (let c = 0; c < G.cols; c++) {
                    if (!G.board[r][c] && !(r === kingR && c === kingC)) {
                        G.board[kingR][kingC] = null;
                        G.board[r][c] = kingChar;
                        renderBoard();
                        return;
                    }
                }
            }
            break;
        }
        case 'transform_perm': {
            const pawnChar = color === 'black' ? 'p' : 'P';
            const rookChar = color === 'black' ? 'r' : 'R';
            for (let r = 0; r < G.rows; r++) {
                for (let c = 0; c < G.cols; c++) {
                    if (G.board[r][c] === pawnChar) {
                        G.board[r][c] = rookChar;
                        renderBoard();
                        return;
                    }
                }
            }
            break;
        }
        case 'ajout_pions': {
            const pawnChar = color === 'black' ? 'p' : 'P';
            const isW = color === 'white';
            const lostPawns = (isW ? G.graveyardWhite : G.graveyardBlack).filter(p => p === pawnChar).length;
            if (lostPawns < 2) { G.secretUsed[color] = false; G.cardPlayedThisTurn = false; break; }
            const startRow = isW ? G.rows - 2 : 1;
            let placed = 0;
            for (let c = 0; c < G.cols && placed < 2; c++) {
                if (!G.board[startRow][c]) {
                    G.board[startRow][c] = pawnChar;
                    placed++;
                }
            }
            renderBoard();
            break;
        }
    }
}

function aiTryCard(card, index) {
    const color = G.aiColor;
    const enemyColor = color === 'black' ? 'white' : 'black';
    const enemyIsUpper = color === 'black';

    function commit() {
        G.hand[color].splice(index, 1);
        G.cardPlayedThisTurn = true;
    }

    switch (card.id) {
        case 'gel': {
            // Geler la pièce ennemie la plus dangereuse (valeur + menace combinées)
            let best = null, bestScore = 0;
            for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
                const p = G.board[r][c];
                if (!p) continue;
                const isEnemy = enemyIsUpper ? p === p.toUpperCase() : p === p.toLowerCase();
                if (!isEnemy || isEffectAt(r,c,'freeze') || isEffectAt(r,c,'shield')) continue;
                const pv  = AI_PIECE_VALUE[p.toLowerCase()] || 0;
                const tv  = aiGetThreatValue(r, c, color) * 0.6;
                const sc  = pv * 0.35 + tv;
                if (sc > bestScore) { bestScore = sc; best = {r,c}; }
            }
            if (!best || bestScore < 110) return false;
            commit();
            addEffect('freeze', color, {r:best.r, c:best.c}, 1);
            renderHandCards(); renderBoard();
            return true;
        }
        case 'bouclier': {
            // Protéger la pièce alliée la plus précieuse qui est menacée
            let best = null, bestVal = 0;
            for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
                const p = G.board[r][c];
                if (!p) continue;
                const isOwn = enemyIsUpper ? p === p.toLowerCase() : p === p.toUpperCase();
                if (!isOwn || p.toLowerCase() === 'q' || p.toLowerCase() === 'k' || isEffectAt(r,c,'shield')) continue;
                const pv = AI_PIECE_VALUE[p.toLowerCase()] || 0;
                if (pv > bestVal && aiIsThreatened(r, c, enemyColor)) { bestVal = pv; best = {r,c}; }
            }
            if (!best) return false;
            commit();
            addEffect('shield', color, {r:best.r, c:best.c}, 1);
            renderHandCards(); renderBoard();
            return true;
        }
        case 'resurrection': {
            const gArr = color === 'black' ? G.graveyardBlack : G.graveyardWhite;
            const candidates = gArr.filter(p => p.toLowerCase() !== 'q')
                .sort((a,b) => AI_PIECE_VALUE[b.toLowerCase()] - AI_PIECE_VALUE[a.toLowerCase()]);
            if (!candidates.length) return false;
            const piece = candidates[0];
            const startRows = color === 'black' ? [0, 1] : [G.rows-2, G.rows-1];
            // Chercher une case libre non menacée
            for (const row of startRows) {
                for (let c = 0; c < G.cols; c++) {
                    if (!G.board[row][c] && !aiIsThreatened(row, c, enemyColor)) {
                        commit();
                        const gi = gArr.indexOf(piece); if (gi >= 0) gArr.splice(gi, 1);
                        G.board[row][c] = piece;
                        addEffect('resurrect', color, {r:row, c}, 3);
                        renderGraveyards(); renderHandCards(); renderBoard();
                        return true;
                    }
                }
            }
            // Fallback: case libre même menacée
            for (const row of startRows) {
                for (let c = 0; c < G.cols; c++) {
                    if (!G.board[row][c]) {
                        commit();
                        const gi = gArr.indexOf(piece); if (gi >= 0) gArr.splice(gi, 1);
                        G.board[row][c] = piece;
                        addEffect('resurrect', color, {r:row, c}, 3);
                        renderGraveyards(); renderHandCards(); renderBoard();
                        return true;
                    }
                }
            }
            return false;
        }
        case 'transformation': {
            // Choisir le pion le plus avancé ou le plus central
            const pawnChar = color === 'black' ? 'p' : 'P';
            const rookChar = color === 'black' ? 'r' : 'R';
            let bestPawn = null, bestAdvance = -1;
            for (let r = 0; r < G.rows; r++) {
                for (let c = 0; c < G.cols; c++) {
                    if (G.board[r][c] !== pawnChar) continue;
                    // Avancement = distance vers promotion
                    const advance = color === 'black' ? r : (G.rows - 1 - r);
                    const centerBonus = Math.abs(c - G.cols/2) < 2 ? 1 : 0;
                    const score = advance * 2 + centerBonus;
                    if (score > bestAdvance) { bestAdvance = score; bestPawn = {r,c}; }
                }
            }
            if (!bestPawn) return false;
            commit();
            const originalPiece = G.board[bestPawn.r][bestPawn.c];
            G.board[bestPawn.r][bestPawn.c] = rookChar;
            addEffect('transform', color, {r:bestPawn.r, c:bestPawn.c, originalPiece}, 2);
            renderHandCards(); renderBoard();
            return true;
        }
        case 'brouillard': {
            if (G.aiDifficulty === 'easy') return false;
            commit();
            for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
                const p = G.board[r][c]; if (!p) continue;
                const isOwn = enemyIsUpper ? p === p.toLowerCase() : p === p.toUpperCase();
                if (isOwn) addEffect('fog', color, {r,c}, 1);
            }
            renderHandCards(); renderBoard();
            return true;
        }
        case 'echange': {
            // Trouver l'échange qui améliore le plus la position de l'IA
            const own = [];
            for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
                const p = G.board[r][c];
                if (!p) continue;
                const isOwn = enemyIsUpper ? p === p.toLowerCase() : p === p.toUpperCase();
                if (isOwn) own.push({r,c});
            }
            if (own.length < 2) return false;
            const base = aiEval(G.board);
            let bestPair = null, bestGain = 30;
            for (let i = 0; i < own.length; i++) for (let j = i+1; j < own.length; j++) {
                const tb = G.board.map(row => [...row]);
                const {r:r1,c:c1} = own[i], {r:r2,c:c2} = own[j];
                tb[r1][c1] = G.board[r2][c2]; tb[r2][c2] = G.board[r1][c1];
                const gain = aiEval(tb) - base;
                if (gain > bestGain) { bestGain = gain; bestPair = [own[i], own[j]]; }
            }
            if (!bestPair) return false;
            commit();
            const [a,b] = bestPair;
            const tmp = G.board[a.r][a.c];
            G.board[a.r][a.c] = G.board[b.r][b.c]; G.board[b.r][b.c] = tmp;
            G.activeEffects.forEach(e => {
                const onA = e.data.r===a.r && e.data.c===a.c;
                const onB = e.data.r===b.r && e.data.c===b.c;
                if (onA) { e.data.r=b.r; e.data.c=b.c; }
                else if (onB) { e.data.r=a.r; e.data.c=a.c; }
            });
            renderHandCards(); renderBoard();
            return true;
        }
        case 'vision': {
            commit();
            if (!G.nextCard) G.nextCard = getRandomCard();
            renderHandCards();
            return true;
        }
    }
    return false;
}

function aiIsThreatened(r, c, byColor) {
    for (let er = 0; er < G.rows; er++) {
        for (let ec = 0; ec < G.cols; ec++) {
            const p = G.board[er][ec];
            if (!p) continue;
            const isW = p === p.toUpperCase();
            if ((byColor === 'white') !== isW) continue;
            if (getValidMoves(er, ec, p).some(m => m.r === r && m.c === c)) return true;
        }
    }
    return false;
}

// ===== KEYBOARD =====
document.addEventListener('keydown', e => {
    if (e.key==='Escape') {
        closeSecretCardModal();
        document.getElementById('gameover-modal').style.display='none';
        document.getElementById('forfeit-modal').style.display='none';
        closeCardGallery();
        if (G.activeCard&&G.activeCard.id==='murale'&&G.cardTargets.length>0) executeWall(G.cardTargets);
    }
});
