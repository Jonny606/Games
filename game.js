// game.js

// --- Global State & Constants ---
let scene, camera, renderer, clock, textureLoader;
let ball, goal, keeper, shooter; // 'keeper' will now be a THREE.Mesh (plane) for the 2D sprite
let playerState = { gold: 5000, myPlayers: [], penaltyTakers: [] };
const screens = { loading: document.getElementById('loading-screen'), mainMenu: document.getElementById('main-menu'), squad: document.getElementById('squad-screen'), store: document.getElementById('pack-store'), packOpening: document.getElementById('pack-opening-animation'), penaltyUI: document.getElementById('penalty-game-ui'), };
const PENALTY_STATE = { INACTIVE: 'inactive', AIMING: 'aiming', POWERING: 'powering', SHOT_TAKEN: 'shot_taken', ANIMATING_KEEPER: 'animating_keeper', KEEPER_TURN: 'keeper_turn', END_ROUND: 'end_round' };
let penalty = { state: PENALTY_STATE.INACTIVE, round: 0, playerScore: 0, opponentScore: 0, shotPower: 0, aim: new THREE.Vector3(), keeperDive: { active: false, start: null, end: null, duration: 0.4 } };

// --- Realistic Physics Constants ---
const g = 9.81;
const rho = 1.2;          // density of air
const Cd = 0.25;          // drag coefficient
const Cl = 0.28;          // lift coefficient (for spin)
const mass = 0.4;         // ball mass in kg
const radius = 0.1095;    // ball radius in meters
const A = Math.PI * radius * radius; // cross-sectional area
const magnusConstant = (rho * A * Cl) / (2 * mass);
const dragConstant = (rho * A * Cd) / (2 * mass);


// --- Initialization ---
function init() {
    loadPlayerState(); // Loads saved player state from localStorage

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    scene.fog = new THREE.Fog(0x87CEEB, 20, 60); // Adds atmospheric fog

    // Camera and Renderer setup
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight); // Sets renderer size to window dimensions
    renderer.shadowMap.enabled = true; // Enables shadow maps
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Modern tone mapping
    renderer.toneMappingExposure = 1.0;
    document.getElementById('game-container').appendChild(renderer.domElement); // Appends canvas to game-container HTML div
    
    clock = new THREE.Clock(); // For time-based animations and physics

    // Loading Manager (monitors all asset loading)
    const loadingManager = new THREE.LoadingManager();
    const loadingDetails = document.getElementById('loading-details');

    loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
        loadingDetails.textContent = `Loading asset ${itemsLoaded} of ${itemsTotal}...`;
        console.log(`Loading file: ${url} (${itemsLoaded}/${itemsTotal})`);
    };

    loadingManager.onLoad = function() {
        console.log('All models loaded successfully!');
        setTimeout(() => {
            showScreen('mainMenu'); // Show main menu after all assets load
            updateGoldUI();
        }, 200);
    };

    loadingManager.onError = function(url) {
        console.error('There was an error loading ' + url);
        loadingDetails.textContent = `Error loading: ${url}. Please refresh.`;
    };

    // Initialize Loaders (pass loadingManager to them for unified progress tracking)
    textureLoader = new THREE.TextureLoader(loadingManager); // Used for environment textures and 2D sprite goalkeeper
    const gltfLoader = new THREE.GLTFLoader(loadingManager); // Used for 3D shooter model
    
    // Add Lights to the scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Soft ambient light
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0); // Directional light for shadows
    dirLight.position.set(10, 15, 5);
    dirLight.castShadow = true; // Enable shadow casting
    // Configure shadow camera for optimal coverage
    dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.top = 20; dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20; dirLight.shadow.camera.right = 20;
    dirLight.shadow.bias = -0.001; // Prevents shadow artifacts
    scene.add(dirLight);

    // Load 3D environment and character models
    loadEnvironment(); 
    loadCharacters(gltfLoader); // Pass the gltfLoader here

    // Set up user interaction events
    setupEventListeners();
    
    // Start the animation loop
    animate();
}

