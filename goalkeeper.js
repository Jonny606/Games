// js/goalkeeper.js

// Global variables to be used by game.js and this file
let keeper; // The THREE.Mesh object for the goalkeeper
let keeperIdleTexture;
let keeperSaveRightTextures = [];
let keeperSaveLeftTextures = [];
let currentKeeperFrame = 0;
let lastFrameTime = 0; // Not used as heavily if we rely on elapsed time for sprite sheet index

const KEEPER_FRAME_RATE = 20; // Frames per second for goalkeeper animation
const KEEPER_IDLE_SPRITE_URL = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_idle/gk_idle_0_0.png';
const KEEPER_SAVE_RIGHT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_right/gk_save_up_right_0_';
const KEEPER_SAVE_LEFT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_left/gk_save_up_left_0_';
const NUM_DIVE_FRAMES = 18;

/**
 * Loads all goalkeeper sprites (idle and animation sequences) and initializes the keeper Mesh.
 * Assumes `scene` and `textureLoader` are globally available.
 */
function loadKeeperSpritesAndModel() {
    // Load IDLE sprite
    const idleTextureLoadPromise = new Promise((resolve, reject) => {
        textureLoader.load(KEEPER_IDLE_SPRITE_URL, (texture) => {
            keeperIdleTexture = texture;
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
            keeperSaveRightTextures = results[1]; 
            keeperSaveLeftTextures = results[2]; 

            // Initialize keeper object with the IDLE texture
            const initialTexture = keeperIdleTexture; 
            const spriteHeight = 1.8; 
            const spriteWidth = spriteHeight * (initialTexture.image.width / initialTexture.image.height); 

            const keeperGeometry = new THREE.PlaneGeometry(spriteWidth, spriteHeight);
            const keeperMaterial = new THREE.MeshBasicMaterial({ 
                map: initialTexture, 
                transparent: true, 
                alphaTest: 0.5, 
                side: THREE.DoubleSide
            });

            keeper = new THREE.Mesh(keeperGeometry, keeperMaterial);
            keeper.position.set(0, spriteHeight / 2, 0.5); 
            keeper.rotation.y = Math.PI; 
            keeper.castShadow = false; 
            scene.add(keeper);

            console.log('All goalkeeper sprites (idle, right dive, left dive) loaded successfully!');
        })
        .catch(error => {
            console.error('Error loading one or more keeper sprite assets:', error);
            // This error is also propagated by the loadingManager since textureLoader uses it.
        });
}

/**
 * Updates the goalkeeper's position and sprite based on current game state.
 * @param {number} delta - Time in seconds since last frame.
 * @param {Object} penaltyState - The global penalty state object from game.js
 */
function updateGoalkeeper(delta, penaltyState) {
    const isPlayerDive = penaltyState.keeperDive.active && keeper;
    const isOpponentDive = penaltyState.opponentKeeperDive.active && keeper;

    if (isPlayerDive || isOpponentDive) {
        let diveInfo;
        if (isPlayerDive) {
            diveInfo = penaltyState.keeperDive;
        } else {
            diveInfo = penaltyState.opponentKeeperDive;
        }

        const elapsedTimeSinceDiveStart = clock.getElapsedTime() - diveInfo.startTime;
        const progress = Math.min(elapsedTimeSinceDiveStart / diveInfo.duration, 1);
        
        // Physical movement (lerp position and simulate jump arc)
        keeper.position.lerpVectors(diveInfo.startPosition || diveInfo.start, diveInfo.targetPosition || diveInfo.end, progress);
        const jumpHeight = (isPlayerDive ? 1.0 : 0.8); // Slightly less dynamic for bot
        const parabolicProgress = progress * (1 - progress) * 4; 
        keeper.position.y = (diveInfo.startPosition ? diveInfo.startPosition.y : diveInfo.start.y) + (parabolicProgress * jumpHeight); 
        
        // Lean/rotate the sprite during the dive
        if (keeper && keeper.geometry && keeper.geometry.parameters) {
            const currentSpriteWidth = keeper.geometry.parameters.width;
            const diveLeanAngle = (keeper.position.x / (currentSpriteWidth / 2)) * (Math.PI / 4); 
            keeper.rotation.z = -diveLeanAngle * progress;
        }


        // Sprite animation logic
        let texturesToUse = [];
        if (diveInfo.animationSet === 'right') {
            texturesToUse = keeperSaveRightTextures;
        } else if (diveInfo.animationSet === 'left') {
            texturesToUse = keeperSaveLeftTextures;
        }

        if (texturesToUse.length > 0) { 
            const frameIndex = Math.min(Math.floor(elapsedTimeSinceDiveStart * KEEPER_FRAME_RATE), texturesToUse.length - 1); 
            if (keeper && keeper.material && keeper.material.map !== texturesToUse[frameIndex]) { 
                 keeper.material.map = texturesToUse[frameIndex];
                 keeper.material.map.needsUpdate = true; 
            }
        } else {
            // Fallback to idle if no animation textures or animationSet not valid for the phase
            if (keeper && keeperIdleTexture && keeper.material.map !== keeperIdleTexture) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
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
 */
function resetGoalkeeperState() {
    if (keeper) { 
        const spriteHeight = keeper.geometry.parameters.height; // Use dynamic height
        keeper.position.set(0, spriteHeight / 2, 0.5); 
        keeper.rotation.set(0, Math.PI, 0); // Reset rotation to face player
        
        if (keeperIdleTexture) { 
             keeper.material.map = keeperIdleTexture;
        } else if(keeperSaveRightTextures.length > 0) { // Fallback if no idle (shouldn't happen with Promises.all)
             keeper.material.map = keeperSaveRightTextures[0];
        }
        if (keeper.material && keeper.material.map) { // Ensure material and map exist before flagging update
            keeper.material.map.needsUpdate = true;
        }
        currentKeeperFrame = 0; 
        lastFrameTime = 0; 
        keeper.visible = true; 
    }
}
