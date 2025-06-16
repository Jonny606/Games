// goalkeeper.js

// Global variables made available in the window scope
let keeper; // The THREE.Mesh object for the goalkeeper
let keeperIdleTexture;
let keeperSaveRightTextures = [];
let keeperSaveLeftTextures = [];

const KEEPER_FRAME_RATE = 20; // Default frame rate, tune based on animation duration and frames.
                               // 18 frames in 0.4s means (18 / 0.4) = 45 frames per second for smooth visuals.
                               // Adjust KEEPER_FRAME_RATE here for desired smoothness (e.g., 30 or 40).

// Keeper sprite URLs - These MUST BE EXACT!
const KEEPER_IDLE_SPRITE_URL = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_idle/gk_idle_0_0.png';
const KEEPER_SAVE_RIGHT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_right/gk_save_up_right_0_';
const KEEPER_SAVE_LEFT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_left/gk_save_up_left_0_';
const NUM_DIVE_FRAMES = 18; // Number of frames in each dive sequence (0 to 17 = 18 frames)

// Keep track of the initially set dimensions of the keeper mesh for consistent resets
let _keeperMeshHeight = 0;
let _keeperMeshWidth = 0;


/**
 * Loads all goalkeeper sprites (idle and animation sequences) and initializes the keeper Mesh.
 * Assumes `scene` (from game.js) and `textureLoader` (from game.js) are globally available.
 */
function loadKeeperSpritesAndModel() {
    // Promises to load each asset
    const idleTextureLoadPromise = new Promise((resolve, reject) => {
        textureLoader.load(KEEPER_IDLE_SPRITE_URL, (texture) => {
            keeperIdleTexture = texture;
            resolve(texture);
        }, undefined, reject);
    });

    const saveRightTexturePromises = [];
    for (let i = 0; i < NUM_DIVE_FRAMES; i++) {
        const frameUrl = `${KEEPER_SAVE_RIGHT_BASE_PATH}${i}.png`;
        saveRightTexturePromises.push(
            new Promise((resolve, reject) => {
                textureLoader.load(frameUrl, resolve, undefined, reject);
            })
        );
    }

    const saveLeftTexturePromises = [];
    for (let i = 0; i < NUM_DIVE_FRAMES; i++) {
        const frameUrl = `${KEEPER_SAVE_LEFT_BASE_PATH}${i}.png`;
        saveLeftTexturePromises.push(
            new Promise((resolve, reject) => {
                textureLoader.load(frameUrl, resolve, undefined, reject);
            })
        );
    }
    
    // Wait for all promises to resolve
    Promise.all([idleTextureLoadPromise, Promise.all(saveRightTexturePromises), Promise.all(saveLeftTexturePromises)])
        .then(results => {
            keeperSaveRightTextures = results[1]; 
            keeperSaveLeftTextures = results[2]; 

            // --- KEEPER SIZE AND POSITIONING ---
            // Use empirically found values that seem to make the sprite appear correctly proportional
            // for characters typically inside a 256x256 image with significant padding.
            // These might need slight tuning by YOU for exact visual match.
            _keeperMeshHeight = 2.4; // Target height, almost matches goal crossbar
            _keeperMeshWidth = 1.0;  // Target width, assuming sprite's actual content is ~100px wide for ~250px tall image.

            const keeperGeometry = new THREE.PlaneGeometry(_keeperMeshWidth, _keeperMeshHeight);
            const keeperMaterial = new THREE.MeshBasicMaterial({ 
                map: keeperIdleTexture, 
                transparent: true, 
                alphaTest: 0.1, 
                side: THREE.DoubleSide
            });

            keeper = new THREE.Mesh(keeperGeometry, keeperMaterial);
            // Position: X=0, Y such that bottom of sprite is at ground Y=0, Z=0.5 slightly in front of goal
            keeper.position.set(0, (_keeperMeshHeight / 2) + 0.0, 0.5); // Add 0.0 if ground is at Y=0
            
            keeper.rotation.y = Math.PI; // Make keeper face the shooter
            keeper.rotation.z = 0;       // Ensure no initial Z-lean
            keeper.rotation.x = 0;       // Ensure no initial X-tilt
            keeper.castShadow = false;   
            scene.add(keeper); // Add to Three.js scene

            console.log(`Goalkeeper initialized: W: ${_keeperMeshWidth.toFixed(2)}m, H: ${_keeperMeshHeight.toFixed(2)}m`);
        })
        .catch(error => {
            console.error('Error loading one or more keeper sprite assets:', error);
            // Note: The `loadingManager.onError` from game.js handles overall errors.
        });
}

/**
 * Updates the goalkeeper's position and sprite based on current game state (`penalty.keeperDive`).
 * Assumes `clock` and `keeper` (the mesh) are globally available (defined from game.js/this file).
 * @param {number} delta - Time in seconds since last frame.
 * @param {Object} penaltyState - The global penalty state object from game.js
 */
