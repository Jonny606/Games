// game.js

// --- Global State & Constants ---
let scene, camera, renderer, clock, textureLoader;
let ball, goal, keeper, shooter; // Using full 3D models now
let mixer; // For animations later, if any
let playerState = { gold: 5000, myPlayers: [], penaltyTakers: [] };
const screens = { loading: document.getElementById('loading-screen'), mainMenu: document.getElementById('main-menu'), squad: document.getElementById('squad-screen'), store: document.getElementById('pack-store'), packOpening: document.getElementById('pack-opening-animation'), penaltyUI: document.getElementById('penalty-game-ui'), };
const PENALTY_STATE = { INACTIVE: 'inactive', AIMING: 'aiming', POWERING: 'powering', SHOT_TAKEN: 'shot_taken', ANIMATING_KEEPER: 'animating_keeper', KEEPER_TURN: 'keeper_turn', END_ROUND: 'end_round' };
let penalty = { state: PENALTY_STATE.INACTIVE, round: 0, playerScore: 0, opponentScore: 0, shotPower: 0, aim: new THREE.Vector3(), keeperDive: { active: false, start: null, end: null, duration: 0.4 } };


// --- Initialization ---
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
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    clock = new THREE.Clock();
    textureLoader = new THREE.TextureLoader();

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

    const loadingManager = new THREE.LoadingManager();
    const loadingDetails = document.getElementById('loading-details');

    loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
        loadingDetails.textContent = `Loading asset ${itemsLoaded} of ${itemsTotal}...`;
    };

    loadingManager.onLoad = function() {
        console.log('All models loaded successfully!');
        setTimeout(() => {
            showScreen('mainMenu');
            updateGoldUI();
        }, 200);
    };

    loadingManager.onError = function(url) {
        console.error('There was an error loading ' + url);
        loadingDetails.textContent = 'Error loading assets. Please refresh.';
    };

    const gltfLoader = new THREE.GLTFLoader(loadingManager);
    
    loadEnvironment(gltfLoader);
    loadCharacters(gltfLoader);

    setupEventListeners();
    animate();
}

function showScreen(screenName) { Object.values(screens).forEach(s => s.classList.remove('active')); if (screens[screenName]) { screens[screenName].classList.add('active'); } }
function savePlayerState() { localStorage.setItem('soccerGameState', JSON.stringify(playerState)); }
function loadPlayerState() { const savedState = localStorage.getItem('soccerGameState'); if (savedState) { playerState = JSON.parse(savedState); } else { playerState.myPlayers = [1, 3, 6, 9, 21]; } }
function updateGoldUI() { document.getElementById('gold-balance').textContent = playerState.gold.toLocaleString(); }

function renderSquad() { 
    const grid = document.getElementById('squad-list'); 
    grid.innerHTML = ''; 
    playerState.myPlayers.map(playerId => { 
        const player = ALL_PLAYERS.find(p => p.id === playerId); 
        if (player) { grid.appendChild(createPlayerCard(player, 'squad')); } 
    }); 
    document.getElementById('player-count').textContent = playerState.myPlayers.length; 
    renderPenaltyTakers(); 
}

function renderPenaltyTakers() { 
    const lineupEl = document.getElementById('team-sheet-lineup'); 
    lineupEl.innerHTML = ''; 
    for (let i = 0; i < 5; i++) { 
        const slot = document.createElement('div'); 
        slot.className = 'lineup-slot'; 
        const playerId = playerState.penaltyTakers[i]; 
        if (playerId) { 
            const player = ALL_PLAYERS.find(p => p.id === playerId); 
            slot.classList.add('filled'); 
            slot.innerHTML = `<img class="player-img" src="${player.image}" alt="${player.name}"><div class="slot-info"><h3>${player.name}</h3><p>Rating: ${player.rating}</p></div>`; 
        } else { 
            slot.innerHTML = `<span class="slot-role">Taker ${i + 1}</span>`; 
        } 
        lineupEl.appendChild(slot); 
    } 
}

