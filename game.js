// game.js

// --- Global State & Constants ---
let scene, camera, renderer, clock;
let ball, goal, keeper;
let playerState = {
    gold: 5000,
    myPlayers: [], // array of player IDs
    penaltyTakers: [] // array of 5 player IDs
};

const screens = {
    loading: document.getElementById('loading-screen'),
    mainMenu: document.getElementById('main-menu'),
    squad: document.getElementById('squad-screen'),
    store: document.getElementById('pack-store'),
    packOpening: document.getElementById('pack-opening-animation'),
    penaltyUI: document.getElementById('penalty-game-ui'),
};

const PENALTY_STATE = {
    INACTIVE: 'inactive',
    AIMING: 'aiming',
    POWERING: 'powering',
    SHOT_TAKEN: 'shot_taken',
    KEEPER_TURN: 'keeper_turn',
    END_ROUND: 'end_round'
};
let penalty = {
    state: PENALTY_STATE.INACTIVE,
    round: 0,
    playerScore: 0,
    opponentScore: 0,
    shotPower: 0,
    aim: new THREE.Vector3(),
};

// --- Initialization ---

function init() {
    loadPlayerState();

    // 3D Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 50);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    clock = new THREE.Clock();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(-5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    scene.add(dirLight);

    createStadium();
    setupEventListeners();
    
    setTimeout(() => {
        showScreen('mainMenu');
        updateGoldUI();
    }, 1500); // Simulate loading time

    animate();
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
}

// --- Player Data & UI ---

function savePlayerState() {
    localStorage.setItem('soccerGameState', JSON.stringify(playerState));
}

function loadPlayerState() {
    const savedState = localStorage.getItem('soccerGameState');
    if (savedState) {
        playerState = JSON.parse(savedState);
    } else {
        // Give player a starter team
        playerState.myPlayers = [1, 3, 6, 9, 21]; // Some good starter players
    }
}

function updateGoldUI() {
    document.getElementById('gold-balance').textContent = playerState.gold.toLocaleString();
}

function renderSquad() {
    const grid = document.getElementById('squad-list');
    grid.innerHTML = '';
    playerState.myPlayers.map(playerId => {
        const player = ALL_PLAYERS.find(p => p.id === playerId);
        if(player) {
            grid.appendChild(createPlayerCard(player, 'squad'));
        }
    });
    document.getElementById('player-count').textContent = playerState.myPlayers.length;
    renderPenaltyTakers();
}

function renderPenaltyTakers() {
    const list = document.getElementById('penalty-takers-list');
    list.innerHTML = '';
    for(let i=0; i<5; i++){
        const playerId = playerState.penaltyTakers[i];
        if(playerId) {
            const player = ALL_PLAYERS.find(p => p.id === playerId);
            list.appendChild(createPlayerCard(player, 'taker'));
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'player-card';
            placeholder.style.borderStyle = 'dashed';
            list.appendChild(placeholder);
        }
    }
}

function handleSquadCardClick(player, cardElement) {
    const isSelected = playerState.penaltyTakers.includes(player.id);
    if(isSelected) {
        playerState.penaltyTakers = playerState.penaltyTakers.filter(id => id !== player.id);
        cardElement.classList.remove('selected');
    } else {
        if (playerState.penaltyTakers.length < 5) {
            playerState.penaltyTakers.push(player.id);
            cardElement.classList.add('selected');
        } else {
            alert('You can only select 5 penalty takers.');
        }
    }
    renderPenaltyTakers();
    savePlayerState();
}

