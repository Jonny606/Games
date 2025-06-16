 // game.js

// ==================== CONSTANTS & GLOBAL STATE ====================

// -- General constants --

const BALL_START_POS = { x: 0, y: 0.2, z: 11 };
const REWARD_WIN = 1500;
const REWARD_LOSE = 250;
const REWARD_DRAW = 500;
const PACK_COST = 1000;
const PENALTY_ROUNDS = 5;
// -- Physics constants --

const g = 9.81;

const rho = 1.2;          // density of air

const Cd = 0.25;          // drag coefficient

const Cl = 0.28;          // lift coefficient (for spin)

const mass = 0.4;         // ball mass in kg

const radius = 0.1095;    // ball radius in meters

const A = Math.PI * radius * radius; // cross-sectional area

const magnusConstant = (rho * A * Cl) / (2 * mass);

const dragConstant = (rho * A * Cd) / (2 * mass);



// -- Penalty State Enum --

const PENALTY_STATE = {

    INACTIVE: 'inactive',

    AIMING: 'aiming',

    POWERING: 'powering',

    SHOT_TAKEN: 'shot_taken',

    ANIMATING_KEEPER: 'animating_keeper',

    KEEPER_TURN: 'keeper_turn',

    OPPONENT_SHOT: 'opponent_shot',

    END_ROUND: 'end_round'

};



// -- Global Three.js objects --

let scene, camera, renderer, clock, textureLoader;

let ball, goal, shooter; // 'keeper' is defined in goalkeeper.js



// -- UI state --

let playerState = { gold: 5000, myPlayers: [], penaltyTakers: [] };

const screens = {

    loading: document.getElementById('loading-screen'),

    mainMenu: document.getElementById('main-menu'),

    squad: document.getElementById('squad-screen'),

    store: document.getElementById('store-screen'),

    packOpening: document.getElementById('pack-opening'),

    penalty: document.getElementById('penalty-screen')

};



// -- Penalty game state --

let penalty = {

    state: PENALTY_STATE.INACTIVE,

    round: 0,

    playerScore: 0,

    opponentScore: 0,

    shotPower: 0,

    aim: new THREE.Vector3(),

    keeperDive: {

        active: false,

        start: new THREE.Vector3(),

        end: new THREE.Vector3(),

        duration: 0.4,

        animationSet: 'idle'

    }

};



// ==================== UTILITY FUNCTIONS ====================



function $(id) {

    return document.getElementById(id);

}



function showScreen(screenName) {

    Object.values(screens).forEach(s => s && s.classList.remove('active'));

    if (screens[screenName]) screens[screenName].classList.add('active');

}



function showElement(id) {

    const el = $(id);

    if (el) el.classList.add('visible');

}

function hideElement(id) {

    const el = $(id);

    if (el) el.classList.remove('visible');

}



// ==================== PLAYER STATE STORAGE ====================



function savePlayerState() {

    localStorage.setItem('soccerGameState', JSON.stringify(playerState));

}



function loadPlayerState() {

    const savedState = localStorage.getItem('soccerGameState');

    if (savedState) {

        playerState = JSON.parse(savedState);

    } else {

        playerState.myPlayers = [1, 3, 6, 9, 21]; // Default players

        playerState.penaltyTakers = [1, 3, 6, 9, 21];

        playerState.gold = 5000;

    }

}



// ==================== UI RENDERING ====================



function updateGoldUI() {

    const el = $('gold-balance');

    if (el) el.textContent = playerState.gold.toLocaleString();

}



function renderSquad() {

    const grid = $('squad-list');

    if (!grid) return;

    grid.innerHTML = '';

    playerState.myPlayers.map(playerId => {

        const player = ALL_PLAYERS.find(p => p.id === playerId);

        if (player) grid.appendChild(createPlayerCard(player, 'squad'));

    });

}