// --- UI and Event Listener Functions (Minimal changes, mostly moved from game.js and HTML) ---
function showScreen(screenName) { Object.values(screens).forEach(s => s.classList.remove('active')); if (screens[screenName]) { screens[screenName].classList.add('active'); } }
function savePlayerState() { localStorage.setItem('soccerGameState', JSON.stringify(playerState)); }
function loadPlayerState() { const savedState = localStorage.getItem('soccerGameState'); if (savedState) { playerState = JSON.parse(savedState); } else { playerState.myPlayers = [1, 3, 6, 9, 21]; /* Default starting players */ } }
function updateGoldUI() { document.getElementById('gold-balance').textContent = playerState.gold.toLocaleString(); }
function renderSquad() { const grid = document.getElementById('squad-list'); grid.innerHTML = ''; playerState.myPlayers.map(playerId => { const player = ALL_PLAYERS.find(p => p.id === playerId); if (player) { grid.appendChild(createPlayerCard(player, 'squad')); } }); document.getElementById('player-count').textContent = playerState.myPlayers.length; renderPenaltyTakers(); }
function renderPenaltyTakers() { const lineupEl = document.getElementById('team-sheet-lineup'); lineupEl.innerHTML = ''; for (let i = 0; i < 5; i++) { const slot = document.createElement('div'); slot.className = 'lineup-slot'; const playerId = playerState.penaltyTakers[i]; if (playerId) { const player = ALL_PLAYERS.find(p => p.id === playerId); slot.classList.add('filled'); slot.innerHTML = `<img class="player-img" src="${player.image}" alt="${player.name}"><div class="slot-info"><h3>${player.name}</h3><p>Rating: ${player.rating}</p></div>`; } else { slot.innerHTML = `<span class="slot-role">Taker ${i + 1}</span>`; } lineupEl.appendChild(slot); } }
function handleSquadCardClick(player, cardElement) { const isSelected = playerState.penaltyTakers.includes(player.id); if (isSelected) { playerState.penaltyTakers = playerState.penaltyTakers.filter(id => id !== player.id); cardElement.classList.remove('selected'); } else { if (playerState.penaltyTakers.length < 5) { playerState.penaltyTakers.push(player.id); cardElement.classList.add('selected'); } else { alert('You can only select 5 penalty takers.'); } } renderSquad(); savePlayerState(); }
function createPlayerCard(player, context = 'default') { const card = document.createElement('div'); card.className = 'player-card'; if (playerState.penaltyTakers.includes(player.id) && context === 'squad') { card.classList.add('selected'); } let bgGradient = 'linear-gradient(160deg, #4b5a6a, #202b36)'; if (player.rating >= 90) bgGradient = 'linear-gradient(160deg, #FFD700, #B8860B)'; else if (player.rating >= 85) bgGradient = 'linear-gradient(160deg, #3498db, #2980b9)'; else if (player.rating >= 80) bgGradient = 'linear-gradient(160deg, #50c878, #3e9e62)'; card.style.background = bgGradient; card.innerHTML = `<img class="player-img" src="${player.image}" alt="${player.name}"><div class="player-rating">${player.rating}</div><div class="player-nation-pos"><img src="https://flagcdn.com/w40/${player.nation}.png" alt="${player.nation}"><span>${player.position}</span></div><div class="player-info"><h3 class="player-name">${player.name}</h3></div>`; if (context === 'squad') { card.addEventListener('click', () => handleSquadCardClick(player, card)); } return card; }
function setupEventListeners() { document.getElementById('play-btn').addEventListener('click', () => { if (playerState.penaltyTakers.length !== 5) { alert('Please select 5 players for your squad before playing!'); return; } showScreen('penaltyUI'); startPenaltyGame(); }); document.getElementById('squad-btn').addEventListener('click', () => { renderSquad(); showScreen('squad'); }); document.getElementById('packs-btn').addEventListener('click', () => showScreen('store')); document.querySelectorAll('.back-btn').forEach(btn => { btn.addEventListener('click', () => { penalty.state = PENALTY_STATE.INACTIVE; showScreen(btn.dataset.target); }); }); document.getElementById('buy-pack-btn').addEventListener('click', buyPack); document.getElementById('pack-continue-btn').addEventListener('click', () => showScreen('store')); window.addEventListener('mousemove', onMouseMove, false); window.addEventListener('mousedown', onMouseDown, false); window.addEventListener('mouseup', onMouseUp, false); }
function buyPack() { const cost = 1000; if (playerState.gold >= cost) { playerState.gold -= cost; updateGoldUI(); savePlayerState(); showScreen('packOpening'); openPack(); } else { alert("Not enough gold!"); } }
function openPack() { const weights = ALL_PLAYERS.map(p => { if (p.rating >= 90) return 1; if (p.rating >= 87) return 5; if (p.rating >= 84) return 20; return 74; }); const totalWeight = weights.reduce((a, b) => a + b, 0); let random = Math.random() * totalWeight; let playerToReveal; for (let i = 0; i < ALL_PLAYERS.length; i++) { random -= weights[i]; if (random <= 0) { playerToReveal = ALL_PLAYERS[i]; break; } } if (!playerState.myPlayers.includes(playerToReveal.id)) { playerState.myPlayers.push(playerToReveal.id); } else { playerState.gold += Math.floor(playerToReveal.rating * 5); updateGoldUI(); } savePlayerState(); runPackAnimation(playerToReveal); }
function runPackAnimation(player) { const flagEl = document.getElementById('reveal-flag'), posEl = document.getElementById('reveal-position'), cardContainer = document.getElementById('reveal-card-container'), continueBtn = document.getElementById('pack-continue-btn'); flagEl.style.opacity = 0; posEl.style.opacity = 0; cardContainer.innerHTML = ''; continueBtn.style.display = 'none'; const oldFlare = document.querySelector('.walkout-flare'); if (oldFlare) oldFlare.remove(); setTimeout(() => { flagEl.style.backgroundImage = `url(https://flagcdn.com/h120/${player.nation}.png)`; flagEl.style.opacity = 1; flagEl.style.transform = 'scale(1)'; }, 500); setTimeout(() => { posEl.textContent = player.position; posEl.style.opacity = 1; posEl.style.transform = 'scale(1)'; }, 1500); setTimeout(() => { const card = createPlayerCard(player); cardContainer.appendChild(card); if (player.rating >= 86) { const flare = document.createElement('div'); flare.className = 'walkout-flare'; cardContainer.appendChild(flare); } }, 2500); setTimeout(() => { continueBtn.style.display = 'block'; }, 3500); }

