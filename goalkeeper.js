// goalkeeper.js

// Global variables to be used by game.js and this file
let keeper; // The THREE.Mesh object for the goalkeeper
let keeperIdleTexture;
let keeperSaveRightTextures = [];
let keeperSaveLeftTextures = [];
let currentKeeperFrame = 0;
let lastFrameTime = 0; 

const KEEPER_FRAME_RATE = 20; // Frames per second for goalkeeper animation
const KEEPER_IDLE_SPRITE_URL = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_idle/gk_idle_0_0.png';
const KEEPER_SAVE_RIGHT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_right/gk_save_up_right_0_';
const KEEPER_SAVE_LEFT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_left/gk_save_up_left_0_';
const NUM_DIVE_FRAMES = 18; // From _0_0.png to _0_17.png is 18 frames

// Keep track of the original sprite dimensions from a reliable frame (e.g., the idle one)
let initialSpriteNativeWidth;
let initialSpriteNativeHeight;


/**
 * Loads all goalkeeper sprites (idle and animation sequences) and initializes the keeper Mesh.
 * Assumes `scene` and `textureLoader` are globally available.
 */
function loadKeeperSpritesAndModel() {
    // Load IDLE sprite first and capture its dimensions for initial setup
    const idleTextureLoadPromise = new Promise((resolve, reject) => {
        textureLoader.load(KEEPER_IDLE_SPRITE_URL, (texture) => {
            keeperIdleTexture = texture;
            // Store native dimensions from the first loaded sprite for aspect ratio
            initialSpriteNativeWidth = texture.image.width;
            initialSpriteNativeHeight = texture.image.height;
            resolve(texture);
        }, undefined, reject);
    });

    // Load SAVE RIGHT animation frames
    const saveRightTexturePromises = [];
    for (let i = 0; i < NUM_DIVE_FRAMES; i++) {
        const frameUrl = `${KEEPER_SAVE_RIGHT_BASE_PATH}${i}.png`;
        saveRightTexturePromises.push(
            new Promise((resolve, reject) => {
                textureLoader.load(frameUrl, resolve, undefined, reject);
            })
        );
    }

    // Load SAVE LEFT animation frames
    const saveLeftTexturePromises = [];
    for (let i = 0; i < NUM_DIVE_FRAMES; i++) {
        const frameUrl = `${KEEPER_SAVE_LEFT_BASE_PATH}${i}.png`;
        saveLeftTexturePromises.push(
            new Promise((resolve, reject) => {
                textureLoader.load(frameUrl, resolve, undefined, reject);
            })
        );
    }
    
    Promise.all([idleTextureLoadPromise, Promise.all(saveRightTexturePromises), Promise.all(saveLeftTexturePromises)])
        .then(results => {
            // idleTextureLoadPromise is result[0], saveRight is results[1], saveLeft is results[2]
            // We've already assigned keeperIdleTexture above for clarity and initial dimensions capture.
            keeperSaveRightTextures = results[1]; 
            keeperSaveLeftTextures = results[2]; 

            // Create keeper object only AFTER all critical dimensions are known and textures loaded
            // The 1.8 meters refers to the target height for the human player model, let's keep the sprite visually proportionate
            const targetVisualHeight = 2.5; // Adjusted to a larger value to prevent it looking too stretched/tiny, tune as needed
            // Calculate sprite dimensions based on native image aspect ratio and desired visual height
            const spriteHeight = targetVisualHeight; 
            const spriteWidth = (initialSpriteNativeWidth / initialSpriteNativeHeight) * spriteHeight; 


            const keeperGeometry = new THREE.PlaneGeometry(spriteWidth, spriteHeight);
            const keeperMaterial = new THREE.MeshBasicMaterial({ 
                map: keeperIdleTexture, // Start with IDLE texture
                transparent: true, 
                alphaTest: 0.5, 
                side: THREE.DoubleSide
            });

            keeper = new THREE.Mesh(keeperGeometry, keeperMaterial);
            // Position keeper, adjusting Y so its "feet" are on the ground (ground Y = 0.2, assuming player at 0,0,11 so goalkeeper at 0,0,0.5)
            // A plane's origin is its center, so its bottom edge is at position.y - (height/2).
            // So if ground is at Y=0, position.y should be (spriteHeight/2) + 0.2 if keeper standing on ball, or just spriteHeight/2 if it's based on goalpost level
            const groundLevelOffset = 0.2; // Match ball's initial Y if goalkeeper feet are supposed to be where ball is
            keeper.position.set(0, spriteHeight / 2 + groundLevelOffset, 0.5); // Ensure base of sprite is at ground level
            keeper.rotation.y = Math.PI; 
            keeper.castShadow = false; 
            scene.add(keeper);

            console.log('All goalkeeper sprites loaded and keeper initialized!');
            // After initialization, if not during a penalty state, keep him visible with idle sprite.
            if(penalty.state === PENALTY_STATE.INACTIVE || penalty.state === PENALTY_STATE.AIMING) {
                 if (keeper) keeper.visible = true; // Make sure he's visible after loading
            }
        })
        .catch(error => {
            console.error('Error loading one or more keeper sprite assets:', error);
        });
}