function handleSquadCardClick(player, cardElement) { 
    const isSelected = playerState.penaltyTakers.includes(player.id); 
    if (isSelected) { 
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
    renderSquad(); 
    savePlayerState(); 
}

function createPlayerCard(player, context = 'default') { 
    const card = document.createElement('div'); 
    card.className = 'player-card'; 
    if (playerState.penaltyTakers.includes(player.id) && context === 'squad') { 
        card.classList.add('selected'); 
    } 
    let bgGradient = 'linear-gradient(160deg, #4b5a6a, #202b36)'; 
    if (player.rating >= 90) bgGradient = 'linear-gradient(160deg, #FFD700, #B8860B)'; 
    else if (player.rating >= 85) bgGradient = 'linear-gradient(160deg, #3498db, #2980b9)'; 
    else if (player.rating >= 80) bgGradient = 'linear-gradient(160deg, #50c878, #3e9e62)'; 
    card.style.background = bgGradient; 
    card.innerHTML = `<img class="player-img" src="${player.image}" alt="${player.name}"><div class="player-rating">${player.rating}</div><div class="player-nation-pos"><img src="https://flagcdn.com/w40/${player.nation}.png" alt="${player.nation}"><span>${player.position}</span></div><div class="player-info"><h3 class="player-name">${player.name}</h3></div>`; 
    if (context === 'squad') { 
        card.addEventListener('click', () => handleSquadCardClick(player, card)); 
    } 
    return card; 
}

function setupEventListeners() { 
    document.getElementById('play-btn').addEventListener('click', () => { 
        if (playerState.penaltyTakers.length !== 5) { 
            alert('Please select 5 players for your squad before playing!'); 
            return; 
        } 
        showScreen('penaltyUI'); 
        startPenaltyGame(); 
    }); 
    document.getElementById('squad-btn').addEventListener('click', () => { renderSquad(); showScreen('squad'); }); 
    document.getElementById('packs-btn').addEventListener('click', () => showScreen('store')); 
    document.querySelectorAll('.back-btn').forEach(btn => { 
        btn.addEventListener('click', () => { 
            penalty.state = PENALTY_STATE.INACTIVE; 
            showScreen(btn.dataset.target); 
        }); 
    }); 
    document.getElementById('buy-pack-btn').addEventListener('click', buyPack); 
    document.getElementById('pack-continue-btn').addEventListener('click', () => showScreen('store')); 
    window.addEventListener('mousemove', onMouseMove, false); 
    window.addEventListener('mousedown', onMouseDown, false); 
    window.addEventListener('mouseup', onMouseUp, false); 
}

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
    const weights = ALL_PLAYERS.map(p => { 
        if (p.rating >= 90) return 1; 
        if (p.rating >= 87) return 5; 
        if (p.rating >= 84) return 20; 
        return 74; 
    }); 
    const totalWeight = weights.reduce((a, b) => a + b, 0); 
    let random = Math.random() * totalWeight; 
    let playerToReveal; 
    for (let i = 0; i < ALL_PLAYERS.length; i++) { 
        random -= weights[i]; 
        if (random <= 0) { playerToReveal = ALL_PLAYERS[i]; break; } 
    } 
    if (!playerState.myPlayers.includes(playerToReveal.id)) { 
        playerState.myPlayers.push(playerToReveal.id); 
    } else { 
        playerState.gold += Math.floor(playerToReveal.rating * 5); 
        updateGoldUI(); 
    } 
    savePlayerState(); 
    runPackAnimation(playerToReveal); 
}