// --- 3D Model and Environment Loading Section ---
function loadEnvironment() {
    // Ground plane with grass texture
    const grassColorMap = textureLoader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/terrain/grasslight-big.jpg');
    grassColorMap.wrapS = THREE.RepeatWrapping; grassColorMap.wrapT = THREE.RepeatWrapping; grassColorMap.repeat.set(25, 25);
    const grassMaterial = new THREE.MeshStandardMaterial({ map: grassColorMap, roughness: 0.7, metalness: 0.1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), grassMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to lie flat
    ground.receiveShadow = true; // Allows ground to receive shadows
    scene.add(ground);

    // Ball creation
    const ballGeometry = new THREE.SphereGeometry(0.2, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true; // Ball casts shadows
    ball.position.set(0, 0.2, 11); // Initial position
    ball.velocity = new THREE.Vector3(); // Initialize linear velocity for physics
    ball.angularVelocity = new THREE.Vector3(); // Initialize angular velocity for physics (spin)
    scene.add(ball);

    // Goal creation (composed of simple geometries)
    goal = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9 });
    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.44, 16); // Standard goal post height
    const leftPost = new THREE.Mesh(postGeo, postMaterial);
    leftPost.position.set(-3.66, 2.44 / 2, 0); // Left post position (standard goal width is 7.32m)
    const rightPost = new THREE.Mesh(postGeo, postMaterial);
    rightPost.position.set(3.66, 2.44 / 2, 0); // Right post position
    const crossbarGeo = new THREE.CylinderGeometry(0.1, 0.1, 7.32, 16); // Standard crossbar length
    const crossbar = new THREE.Mesh(crossbarGeo, postMaterial);
    crossbar.rotation.z = Math.PI/2; // Rotate crossbar to be horizontal
    crossbar.position.y = 2.44; // Position at the top of the posts
    goal.add(leftPost, rightPost, crossbar);
    goal.traverse(node => { if (node.isMesh) { node.castShadow = true; } }); // Make goal posts cast shadows
    scene.add(goal);
}