function createPlayerCard(player, context = 'default') {
    const card = document.createElement('div');
    card.className = 'player-card';
    if(playerState.penaltyTakers.includes(player.id) && context === 'squad') {
        card.classList.add('selected');
    }

   // --- THIS IS THE CORRECTED VERSION ---

// Set background gradient based on rating
let bgGradient = 'linear-gradient(160deg, #4b5a6a, #202b36)'; // A default color
if (player.rating >= 90) {
    bgGradient = 'linear-gradient(160deg, #FFD700, #B8860B)'; // Gold/Legend
} else if (player.rating >= 85) {
    bgGradient = 'linear-gradient(160deg, #3498db, #2980b9)'; // Blue/Rare
} else if (player.rating >= 80) {
    bgGradient = 'linear-gradient(160deg, #50c878, #3e9e62)'; // Green/Uncommon
}

card.style.background = bgGradient; // Use the corrected variable here too

    card.innerHTML = `
        <img class="player-img" src="${player.image}" alt="${player.name}">
        <div class="player-rating">${player.rating}</div>
        <div class="player-nation-pos">
            <img src="https://flagcdn.com/w40/${player.nation}.png" alt="${player.nation}">
            <span>${player.position}</span>
        </div>
        <div class="player-info">
            <h3 class="player-name">${player.name}</h3>
        </div>
    `;
    if(context === 'squad') {
        card.addEventListener('click', () => handleSquadCardClick(player, card));
    }
    return card;
}


// --- Event Listeners Setup ---

function setupEventListeners() {
    document.getElementById('play-btn').addEventListener('click', () => {
        if(playerState.penaltyTakers.length !== 5){
            alert('Please select 5 players for your squad before playing!');
            return;
        }
        showScreen('penaltyUI');
        startPenaltyGame();
    });
    document.getElementById('squad-btn').addEventListener('click', () => {
        renderSquad();
        showScreen('squad');
    });
    document.getElementById('packs-btn').addEventListener('click', () => showScreen('store'));
    
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => showScreen(btn.dataset.target));
    });

    document.getElementById('buy-pack-btn').addEventListener('click', buyPack);
    document.getElementById('pack-continue-btn').addEventListener('click', () => showScreen('store'));
    
    // Penalty controls
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('mousedown', onMouseDown, false);
    window.addEventListener('mouseup', onMouseUp, false);
}


// --- Pack Opening Logic ---

function buyPack() {
    const cost = 1000;
    if (playerState.gold >= cost) {
        playerState.gold -= cost;
        updateGoldUI();
        savePlayerState();
        showScreen('packOpening');
        openPack();
    } else {
        alert("Not enough gold!");
    }
}

function openPack() {
    // Weighted random selection
    const weights = ALL_PLAYERS.map(p => {
        if (p.rating >= 90) return 1;  // very rare
        if (p.rating >= 87) return 5;  // rare
        if (p.rating >= 84) return 20; // uncommon
        return 74; // common
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    let playerToReveal;
    for (let i = 0; i < ALL_PLAYERS.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            playerToReveal = ALL_PLAYERS[i];
            break;
        }
    }
    
    if (!playerState.myPlayers.includes(playerToReveal.id)) {
        playerState.myPlayers.push(playerToReveal.id);
    } else {
        // It's a duplicate, give some gold back
        const duplicateGold = Math.floor(playerToReveal.rating * 5);
        playerState.gold += duplicateGold;
        updateGoldUI();
        // Here you could add a message saying it was a duplicate.
    }
    savePlayerState();
    runPackAnimation(playerToReveal);
}

function runPackAnimation(player) {
    const flagEl = document.getElementById('reveal-flag');
    const posEl = document.getElementById('reveal-position');
    const cardContainer = document.getElementById('reveal-card-container');
    const continueBtn = document.getElementById('pack-continue-btn');

    flagEl.style.opacity = 0;
    posEl.style.opacity = 0;
    cardContainer.innerHTML = '';
    continueBtn.style.display = 'none';

    // Clear previous animations if any
    const oldFlare = document.querySelector('.walkout-flare');
    if (oldFlare) oldFlare.remove();
    
    setTimeout(() => { // 1. Reveal Flag
        flagEl.style.backgroundImage = `url(https://flagcdn.com/h120/${player.nation}.png)`;
        flagEl.style.opacity = 1;
        flagEl.style.transform = 'scale(1)';
    }, 500);

    setTimeout(() => { // 2. Reveal Position
        posEl.textContent = player.position;
        posEl.style.opacity = 1;
        posEl.style.transform = 'scale(1)';
    }, 1500);

    setTimeout(() => { // 3. Reveal Card
        const card = createPlayerCard(player);
        cardContainer.appendChild(card);
        // Add walkout flare for high-rated players
        if (player.rating >= 86) {
            const flare = document.createElement('div');
            flare.className = 'walkout-flare';
            cardContainer.appendChild(flare);
        }
    }, 2500);
    
    setTimeout(() => { // 4. Show Continue Button
        continueBtn.style.display = 'block';
    }, 3500);
}


// --- 3D World & Game Creation ---

function createStadium() {
    // Grass
    const grassTexture = new THREE.TextureLoader().load('https://threejsfundamentals.org/threejs/resources/images/checker.png'); // Placeholder texture
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(100, 100);
    const grassMaterial = new THREE.MeshLambertMaterial({ map: grassTexture });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), grassMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Ball
    const ballGeometry = new THREE.SphereGeometry(0.2, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(0, 0.2, 11); // Penalty spot
    scene.add(ball);
    
    // Goal
    goal = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.44, 16);
    const leftPost = new THREE.Mesh(postGeo, postMaterial);
    leftPost.position.set(-3.66, 2.44 / 2, 0);
    const rightPost = new THREE.Mesh(postGeo, postMaterial);
    rightPost.position.set(3.66, 2.44 / 2, 0);
    const crossbarGeo = new THREE.CylinderGeometry(0.1, 0.1, 7.32, 16);
    const crossbar = new THREE.Mesh(crossbarGeo, postMaterial);
    crossbar.rotation.z = Math.PI/2;
    crossbar.position.y = 2.44;
    goal.add(leftPost, rightPost, crossbar);
    goal.traverse(child => { child.castShadow = true; child.receiveShadow = true; });
    scene.add(goal);

    // Goalkeeper
    const keeperGeo = new THREE.CapsuleGeometry(0.3, 1.4, 4, 16);
    const keeperMat = new THREE.MeshStandardMaterial({color: 0xff0000, roughness: 0.5});
    keeper = new THREE.Mesh(keeperGeo, keeperMat);
    keeper.position.set(0, (1.4/2)+0.3, 0.5);
    keeper.castShadow = true;
    scene.add(keeper);
}


