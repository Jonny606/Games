// goalkeeper.js

// Global variables made available in the window scope
let keeper; // The THREE.Mesh object for the goalkeeper
let keeperIdleTexture;
let keeperSaveRightTextures = [];
let keeperSaveLeftTextures = [];
let currentKeeperFrame = 0;
let lastFrameTime = 0; // Not used as heavily if we rely on elapsed time for sprite sheet index

const KEEPER_FRAME_RATE = 20; // Frames per second for goalkeeper animation
// It's highly recommended to adjust this frame rate. If 18 frames in 0.4s means 45fps.
// Use KEEPER_FRAME_RATE = NUM_DIVE_FRAMES / penalty.keeperDive.duration for exact sync.

// Keeper sprite URLs
const KEEPER_IDLE_SPRITE_URL = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_idle/gk_idle_0_0.png';
const KEEPER_SAVE_RIGHT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_right/gk_save_up_right_0_';
const KEEPER_SAVE_LEFT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_left/gk_save_up_left_0_';
const NUM_DIVE_FRAMES = 18; // From _0_0.png to _0_17.png is 18 frames

// Internal tracking of sprite's natural dimensions (from first loaded image)
let _initialSpriteNativeWidth = 1;
let _initialSpriteNativeHeight = 1;

/**
 * Loads all goalkeeper sprites (idle and animation sequences) and initializes the keeper Mesh.
 * Assumes `scene` (from game.js) and `textureLoader` (from game.js) are globally available.
 * These variables become available because `goalkeeper.js` is loaded after Three.js and `game.js` starts,
 * and they are declared as `let` in global scope in `game.js`.
 */