// Loads 3D shooter model and 2D sprite for keeper
function loadCharacters(gltfLoader) {
    // 3D SHOOTER MODEL (remains loaded via GLTF Loader from previous versions)
    // Corrected URL using '@master' branch and 'models' subfolder
    const shooterURL = 'https://cdn.jsdelivr.net/gh/Jonny606/Games@master/models/SoccerPenaltyKick.glb';

    gltfLoader.load(shooterURL, (gltf) => { 
        shooter = gltf.scene;
        // Adjust scale for Shooter model to fit the scene well
        shooter.scale.set(0.006, 0.006, 0.006); 
        shooter.position.set(0, 0, 11.5); // Position the shooter far from the goal (closer to the ball initially)
        shooter.rotation.y = Math.PI; // Rotate to face the goal
        shooter.traverse(node => { if (node.isMesh) { node.castShadow = true; } }); // Shooter casts shadows
        scene.add(shooter);
    }, undefined, function (error) { 
        console.error('Error loading shooter model:', error); // Log loading errors for the shooter
    });

    // 2D GOALKEEPER SPRITE (Replaces the 3D keeper model with a static PNG)
    const keeperSpriteURL = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_right/gk_save_up_right_0_17.png';
    
    // Load the sprite texture using the initialized textureLoader
    textureLoader.load(keeperSpriteURL, function(texture) {
        // Define desired real-world height for the sprite
        const spriteHeight = 1.8; // Example: 1.8 meters tall
        // Calculate width to maintain original image's aspect ratio
        const spriteWidth = spriteHeight * (texture.image.width / texture.image.height); 

        // Create a flat plane geometry
        const keeperGeometry = new THREE.PlaneGeometry(spriteWidth, spriteHeight); 
        // Create a basic material for 2D sprites. It doesn't react to lights complexly.
        const keeperMaterial = new THREE.MeshBasicMaterial({ 
            map: texture,          // Apply the loaded image as a texture
            transparent: true,     // Essential for PNGs with transparency
            alphaTest: 0.5,        // Improves rendering of transparent areas (tunes cutoff)
            side: THREE.DoubleSide // Makes the sprite visible from both front and back
        });

        // Create the Mesh for the keeper
        keeper = new THREE.Mesh(keeperGeometry, keeperMaterial);
        // Position the keeper (sprite's center): X=0, Y=half its height (to stand on ground), Z slightly in front of goal line
        keeper.position.set(0, spriteHeight / 2, 0.5); 
        keeper.rotation.y = Math.PI; // Rotate the plane to face the camera/ball (player)
        keeper.castShadow = false; // 2D sprites typically don't cast realistic shadows in 3D without special setup
        scene.add(keeper);

        console.log('2D Goalkeeper sprite loaded successfully!');

    }, undefined, function(error) {
        console.error('Error loading keeper sprite:', error); // Log loading errors for the sprite
    });
}

