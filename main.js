import * as THREE from 'three';

// Global Game Variables
let scene, camera, renderer;
let player, leftArm, rightArm, leftLeg, rightLeg, body;
let tracks = [];
let obstacles = [];
let gameActive = false;
let score = 0;
let speed = 20; // Units per second
let laneWidth = 3;
let currentLane = 0; // -1, 0, 1
let targetX = 0;

// Player Animation States
let isJumping = false;
let jumpVelocity = 0;
let gravity = -50;
let playerY = 1; // Base Y position
let isSliding = false;
let slideTimer = 0;
let runTime = 0;

// Intro Cinematic
let isIntro = true;
let introProgress = 0;
const INTRO_DURATION = 3; // seconds
let initialCameraPos = new THREE.Vector3(0, 10, -15);
let initialCameraTarget = new THREE.Vector3(0, 0, 10);
let finalCameraPos = new THREE.Vector3(0, 5, 8);
let finalCameraTarget = new THREE.Vector3(0, 2, 0);

// Colors
const colors = {
    sky: 0x87CEEB,
    ground: 0x2d3436,
    rail: 0x636e72,
    sleeper: 0x8e44ad,
    playerDress: 0xff4757,
    playerSkin: 0xffdcb6,
    playerShoe: 0x2f3542,
    obstacle: 0xf1c40f
};

const clock = new THREE.Clock();

init();
animate();

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.sky);
    scene.fog = new THREE.Fog(colors.sky, 30, 80);

    // 2. Camera Setup (TPV)
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.copy(initialCameraPos);
    camera.lookAt(initialCameraTarget);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance optimization
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    scene.add(dirLight);

    // 5. Build Environment
    createEnvironment();

    // 6. Build Player
    createPlayer();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.getElementById('intro-screen').addEventListener('click', startCinematic);
    document.getElementById('restart-btn').addEventListener('click', resetGame);
    
    setupControls();
}

function createEnvironment() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 200);
    const groundMat = new THREE.MeshLambertMaterial({ color: colors.ground });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -50;
    ground.receiveShadow = true;
    scene.add(ground);

    // Railway Tracks Texture
    const trackCanvas = document.createElement('canvas');
    trackCanvas.width = 512;
    trackCanvas.height = 1024;
    const ctx = trackCanvas.getContext('2d');
    
    // Base dark color
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(0, 0, 512, 1024);
    
    // Wooden sleepers
    ctx.fillStyle = '#636e72';
    for (let i = 0; i < 1024; i += 64) {
        ctx.fillRect(0, i + 16, 512, 32);
    }
    
    // Steel rails
    ctx.fillStyle = '#dfe6e9';
    // 3 Lanes
    for (let lane = -1; lane <= 1; lane++) {
        let centerX = 256 + lane * (512 / 3);
        let leftRail = centerX - 20;
        let rightRail = centerX + 20;
        ctx.fillRect(leftRail, 0, 8, 1024);
        ctx.fillRect(rightRail, 0, 8, 1024);
    }

    const trackTexture = new THREE.CanvasTexture(trackCanvas);
    trackTexture.wrapS = THREE.RepeatWrapping;
    trackTexture.wrapT = THREE.RepeatWrapping;
    trackTexture.repeat.set(1, 10);

    const trackMat = new THREE.MeshStandardMaterial({ 
        map: trackTexture,
        roughness: 0.8,
        metalness: 0.2
    });

    // We use two large planes for the endless track effect
    for (let i = 0; i < 2; i++) {
        const trackGeo = new THREE.PlaneGeometry(laneWidth * 3.5, 100);
        const track = new THREE.Mesh(trackGeo, trackMat);
        track.rotation.x = -Math.PI / 2;
        track.position.z = -i * 100 + 50;
        track.position.y = 0.01; // Slightly above ground to prevent z-fighting
        track.receiveShadow = true;
        scene.add(track);
        tracks.push(track);
    }
}