function renderPenaltyTakers() {

    const lineupEl = $('team-sheet-lineup');

    if (!lineupEl) return;

    lineupEl.innerHTML = '';

    for (let i = 0; i < PENALTY_ROUNDS; i++) {

        const slot = document.createElement('div');

        slot.className = 'lineup-slot';

        const playerId = playerState.penaltyTakers[i];

        if (playerId) {

            const player = ALL_PLAYERS.find(p => p.id === playerId);

            if (player) slot.appendChild(createPlayerCard(player, 'lineup'));

        }

        lineupEl.appendChild(slot);

    }

}



function createPlayerCard(player, context = 'default') {

    const card = document.createElement('div');

    card.className = 'player-card';

    if (playerState.penaltyTakers.includes(player.id) && context === 'squad') {

        card.classList.add('selected');

    }

    card.textContent = player.name + " (" + player.rating + ")";

    card.addEventListener('click', () => handleSquadCardClick(player, card));

    return card;

}



function handleSquadCardClick(player, cardElement) {

    const isSelected = playerState.penaltyTakers.includes(player.id);

    if (isSelected) {

        playerState.penaltyTakers = playerState.penaltyTakers.filter(id => id !== player.id);

    } else if (playerState.penaltyTakers.length < PENALTY_ROUNDS) {

        playerState.penaltyTakers.push(player.id);

    }

    renderSquad();

    renderPenaltyTakers();

    savePlayerState();

}



// ==================== EVENT LISTENERS ====================



function setupEventListeners() {

    const playBtn = $('play-btn');

    if (playBtn) {

        playBtn.addEventListener('click', () => {

            if (playerState.penaltyTakers.length !== PENALTY_ROUNDS) {

                alert('Please select 5 players for your squad.');

                return;

            }

            showScreen('penalty');

            startPenaltyGame();

        });

    }

    // Add more listeners as needed

}



// ==================== PACK OPENING LOGIC ====================



function buyPack() {

    if (playerState.gold >= PACK_COST) {

        playerState.gold -= PACK_COST;

        updateGoldUI();

        savePlayerState();

        showScreen('packOpening');

        openPack();

    } else {

        alert("Not enough gold!");

    }

}



function openPack() {

    // Sample weighted player selection logic

    const weights = ALL_PLAYERS.map(p => {

        if (p.rating >= 90) return 1;

        if (p.rating >= 87) return 5;

        if (p.rating >= 84) return 20;

        return 74;

    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let r = Math.random() * totalWeight;

    for (let i = 0; i < ALL_PLAYERS.length; i++) {

        r -= weights[i];

        if (r < 0) {

            const player = ALL_PLAYERS[i];

            runPackAnimation(player);

            playerState.myPlayers.push(player.id);

            savePlayerState();

            return;

        }

    }

}



function runPackAnimation(player) {

    const flagEl = $('reveal-flag');

    const posEl = $('reveal-position');

    const cardContainer = $('reveal-card');

    if (flagEl) flagEl.textContent = player.nationality || '';

    if (posEl) posEl.textContent = player.position || '';

    if (cardContainer) cardContainer.textContent = player.name + " (" + player.rating + ")";

}



// ==================== THREE.JS ENVIRONMENT ====================



function loadEnvironment() {

    // Grass

    const grassColorMap = textureLoader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/terrain/grasslight-big.jpg');

    grassColorMap.wrapS = THREE.RepeatWrapping;

    grassColorMap.wrapT = THREE.RepeatWrapping;

    grassColorMap.repeat.set(25, 25);

    const grassMaterial = new THREE.MeshStandardMaterial({ map: grassColorMap, roughness: 0.7, metalness: 0.1 });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), grassMaterial);

    ground.rotation.x = -Math.PI / 2;

    ground.receiveShadow = true;

    scene.add(ground);



    // Ball

    const ballGeometry = new THREE.SphereGeometry(0.2, 32, 32);

    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });

    ball = new THREE.Mesh(ballGeometry, ballMaterial);

    ball.castShadow = true;

    ball.position.set(BALL_START_POS.x, BALL_START_POS.y, BALL_START_POS.z);

    ball.velocity = new THREE.Vector3();

    ball.angularVelocity = new THREE.Vector3();

    scene.add(ball);



    // Goal

    goal = new THREE.Group();

    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9 });

    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.44, 16);

    const leftPost = new THREE.Mesh(postGeo, postMaterial);

    leftPost.position.set(-3.66, 2.44 / 2, 0);

    const rightPost = new THREE.Mesh(postGeo, postMaterial);

    rightPost.position.set(3.66, 2.44 / 2, 0);

    const crossbarGeo = new THREE.CylinderGeometry(0.1, 0.1, 7.32, 16);

    const crossbar = new THREE.Mesh(crossbarGeo, postMaterial);

    crossbar.rotation.z = Math.PI / 2;

    crossbar.position.y = 2.44;

    goal.add(leftPost, rightPost, crossbar);

    goal.traverse(node => { if (node.isMesh) node.castShadow = true; });

    scene.add(goal);

}