// --- Realistic Physics Simulation ---
function updateBallPhysics(delta) {
    if (!ball || !ball.velocity) {
        return;
    }

    const v = ball.velocity.length();

    // If ball is moving too slowly, stop it and its spin completely.
    if (v < 0.1 && ball.position.y <= 0.21) { // Only stop if on or very near ground
        ball.velocity.set(0, 0, 0);
        ball.angularVelocity.set(0, 0, 0);
        ball.rotation.set(0,0,0); // Reset visual rotation for simplicity when stopped
        return;
    }

    // Calculate Drag Force: F_drag = -dragConstant * v^2 * unit_vector_v
    const Fdrag = ball.velocity.clone().negate().normalize().multiplyScalar(dragConstant * v * v);
    
    // Calculate Magnus Force: F_magnus = magnusConstant * (W x V)
    // W is angular velocity (ball.angularVelocity), V is linear velocity (ball.velocity)
    const FMagnus = ball.angularVelocity.clone().cross(ball.velocity).multiplyScalar(magnusConstant);
    
    // Total acceleration = (F_drag + F_magnus) / mass + Gravity
    const acceleration = new THREE.Vector3().add(Fdrag).add(FMagnus);
    acceleration.y -= g; // Add gravity (always pulling down)

    // Update velocity and position using simple Euler integration
    ball.velocity.add(acceleration.clone().multiplyScalar(delta));
    ball.position.add(ball.velocity.clone().multiplyScalar(delta));
}


// --- Penalty Game Logic ---
function startPenaltyGame() {
    // Reset game state for a new match
    penalty.state = PENALTY_STATE.INACTIVE; 
    penalty.round = 1; 
    penalty.playerScore = 0; 
    penalty.opponentScore = 0;
    
    // Ensure character visibility
    if (shooter) shooter.visible = true;
    if (keeper) keeper.visible = true;
    
    resetBall();    // Reset ball position and velocity
    resetKeeper();  // Reset keeper position
    updatePenaltyHUD(); // Update score display

    document.querySelector('.shot-controls').classList.add('visible'); // Show UI controls
    setTimeout(() => { setupPlayerTurn(); }, 1000); // Start player turn after a short delay
}

function setupPlayerTurn() { 
    penalty.state = PENALTY_STATE.AIMING; 
    document.getElementById('aim-reticle').classList.add('visible'); 
    camera.position.set(0, 1.5, 14); // Position camera for aiming view
    camera.lookAt(ball.position); // Look at the ball
}

function updatePenaltyHUD() { 
    document.getElementById('penalty-score').textContent = `Player ${penalty.playerScore} - ${penalty.opponentScore} Opponent`; 
    const turnText = (penalty.state === PENALTY_STATE.KEEPER_TURN) ? "Opponent's Turn" : `Your Turn - Taker #${penalty.round}`; 
    document.getElementById('penalty-info').textContent = `Round ${penalty.round}/5: ${turnText}`; 
}

function onMouseMove(event) { 
    if (penalty.state !== PENALTY_STATE.AIMING) return; // Only allow aiming when in AIMING state
    
    const mouse = new THREE.Vector2(); 
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1; 
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; 
    
    // Define a plane at the goal line (or slightly in front) to project mouse onto
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Plane at Z=0
    const raycaster = new THREE.Raycaster(); 
    raycaster.setFromCamera(mouse, camera); 
    raycaster.ray.intersectPlane(plane, penalty.aim); // Calculate intersection point on the plane
    
    // Clamp aim position within realistic goal bounds
    penalty.aim.x = THREE.MathUtils.clamp(penalty.aim.x, -3.5, 3.5); // Between goal posts
    penalty.aim.y = THREE.MathUtils.clamp(penalty.aim.y, 0.1, 2.3); // Between ground and crossbar (approximate)

    // Update the on-screen aim reticle position
    const screenPos = penalty.aim.clone().project(camera); 
    const reticle = document.getElementById('aim-reticle'); 
    reticle.style.left = `${(screenPos.x + 1) / 2 * window.innerWidth}px`; 
    reticle.style.top = `${(-screenPos.y + 1) / 2 * window.innerHeight}px`; 
}

function onMouseDown(event) { 
    if (penalty.state === PENALTY_STATE.AIMING) { 
        penalty.state = PENALTY_STATE.POWERING; // Transition to powering state
        penalty.shotPower = 0; // Start power bar at zero
    } 
}

function onMouseUp(event) { 
    if (penalty.state === PENALTY_STATE.POWERING) { 
        shootBall(); // Shoot the ball when mouse is released in powering state
    } 
}

