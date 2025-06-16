// goalkeeper.js

// Global variables made available in the window scope
let keeper; // The THREE.Mesh object for the goalkeeper
let keeperIdleTexture;
let keeperSaveRightTextures = [];
let keeperSaveLeftTextures = [];
let currentKeeperFrame = 0; // Current animation frame index for current dive

const KEEPER_FRAME_RATE = 40; 

const KEEPER_IDLE_SPRITE_URL = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_idle/gk_idle_0_0.png';
const KEEPER_SAVE_RIGHT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_right/gk_save_up_right_0_';
const KEEPER_SAVE_LEFT_BASE_PATH = 'https://abinbins.github.io/a/penalty-kick-online/sprites/striker/goalkeeper/gk_save_up_left/gk_save_up_left_0_';
const NUM_DIVE_FRAMES = 18; 

let _initialSpriteNativeWidth = 1;
let _initialSpriteNativeHeight = 1;

/**
 * Loads all goalkeeper sprites (idle and animation sequences) and initializes the keeper Mesh.
 * Assumes `scene` (from game.js) and `textureLoader` (from game.js) are globally available.
 */
function loadKeeperSpritesAndModel() {
    const idleTextureLoadPromise = new Promise((resolve, reject) => {
        textureLoader.load(KEEPER_IDLE_SPRITE_URL, (texture) => {
            keeperIdleTexture = texture;
            _initialSpriteNativeWidth = texture.image.width;
            _initialSpriteNativeHeight = texture.image.height;
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
    
    Promise.all([idleTextureLoadPromise, Promise.all(saveRightTexturePromises), Promise.all(saveLeftTexturePromises)])
        .then(results => {
            keeperSaveRightTextures = results[1]; 
            keeperSaveLeftTextures = results[2]; 

            const characterVisualHeightFactor = 250; 
            const characterVisualWidthFactor = 100; 
            const targetHeightMeters = 2.2; 

            const finalPlaneHeight = targetHeightMeters;
            const finalPlaneWidth = (finalPlaneHeight / characterVisualHeightFactor) * characterVisualWidthFactor;

            const keeperGeometry = new THREE.PlaneGeometry(finalPlaneWidth, finalPlaneHeight);
            const keeperMaterial = new THREE.MeshBasicMaterial({ 
                map: keeperIdleTexture, 
                transparent: true, 
                alphaTest: 0.1, 
                side: THREE.DoubleSide
            });

            keeper = new THREE.Mesh(keeperGeometry, keeperMaterial);
            const groundReferenceY = 0; 
            keeper.position.set(0, (finalPlaneHeight / 2) + groundReferenceY, 0.5); 
            
            keeper.rotation.y = Math.PI; 
            keeper.rotation.z = 0;       
            keeper.rotation.x = 0;       
            keeper.castShadow = false;   
            scene.add(keeper);

            console.log(`Goalkeeper initialized with dimensions: Width ${finalPlaneWidth.toFixed(2)}m, Height ${finalPlaneHeight.toFixed(2)}m`);
        })
        .catch(error => {
            console.error('Error loading one or more keeper sprite assets:', error);
        });
}

/**
 * Updates the goalkeeper's position and sprite based on current game state.
 * @param {number} delta - Time in seconds since last frame.
 * @param {Object} penaltyState - The global penalty state object from game.js
 */
function updateGoalkeeper(delta, penaltyState) {
    // Defensive check: ensure penaltyState and keeper object exist
    if (!penaltyState || !keeper || !keeper.material) {
        return; 
    }

    // Defensive checks for keeperDive properties
    const keeperDiveActive = penaltyState.keeperDive && penaltyState.keeperDive.active;
    
    if (keeperDiveActive) {
        let diveInfo = penaltyState.keeperDive;
        
        const elapsedTimeSinceDiveStart = clock.getElapsedTime() - diveInfo.startTime;
        const progress = Math.min(elapsedTimeSinceDiveStart / diveInfo.duration, 1);
        
        // Physical movement (lerp position and simulate jump arc)
        // Ensure diveInfo.start and diveInfo.end are defined and are THREE.Vector3 objects
        if (!diveInfo.start || !diveInfo.end || !(diveInfo.start instanceof THREE.Vector3) || !(diveInfo.end instanceof THREE.Vector3)) {
            // This is a critical state error, likely due to triggerKeeperDive not setting start/end properly
            // Log it and deactivate to prevent further errors
            console.error("Keeper dive start or end position is undefined or not a Vector3.", diveInfo);
            penaltyState.keeperDive.active = false; // Deactivate broken dive
            return;
        }

        keeper.position.lerpVectors(diveInfo.start, diveInfo.end, progress); 
        const jumpHeight = (penaltyState.state === 'ANIMATING_KEEPER' ? 1.0 : 0.8); // Adjust based on whether it's player or opponent
        const parabolicProgress = progress * (1 - progress) * 4; 
        
        const keeperStandingGroundY = keeper.geometry.parameters.height / 2 + 0.0; 
        keeper.position.y = keeperStandingGroundY + (parabolicProgress * jumpHeight); 
        
        // Lean/rotate the sprite during the dive
        const currentSpriteWidth = keeper.geometry.parameters.width;
        let targetZRotation = 0; 
        if (diveInfo.animationSet === 'left') {
            targetZRotation = THREE.Math.degToRad(30); 
        } else if (diveInfo.animationSet === 'right') {
            targetZRotation = THREE.Math.degToRad(-30); 
        }
        keeper.rotation.z = THREE.Math.lerp(0, targetZRotation, progress); 

        // Sprite animation logic
        let texturesToUse = [];
        if (diveInfo.animationSet === 'right') {
            texturesToUse = keeperSaveRightTextures;
        } else if (diveInfo.animationSet === 'left') {
            texturesToUse = keeperSaveLeftTextures;
        } 

        if (texturesToUse.length > 0) { 
            const frameIndex = Math.min(Math.floor(elapsedTimeSinceDiveStart * KEEPER_FRAME_RATE), texturesToUse.length - 1); 
            if (keeper.material.map !== texturesToUse[frameIndex]) { 
                 keeper.material.map = texturesToUse[frameIndex];
                 keeper.material.map.needsUpdate = true; 
            }
        } else {
            // Fallback to idle if no active dive textures or animation set invalid.
            if (keeperIdleTexture && keeper.material.map !== keeperIdleTexture) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
        }

        // When the dive motion and animation finishes for Player's Turn:
        if (progress >= 1) {
            penaltyState.keeperDive.active = false; 
            
            // Snap rotation and return to idle texture
            if (keeperIdleTexture && keeper.material) {
                keeper.material.map = keeperIdleTexture;
                keeper.material.map.needsUpdate = true;
            }
            keeper.rotation.z = 0; 
            keeper.rotation.x = 0; 
            keeper.rotation.y = Math.PI; 
        }

    } else { // If no dive active, ensure keeper is on idle sprite and upright.
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
        const spriteHeight = keeper.geometry.parameters.height; 
        const groundReferenceY = 0; 

        keeper.position.set(0, (spriteHeight / 2) + groundReferenceY, 0.5); 
        keeper.rotation.set(0, Math.PI, 0); 
        
        if (keeperIdleTexture) { 
             keeper.material.map = keeperIdleTexture;
        } else if(keeperSaveRightTextures.length > 0) { 
             keeper.material.map = keeperSaveRightTextures[0];
        }
        if (keeper.material && keeper.material.map) { 
            keeper.material.map.needsUpdate = true;
        }
        keeper.visible = true; // Ensure keeper is visible after reset.
    }
}