function updateGoalkeeper(delta, penaltyState) {
    // Defensive check: Ensure penaltyState, keeper object, and its material/map are valid
    if (!penaltyState || !keeper || !keeper.material || !keeper.material.map) {
        return; 
    }

    const keeperDiveData = penaltyState.keeperDive;

    // Check if keeper dive animation/movement is active
    if (keeperDiveData.active) {
        const elapsedTimeSinceDiveStart = clock.getElapsedTime() - keeperDiveData.startTime;
        const progress = Math.min(elapsedTimeSinceDiveStart / keeperDiveData.duration, 1); // Progress 0-1

        // Defensive check: Ensure start/end vectors are defined before using lerp
        if (!keeperDiveData.start || !keeperDiveData.end || 
            !(keeperDiveData.start instanceof THREE.Vector3) || !(keeperDiveData.end instanceof THREE.Vector3)) {
            console.error("Keeper dive start or end position is invalid. Resetting dive active state.");
            keeperDiveData.active = false; // Prevent continuous errors
            return;
        }

        // --- Physical movement of keeper ---
        keeper.position.lerpVectors(keeperDiveData.start, keeperDiveData.end, progress); 
        
        // Arc movement (jump/dive)
        const jumpHeight = (penaltyState.state === 'ANIMATING_KEEPER' ? 1.0 : 0.8); // Player jump vs opponent reaction jump
        const parabolicProgress = progress * (1 - progress) * 4; // Parabolic curve 0 to 1 back to 0
        
        const keeperStandingGroundY = (_keeperMeshHeight / 2) + 0.0; // Recalculate original standing Y
        keeper.position.y = keeperStandingGroundY + (parabolicProgress * jumpHeight); 
        
        // --- Sprite rotation (lean) during dive ---
        let targetZRotation = 0; // Default: upright
        if (keeperDiveData.animationSet === 'left') {
            targetZRotation = THREE.Math.degToRad(30); // Lean to the left (clockwise Z-rotation)
        } else if (keeperDiveData.animationSet === 'right') {
            targetZRotation = THREE.Math.degToRad(-30); // Lean to the right (counter-clockwise Z-rotation)
        }
        keeper.rotation.z = THREE.Math.lerp(0, targetZRotation, progress); // Smoothly animate Z rotation

        // --- Sprite texture animation ---
        let texturesToUse = [];
        if (keeperDiveData.animationSet === 'right') {
            texturesToUse = keeperSaveRightTextures;
        } else if (keeperDiveData.animationSet === 'left') {
            texturesToUse = keeperSaveLeftTextures;
        } // Else if animationSet is 'idle' or unassigned, texturesToUse remains empty

        if (texturesToUse.length > 0) { 
            // Calculate current frame index based on dive progress and frame rate
            const frameIndex = Math.min(Math.floor(elapsedTimeSinceDiveStart * KEEPER_FRAME_RATE), texturesToUse.length - 1); 
            
            // Only update texture if it's different from the current one to avoid flickering
            if (keeper.material.map !== texturesToUse[frameIndex]) { 
                 keeper.material.map = texturesToUse[frameIndex];
                 keeper.material.map.needsUpdate = true; // Tell Three.js the texture has changed
            }
        } else { // Fallback if no specific dive animation textures available for current set
            if (keeperIdleTexture && keeper.material.map !== keeperIdleTexture) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
        }

        // --- End of Dive Action ---
        if (progress >= 1) { // If dive motion duration has completed
            keeperDiveData.active = false; // Deactivate dive movement
            
            // Snap to final idle state (texture and rotation)
            if (keeperIdleTexture && keeper.material) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
            keeper.rotation.z = 0; 
            keeper.rotation.x = 0; 
            keeper.rotation.y = Math.PI; // Ensure keeper is always facing shooter
        }

    } else { // If keeper dive is NOT active, ensure it stays in an idle state
        if (keeper && keeper.visible && keeperIdleTexture && keeper.material.map !== keeperIdleTexture) {
             keeper.material.map = keeperIdleTexture;
             keeper.material.map.needsUpdate = true;
             keeper.rotation.z = 0; 
             keeper.rotation.x = 0; 
             keeper.rotation.y = Math.PI; 
        }
    }
}

/**
 * Resets the goalkeeper's state (position, rotation, sprite) to its initial standing idle pose.
 * Assumes `keeper` (the mesh) and `keeperIdleTexture` are globally available.
 */
function resetGoalkeeperState() {
    if (keeper && keeper.geometry && keeper.geometry.parameters) { 
        // Use the initial dimensions captured during loading for consistent reset
        const currentHeight = _keeperMeshHeight; // Use cached value
        const groundReferenceY = 0.0; 

        keeper.position.set(0, (currentHeight / 2) + groundReferenceY, 0.5); 
        keeper.rotation.set(0, Math.PI, 0); // Full reset of rotation (X=0, Y=PI, Z=0)
        
        if (keeperIdleTexture) { 
             keeper.material.map = keeperIdleTexture;
        } else if(keeperSaveRightTextures.length > 0) { // Fallback
             keeper.material.map = keeperSaveRightTextures[0];
        }
        if (keeper.material && keeper.material.map) { 
            keeper.material.map.needsUpdate = true;
        }
        // No currentKeeperFrame = 0 here as animation cycle depends on state-based time (in updateGoalkeeper)
        keeper.visible = true; 
    }
}