function shootBall() {
    penalty.state = PENALTY_STATE.SHOT_TAKEN;
    document.getElementById('aim-reticle').classList.remove('visible'); // Hide aim reticle
    if (shooter) shooter.visible = false; // Hide the static shooter model after kick

    // Get current player's stats for influence on shot
    const player = ALL_PLAYERS.find(p => p.id === playerState.penaltyTakers[penalty.round-1]);
    // Defensive access to stats, defaulting if undefined to prevent errors
    const stats = player ? player.stats : { speed: 50, control: 50, curve: 50 }; 
    
    // Calculate base power from power bar percentage
    const basePower = (penalty.shotPower / 100) * 20 + 15; // Power range from 15 to 35 m/s
    // Apply speed stat influence on final power
    const finalPower = basePower * (1 + (stats.speed - 50) / 50 * 0.3); // +/- 30% from base speed based on stat
    // Apply control stat influence on inaccuracy
    const inaccuracy = 0.5 * (1 - (stats.control - 50) / 50 * 0.9); // More control = less inaccuracy

    // Determine initial shot direction based on aim and inaccuracy
    const direction = penalty.aim.clone().sub(ball.position).normalize();
    direction.x += (Math.random() - 0.5) * inaccuracy; 
    direction.y += (Math.random() - 0.5) * inaccuracy;
    ball.velocity.copy(direction.multiplyScalar(finalPower)); // Set ball's initial velocity

    // Calculate ball's angular velocity (spin) for realistic Magnus effect and visual rotation
    const curveStat = stats.curve; // Player's curve stat directly influences sidespin

    let spinY = 0; // Side spin (for horizontal curve, positive for left curve, negative for right curve in Three.js coordinates)
    let spinZ = 0; // Forward/Back spin (primarily visual rotation and subtle vertical effect from Magnus)

    // Normalize aim X position relative to goal width (approx. -1 to 1 across goal)
    const aimXNormalized = THREE.MathUtils.clamp(penalty.aim.x, -3.66, 3.66) / 3.66; 

    const baseSideSpinMagnitude = 80; // Max radians per second for side spin (tune this value as needed)
    // Formula to apply spin based on horizontal aim: Aiming right (+X) results in negative spinY for right curve (Magnus force towards +X if vel is -Z, spin is -Y).
    spinY = -aimXNormalized * baseSideSpinMagnitude * (curveStat / 100); 

    // Apply some forward roll (Z-axis spin) scaled by shot power, making the ball visibly spin forward
    const baseForwardRollMagnitude = 50; // Max radians per second for forward roll
    spinZ = (finalPower / 35) * baseForwardRollMagnitude; // Scales from 0 to baseForwardRollMagnitude

    // Set the ball's angular velocity
    ball.angularVelocity.set(0, spinY, spinZ); // X-spin (back/top spin for vertical curve) set to 0 for simplicity

    // Clamp total angular velocity magnitude to prevent extreme unrealistic spin
    const maxTotalSpin = 120; // Maximum realistic total angular velocity for a kick (rad/s)
    ball.angularVelocity.clampLength(0, maxTotalSpin);

    triggerKeeperDive(); // Start the goalkeeper's dive animation
}

function triggerKeeperDive() { 
    // Randomly decide where keeper will dive (biased to corners)
    const random = Math.random(); 
    let diveTargetX = 0; 
    if (random < 0.45) { diveTargetX = -2.5; } // Dive left
    else if (random < 0.90) { diveTargetX = 2.5; } // Dive right
    // 10% chance to stay in center (if random >= 0.90)

    if(keeper) { 
        penalty.keeperDive.start = keeper.position.clone(); // Start position
        penalty.keeperDive.end = new THREE.Vector3(diveTargetX, keeper.position.y, keeper.position.z); // End position
        // The Y coordinate will be handled during lerp for diving height, not set here in end vector's Y.
        penalty.keeperDive.startTime = clock.getElapsedTime(); 
        penalty.keeperDive.active = true; // Activate dive animation
    } 
    penalty.state = PENALTY_STATE.ANIMATING_KEEPER; // Transition to keeper animation state
}