function runPackAnimation(player) { 
    const flagEl = document.getElementById('reveal-flag'), posEl = document.getElementById('reveal-position'), cardContainer = document.getElementById('reveal-card-container'), continueBtn = document.getElementById('pack-continue-btn'); 
    flagEl.style.opacity = 0; posEl.style.opacity = 0; cardContainer.innerHTML = ''; continueBtn.style.display = 'none'; 
    const oldFlare = document.querySelector('.walkout-flare'); 
    if (oldFlare) oldFlare.remove(); 
    setTimeout(() => { flagEl.style.backgroundImage = `url(https://flagcdn.com/h120/${player.nation}.png)`; flagEl.style.opacity = 1; flagEl.style.transform = 'scale(1)'; }, 500); 
    setTimeout(() => { posEl.textContent = player.position; posEl.style.opacity = 1; posEl.style.transform = 'scale(1)'; }, 1500); 
    setTimeout(() => { 
        const card = createPlayerCard(player); 
        cardContainer.appendChild(card); 
        if (player.rating >= 86) { const flare = document.createElement('div'); flare.className = 'walkout-flare'; cardContainer.appendChild(flare); } 
    }, 2500); 
    setTimeout(() => { continueBtn.style.display = 'block'; }, 3500); 
}// --- 3D Model Loading Section ---
function loadEnvironment(gltfLoader) {
    const grassColorMap = textureLoader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/terrain/grasslight-big.jpg');
    grassColorMap.wrapS = THREE.RepeatWrapping; grassColorMap.wrapT = THREE.RepeatWrapping; grassColorMap.repeat.set(25, 25);
    const grassMaterial = new THREE.MeshStandardMaterial({ map: grassColorMap, roughness: 0.7, metalness: 0.1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), grassMaterial);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    const ballGeometry = new THREE.SphereGeometry(0.2, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true; ball.position.set(0, 0.2, 11);
    scene.add(ball);

    // Load the Goal model
    const goalURL = 'https://raw.githubusercontent.com/baronwatts/models/master/legacy-soccer-goal.glb';
    gltfLoader.load(goalURL, (gltf) => {
        goal = gltf.scene;
        goal.scale.set(1.4, 1.4, 1.4);
        goal.position.set(0, 0, -1);
        goal.traverse(node => { if (node.isMesh) { node.castShadow = true; } });
        scene.add(goal);
    });
}

function loadCharacters(gltfLoader) {
    // Load the Goalkeeper model
    const keeperURL = 'https://raw.githubusercontent.com/baronwatts/models/master/goalie.glb';
    gltfLoader.load(keeperURL, (gltf) => {
        keeper = gltf.scene;
        keeper.scale.set(0.6, 0.6, 0.6);
        keeper.position.set(0, 0, 0.5);
        keeper.rotation.y = Math.PI;
        keeper.traverse(node => { if (node.isMesh) { node.castShadow = true; } });
        scene.add(keeper);
    });

    // Load the Shooter model
    const shooterURL = 'https://raw.githubusercontent.com/Jonny606/Games/main/Soccer%20Penalty%20Kick.glb';
    gltfLoader.load(shooterURL, (gltf) => {
        shooter = gltf.scene;
        shooter.scale.set(0.6, 0.6, 0.6);
        shooter.position.set(0, 0, 11.5);
        shooter.rotation.y = Math.PI;
        shooter.traverse(node => { if (node.isMesh) { node.castShadow = true; } });
        scene.add(shooter);
    });
}
// --- Penalty Game Logic ---
function startPenaltyGame() {
    penalty.state = PENALTY_STATE.INACTIVE; penalty.round = 1; penalty.playerScore = 0; penalty.opponentScore = 0;
    if (shooter) shooter.visible = true;
    if (keeper) keeper.visible = true;
    resetBall(); resetKeeper();
    updatePenaltyHUD();
    document.querySelector('.shot-controls').classList.add('visible');
    setTimeout(() => { setupPlayerTurn(); }, 1000);
}

function setupPlayerTurn() { penalty.state = PENALTY_STATE.AIMING; document.getElementById('aim-reticle').classList.add('visible'); camera.position.set(0, 1.5, 14); camera.lookAt(ball.position); }
function updatePenaltyHUD() { document.getElementById('penalty-score').textContent = `Player ${penalty.playerScore} - ${penalty.opponentScore} Opponent`; const turnText = (penalty.state === PENALTY_STATE.KEEPER_TURN) ? "Opponent's Turn" : `Your Turn - Taker #${penalty.round}`; document.getElementById('penalty-info').textContent = `Round ${penalty.round}/5: ${turnText}`; }
function onMouseMove(event) { if (penalty.state !== PENALTY_STATE.AIMING) return; const mouse = new THREE.Vector2(); mouse.x = (event.clientX / window.innerWidth) * 2 - 1; mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(mouse, camera); raycaster.ray.intersectPlane(plane, penalty.aim); penalty.aim.x = THREE.MathUtils.clamp(penalty.aim.x, -3.5, 3.5); penalty.aim.y = THREE.MathUtils.clamp(penalty.aim.y, 0.1, 2.3); const screenPos = penalty.aim.clone().project(camera); const reticle = document.getElementById('aim-reticle'); reticle.style.left = `${(screenPos.x + 1) / 2 * window.innerWidth}px`; reticle.style.top = `${(-screenPos.y + 1) / 2 * window.innerHeight}px`; }
function onMouseDown(event) { if (penalty.state === PENALTY_STATE.AIMING) { penalty.state = PENALTY_STATE.POWERING; penalty.shotPower = 0; } }
function onMouseUp(event) { if (penalty.state === PENALTY_STATE.POWERING) { shootBall(); } }

function shootBall() {
    penalty.state = PENALTY_STATE.SHOT_TAKEN;
    document.getElementById('aim-reticle').classList.remove('visible');
    if (shooter) shooter.visible = false;

    const player = ALL_PLAYERS.find(p => p.id === playerState.penaltyTakers[penalty.round-1]);
    const stats = player.stats;
    const power = (penalty.shotPower / 100) * 20 + 10;
    const finalPower = power * (1 + (stats.speed - 50) / 50 * 0.3);
    const inaccuracy = 0.5 * (1 - (stats.control - 50) / 50 * 0.9);
    const direction = penalty.aim.clone().sub(ball.position).normalize();
    direction.x += (Math.random() - 0.5) * inaccuracy; direction.y += (Math.random() - 0.5) * inaccuracy;
    ball.velocity = direction.multiplyScalar(finalPower);
    ball.angularVelocity = new THREE.Vector3(-ball.velocity.z, 0, ball.velocity.x).multiplyScalar(0.1);
    triggerKeeperDive();
}

function triggerKeeperDive() { const random = Math.random(); let diveTargetX = 0; if (random < 0.45) { diveTargetX = -2.5; } else if (random < 0.90) { diveTargetX = 2.5; } if(keeper) { penalty.keeperDive.start = keeper.position.clone(); penalty.keeperDive.end = new THREE.Vector3(diveTargetX, keeper.position.y, keeper.position.z); penalty.keeperDive.startTime = clock.getElapsedTime(); penalty.keeperDive.active = true; } penalty.state = PENALTY_STATE.ANIMATING_KEEPER; }
function handleKeeperTurn() { penalty.state = PENALTY_STATE.KEEPER_TURN; updatePenaltyHUD(); setTimeout(() => { const goalScored = Math.random() < 0.7; if (goalScored) { penalty.opponentScore++; showResultMessage("THEY SCORE", endRound); } else { showResultMessage("THEY MISS!", endRound); } }, 1500); }
function endRound() { penalty.round++; if (penalty.round > 5) { endGame(); } else { setupPlayerTurn(); updatePenaltyHUD(); resetBall(); resetKeeper(); } }
function endGame() { document.querySelector('.shot-controls').classList.remove('visible'); let result = "DRAW!", reward = 500; if (penalty.playerScore > penalty.opponentScore) { result = "YOU WIN!"; reward = 1500; } else if (penalty.playerScore < penalty.opponentScore) { result = "YOU LOSE!"; reward = 250; } playerState.gold += reward; showResultMessage(result, () => { if(shooter) shooter.visible = false; if(keeper) keeper.visible = false; showScreen('mainMenu'); }); savePlayerState(); updateGoldUI(); }
function checkGoalAndSave(ballPos) { if (ballPos.z < 0.5 && ballPos.y > 0) { const ballRect = new THREE.Box3().setFromCenterAndSize(ballPos, new THREE.Vector3(0.4, 0.4, 0.4)); if (keeper) { const keeperRect = new THREE.Box3().setFromObject(keeper); if (keeperRect.intersectsBox(ballRect)) return "SAVE!"; } if (Math.abs(ballPos.x) < 3.66 && ballPos.y < 2.44) { penalty.playerScore++; return "GOAL!"; } } return null; }
function showResultMessage(msg, callback) { const el = document.getElementById('result-message'); el.textContent = msg; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; if(callback) callback(); }, 2000); }
function resetBall() { ball.position.set(0, 0.2, 11); if (ball.velocity) ball.velocity.set(0, 0, 0); if (ball.angularVelocity) ball.angularVelocity.set(0, 0, 0); if(shooter) shooter.visible = true; }
function resetKeeper() { if (keeper) { keeper.position.set(0, 0, 0.5); keeper.rotation.set(0, Math.PI, 0); } }


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (penalty.state === PENALTY_STATE.POWERING) { penalty.shotPower += 150 * delta; if (penalty.shotPower > 100) penalty.shotPower = 100; document.getElementById('power-bar-inner').style.width = `${penalty.shotPower}%`; }
    if (penalty.state === PENALTY_STATE.ANIMATING_KEEPER || penalty.state === PENALTY_STATE.SHOT_TAKEN) {
        if (penalty.keeperDive.active && keeper) {
            const elapsedTime = clock.getElapsedTime() - penalty.keeperDive.startTime;
            const progress = Math.min(elapsedTime / penalty.keeperDive.duration, 1);
            keeper.position.lerpVectors(penalty.keeperDive.start, penalty.keeperDive.end, progress);
            const diveAngle = (keeper.position.x / 2.5) * (Math.PI / 2.5);
            keeper.rotation.z = -diveAngle * progress;
            if (progress >= 1) penalty.keeperDive.active = false;
        }
        if (ball.velocity && ball.velocity.length() > 0.1) {
            ball.velocity.y -= 9.8 * delta; ball.position.add(ball.velocity.clone().multiplyScalar(delta));
            ball.rotation.x += ball.angularVelocity.x * delta; ball.rotation.z += ball.angularVelocity.z * delta;
            if (ball.position.y < 0.2) { ball.position.y = 0.2; ball.velocity.y *= -0.5; }
            if (penalty.state === PENALTY_STATE.ANIMATING_KEEPER) {
                const result = checkGoalAndSave(ball.position);
                if (result) { penalty.state = PENALTY_STATE.END_ROUND; showResultMessage(result, handleKeeperTurn); } 
                else if (ball.position.z < -2) { penalty.state = PENALTY_STATE.END_ROUND; showResultMessage("MISS!", handleKeeperTurn); }
            }
        }
    }
    renderer.render(scene, camera);
}

// --- Start the App ---
init();