// --- Penalty Game Logic ---

function startPenaltyGame() {
    penalty.state = PENALTY_STATE.INACTIVE;
    penalty.round = 1;
    penalty.playerScore = 0;
    penalty.opponentScore = 0;
    resetBall();
    updatePenaltyHUD();
    setTimeout(() => {
        setupPlayerTurn();
    }, 1000);
}

function setupPlayerTurn() {
    penalty.state = PENALTY_STATE.AIMING;
    document.getElementById('aim-reticle').classList.add('visible');
    camera.position.set(0, 1, 13);
    camera.lookAt(ball.position);
}

function updatePenaltyHUD() {
    document.getElementById('penalty-score').textContent = `Player ${penalty.playerScore} - ${penalty.opponentScore} Opponent`;
    document.getElementById('penalty-info').textContent = `Round ${penalty.round}/5: ${penalty.state === PENALTY_STATE.KEEPER_TURN ? 'Opponent\'s turn' : 'Your turn to shoot'}`;
}

function onMouseMove(event) {
    if (penalty.state !== PENALTY_STATE.AIMING) return;
    
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    
    // Project mouse onto the goal plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(plane, penalty.aim);

    // Clamp the aim to be within the goal posts
    penalty.aim.x = THREE.MathUtils.clamp(penalty.aim.x, -3.5, 3.5);
    penalty.aim.y = THREE.MathUtils.clamp(penalty.aim.y, 0.1, 2.3);

    // Update reticle position
    const screenPos = penalty.aim.clone().project(camera);
    const reticle = document.getElementById('aim-reticle');
    reticle.style.left = `${(screenPos.x + 1) / 2 * window.innerWidth}px`;
    reticle.style.top = `${(-screenPos.y + 1) / 2 * window.innerHeight}px`;
}

function onMouseDown(event) {
    if (penalty.state === PENALTY_STATE.AIMING) {
        penalty.state = PENALTY_STATE.POWERING;
        penalty.shotPower = 0;
    }
}

function onMouseUp(event) {
    if (penalty.state === PENALTY_STATE.POWERING) {
        shootBall();
    }
}