function handleKeeperTurn() { 
    penalty.state = PENALTY_STATE.KEEPER_TURN; // Set game state for opponent's turn
    updatePenaltyHUD(); // Update display to show opponent's turn
    // Simulate opponent's shot result
    setTimeout(() => { 
        const goalScored = Math.random() < 0.7; // 70% chance opponent scores
        if (goalScored) { 
            penalty.opponentScore++; 
            showResultMessage("THEY SCORE", endRound); 
        } else { 
            showResultMessage("THEY MISS!", endRound); 
        } 
    }, 1500); // Display result after 1.5 seconds
}

function endRound() { 
    penalty.round++; // Increment round number
    if (penalty.round > 5) { 
        endGame(); // End game after 5 rounds
    } else { 
        setupPlayerTurn(); // Otherwise, set up next player turn
        updatePenaltyHUD(); 
        resetBall(); 
        resetKeeper(); 
    } 
}

function endGame() { 
    document.querySelector('.shot-controls').classList.remove('visible'); // Hide UI controls
    let result = "DRAW!", reward = 500; // Default to draw
    if (penalty.playerScore > penalty.opponentScore) { 
        result = "YOU WIN!"; reward = 1500; // Win bonus
    } else if (penalty.playerScore < penalty.opponentScore) { 
        result = "YOU LOSE!"; reward = 250; // Loss penalty/consolation
    } 
    playerState.gold += reward; // Award gold
    showResultMessage(result, () => { 
        if(shooter) shooter.visible = false; 
        if(keeper) keeper.visible = false; 
        showScreen('mainMenu'); // Return to main menu after game ends
    }); 
    savePlayerState(); 
    updateGoldUI(); 
}

function checkGoalAndSave(ballPos) { 
    // Check if ball is behind the goal line and above ground
    if (ballPos.z < 0.5 && ballPos.y > 0) { 
        // Create simple bounding boxes for collision detection
        const ballRect = new THREE.Box3().setFromCenterAndSize(ballPos, new THREE.Vector3(0.4, 0.4, 0.4)); // Ball is 0.4m diameter (radius 0.2*2)
        if (keeper) { 
            const keeperRect = new THREE.Box3().setFromObject(keeper); // Get bounding box of the keeper object
            // Adjust keeperRect size slightly for 2D sprite to make it more forgiving / accurate collision with 3D ball
            // Assuming keeper is an upright plane, x will be its width, y its height. z will be minimal.
            keeperRect.expandByVector(new THREE.Vector3(0.2, 0.2, 0.5)); // Expand slightly
            if (keeperRect.intersectsBox(ballRect)) {
                return "SAVE!"; // Ball hit keeper
            }
        } 
        // Check if ball is within goal frame (width 7.32m, height 2.44m)
        if (Math.abs(ballPos.x) < 3.66 && ballPos.y < 2.44) { 
            penalty.playerScore++; 
            return "GOAL!"; // Ball is within goal and keeper didn't save
        } 
    } 
    return null; // No goal, no save yet
}

function showResultMessage(msg, callback) { 
    const el = document.getElementById('result-message'); 
    el.textContent = msg; 
    el.style.display = 'block'; // Show message
    setTimeout(() => { 
        el.style.display = 'none'; // Hide message after 2 seconds
        if(callback) callback(); // Call optional callback
    }, 2000); 
}

function resetBall() { 
    ball.position.set(0, 0.2, 11); // Reset ball to starting position
    ball.velocity.set(0, 0, 0); // Clear linear velocity
    ball.angularVelocity.set(0, 0, 0); // Clear angular velocity
    ball.rotation.set(0,0,0); // Reset visual rotation
    if(shooter) shooter.visible = true; // Show shooter again
}

function resetKeeper() { 
    if (keeper) { 
        // Assuming spriteHeight was captured in loadCharacters. Re-calculating to be safe:
        const currentSpriteHeight = keeper.geometry.parameters.height;
        keeper.position.set(0, currentSpriteHeight / 2, 0.5); // Reset keeper to original idle position
        keeper.rotation.set(0, Math.PI, 0); // Ensure sprite faces player
    } 
}