// ==================== CHARACTER LOADING ====================



function loadCharacters(gltfLoader) {

    const shooterURL = 'https://cdn.jsdelivr.net/gh/Jonny606/Games@main/Soccer%20Penalty%20Kick.glb';

    gltfLoader.load(shooterURL, (gltf) => {

        shooter = gltf.scene;

        shooter.scale.set(0.006, 0.006, 0.006);

        shooter.position.set(0, 0, 11.5);

        shooter.rotation.y = Math.PI;

        shooter.traverse(node => { if (node.isMesh) node.castShadow = true; });

        scene.add(shooter);

    }, undefined, function (error) {

        console.error('Error loading shooter model:', error);

    });

    loadKeeperSpritesAndModel();

}



// ==================== BALL PHYSICS ====================



function updateBallPhysics(delta) {

    if (!ball || !ball.velocity) return;

    const v = ball.velocity.length();

    if (v < 0.1 && ball.position.y <= 0.21) {

        ball.velocity.set(0, 0, 0);

        ball.angularVelocity.set(0, 0, 0);

        ball.rotation.set(0, 0, 0);

        return;

    }

    const Fdrag = ball.velocity.clone().negate().normalize().multiplyScalar(dragConstant * v * v);

    const FMagnus = ball.angularVelocity.clone().cross(ball.velocity).multiplyScalar(magnusConstant);

    const acceleration = new THREE.Vector3().add(Fdrag).add(FMagnus);

    acceleration.y -= g;

    ball.velocity.add(acceleration.clone().multiplyScalar(delta));

    ball.position.add(ball.velocity.clone().multiplyScalar(delta));

}



// ==================== PENALTY GAME LOGIC ====================



function startPenaltyGame() {

    penalty.state = PENALTY_STATE.INACTIVE;

    penalty.round = 1;

    penalty.playerScore = 0;

    penalty.opponentScore = 0;

    if (shooter) shooter.visible = true;

    if (keeper) keeper.visible = true;

    ball.visible = true;

    resetBall();

    resetKeeper();

    updatePenaltyHUD();

    showElement('shot-controls');

    setTimeout(setupPlayerTurn, 1000);

}



function setupPlayerTurn() {

    penalty.state = PENALTY_STATE.AIMING;

    showElement('aim-reticle');

    camera.position.set(0, 1.5, 14);

    camera.lookAt(ball.position);

    if (keeper) {

        keeper.visible = true;

        if (typeof keeperIdleTexture !== "undefined" && keeper.material) {

            keeper.material.map = keeperIdleTexture;

            keeper.material.map.needsUpdate = true;

        }

        penalty.keeperDive.animationSet = 'idle';

        resetGoalkeeperState();

    }

    ball.visible = true;

}
 function resetBall() {
    if (ball) {
        ball.position.set(BALL_START_POS.x, BALL_START_POS.y, BALL_START_POS.z);
        ball.velocity.set(0, 0, 0);
        ball.angularVelocity.set(0, 0, 0);
        ball.visible = true;
    }
}
 function resetKeeper() {
    if (keeper) {
        // Set to starting position; adjust as needed for your model
        keeper.position.set(0, 0, 0); 
        keeper.visible = true;
        // You can also reset animation or state if your keeper uses those
        if (typeof resetGoalkeeperState === "function") {
            resetGoalkeeperState();
        }
    }
}