function shootBall() {
    penalty.state = PENALTY_STATE.SHOT_TAKEN;
    document.getElementById('aim-reticle').classList.remove('visible');

    // Get current player stats
    const player = ALL_PLAYERS.find(p => p.id === playerState.penaltyTakers[penalty.round-1]);
    const stats = player.stats;

    // Ball velocity based on aim, power, and player stats
    const power = (penalty.shotPower / 100) * 20 + 10; // base velocity 10-30
    const shotPowerStat = (stats.speed - 50) / 50; // -1 to 1
    const finalPower = power * (1 + shotPowerStat * 0.3); // Apply +/- 30% from stats

    const accuracyStat = 1 - ((stats.control-50)/50) * 0.9; // 0.1 to 1.9
    const inaccuracy = 0.5 * accuracyStat;

    const direction = penalty.aim.clone().sub(ball.position).normalize();
    direction.x += (Math.random() - 0.5) * inaccuracy;
    direction.y += (Math.random() - 0.5) * inaccuracy;

    ball.velocity = direction.multiplyScalar(finalPower);
    ball.angularVelocity = new THREE.Vector3(-ball.velocity.z, 0, ball.velocity.x).multiplyScalar(0.1);
}

function handleKeeperTurn() {
    penalty.state = PENALTY_STATE.KEEPER_TURN;
    updatePenaltyHUD();
    
    // AI keeper logic
    setTimeout(() => {
        const diveSuccess = Math.random() < 0.7; // 70% chance AI saves
        let result = "SAVED!";
        if(diveSuccess) {
            result = "SAVED!";
        } else {
            result = "GOAL!";
            penalty.opponentScore++;
        }
        showResultMessage(result, endRound);
    }, 1500);
}

function endRound() {
    penalty.round++;
    if(penalty.round > 5){
        endGame();
    } else {
       setupPlayerTurn();
       updatePenaltyHUD();
       resetBall();
    }
}

function endGame(){
    let result = "DRAW!";
    let reward = 500;
    if(penalty.playerScore > penalty.opponentScore){
        result = "YOU WIN!";
        reward = 1500;
    } else if (penalty.playerScore < penalty.opponentScore) {
        result = "YOU LOSE!";
        reward = 250;
    }
    playerState.gold += reward;
    showResultMessage(result, () => showScreen('mainMenu'));
    savePlayerState();
    updateGoldUI();
}

function checkGoal(ballPos) {
    // Basic collision check
    if (ballPos.z < 0 && ballPos.y > 0) { // Past goal line
        if (Math.abs(ballPos.x) < 3.66 && ballPos.y < 2.44) {
            // GOAL
            penalty.playerScore++;
            return "GOAL!";
        }
    }
    return null; // Not a goal yet
}

function showResultMessage(msg, callback) {
    const el = document.getElementById('result-message');
    el.textContent = msg;
    el.style.display = 'block';

    setTimeout(() => {
        el.style.display = 'none';
        callback();
    }, 2000);
}

function resetBall(){
    ball.position.set(0, 0.2, 11);
    ball.velocity = new THREE.Vector3();
    ball.angularVelocity = new THREE.Vector3();
}

// --- Animation Loop ---

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Powering up shot
    if (penalty.state === PENALTY_STATE.POWERING) {
        penalty.shotPower += 150 * delta;
        if (penalty.shotPower > 100) penalty.shotPower = 100;
        document.getElementById('power-bar-inner').style.width = `${penalty.shotPower}%`;
    }

    // Shot physics
    if (penalty.state === PENALTY_STATE.SHOT_TAKEN && ball.velocity) {
        ball.velocity.y -= 9.8 * delta; // Gravity
        ball.position.add(ball.velocity.clone().multiplyScalar(delta));
        ball.rotation.x += ball.angularVelocity.x * delta;
        ball.rotation.z += ball.angularVelocity.z * delta;
        
        // Ground collision
        if(ball.position.y < 0.2){
            ball.position.y = 0.2;
            ball.velocity.y *= -0.5; // bounce
        }

        const goalResult = checkGoal(ball.position);
        if(goalResult) {
            penalty.state = PENALTY_STATE.END_ROUND;
            showResultMessage(goalResult, handleKeeperTurn);
        } else if(ball.position.z < -2){ // went too far
            penalty.state = PENALTY_STATE.END_ROUND;
            showResultMessage("MISS!", handleKeeperTurn);
        }
    }

    renderer.render(scene, camera);
}

// --- Start the App ---
init();