// --- Main Animation Loop ---
function animate() {
    requestAnimationFrame(animate); // Continuously calls animate function
    const delta = clock.getDelta(); // Time elapsed since last frame (for frame-rate independent motion)
    
    // Power bar animation
    if (penalty.state === PENALTY_STATE.POWERING) { 
        penalty.shotPower += 150 * delta; // Increase power over time
        if (penalty.shotPower > 100) penalty.shotPower = 100; // Clamp at 100%
        document.getElementById('power-bar-inner').style.width = `${penalty.shotPower}%`; 
    }
    
    // Physics and keeper animation when ball is in motion
    if (penalty.state === PENALTY_STATE.ANIMATING_KEEPER || penalty.state === PENALTY_STATE.SHOT_TAKEN) {
        // Keeper dive animation (lerp for smooth movement)
        if (penalty.keeperDive.active && keeper) {
            const elapsedTime = clock.getElapsedTime() - penalty.keeperDive.startTime;
            const progress = Math.min(elapsedTime / penalty.keeperDive.duration, 1);
            // Linear interpolation of keeper position
            keeper.position.lerpVectors(penalty.keeperDive.start, penalty.keeperDive.end, progress);
            
            // Adjust keeper's Y position to simulate a dive/jump (simplified)
            // Use a parabolic motion for height
            const jumpHeight = 1.0; // Max jump height during dive
            const parabolicProgress = progress * (1 - progress) * 4; // Max at 0.5, zero at 0 and 1
            keeper.position.y = penalty.keeperDive.start.y + (parabolicProgress * jumpHeight); // Start_Y + parabola

            // Rotate/lean the keeper sprite during the dive
            // spriteHeight already used in loadCharacters, should get current one from geometry for consistency
            const currentSpriteWidth = keeper.geometry.parameters.width;
            const diveLeanAngle = (keeper.position.x / (currentSpriteWidth / 2)) * (Math.PI / 4); // Lean more for wider dives
            keeper.rotation.z = -diveLeanAngle * progress; // Tilts the sprite

            if (progress >= 1) penalty.keeperDive.active = false;
        }
        
        updateBallPhysics(delta); // Apply realistic ball physics

        // Apply visual rotation to the ball based on its angular velocity
        if (ball.angularVelocity) {
            ball.rotation.x += ball.angularVelocity.x * delta;
            ball.rotation.y += ball.angularVelocity.y * delta;
            ball.rotation.z += ball.angularVelocity.z * delta;
        }

        // Basic ground collision and bounce for the ball
        // Ensure ball doesn't go through ground (y < 0.2)
        if (ball.position.y < 0.2) { 
            ball.position.y = 0.2; // Keep ball at ground level
            if (ball.velocity.y < -0.1) { // Only bounce if moving downwards significantly
                ball.velocity.y *= -0.5; // Invert vertical velocity and reduce by half (restitution)
            } else {
                ball.velocity.y = 0; // If barely moving vertically or going up, just set to zero
            }
            ball.velocity.x *= 0.9; // Apply some friction on horizontal speed
            ball.velocity.z *= 0.9; // Apply some friction on depth speed
        }

        // Check game outcome conditions (goal, save, miss) once keeper animation is considered in progress
        // Only trigger end-of-round state once
        if (penalty.state === PENALTY_STATE.ANIMATING_KEEPER || penalty.state === PENALTY_STATE.SHOT_TAKEN) {
            const result = checkGoalAndSave(ball.position); // Check for goal or save
            
            // Check if ball went past goal line or missed entirely (based on position)
            if (result) { 
                penalty.state = PENALTY_STATE.END_ROUND; 
                showResultMessage(result, handleKeeperTurn); 
            } else if (ball.position.z < -2 || ball.position.y < -1 || Math.abs(ball.position.x) > 4) { 
                // Miss conditions: past a certain Z depth, too low (below ground), or too wide of goal
                penalty.state = PENALTY_STATE.END_ROUND; 
                showResultMessage("MISS!", handleKeeperTurn); 
            }
        }
    }
    
    // Render the scene from the camera's perspective
    renderer.render(scene, camera);
}

// --- Start the Application ---
init(); // This function kicks off the entire game when the script loads