function loadKeeperSpritesAndModel() {
    // Load IDLE sprite first and capture its dimensions for initial setup
    const idleTextureLoadPromise = new Promise((resolve, reject) => {
        textureLoader.load(KEEPER_IDLE_SPRITE_URL, (texture) => {
            keeperIdleTexture = texture;
            _initialSpriteNativeWidth = texture.image.width;
            _initialSpriteNativeHeight = texture.image.height;
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
    
    // Wait for all keeper textures (idle + right dive + left dive) to load
    Promise.all([idleTextureLoadPromise, Promise.all(saveRightTexturePromises), Promise.all(saveLeftTexturePromises)])
        .then(results => {
            // results[0] is idleTextureLoadPromise result (texture already assigned to keeperIdleTexture)
            keeperSaveRightTextures = results[1]; // results[1] is array of right dive textures
            keeperSaveLeftTextures = results[2]; // results[2] is array of left dive textures

            // --- IMPORTANT ADJUSTMENTS FOR KEEPER APPEARANCE AND INITIALIZATION ---
            // Visual tuning based on your screenshot and typical sprite use.
            // These numbers might still need fine-tuning through trial-and-error by you.
            const desiredVisualHeightMeters = 2; // Made taller, common issue with sprites appearing small.
            // Aspect ratio calculation from native image. This assumes the content occupies the whole image.
            const spriteAspectRatio = _initialSpriteNativeWidth / _initialSpriteNativeHeight;
            const desiredVisualWidthMeters = desiredVisualHeightMeters * spriteAspectRatio;


            const keeperGeometry = new THREE.PlaneGeometry(desiredVisualWidthMeters, desiredVisualHeightMeters);
            const keeperMaterial = new THREE.MeshBasicMaterial({ 
                map: keeperIdleTexture, // Start with IDLE texture
                transparent: true, 
                alphaTest: 0.1, // Adjusted alphaTest, sometimes needed for transparent borders.
                side: THREE.DoubleSide
            });

            keeper = new THREE.Mesh(keeperGeometry, keeperMaterial);
            // Position keeper, ensuring its *bottom* aligns with the ground plane Y=0.
            // Plane origin is its center, so its bottom edge is at position.y - (height/2).
            const groundReferenceY = 0; // Assuming your ground is at Y=0.
            keeper.position.set(0, (desiredVisualHeightMeters / 2) + groundReferenceY, 0.5); // Center X, (Half Height + Ground Y), slight Z offset in front of goal line
            
            keeper.rotation.y = Math.PI; // Make it face towards the shooter
            keeper.rotation.z = 0;       // Ensure no initial Z-rotation (lean)
            keeper.rotation.x = 0;       // Ensure no initial X-rotation
            keeper.castShadow = false;   // 2D sprites don't typically cast realistic shadows.
            scene.add(keeper);

            console.log('All goalkeeper sprites loaded and keeper initialized!');
            // After initialization, keeper should be visible. Game state functions will control its visibility.
        })
        .catch(error => {
            console.error('Error loading one or more keeper sprite assets:', error);
        });
}

/**
 * Updates the goalkeeper's position and sprite based on current game state.
 * @param {number} delta - Time in seconds since last frame.
 * @param {Object} penaltyState - The global penalty state object from game.js
 * Assumes `clock` and `keeper` (the mesh) are globally available (defined via let/const in `game.js` main scope)
 */
function updateGoalkeeper(delta, penaltyState) {
    // Only proceed if keeper mesh is loaded
    if (!keeper || !keeper.material || !keeper.material.map) {
        return; 
    }

    const isPlayerDive = penaltyState.keeperDive.active; // Use only the 'active' flag
    const isOpponentDive = penaltyState.opponentKeeperDive.active; // Use only the 'active' flag

    if (isPlayerDive || isOpponentDive) {
        let diveInfo;
        let texturesToUse = []; 

        if (isPlayerDive) {
            diveInfo = penaltyState.keeperDive;
        } else { // Opponent's dive
            diveInfo = penaltyState.opponentKeeperDive;
        }

        const elapsedTimeSinceDiveStart = clock.getElapsedTime() - diveInfo.startTime;
        const progress = Math.min(elapsedTimeSinceDiveStart / diveInfo.duration, 1);
        
        // Physical movement (lerp position and simulate jump arc)
        keeper.position.lerpVectors(diveInfo.start, diveInfo.end, progress); // Use start/end as directly defined in game.js
        const jumpHeight = (isPlayerDive ? 1.0 : 0.8); // Adjusted jump for player vs bot.
        const parabolicProgress = progress * (1 - progress) * 4; 
        
        // Calculate keeper Y position relative to its initial standing Y-position
        // (keeper.geometry.parameters.height / 2) + groundReferenceY as calculated in loadKeeperSpritesAndModel
        // Using keeper.position.y during reset is better as base for movement after it's been correctly placed.
        const keeperInitialStandingY = (keeper.geometry.parameters.height / 2) + 0; // assuming ground Y = 0.
        keeper.position.y = keeperInitialStandingY + (parabolicProgress * jumpHeight); 
        
        // Lean/rotate the sprite during the dive
        const currentSpriteWidth = keeper.geometry.parameters.width;
        // Make the rotation dynamic to prevent a fixed, wrong rotation if it's not correctly facing goal before dive
        // Use an angle that gradually applies.
        let targetZRotation = 0; // Default: upright
        if (diveInfo.animationSet === 'left') {
            targetZRotation = THREE.Math.degToRad(30); // Lean left (clockwise Z rotation)
        } else if (diveInfo.animationSet === 'right') {
            targetZRotation = THREE.Math.degToRad(-30); // Lean right (counter-clockwise Z rotation)
        }
        keeper.rotation.z = THREE.Math.lerp(0, targetZRotation, progress); // Lerp the Z rotation

        // Sprite animation logic
        if (diveInfo.animationSet === 'right') {
            texturesToUse = keeperSaveRightTextures;
        } else if (diveInfo.animationSet === 'left') {
            texturesToUse = keeperSaveLeftTextures;
        } else { // Default to idle if no specific dive animation set (e.g. for a "no dive" choice)
             texturesToUse = []; // So it defaults to idle below
        }

        if (texturesToUse.length > 0) { 
            const frameIndex = Math.min(Math.floor(elapsedTimeSinceDiveStart * KEEPER_FRAME_RATE), texturesToUse.length - 1); 
            if (keeper.material.map !== texturesToUse[frameIndex]) { 
                 keeper.material.map = texturesToUse[frameIndex];
                 keeper.material.map.needsUpdate = true; 
            }
        } else {
            // Fallback to idle if no active dive textures needed
            if (keeperIdleTexture && keeper.material.map !== keeperIdleTexture) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
        }

        // Check if dive motion is completely finished. IMPORTANT for player/opponent dive distinction.
        if (progress >= 1) {
            // Once the physical dive is over, deactivate the respective flag
            if(isPlayerDive) penalty.keeperDive.active = false;
            if(isOpponentDive) penalty.opponentKeeperDive.active = false;

            // Immediately snap rotation and return to idle texture after dive is finished
            if (keeperIdleTexture && keeper.material) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
            keeper.rotation.z = 0; // Ensure no lingering lean
            keeper.rotation.x = 0; // Ensure upright
            keeper.rotation.y = Math.PI; // Ensure facing forward after all rotations are applied.
        }

    } else { // If neither player nor opponent dive is active, ensure keeper is on idle sprite and upright.
        if (keeper && keeper.visible && keeperIdleTexture && keeper.material && keeper.material.map !== keeperIdleTexture) {
             keeper.material.map = keeperIdleTexture;
             keeper.material.map.needsUpdate = true;
             keeper.rotation.z = 0; // Ensure no lean in idle state
             keeper.rotation.x = 0; // Ensure no tilt in idle state
             keeper.rotation.y = Math.PI; // Ensure faces forward in idle state
        }
    }
}

/**
 * Resets the goalkeeper's state (position, rotation, sprite) to its initial standing idle pose.
 * Should be called from game.js's resetKeeper().
 * Assumes `keeper` (the mesh) and `keeperIdleTexture` are globally available.
 */
function resetGoalkeeperState() {
    if (keeper && keeper.geometry && keeper.geometry.parameters) { 
        const spriteHeight = keeper.geometry.parameters.height; 
        const groundReferenceY = 0; 
        
        keeper.position.set(0, (spriteHeight / 2) + groundReferenceY, 0.5); 
        keeper.rotation.set(0, Math.PI, 0); // Full reset of rotation (X=0, Y=PI, Z=0)
        
        if (keeperIdleTexture) { 
             keeper.material.map = keeperIdleTexture;
        } else if(keeperSaveRightTextures.length > 0) { // Fallback if no idle texture
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