function createPlayer() {
    player = new THREE.Group();
    player.position.set(0, playerY, 0);
    scene.add(player);

    const skinMat = new THREE.MeshLambertMaterial({ color: colors.playerSkin });
    const dressMat = new THREE.MeshLambertMaterial({ color: colors.playerDress });
    const shoeMat = new THREE.MeshLambertMaterial({ color: colors.playerShoe });

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), skinMat);
    head.position.y = 1.4;
    head.castShadow = true;
    player.add(head);

    // Body (Dress)
    body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.6), dressMat);
    body.position.y = 0.4;
    body.castShadow = true;
    player.add(body);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.3, 1, 0.3);
    
    leftArm = new THREE.Group();
    leftArm.position.set(-0.7, 0.9, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
    leftArmMesh.position.y = -0.4; // Pivot from shoulder
    leftArmMesh.castShadow = true;
    leftArm.add(leftArmMesh);
    player.add(leftArm);

    rightArm = new THREE.Group();
    rightArm.position.set(0.7, 0.9, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, skinMat);
    rightArmMesh.position.y = -0.4;
    rightArmMesh.castShadow = true;
    rightArm.add(rightArmMesh);
    player.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);
    
    leftLeg = new THREE.Group();
    leftLeg.position.set(-0.25, -0.2, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, dressMat); // Trousers
    leftLegMesh.position.y = -0.5;
    leftLegMesh.castShadow = true;
    leftLeg.add(leftLegMesh);
    // Left Shoe
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.6), shoeMat);
    leftShoe.position.set(0, -1.15, 0.1);
    leftShoe.castShadow = true;
    leftLeg.add(leftShoe);
    player.add(leftLeg);

    rightLeg = new THREE.Group();
    rightLeg.position.set(0.25, -0.2, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, dressMat); // Trousers
    rightLegMesh.position.y = -0.5;
    rightLegMesh.castShadow = true;
    rightLeg.add(rightLegMesh);
    // Right Shoe
    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.6), shoeMat);
    rightShoe.position.set(0, -1.15, 0.1);
    rightShoe.castShadow = true;
    rightLeg.add(rightShoe);
    player.add(rightLeg);
}

function spawnObstacle() {
    if(!gameActive) return;

    // Determine type: 0 = tall (need to slide), 1 = low (need to jump)
    const type = Math.random() > 0.5 ? 'tall' : 'low';
    const lane = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    
    const mat = new THREE.MeshLambertMaterial({ color: colors.obstacle });
    let geo, yPos;
    
    if (type === 'tall') {
        // Floating obstacle to slide under
        geo = new THREE.BoxGeometry(2, 1, 1);
        yPos = 2.5;
    } else {
        // Ground obstacle to jump over
        geo = new THREE.BoxGeometry(2, 1.5, 1);
        yPos = 0.75;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(lane * laneWidth, yPos, -80);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    mesh.userData = { type: type, passed: false };
    scene.add(mesh);
    obstacles.push(mesh);
}

function startCinematic() {
    document.getElementById('intro-screen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('intro-screen').style.display = 'none';
    }, 1000);
    
    // Start interpolation loop
    let startTime = clock.getElapsedTime();
    
    function cinematicLoop() {
        if (!isIntro) return;
        requestAnimationFrame(cinematicLoop);
        
        let now = clock.getElapsedTime();
        let p = (now - startTime) / INTRO_DURATION;
        
        if (p >= 1) {
            p = 1;
            isIntro = false;
            startGame();
        }
        
        // Easing function
        let easeOut = 1 - Math.pow(1 - p, 3);
        
        camera.position.lerpVectors(initialCameraPos, finalCameraPos, easeOut);
        
        let target = new THREE.Vector3().lerpVectors(initialCameraTarget, finalCameraTarget, easeOut);
        camera.lookAt(target);
        
        renderer.render(scene, camera);
    }
    
    cinematicLoop();
}

function startGame() {
    gameActive = true;
    score = 0;
    speed = 20;
    document.getElementById('game-ui').style.display = 'flex';
    document.getElementById('score-val').innerText = score;
    
    // Initial obstacles
    setTimeout(spawnObstacle, 1000);
    
    // Obstacle spawner loop
    setInterval(() => {
        if(gameActive) spawnObstacle();
    }, 1500);
}

function resetGame() {
    document.getElementById('game-over-screen').style.display = 'none';
    
    // Clear obstacles
    obstacles.forEach(obs => scene.remove(obs));
    obstacles = [];
    
    // Reset player
    currentLane = 0;
    targetX = 0;
    player.position.set(0, playerY, 0);
    isJumping = false;
    isSliding = false;
    
    startGame();
}