/**
 * Updates the goalkeeper's position and sprite based on current game state.
 * @param {number} delta - Time in seconds since last frame.
 * @param {Object} penaltyState - The global penalty state object from game.js
 * Assumes `clock` and `keeper` (the mesh) are globally available.
 */
function updateGoalkeeper(delta, penaltyState) {
    const isPlayerDive = penaltyState.keeperDive.active && keeper;
    const isOpponentDive = penaltyState.opponentKeeperDive.active && keeper;

    if (isPlayerDive || isOpponentDive) {
        let diveInfo;
        let texturesToUse = []; // The specific texture set for this dive

        if (isPlayerDive) {
            diveInfo = penaltyState.keeperDive;
            if (diveInfo.animationSet === 'right') {
                texturesToUse = keeperSaveRightTextures;
            } else if (diveInfo.animationSet === 'left') {
                texturesToUse = keeperSaveLeftTextures;
            }
        } else { // Opponent's dive
            diveInfo = penaltyState.opponentKeeperDive;
            if (diveInfo.animationSet === 'right') {
                texturesToUse = keeperSaveRightTextures;
            } else if (diveInfo.animationSet === 'left') {
                texturesToUse = keeperSaveLeftTextures;
            }
        }

        const elapsedTimeSinceDiveStart = clock.getElapsedTime() - diveInfo.startTime;
        const progress = Math.min(elapsedTimeSinceDiveStart / diveInfo.duration, 1);
        
        // Physical movement (lerp position and simulate jump arc)
        keeper.position.lerpVectors(diveInfo.startPosition || diveInfo.start, diveInfo.targetPosition || diveInfo.end, progress);
        const jumpHeight = (isPlayerDive ? 1.0 : 0.8); // Adjusted jump for player vs bot.
        const parabolicProgress = progress * (1 - progress) * 4; 
        
        // Calculate keeper Y position relative to its standing ground level
        const keeperStandingGroundY = keeper.geometry.parameters.height / 2 + 0.2; // Base standing Y + offset
        keeper.position.y = keeperStandingGroundY + (parabolicProgress * jumpHeight); 
        
        // Lean/rotate the sprite during the dive
        if (keeper && keeper.geometry && keeper.geometry.parameters) {
            const currentSpriteWidth = keeper.geometry.parameters.width;
            const diveLeanAngle = (keeper.position.x / (currentSpriteWidth / 2)) * (Math.PI / 4); 
            keeper.rotation.z = -diveLeanAngle * progress;
        }

        // Sprite animation logic
        if (texturesToUse.length > 0) { 
            const frameIndex = Math.min(Math.floor(elapsedTimeSinceDiveStart * KEEPER_FRAME_RATE), texturesToUse.length - 1); 
            if (keeper && keeper.material && keeper.material.map !== texturesToUse[frameIndex]) { 
                 keeper.material.map = texturesToUse[frameIndex];
                 keeper.material.map.needsUpdate = true; 
            }
        } else {
            // Fallback to idle if no animation textures (e.g., a "central dive" with no dedicated anim)
            if (keeper && keeperIdleTexture && keeper.material.map !== keeperIdleTexture) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
        }

        // Check if dive is finished
        if (progress >= 1) {
            // Stop specific dive animation flags
            if(isPlayerDive) penaltyState.keeperDive.active = false;
            if(isOpponentDive) penaltyState.opponentKeeperDive.active = false;
            // Revert to idle texture once the dive motion ends
            if(keeperIdleTexture) keeper.material.map = keeperIdleTexture;
            keeper.material.map.needsUpdate = true;
        }

    } else { // If not in any dive animation state (player or opponent), ensure keeper is on idle sprite if visible
        if (keeper && keeper.visible && keeperIdleTexture && keeper.material.map !== keeperIdleTexture) {
             keeper.material.map = keeperIdleTexture;
             keeper.material.map.needsUpdate = true;
        }
    }
}

/**
 * Resets the goalkeeper's state (position, rotation, sprite).
 * Should be called from game.js's resetKeeper().
 * Assumes `keeper` (the mesh) and `keeperIdleTexture` are globally available.
 */
function resetGoalkeeperState() {
    if (keeper && keeper.geometry && keeper.geometry.parameters) { 
        // Recalculate based on original height setup for reset consistency
        const spriteHeight = keeper.geometry.parameters.height; 
        const groundLevelOffset = 0.2; // Match ball's height above ground
        keeper.position.set(0, spriteHeight / 2 + groundLevelOffset, 0.5); 
        keeper.rotation.set(0, Math.PI, 0); // Reset rotation to face player (0 on X, PI on Y, 0 on Z)
        keeper.rotation.z = 0; // Explicitly reset lean from dives

        if (keeperIdleTexture) { 
             keeper.material.map = keeperIdleTexture;
        } else if(keeperSaveRightTextures.length > 0) { 
             keeper.material.map = keeperSaveRightTextures[0];
        }
        if (keeper.material && keeper.material.map) { 
            keeper.material.map.needsUpdate = true;
        }
        currentKeeperFrame = 0; 
        lastFrameTime = 0; 
        keeper.visible = true; 
    }
}
