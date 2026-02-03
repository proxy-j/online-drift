<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Multiplayer Drift - Optimized</title>
    <style>
        body { margin: 0; overflow: hidden; background: #87CEEB; font-family: sans-serif; }
        
        /* LOGIN SCREEN */
        #loginOverlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); display: flex; flex-direction: column;
            align-items: center; justify-content: center; z-index: 10;
        }
        #loginBox {
            background: #fff; padding: 30px; border-radius: 10px; text-align: center;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        }
        input { padding: 10px; font-size: 1.2rem; width: 200px; margin-bottom: 15px; border: 2px solid #ccc; border-radius: 5px; }
        button { padding: 10px 20px; font-size: 1.2rem; background: #ff0044; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #d00033; }

        /* HUD */
        #speedometer {
            position: absolute; bottom: 20px; left: 20px; color: #fff;
            font-size: 2.5rem; font-family: monospace; font-weight: bold;
            text-shadow: 2px 2px 0px #000;
        }

        /* SETTINGS PANEL */
        #settings {
            position: absolute; top: 20px; right: 20px; width: 200px;
            background: rgba(0, 0, 0, 0.7); color: white; padding: 15px;
            border-radius: 10px; backdrop-filter: blur(5px); font-family: sans-serif;
            font-size: 0.9rem;
        }
        .control-group { margin-bottom: 15px; }
        .control-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .control-group input[type=range] { width: 100%; }
        .control-group span { font-size: 0.8rem; color: #aaa; float: right; }
    </style>
</head>
<body>

    <div id="loginOverlay">
        <div id="loginBox">
            <h1>Drift City</h1>
            <p>Enter your racer name:</p>
            <input type="text" id="playerNameInput" placeholder="Your Name" maxlength="10">
            <br>
            <button onclick="startGame()">JOIN GAME</button>
        </div>
    </div>

    <div id="speedometer">0 km/h</div>

    <div id="settings">
        <h3 style="margin-top:0; border-bottom:1px solid #555; padding-bottom:5px;">Performance</h3>
        
        <div class="control-group">
            <label>Smoke Amount <span id="smokeVal">50%</span></label>
            <input type="range" id="smokeSlider" min="0" max="100" value="50">
        </div>

        <div class="control-group">
            <label style="display:flex; justify-content:space-between; cursor:pointer;">
                Shadows
                <input type="checkbox" id="shadowToggle" checked>
            </label>
        </div>
        
        <div style="font-size:0.7rem; color:#888; margin-top:10px;">
            Tire marks removed for speed.
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>

    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
            }
        }
    </script>

    <script type="module">
        import * as THREE from 'three';

        // --- Config ---
        const CONFIG = {
            maxSpeed: 1.2, acceleration: 0.02, friction: 0.98, turnSpeed: 0.045,
            driftFactor: 0.94, cameraHeight: 15, cameraDistance: 25, cameraLerp: 0.1,
            mapSize: 400
        };

        // --- Globals ---
        let scene, camera, renderer, socket;
        let car, carVelocity = new THREE.Vector3();
        let inputs = { up: false, down: false, left: false, right: false };
        let particles = [];
        let speed = 0;
        let carHeading = 0;
        let otherPlayers = {}; 
        let dirLight;
        let myName = "Player";
        let isGameActive = false;

        let SETTINGS = {
            smokeChance: 0.5,
            shadows: true
        };
        
        const dummyObj = new THREE.Object3D(); 

        // Expose startGame to HTML button
        window.startGame = function() {
            const nameInput = document.getElementById('playerNameInput');
            if(nameInput.value.trim() !== "") {
                myName = nameInput.value.trim();
                document.getElementById('loginOverlay').style.display = 'none';
                isGameActive = true;
                
                // If socket is ready, send name
                if(socket) {
                    socket.emit('joinGame', myName);
                    // Add my own name tag
                    addNameTag(car, myName, true);
                }
            } else {
                alert("Please enter a name!");
            }
        };

        init();
        animate();

        function init() {
            // 1. Scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87CEEB); 
            scene.fog = new THREE.Fog(0x87CEEB, 60, 300);

            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            
            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            document.body.appendChild(renderer.domElement);

            // 2. Lighting
            const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
            hemiLight.position.set(0, 100, 0);
            scene.add(hemiLight);

            dirLight = new THREE.DirectionalLight(0xffffff, 1);
            dirLight.position.set(80, 120, 50);
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 1024; 
            dirLight.shadow.mapSize.height = 1024;
            dirLight.shadow.camera.near = 0.5;
            dirLight.shadow.camera.far = 400;
            const d = 150;
            dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
            dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
            scene.add(dirLight);

            // 3. World
            createParkingLot();
            createCityBorderOptimized();
            createCar(); // Creates MY car

            // 4. Events
            window.addEventListener('resize', onWindowResize);
            document.addEventListener('keydown', (e) => { if(isGameActive) handleKey(e, true) });
            document.addEventListener('keyup', (e) => { if(isGameActive) handleKey(e, false) });
            setupUISettings();

            initSocket();
        }

        // --- NAME TAG SYSTEM ---
        function createTextSprite(message) {
            const fontface = "Arial";
            const fontsize = 40;
            const borderThickness = 4;
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256; // Power of 2 for GPU
            canvas.height = 128;
            
            context.font = "Bold " + fontsize + "px " + fontface;
            
            // Text Width
            const metrics = context.measureText(message);
            const textWidth = metrics.width;
            
            // Background
            context.fillStyle = "rgba(0,0,0,0.5)";
            context.strokeStyle = "rgba(0,0,0,0.5)";
            context.lineWidth = borderThickness;
            
            // Centered Rect
            const x = (canvas.width - textWidth) / 2 - 10;
            const y = (canvas.height - fontsize) / 2;
            const w = textWidth + 20;
            const h = fontsize * 1.4;
            
            roundRect(context, x, y, w, h, 6); // Helper function below
            
            // Text
            context.fillStyle = "rgba(255, 255, 255, 1.0)";
            context.textAlign = "center";
            context.fillText(message, canvas.width/2, (canvas.height + fontsize/2)/2);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            
            // Scale sprite to be reasonable size in 3D world
            sprite.scale.set(10, 5, 1);
            return sprite;
        }

        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x+r, y);
            ctx.lineTo(x+w-r, y);
            ctx.quadraticCurveTo(x+w, y, x+w, y+r);
            ctx.lineTo(x+w, y+h-r);
            ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
            ctx.lineTo(x+r, y+h);
            ctx.quadraticCurveTo(x, y+h, x, y+h-r);
            ctx.lineTo(x, y+r);
            ctx.quadraticCurveTo(x, y, x+r, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        function addNameTag(targetObj, name, isMe) {
            // Remove old tag if exists
            const oldTag = targetObj.getObjectByName("NameTag");
            if(oldTag) targetObj.remove(oldTag);

            const sprite = createTextSprite(name);
            sprite.position.set(0, 3.5, 0); // 3.5 units above car center
            sprite.name = "NameTag";
            
            if(isMe) sprite.material.color.setHex(0xffff00); // Yellow name for self

            targetObj.add(sprite);
        }

        // --- GAME LOGIC ---

        function setupUISettings() {
            const smokeSlider = document.getElementById('smokeSlider');
            const smokeVal = document.getElementById('smokeVal');
            smokeSlider.addEventListener('input', (e) => {
                SETTINGS.smokeChance = e.target.value / 100;
                smokeVal.innerText = e.target.value + '%';
            });

            const shadowToggle = document.getElementById('shadowToggle');
            shadowToggle.addEventListener('change', (e) => {
                SETTINGS.shadows = e.target.checked;
                renderer.shadowMap.enabled = SETTINGS.shadows;
                dirLight.castShadow = SETTINGS.shadows;
                scene.traverse((child) => { if (child.material) child.material.needsUpdate = true; });
            });
        }

        function initSocket() {
            socket = io();
            
            socket.on('currentPlayers', (players) => {
                Object.keys(players).forEach((id) => {
                    if (id !== socket.id) addOtherPlayer(players[id], id);
                });
            });

            socket.on('newPlayer', (data) => {
                addOtherPlayer(data.player, data.id);
            });

            socket.on('updatePlayerName', (data) => {
                if(data.id === socket.id) {
                    addNameTag(car, data.name, true);
                } else if(otherPlayers[data.id]) {
                    addNameTag(otherPlayers[data.id].mesh, data.name, false);
                }
            });

            socket.on('playerMoved', (data) => {
                if (otherPlayers[data.id]) {
                    otherPlayers[data.id].targetX = data.x;
                    otherPlayers[data.id].targetY = data.y || 0;
                    otherPlayers[data.id].targetZ = data.z;
                    otherPlayers[data.id].targetAngle = data.angle;
                    otherPlayers[data.id].isDrifting = data.isDrifting; 
                }
            });

            socket.on('playerDisconnected', (id) => {
                if (otherPlayers[id]) { scene.remove(otherPlayers[id].mesh); delete otherPlayers[id]; }
            });
        }

        function addOtherPlayer(data, id) {
            const playerGroup = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4), new THREE.MeshStandardMaterial({ color: data.color || 0xcccccc }));
            body.position.y = 0.6; body.castShadow = true; playerGroup.add(body);
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2), new THREE.MeshStandardMaterial({ color: 0x222222 }));
            cabin.position.set(0, 1.2, -0.2); cabin.castShadow = true; playerGroup.add(cabin);
            
            playerGroup.position.set(data.x, data.y || 0, data.z);
            scene.add(playerGroup);
            
            // Add name tag immediately
            addNameTag(playerGroup, data.name || "Racer", false);

            otherPlayers[id] = { 
                mesh: playerGroup, 
                targetX: data.x, 
                targetY: data.y || 0,
                targetZ: data.z, 
                targetAngle: data.angle, 
                isDrifting: false 
            };
        }

        function createTiledGroundTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            
            // Base tile color
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(0, 0, 128, 128);
            
            // Tile grid lines
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 2;
            
            // Draw grid
            for(let i = 0; i <= 4; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 32, 0);
                ctx.lineTo(i * 32, 128);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(0, i * 32);
                ctx.lineTo(128, i * 32);
                ctx.stroke();
            }
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(50, 50);
            return texture;
        }

        function createParkingLot() {
            // Main tiled ground
            const groundTexture = createTiledGroundTexture();
            const groundGeo = new THREE.PlaneGeometry(CONFIG.mapSize, CONFIG.mapSize);
            const groundMat = new THREE.MeshStandardMaterial({ 
                map: groundTexture,
                roughness: 0.8, 
                metalness: 0.1 
            });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            scene.add(ground);

            // Create the map layout
            // Map grid: 5x5 sections, each section is 80 units to fill the map better
            const sectionSize = 80;
            const platformHeight = 15;
            const platformThickness = 3;
            
            // Map layout based on emoji grid:
            // 🟦🟦🟦🟦🟦  (top platforms in corners)
            // 🟥⬛⬛⬛🟥  (ramps on sides)
            // ⬛⬛⬛⬛⬛  (center ground)
            // 🟥⬛⬛⬛🟥  (ramps on sides)
            // 🟦🟦🟦🟦🟦  (bottom platforms in corners)
            
            const mapLayout = [
                ['P','P','P','P','P'], // top row - platforms
                ['R','G','G','G','R'], // ramps on sides
                ['G','G','G','G','G'], // center ground
                ['R','G','G','G','R'], // ramps on sides
                ['P','P','P','P','P']  // bottom row - platforms
            ];

            // Store platform and ramp collision boxes
            window.gameColliders = [];

            // Create platforms (🟦) - flat elevated surfaces
            const platformGeo = new THREE.BoxGeometry(sectionSize, platformThickness, sectionSize);
            const platformMat = new THREE.MeshStandardMaterial({ 
                color: 0x4488ff,
                roughness: 0.6,
                metalness: 0.2
            });
            
            // Build the map
            for(let row = 0; row < 5; row++) {
                for(let col = 0; col < 5; col++) {
                    const type = mapLayout[row][col];
                    const x = (col - 2) * sectionSize; // center the map
                    const z = (row - 2) * sectionSize;
                    
                    if(type === 'P') {
                        // Platform - flat box at elevated height
                        const platform = new THREE.Mesh(platformGeo, platformMat);
                        platform.position.set(x, platformHeight, z);
                        platform.castShadow = true;
                        platform.receiveShadow = true;
                        scene.add(platform);
                        
                        // Store collider info
                        window.gameColliders.push({
                            type: 'platform',
                            minX: x - sectionSize/2,
                            maxX: x + sectionSize/2,
                            minZ: z - sectionSize/2,
                            maxZ: z + sectionSize/2,
                            height: platformHeight
                        });
                        
                        // Add glow effect under platform
                        const glowLight = new THREE.PointLight(0x4488ff, 20, 40);
                        glowLight.position.set(x, platformHeight - 5, z);
                        scene.add(glowLight);
                        
                    } else if(type === 'R') {
                        // Ramp - create properly sloped geometry
                        // Use THREE.BufferGeometry to make a custom wedge shape
                        const rampWidth = sectionSize;
                        const rampLength = sectionSize;
                        const rampHeight = platformHeight;
                        
                        // Create wedge-shaped ramp
                        const rampGeo = new THREE.BufferGeometry();
                        
                        // Vertices for a wedge (ramp)
                        const vertices = new Float32Array([
                            // Front face (low end)
                            -rampWidth/2, 0, rampLength/2,
                            rampWidth/2, 0, rampLength/2,
                            rampWidth/2, 0, rampLength/2,
                            -rampWidth/2, 0, rampLength/2,
                            
                            // Back face (high end)
                            -rampWidth/2, rampHeight, -rampLength/2,
                            rampWidth/2, rampHeight, -rampLength/2,
                            
                            // Bottom
                            -rampWidth/2, 0, rampLength/2,
                            rampWidth/2, 0, rampLength/2,
                            rampWidth/2, 0, -rampLength/2,
                            -rampWidth/2, 0, -rampLength/2,
                            
                            // Sloped top
                            -rampWidth/2, 0, rampLength/2,
                            rampWidth/2, 0, rampLength/2,
                            rampWidth/2, rampHeight, -rampLength/2,
                            -rampWidth/2, rampHeight, -rampLength/2,
                            
                            // Left side
                            -rampWidth/2, 0, rampLength/2,
                            -rampWidth/2, 0, -rampLength/2,
                            -rampWidth/2, rampHeight, -rampLength/2,
                            
                            // Right side
                            rampWidth/2, 0, rampLength/2,
                            rampWidth/2, rampHeight, -rampLength/2,
                            rampWidth/2, 0, -rampLength/2,
                        ]);
                        
                        const indices = [
                            // Bottom
                            6,7,8, 6,8,9,
                            // Top sloped surface
                            10,11,12, 10,12,13,
                            // Front (low)
                            0,1,10, 1,11,10,
                            // Back (high)
                            4,5,12, 4,12,13,
                            // Left
                            14,15,16, 14,16,16,
                            // Right  
                            17,18,19, 17,17,19
                        ];
                        
                        rampGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        rampGeo.setIndex(indices);
                        rampGeo.computeVertexNormals();
                        
                        const rampMat = new THREE.MeshStandardMaterial({ 
                            color: 0xff4444,
                            roughness: 0.7,
                            metalness: 0.1
                        });
                        
                        const ramp = new THREE.Mesh(rampGeo, rampMat);
                        
                        // Determine ramp orientation - ramps should point TOWARD platforms
                        // Top row (row 1) ramps point UP (toward row 0 platforms)
                        // Bottom row (row 3) ramps point DOWN (toward row 4 platforms)
                        if(row === 1) {
                            // Top ramp - points upward (toward north/row 0)
                            ramp.rotation.y = 0; // Face north
                        } else if(row === 3) {
                            // Bottom ramp - points downward (toward south/row 4)
                            ramp.rotation.y = Math.PI; // Face south (flip 180°)
                        }
                        
                        ramp.position.set(x, 0, z);
                        ramp.castShadow = true;
                        ramp.receiveShadow = true;
                        scene.add(ramp);
                        
                        // Store collider info
                        window.gameColliders.push({
                            type: 'ramp',
                            minX: x - sectionSize/2,
                            maxX: x + sectionSize/2,
                            minZ: z - sectionSize/2,
                            maxZ: z + sectionSize/2,
                            row: row,
                            height: platformHeight,
                            length: sectionSize
                        });
                        
                        // Add warning lights on ramps
                        const warnLight = new THREE.PointLight(0xff4444, 15, 30);
                        warnLight.position.set(x, platformHeight/2 + 5, z);
                        scene.add(warnLight);
                    }
                    // 'G' = ground, already created
                }
            }

            // Light Poles (keep existing lighting)
            const poleGeo = new THREE.CylinderGeometry(0.5, 0.5, 15);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
            const lampGeo = new THREE.BoxGeometry(4, 1, 2);
            const lampMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            
            const polePositions = [{x: 50, z: 50}, {x: -50, z: 50}, {x: 50, z: -50}, {x: -50, z: -50}, {x: 100, z: 0}, {x: -100, z: 0}];
            const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, polePositions.length);
            const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, polePositions.length);
            poleMesh.castShadow = true; poleMesh.receiveShadow = true;

            polePositions.forEach((pos, i) => {
                dummyObj.position.set(pos.x, 7.5, pos.z); dummyObj.rotation.set(0,0,0); dummyObj.scale.set(1,1,1); dummyObj.updateMatrix();
                poleMesh.setMatrixAt(i, dummyObj.matrix);
                dummyObj.position.set(pos.x, 15, pos.z); dummyObj.updateMatrix();
                lampMesh.setMatrixAt(i, dummyObj.matrix);
                const pl = new THREE.PointLight(0xffaa00, 30, 50); pl.position.set(pos.x, 14, pos.z); scene.add(pl);
            });
            scene.add(poleMesh); scene.add(lampMesh);
        }

        function createBuildingTexture() {
            const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#444'; ctx.fillRect(0, 0, 64, 128);
            ctx.fillStyle = '#8cf'; 
            for(let y=10; y<120; y+=20) { for(let x=10; x<60; x+=20) { if(Math.random() > 0.3) ctx.fillRect(x, y, 10, 15); } }
            const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

        function createCityBorderOptimized() {
            const buildingTex = createBuildingTexture();
            const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
            const buildingMat = new THREE.MeshStandardMaterial({ map: buildingTex, roughness: 0.2 });
            const buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, 200);
            buildings.castShadow = true; buildings.receiveShadow = true;

            let idx = 0;
            const range = CONFIG.mapSize/2 + 20;
            const countPerWall = Math.ceil(CONFIG.mapSize / 40) + 2;
            const addWall = (sx, sz, dx, dz) => {
                for(let i=0; i<countPerWall; i++) {
                    const h = 40 + Math.random() * 80;
                    dummyObj.position.set(sx + (i*dx*40), h/2, sz + (i*dz*40));
                    dummyObj.rotation.set(0,0,0);
                    dummyObj.scale.set(40, h, 40);
                    dummyObj.updateMatrix();
                    buildings.setMatrixAt(idx++, dummyObj.matrix);
                }
            };
            addWall(-range, -range, 1, 0); addWall(-range, range, 1, 0); addWall(range, -range, 0, 1); addWall(-range, -range, 0, 1);
            scene.add(buildings);
        }

        function createCar() {
            car = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0xff0044 }));
            body.position.y = 0.6; body.castShadow = true; car.add(body);
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2), new THREE.MeshStandardMaterial({ color: 0x222222 }));
            cabin.position.set(0, 1.2, -0.2); cabin.castShadow = true; car.add(cabin);
            const wGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
            const wMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
            [[-1,0.4,1.2],[1,0.4,1.2],[-1,0.4,-1.2],[1,0.4,-1.2]].forEach(p => {
                const w = new THREE.Mesh(wGeo, wMat); w.rotation.z = Math.PI/2; w.position.set(...p); w.castShadow = true; car.add(w);
            });
            const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffaa })); l.position.set(-0.6, 0.7, 2.0); car.add(l);
            const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffaa })); r.position.set(0.6, 0.7, 2.0); car.add(r);
            scene.add(car);
        }

        function handleKey(e, pressed) {
            if(e.key === 'ArrowUp') inputs.up = pressed;
            if(e.key === 'ArrowDown') inputs.down = pressed;
            if(e.key === 'ArrowLeft') inputs.left = pressed;
            if(e.key === 'ArrowRight') inputs.right = pressed;
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function animate() {
            requestAnimationFrame(animate);
            if(isGameActive) {
                updatePhysics();
                updateMultiplayerCars();
                updateEffects();
                updateCamera();
            }
            renderer.render(scene, camera);
        }

        function getGroundHeight(x, z) {
            if(!window.gameColliders) return 0;
            
            // Check each collider
            for(let collider of window.gameColliders) {
                // Check if position is within this collider's bounds
                if(x >= collider.minX && x <= collider.maxX && 
                   z >= collider.minZ && z <= collider.maxZ) {
                    
                    if(collider.type === 'platform') {
                        return collider.height;
                    } else if(collider.type === 'ramp') {
                        // Calculate height based on position on ramp
                        const relZ = z - (collider.minZ + collider.maxZ) / 2;
                        
                        if(collider.row === 1) {
                            // Top ramp - slopes up toward north (negative Z)
                            // At maxZ (south/bottom edge): height = 0
                            // At minZ (north/top edge): height = platformHeight
                            const progress = (collider.maxZ - z) / collider.length;
                            return Math.max(0, Math.min(collider.height, collider.height * progress));
                        } else if(collider.row === 3) {
                            // Bottom ramp - slopes up toward south (positive Z)
                            // At minZ (north/top edge): height = 0
                            // At maxZ (south/bottom edge): height = platformHeight
                            const progress = (z - collider.minZ) / collider.length;
                            return Math.max(0, Math.min(collider.height, collider.height * progress));
                        }
                    }
                }
            }
            
            return 0; // Ground level
        }

        function updatePhysics() {
            if (inputs.up) speed += CONFIG.acceleration;
            if (inputs.down) speed -= CONFIG.acceleration;
            speed *= CONFIG.friction;
            if (speed > CONFIG.maxSpeed) speed = CONFIG.maxSpeed;
            if (speed < -CONFIG.maxSpeed / 2) speed = -CONFIG.maxSpeed / 2;
            if (Math.abs(speed) < 0.001) speed = 0;

            if (Math.abs(speed) > 0.01) {
                const turnFactor = inputs.left ? 1 : (inputs.right ? -1 : 0);
                carHeading += turnFactor * CONFIG.turnSpeed * Math.sign(speed);
            }

            carVelocity.x = carVelocity.x * CONFIG.driftFactor + (Math.sin(carHeading) * speed) * (1 - CONFIG.driftFactor);
            carVelocity.z = carVelocity.z * CONFIG.driftFactor + (Math.cos(carHeading) * speed) * (1 - CONFIG.driftFactor);
            car.position.x += carVelocity.x; car.position.z += carVelocity.z;

            const limit = CONFIG.mapSize / 2 - 3;
            if (car.position.x > limit || car.position.x < -limit) { car.position.x = Math.sign(car.position.x)*limit; speed *= -0.5; }
            if (car.position.z > limit || car.position.z < -limit) { car.position.z = Math.sign(car.position.z)*limit; speed *= -0.5; }

            // Update car height based on ground/platform/ramp
            const targetHeight = getGroundHeight(car.position.x, car.position.z);
            car.position.y += (targetHeight - car.position.y) * 0.2; // Smooth transition

            car.rotation.set(0, carHeading, -(inputs.left ? 1 : (inputs.right ? -1 : 0)) * (speed * 0.1));
            document.getElementById('speedometer').innerText = Math.abs(Math.round(speed * 200)) + " km/h";

            if(socket) {
                const drifting = (inputs.left || inputs.right) && Math.abs(speed) > 0.4;
                socket.emit('playerMovement', { x: car.position.x, y: car.position.y, z: car.position.z, angle: carHeading, isDrifting: drifting });
            }
        }

        function updateMultiplayerCars() {
            Object.keys(otherPlayers).forEach(id => {
                const p = otherPlayers[id];
                p.mesh.position.x += (p.targetX - p.mesh.position.x) * 0.2;
                p.mesh.position.y += (p.targetY - p.mesh.position.y) * 0.2;
                p.mesh.position.z += (p.targetZ - p.mesh.position.z) * 0.2;
                p.mesh.rotation.y = p.targetAngle; 
                if (p.isDrifting) {
                    if(Math.random() < SETTINGS.smokeChance) createRemoteSmoke(p.mesh);
                }
            });
        }

        const particleGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        
        // REMOVED SKID MARK MATERIALS AND ARRAYS HERE

        function updateEffects() {
            const isTurning = inputs.left || inputs.right;
            const isMovingFast = Math.abs(speed) > 0.4;
            
            if (isTurning && isMovingFast) {
                if (Math.random() < SETTINGS.smokeChance) createSmoke(); 
                // REMOVED SKID MARK CREATION
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i]; p.life -= 0.03; p.mesh.position.y += p.velY; p.mesh.scale.multiplyScalar(1.05); p.mesh.material.opacity = p.life * 0.4;
                if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
            }
        }

        function createSmoke() { spawnSmokeAt(car.position.x, car.position.z, carHeading); }
        function createRemoteSmoke(mesh) { spawnSmokeAt(mesh.position.x, mesh.position.z, mesh.rotation.y); }

        function spawnSmokeAt(cx, cz, heading) {
            const offsets = [{x: -1, z: -1.2}, {x: 1, z: -1.2}];
            offsets.forEach(offset => {
                const cos = Math.cos(heading); const sin = Math.sin(heading);
                const wx = offset.x * cos + offset.z * sin; const wz = -offset.x * sin + offset.z * cos;
                const p = new THREE.Mesh(particleGeo, particleMat.clone());
                p.position.set(cx + wx, 0.2, cz + wz); p.rotation.set(Math.random(), Math.random(), Math.random());
                scene.add(p); particles.push({ mesh: p, life: 1.0, velY: 0.05 + Math.random()*0.05 });
            });
        }

        function updateCamera() {
            const dist = CONFIG.cameraDistance; const height = CONFIG.cameraHeight;
            const cx = car.position.x - Math.sin(carHeading) * dist; const cz = car.position.z - Math.cos(carHeading) * dist;
            camera.position.x += (cx - camera.position.x) * CONFIG.cameraLerp; camera.position.z += (cz - camera.position.z) * CONFIG.cameraLerp;
            camera.position.y += (height + car.position.y - camera.position.y) * CONFIG.cameraLerp;
            camera.lookAt(car.position.x, car.position.y, car.position.z);
        }
    </script>
</body>
</html>