function setupControls() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (!gameActive || isIntro) return;
        
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            if (currentLane > -1) {
                currentLane--;
                targetX = currentLane * laneWidth;
            }
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
            if (currentLane < 1) {
                currentLane++;
                targetX = currentLane * laneWidth;
            }
        } else if (e.key === 'ArrowUp' || e.key === 'w') {
            jump();
        } else if (e.key === 'ArrowDown' || e.key === 's') {
            slide();
        }
    });

    // Touch
    let touchStartX = 0;
    let touchStartY = 0;
    window.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });

    window.addEventListener('touchend', (e) => {
        if (!gameActive || isIntro) return;
        
        let touchEndX = e.changedTouches[0].clientX;
        let touchEndY = e.changedTouches[0].clientY;
        
        let dx = touchEndX - touchStartX;
        let dy = touchEndY - touchStartY;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal swipe
            if (Math.abs(dx) > 30) {
                if (dx > 0 && currentLane < 1) {
                    currentLane++;
                    targetX = currentLane * laneWidth;
                } else if (dx < 0 && currentLane > -1) {
                    currentLane--;
                    targetX = currentLane * laneWidth;
                }
            }
        } else {
            // Vertical swipe
            if (Math.abs(dy) > 30) {
                if (dy < 0) {
                    jump();
                } else if (dy > 0) {
                    slide();
                }
            }
        }
    });
}

function jump() {
    if (!isJumping && !isSliding) {
        isJumping = true;
        jumpVelocity = 18;
    }
}

function slide() {
    if (!isSliding && !isJumping) {
        isSliding = true;
        slideTimer = 1.0; // 1 second slide
        
        // Visual adjustment for sliding
        body.rotation.x = -Math.PI / 2;
        body.position.y = -0.2;
        body.position.z = 0.5;
        player.position.y = playerY - 0.5;
    }
}

function updateAnimations(dt) {
    if (!gameActive) return;
    
    runTime += dt * 10;
    
    if (isJumping) {
        // Freeze limbs in jump pose
        leftLeg.rotation.x = -0.5;
        rightLeg.rotation.x = 0.2;
        leftArm.rotation.x = 0.5;
        rightArm.rotation.x = -0.5;
        
    } else if (isSliding) {
        // Arms forward for slide
        leftArm.rotation.x = -Math.PI/2;
        rightArm.rotation.x = -Math.PI/2;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        
    } else {
        // Normal running animation using Sine waves
        leftLeg.rotation.x = Math.sin(runTime) * 0.8;
        rightLeg.rotation.x = Math.sin(runTime + Math.PI) * 0.8;
        leftArm.rotation.x = Math.sin(runTime + Math.PI) * 0.8;
        rightArm.rotation.x = Math.sin(runTime) * 0.8;
        
        // Reset body if returning from slide
        body.rotation.x = 0;
        body.position.y = 0.4;
        body.position.z = 0;
    }
}

function updatePhysics(dt) {
    // Lateral movement (smooth lane changing)
    player.position.x += (targetX - player.position.x) * 10 * dt;

    // Jumping physics
    if (isJumping) {
        player.position.y += jumpVelocity * dt;
        jumpVelocity += gravity * dt;
        
        if (player.position.y <= playerY) {
            player.position.y = playerY;
            isJumping = false;
        }
    }

    // Sliding logic
    if (isSliding) {
        slideTimer -= dt;
        if (slideTimer <= 0) {
            isSliding = false;
            player.position.y = playerY; // reset height
        }
    }

    // Move tracks
    tracks.forEach(track => {
        track.position.z += speed * dt;
        // Move texture offset to enhance speed feeling
        track.material.map.offset.y -= (speed / 100) * dt;
        if (track.position.z > 50) {
            track.position.z -= 200;
        }
    });

    // Move obstacles and check collision
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.position.z += speed * dt;
        
        // Collision Detection (Simple AABB)
        let dx = Math.abs(player.position.x - obs.position.x);
        let dy = player.position.y - obs.position.y;
        let dz = Math.abs(player.position.z - obs.position.z);
        
        if (dz < 1.0 && dx < 1.0) {
            if (obs.userData.type === 'tall') {
                // Must slide
                if (!isSliding) gameOver();
            } else {
                // Must jump
                if (player.position.y < 1.5) gameOver();
            }
        }
        
        if (obs.position.z > 10) {
            scene.remove(obs);
            obstacles.splice(i, 1);
            score += 10;
            document.getElementById('score-val').innerText = score;
            
            // Speed increment
            if (score % 100 === 0) {
                speed += 2;
            }
        }
    }
}

function gameOver() {
    gameActive = false;
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'flex';
    document.getElementById('final-score').innerText = score;
}

function animate() {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta();
    
    if (!isIntro && gameActive) {
        updateAnimations(dt);
        updatePhysics(dt);
        
        // Make camera gently follow player's horizontal movement
        camera.position.x = player.position.x * 0.5;
        camera.lookAt(new THREE.Vector3(player.position.x * 0.3, 2, 0));
    }
    
    if (!isIntro) {
        renderer.render(scene, camera);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