function updatePenaltyHUD() {

    const scoreEl = $('penalty-score');

    if (scoreEl) scoreEl.textContent = `Player ${penalty.playerScore} - ${penalty.opponentScore} Opponent`;

    const turnText = (penalty.state === PENALTY_STATE.KEEPER_TURN || penalty.state === PENALTY_STATE.OPPONENT_SHOT)

        ? "Opponent's Turn"

        : `Your Turn - Taker #${penalty.round}`;

    const infoEl = $('penalty-info');

    if (infoEl) infoEl.textContent = `Round ${penalty.round}/${PENALTY_ROUNDS}: ${turnText}`;

}



// ... (Keep all your mouse and shot logic! No removal here) ...



// ==================== MAIN ANIMATION LOOP ====================



function animate() {

    requestAnimationFrame(animate);

    const delta = clock.getDelta();



    if (penalty.state === PENALTY_STATE.POWERING) {

        penalty.shotPower += 150 * delta;

        if (penalty.shotPower > 100) penalty.shotPower = 100;

        const powerBar = $('power-bar-inner');

        if (powerBar) powerBar.style.width = `${penalty.shotPower}%`;

    }



    // External goalkeeper update function

    if (typeof updateGoalkeeper === "function") {

        updateGoalkeeper(delta, penalty);

    }



    // Ball physics and goal checks

    if ([PENALTY_STATE.ANIMATING_KEEPER, PENALTY_STATE.SHOT_TAKEN, PENALTY_STATE.OPPONENT_SHOT].includes(penalty.state)) {

        updateBallPhysics(delta);

        if (ball.angularVelocity) {

            ball.rotation.x += ball.angularVelocity.x * delta;

            ball.rotation.y += ball.angularVelocity.y * delta;

            ball.rotation.z += ball.angularVelocity.z * delta;

        }

        if (ball.position.y < 0.2) {

            ball.position.y = 0.2;

            if (ball.velocity.y < -0.1) ball.velocity.y *= -0.5;

            else ball.velocity.y = 0;

            ball.velocity.x *= 0.9;

            ball.velocity.z *= 0.9;

        }

        const outcome = checkGoalAndSave(ball.position);

        if (outcome) {

            penalty.state = PENALTY_STATE.END_ROUND;

            showResultMessage(outcome, endRound);

        }

    }

    renderer.render(scene, camera);

}



// ==================== INIT ====================



function init() {

    loadPlayerState();



    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x87CEEB);

    scene.fog = new THREE.Fog(0x87CEEB, 20, 60);



    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);



    renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.shadowMap.enabled = true;

    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 1.0;

    if ($('game-container')) $('game-container').appendChild(renderer.domElement);



    clock = new THREE.Clock();



    const loadingManager = new THREE.LoadingManager();

    const loadingDetails = $('loading-details');



    loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {

        if (loadingDetails) loadingDetails.textContent = `Loading asset ${itemsLoaded} of ${itemsTotal}...`;

        console.log(`Loading file: ${url} (${itemsLoaded}/${itemsTotal})`);

    };



    loadingManager.onLoad = function () {

        console.log('All models loaded successfully!');

        setTimeout(() => {

            showScreen('mainMenu');

            updateGoldUI();

        }, 200);

    };



    loadingManager.onError = function (url) {

        console.error('There was an error loading ' + url);

        if (loadingDetails) loadingDetails.textContent = `Error loading: ${url}. Please refresh.`;

    };



    textureLoader = new THREE.TextureLoader(loadingManager);

    const gltfLoader = new THREE.GLTFLoader(loadingManager);



    // Lighting

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);

    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);

    dirLight.position.set(10, 15, 5);

    dirLight.castShadow = true;

    dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;

    dirLight.shadow.camera.top = 20; dirLight.shadow.camera.bottom = -20;

    dirLight.shadow.camera.left = -20; dirLight.shadow.camera.right = 20;

    dirLight.shadow.bias = -0.001;

    scene.add(dirLight);



    loadEnvironment();

    loadCharacters(gltfLoader);



    setupEventListeners();

    animate();

}



init()
