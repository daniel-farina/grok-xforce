import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as CANNON from "cannon-es";
import { io, Socket } from "socket.io-client";

// Video setup
const video = document.createElement("video");
video.src = "/assets/textures/screen_video.mp4";
video.loop = true;
video.muted = true;
video.play();

interface PlayerData {
    socketId: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    name: string;
    health: number;
    lives: number;
    ammo: number;
    ready: boolean;
    hits: number;
    avatar?: string;
}

class App {
    // Properties
    private socket: Socket = io("http://localhost:3000");
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    private renderer!: THREE.WebGLRenderer;
    private world: CANNON.World = new CANNON.World();
    private canvas!: HTMLCanvasElement;
    private hero!: THREE.Object3D;
    private heroBody!: CANNON.Body;
    private otherPlayers: Map<string, { mesh: THREE.Object3D; nameTag: THREE.Mesh; healthBar: THREE.Mesh }> = new Map();
    private ammoPickups: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private thunderBoosts: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private bullets: { mesh: THREE.Mesh; body: CANNON.Body; owner: string }[] = [];
    private sparks: { mesh: THREE.Mesh; lifetime: number }[] = [];
    private buildings: { mesh: THREE.Object3D; body: CANNON.Body }[] = [];
    private ammo: number = 50;
    private lives: number = 5;
    private health: number = 100;
    private hits: number = 0;
    private moveForward: boolean = false;
    private moveBackward: boolean = false;
    private moveRight: boolean = false;
    private moveLeft: boolean = false;
    private jump: boolean = false;
    private isPaused: boolean = false;
    private ammoCounter!: HTMLElement;
    private speedBoostCounter!: HTMLElement;
    private livesCounter!: HTMLElement;
    private healthCounter!: HTMLElement;
    private ammoWarning!: HTMLElement;
    private pauseMenu!: HTMLElement;
    private lobby!: HTMLElement;
    private lobbyTitle!: HTMLElement;
    private resumeButton!: HTMLElement;
    private joinButton!: HTMLElement;
    private readyButton!: HTMLButtonElement;
    private usernameInput!: HTMLInputElement;
    private lobbyStatus!: HTMLElement;
    private countdown!: HTMLElement;
    private characterSelection!: HTMLElement;
    private characterPreview!: HTMLElement;
    private characterOptions!: HTMLElement;
    private mouseX: number = 0;
    private mouseY: number = 0;
    private videoPlane!: THREE.Mesh;
    private speedBoostActive: boolean = false;
    private normalSpeed: number = 20;
    private boostSpeed: number = 80;
    private boostDuration: number = 50000;
    private boostTimeout: NodeJS.Timeout | null = null;
    private roomId: string | null = null;
    private playerId: number | null = null;
    private playerName: string | null = null;
    private selectedCharacter: string = "character-male-a.glb";
    private isReady: boolean = false;
    private blinkTimer: number = 0;
    private blinkInterval: number = 500;
    private elevator!: { mesh: THREE.Mesh; body: CANNON.Body };
    private elevatorHeight: number = 160;
    private elevatorState: "ground" | "rising" | "top" | "falling" = "ground";
    private elevatorTimer: number = 0;
    private elevatorWaitTime: number = 5000;
    private elevatorTravelTime: number = 3000;
    private elevatorStartY: number = -0.25;
    private heroReady: boolean = false;
    private pendingPlayersUpdates: Array<{ [socketId: string]: PlayerData }> = [];
    private lastPlayersUpdateTimestamp: number = 0;
    private debounceInterval: number = 100; // 100ms debounce
    private loadingPlayers: Set<string> = new Set(); // Track players being loaded

    constructor() {
        this.initialize();
    }
    

    private initialize(): void {
        const getCanvas = (): HTMLCanvasElement => {
            const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
            if (!canvas) throw new Error("Canvas element not found");
            return canvas;
        };

        const init = () => {
            this.canvas = getCanvas();
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.world.gravity.set(0, -9.81, 0);

            this.ammoCounter = document.getElementById("ammoCounter") as HTMLElement;
            this.speedBoostCounter = document.getElementById("speedBoostCounter") as HTMLElement;
            this.livesCounter = document.getElementById("livesCounter") as HTMLElement;
            this.healthCounter = document.getElementById("healthCounter") as HTMLElement;
            this.ammoWarning = document.getElementById("ammoWarning") as HTMLElement;
            this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
            this.lobby = document.getElementById("lobby") as HTMLElement;
            this.lobbyTitle = document.getElementById("lobbyTitle") as HTMLElement;
            this.resumeButton = document.getElementById("resumeButton") as HTMLElement;
            this.joinButton = document.getElementById("joinButton") as HTMLElement;
            this.readyButton = document.getElementById("readyButton") as HTMLButtonElement;
            this.usernameInput = document.getElementById("usernameInput") as HTMLInputElement;
            this.lobbyStatus = document.getElementById("lobbyStatus") as HTMLElement;
            this.countdown = document.getElementById("countdown") as HTMLElement;
            this.characterSelection = document.getElementById("characterSelection") as HTMLElement;
            this.characterPreview = document.getElementById("characterPreview") as HTMLElement;
            this.characterOptions = document.getElementById("characterOptions") as HTMLElement;

            this.lobby.style.display = "block";
            this.setupSocketEvents();
            this.setupInput();
            this.setupCharacterSelection();
            this.handleResize();
            window.addEventListener('resize', () => this.handleResize());
        };

        if (document.readyState === "complete" || document.readyState === "interactive") {
            init();
        } else {
            window.addEventListener("DOMContentLoaded", init);
        }
    }

    private setupSocketEvents(): void {
        this.joinButton.addEventListener("click", () => {
            const username = this.usernameInput.value.trim();
            if (username) {
                this.playerName = username;
                this.joinButton.style.display = "none";
                this.usernameInput.style.display = "none";
                this.characterSelection.style.display = "block";
                this.lobbyTitle.textContent = "Select Your Character";
            }
        });

        this.readyButton.addEventListener("click", () => {
            if (!this.isReady) {
                this.socket.emit("login", { name: this.playerName, avatar: this.selectedCharacter });
            }
        });

        this.socket.on("loginSuccess", (data: { roomId: string; playerId: number; name: string; position?: { x: number; y: number; z: number } }) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.playerName = data.name;
            this.characterSelection.style.display = "none";
            this.lobbyTitle.textContent = "Waiting for Players";
            this.readyButton.style.display = "none";
            this.socket.emit("playerReady");
            this.isReady = true;
            this.readyButton.textContent = "Ready (Waiting)";
            this.readyButton.disabled = true;
            this.createScene(data.position).then(() => this.animate());
        });

        this.socket.on("playersUpdate", (players: { [socketId: string]: PlayerData }) => {
            if (!this.heroReady) {
                console.log("Hero not ready, queuing playersUpdate");
                this.pendingPlayersUpdates.push(players);
                return;
            }
            this.processPlayersUpdate(players);
        });

        this.socket.on("elevatorUpdate", (data: { positionY: number; state: string }) => {
            if (this.elevator) {
                this.elevator.mesh.position.y = data.positionY;
                this.elevator.body.position.y = data.positionY;
                this.elevatorState = data.state as "ground" | "rising" | "top" | "falling";
            }
        });

        this.socket.on("lobbyUpdate", ({ total, ready }: { total: number; ready: number }) => {
            this.lobbyStatus.textContent = `Players: ${total} (Ready: ${ready}/${total})`;
        });

        this.socket.on("countdown", ({ timeLeft }: { timeLeft: number }) => {
            this.countdown.textContent = timeLeft > 0 ? `Starting in ${timeLeft}...` : "Game Starting!";
        });

        this.socket.on("gameStarted", () => {
            this.lobby.style.display = "none";
            this.isPaused = false;
        });

        this.socket.on("playerMoved", (data: { socketId: string; position: any; rotation: any }) => {
            if (data.socketId !== this.socket.id) {
                this.updateOtherPlayer(data.socketId, {
                    socketId: data.socketId,
                    position: data.position,
                    rotation: data.rotation,
                    name: "",
                    health: 100,
                    lives: 5,
                    ammo: 50,
                    ready: false,
                    hits: 0,
                });
            }
        });

        this.socket.on("playerShot", (data: { socketId: string; origin: any; direction: any }) => {
            this.spawnBullet(data.origin, data.direction, data.socketId);
        });

        this.socket.on("playerHitEffect", (data: { targetSocketId: string }) => {
            // Optional feedback
        });

        this.socket.on("playerOut", () => {
            this.isPaused = true;
            this.pauseMenu.style.display = "block";
            alert("You are out of lives!");
        });

        this.socket.on("gameEnded", ({ winnerSocketId }: { winnerSocketId: string }) => {
            this.isPaused = true;
            this.pauseMenu.style.display = "block";
            alert(`Game Over! Winner: ${this.otherPlayers.get(winnerSocketId)?.nameTag.userData.name || "Unknown"}`);
            this.resetGameForNewRoom();
        });
    }

    private processPlayersUpdate(players: { [socketId: string]: PlayerData }): void {
        const now = Date.now();
        if (now - this.lastPlayersUpdateTimestamp < this.debounceInterval) {
            console.log("Debouncing duplicate playersUpdate");
            return;
        }
        this.lastPlayersUpdateTimestamp = now;

        console.log("Processing playersUpdate:", Object.keys(players));
        Object.entries(players).forEach(([socketId, player]) => {
            if (socketId === this.socket.id) {
                this.lives = player.lives;
                this.health = player.health;
                this.ammo = player.ammo;
                this.hits = player.hits;
                this.livesCounter.textContent = `Lives: ${this.lives}`;
                this.healthCounter.textContent = `Health: ${this.health}`;
                this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
                this.updateAmmoWarning();
            } else {
                this.updateOtherPlayer(socketId, player);
            }
        });
        const totalPlayers = Object.keys(players).length;
        this.lobbyStatus.textContent = `Players in lobby: ${totalPlayers}`;
    }

    private setupInput(): void {
        this.canvas.addEventListener("click", () => {
            if (!this.isPaused && this.lobby.style.display === "none" && !document.pointerLockElement) {
                this.canvas.requestPointerLock().catch(() => {
                    this.isPaused = true;
                    this.pauseMenu.style.display = "block";
                });
            }
        });

        document.addEventListener("keydown", (event) => {
            if (this.isPaused) return;
            switch (event.keyCode) {
                case 87: this.moveForward = true; break; // W
                case 83: this.moveBackward = true; break; // S
                case 68: this.moveRight = true; break; // D
                case 65: this.moveLeft = true; break; // A
                case 32: this.jump = true; break; // Space
            }
        });

        document.addEventListener("keyup", (event) => {
            switch (event.keyCode) {
                case 87: this.moveForward = false; break;
                case 83: this.moveBackward = false; break;
                case 68: this.moveRight = false; break;
                case 65: this.moveLeft = false; break;
                case 32: this.jump = false; break;
                case 27:
                    if (!this.isPaused && document.pointerLockElement) {
                        this.isPaused = true;
                        this.pauseMenu.style.display = "block";
                        document.exitPointerLock();
                    }
                    break;
            }
        });

        this.resumeButton.addEventListener("click", () => {
            this.isPaused = false;
            this.pauseMenu.style.display = "none";
            if (this.lobby.style.display === "none") {
                this.canvas.requestPointerLock().catch(() => {
                    this.isPaused = true;
                    this.pauseMenu.style.display = "block";
                });
            }
        });

        document.addEventListener("mousemove", (event) => {
            if (this.isPaused || !document.pointerLockElement) return;
            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;
            this.mouseX -= movementX * 0.002;
            this.mouseY -= movementY * 0.002;
            this.mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouseY));
        });

        document.addEventListener("pointerlockerror", () => {
            this.isPaused = true;
            this.pauseMenu.style.display = "block";
        });

        this.canvas.addEventListener("mousedown", () => {
            if (this.isPaused || !document.pointerLockElement || this.ammo <= 0) return;
            this.ammo--;
            this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
            this.updateAmmoWarning();

            const direction = this.camera.getWorldDirection(new THREE.Vector3());
            this.socket.emit("playerShot", {
                origin: this.camera.position,
                direction: direction,
            });

            this.spawnBullet(this.camera.position, direction, this.socket.id);
        });
    }

    private setupCharacterSelection(): void {
        const buttons = Array.from(this.characterOptions.getElementsByTagName("button"));
        for (let button of buttons) {
            button.addEventListener("click", () => {
                this.selectedCharacter = button.dataset.model!;
                this.characterPreview.style.backgroundImage = `url(/assets/characters/${this.selectedCharacter.replace('.glb', '.png')})`;
                this.readyButton.style.display = "block";
            });
        }
    }

    private updateAmmoWarning(): void {
        if (this.ammo <= 0) {
            this.ammoWarning.style.display = "block";
        } else {
            this.ammoWarning.style.display = "none";
        }
    }

    private handleResize(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    private resetGameForNewRoom(): void {
        this.roomId = null;
        this.isReady = false;
        this.heroReady = false;
        this.pendingPlayersUpdates = [];
        this.loadingPlayers.clear();
        this.otherPlayers.forEach((playerObj) => this.scene.remove(playerObj.mesh));
        this.otherPlayers.clear();
        this.bullets.forEach(bullet => {
            this.scene.remove(bullet.mesh);
            this.world.removeBody(bullet.body);
        });
        this.bullets = [];
        this.sparks.forEach(spark => this.scene.remove(spark.mesh));
        this.sparks = [];
        if (this.hero) this.scene.remove(this.hero);
        if (this.heroBody) this.world.removeBody(this.heroBody);
        this.lobby.style.display = "block";
        this.lobbyTitle.textContent = "Enter Username";
        this.usernameInput.style.display = "block";
        this.joinButton.style.display = "block";
        this.readyButton.style.display = "none";
        this.characterSelection.style.display = "none";
        this.readyButton.textContent = "Ready";
        this.readyButton.disabled = false;
        this.pauseMenu.style.display = "none";
    }

    private spawnBullet(origin: any, direction: any, owner: string): void {
        const bulletGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const bulletMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.position.set(origin.x, origin.y, origin.z);
        this.scene.add(bullet);

        const bulletBody = new CANNON.Body({ mass: 1 });
        bulletBody.addShape(new CANNON.Sphere(0.1));
        bulletBody.position.set(origin.x, origin.y, origin.z);
        bulletBody.velocity.set(direction.x * 100, direction.y * 100, direction.z * 100);
        this.world.addBody(bulletBody);
        this.bullets.push({ mesh: bullet, body: bulletBody, owner });

        setTimeout(() => {
            const index = this.bullets.findIndex((b) => b.mesh === bullet);
            if (index !== -1) {
                this.scene.remove(this.bullets[index].mesh);
                this.world.removeBody(this.bullets[index].body);
                this.bullets.splice(index, 1);
            }
        }, 2000);
    }

    private createSpark(position: THREE.Vector3): void {
        const sparkGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
        spark.position.copy(position);
        this.scene.add(spark);
        this.sparks.push({ mesh: spark, lifetime: 500 });
    }

    private async createScene(initialPosition?: { x: number; y: number; z: number }): Promise<void> {
        const gltfLoader = new GLTFLoader();
        const heroGltf = await gltfLoader.loadAsync(`/assets/characters/${this.selectedCharacter}`);
        this.hero = heroGltf.scene;
        this.hero.scale.set(2, 2, 2);
        this.hero.position.set(initialPosition?.x || 0, initialPosition?.y || 0, initialPosition?.z || 0);
        this.hero.rotation.set(0, 0, 0);
        this.scene.add(this.hero);
        this.heroBody = new CANNON.Body({ mass: 1 });
        this.heroBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5 * 2, 1 * 2, 0.5 * 2)));
        this.heroBody.position.set(initialPosition?.x || 0, initialPosition?.y || 1, initialPosition?.z || 0);
        this.world.addBody(this.heroBody);
        this.heroReady = true;
        while (this.pendingPlayersUpdates.length > 0) {
            this.processPlayersUpdate(this.pendingPlayersUpdates.shift()!);
        }
    
        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load('/assets/textures/ground.jpg');
        groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(40, 40); // Adjusted for larger map
        const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture });
        const groundGeometry = new THREE.PlaneGeometry(800, 800); // Increased from 400x400
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        this.scene.add(ground);
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(new CANNON.Plane());
        groundBody.position.set(0, -1, 0);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);
    
        const streetWidth = 10;
        const sidewalkWidth = 3;
        const streetSpacing = 40;
        const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    
        // X-axis streets
        for (let x = -360; x <= 360; x += streetSpacing) {
            if (Math.abs(x) < 80) continue;
            const streetX = new THREE.Mesh(
                new THREE.PlaneGeometry(800, streetWidth),
                streetMaterial
            );
            streetX.rotation.x = -Math.PI / 2;
            streetX.position.set(x, -0.95, 0);
            this.scene.add(streetX);
    
            const sidewalkX1 = new THREE.Mesh(
                new THREE.PlaneGeometry(800, sidewalkWidth),
                sidewalkMaterial
            );
            sidewalkX1.rotation.x = -Math.PI / 2;
            sidewalkX1.position.set(x - streetWidth/2 - sidewalkWidth/2, -0.9, 0);
            this.scene.add(sidewalkX1);
    
            const sidewalkX2 = new THREE.Mesh(
                new THREE.PlaneGeometry(800, sidewalkWidth),
                sidewalkMaterial
            );
            sidewalkX2.rotation.x = -Math.PI / 2;
            sidewalkX2.position.set(x + streetWidth/2 + sidewalkWidth/2, -0.9, 0);
            this.scene.add(sidewalkX2);
        }
    
        // Z-axis streets
        for (let z = -360; z <= 360; z += streetSpacing) {
            if (Math.abs(z) < 80) continue;
            const streetZ = new THREE.Mesh(
                new THREE.PlaneGeometry(streetWidth, 800),
                streetMaterial
            );
            streetZ.rotation.x = -Math.PI / 2;
            streetZ.position.set(0, -0.95, z);
            this.scene.add(streetZ);
    
            const sidewalkZ1 = new THREE.Mesh(
                new THREE.PlaneGeometry(streetWidth, 800),
                sidewalkMaterial
            );
            sidewalkZ1.rotation.x = -Math.PI / 2;
            sidewalkZ1.position.set(0, -0.9, z - streetWidth/2 - sidewalkWidth/2);
            this.scene.add(sidewalkZ1);
    
            const sidewalkZ2 = new THREE.Mesh(
                new THREE.PlaneGeometry(streetWidth, 800),
                sidewalkMaterial
            );
            sidewalkZ2.rotation.x = -Math.PI / 2;
            sidewalkZ2.position.set(0, -0.9, z + streetWidth/2 + sidewalkWidth/2);
            this.scene.add(sidewalkZ2);
        }
    
        // Circular street around lake
        const lakeRingRadius = 80;
        const ringSegments = 32;
        const ringGeometry = new THREE.RingGeometry(lakeRingRadius - streetWidth/2, lakeRingRadius + streetWidth/2, ringSegments);
        const ringStreet = new THREE.Mesh(ringGeometry, streetMaterial);
        ringStreet.rotation.x = -Math.PI / 2;
        ringStreet.position.set(0, -0.95, 0);
        this.scene.add(ringStreet);
    
        const sidewalkInner = new THREE.Mesh(
            new THREE.RingGeometry(lakeRingRadius - streetWidth/2 - sidewalkWidth, lakeRingRadius - streetWidth/2, ringSegments),
            sidewalkMaterial
        );
        sidewalkInner.rotation.x = -Math.PI / 2;
        sidewalkInner.position.set(0, -0.9, 0);
        this.scene.add(sidewalkInner);
    
        const sidewalkOuter = new THREE.Mesh(
            new THREE.RingGeometry(lakeRingRadius + streetWidth/2, lakeRingRadius + streetWidth/2 + sidewalkWidth, ringSegments),
            sidewalkMaterial
        );
        sidewalkOuter.rotation.x = -Math.PI / 2;
        sidewalkOuter.position.set(0, -0.9, 0);
        this.scene.add(sidewalkOuter);
    
        // Lake
        const lakeGeometry = new THREE.CircleGeometry(60, 32);
        const lakeMaterial = new THREE.MeshStandardMaterial({ color: 0x0066cc, side: THREE.DoubleSide });
        const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
        lake.rotation.x = -Math.PI / 2;
        lake.position.set(0, -0.98, 0);
        this.scene.add(lake);
        const lakeBody = new CANNON.Body({ mass: 0 });
        lakeBody.addShape(new CANNON.Cylinder(60, 60, 0.1, 32));
        lakeBody.position.set(0, -1, 0);
        this.world.addBody(lakeBody);
    
        // Elevator
        const elevatorGeometry = new THREE.BoxGeometry(30, 1, 30);
        const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
        const elevatorMesh = new THREE.Mesh(elevatorGeometry, elevatorMaterial);
        elevatorMesh.position.set(100, -0.25, 100);
        this.scene.add(elevatorMesh);
    
        const elevatorBody = new CANNON.Body({ mass: 0 });
        elevatorBody.addShape(new CANNON.Box(new CANNON.Vec3(15, 0.5, 15)));
        elevatorBody.position.set(100, -0.25, 100);
        this.world.addBody(elevatorBody);
        this.elevator = { mesh: elevatorMesh, body: elevatorBody };
    
        // Sky and stars
        const skyGeometry = new THREE.SphereGeometry(1000, 32, 32); // Increased for larger map
        const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x001133, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
        
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 2000; // Increased for larger map
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 2000;
            positions[i * 3 + 1] = Math.random() * 1000;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: true });
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    
        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
        this.scene.add(ambientLight);
        const light1 = new THREE.DirectionalLight(0x8080ff, 0.5);
        light1.position.set(100, 100, 100); // Adjusted for larger map
        light1.castShadow = true;
        this.scene.add(light1);
        const light2 = new THREE.DirectionalLight(0x8080ff, 0.3);
        light2.position.set(-100, 80, -100);
        this.scene.add(light2);
        const light3 = new THREE.DirectionalLight(0x8080ff, 0.3);
        light3.position.set(0, 90, -150);
        this.scene.add(light3);
    
        const loadModel = (path: string, position: THREE.Vector3, scale: number, rotationY = 0): Promise<THREE.Object3D> => {
            return new Promise((resolve) => {
                gltfLoader.load(path, (gltf) => {
                    const model = gltf.scene;
                    model.scale.set(scale, scale, scale);
                    model.rotation.y = rotationY;
                    const bbox = new THREE.Box3().setFromObject(model);
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    model.position.copy(position);
                    model.position.y = -1;
                    this.scene.add(model);
    
                    const body = new CANNON.Body({ mass: 0 });
                    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
                    body.position.copy(model.position);
                    body.quaternion.copy(model.quaternion);
                    this.world.addBody(body);
                    this.buildings.push({ mesh: model, body });
    
                    resolve(model);
                });
            });
        };
    
        const skyscrapers = ["skyscraperA.glb", "skyscraperB.glb", "skyscraperC.glb", "skyscraperD.glb", "skyscraperE.glb", "skyscraperF.glb"];
        const largeBuildings = ["large_buildingA.glb", "large_buildingB.glb", "large_buildingC.glb", "large_buildingD.glb", "large_buildingE.glb", "large_buildingF.glb", "large_buildingG.glb"];
        const lowBuildings = ["low_buildingA.glb", "low_buildingB.glb", "low_buildingC.glb", "low_buildingD.glb", "low_buildingE.glb", "low_buildingF.glb", "low_buildingG.glb", "low_buildingH.glb", "low_buildingI.glb", "low_buildingJ.glb", "low_buildingK.glb", "low_buildingL.glb", "low_buildingM.glb", "low_buildingN.glb", "low_wideA.glb", "low_wideB.glb"];
        const details = ["detail_awning.glb", "detail_awningWide.glb", "detail_overhang.glb", "detail_overhangWide.glb", "detail_umbrella.glb", "detail_umbrellaDetailed.glb"];
        const cars = ["ambulance.glb", "box.glb", "cone-flat.glb", "cone.glb", "delivery-flat.glb", "delivery.glb", "firetruck.glb", "garbage-truck.glb", "hatchback-sports.glb", "police.glb", "race-future.glb", "race.glb", "sedan-sports.glb", "sedan.glb", "suv-luxury.glb", "suv.glb", "taxi.glb", "tractor-police.glb", "tractor-shovel.glb", "tractor.glb", "truck-flat.glb", "truck.glb", "van.glb"];
    
        const downtownRadius = 100;
        const midtownRadius = 600; // Increased from 300 (10x spread: 140 * 10 = 1400, constrained to 600)
    
        // Downtown - Skyscrapers
        for (let i = 0; i < 12; i++) {
            const model = skyscrapers[Math.floor(Math.random() * skyscrapers.length)];
            const angle = (i / 12) * Math.PI * 2;
            const radius = 70 + Math.random() * 30;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const snappedX = Math.round(x / streetSpacing) * streetSpacing + (streetWidth + sidewalkWidth);
            const snappedZ = Math.round(z / streetSpacing) * streetSpacing + (streetWidth + sidewalkWidth);
            
            const skyscraper = await loadModel(
                `/assets/models/${model}`,
                new THREE.Vector3(snappedX, 0, snappedZ),
                30,
                Math.random() * Math.PI * 2
            );
    
            if (i === 0) {
                const videoTexture = new THREE.VideoTexture(video);
                videoTexture.minFilter = THREE.LinearFilter;
                videoTexture.magFilter = THREE.LinearFilter;
                const screenMaterial = new THREE.MeshBasicMaterial({ map: videoTexture });
                const screenGeometry = new THREE.PlaneGeometry(10, 5);
                const screen = new THREE.Mesh(screenGeometry, screenMaterial);
                screen.position.set(snappedX, 15, snappedZ + 5);
                screen.rotation.y = Math.random() * Math.PI * 2;
                this.scene.add(screen);
            }
        }
    
        // Midtown - Large buildings (10x more spread)
        for (let i = 0; i < 8; i++) { // Reduced from 10 for extreme spacing
            const model = largeBuildings[Math.floor(Math.random() * largeBuildings.length)];
            const angle = Math.random() * Math.PI * 2;
            const radius = 110 + Math.random() * 490; // 110-600 units (10x wider: 70 * 10 = 700, adjusted to 600)
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const snappedX = Math.round(x / streetSpacing) * streetSpacing + (streetWidth + sidewalkWidth);
            const snappedZ = Math.round(z / streetSpacing) * streetSpacing + (streetWidth + sidewalkWidth);
            
            await loadModel(
                `/assets/models/${model}`,
                new THREE.Vector3(snappedX, 0, snappedZ),
                15,
                Math.round(Math.random() * 4) * (Math.PI / 2)
            );
        }
    
        // Outskirts - Smaller buildings
        for (let i = 0; i < 25; i++) {
            const model = lowBuildings[Math.floor(Math.random() * lowBuildings.length)];
            const angle = Math.random() * Math.PI * 2;
            const radius = midtownRadius + Math.random() * (360 - midtownRadius);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const snappedX = Math.round(x / streetSpacing) * streetSpacing + (streetWidth + sidewalkWidth);
            const snappedZ = Math.round(z / streetSpacing) * streetSpacing + (streetWidth + sidewalkWidth);
            
            await loadModel(
                `/assets/models/${model}`,
                new THREE.Vector3(snappedX, 0, snappedZ),
                10,
                Math.random() * Math.PI * 2
            );
        }
    
        // Small towns outside city
        const townCenters = [
            { x: -300, z: -300 }, { x: 300, z: -300 },
            { x: -300, z: 300 }, { x: 300, z: 300 }
        ];
        for (const center of townCenters) {
            for (let i = 0; i < 5; i++) {
                const model = lowBuildings[Math.floor(Math.random() * lowBuildings.length)];
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 40;
                const x = center.x + Math.cos(angle) * radius;
                const z = center.z + Math.sin(angle) * radius;
                await loadModel(
                    `/assets/models/${model}`,
                    new THREE.Vector3(x, 0, z),
                    8, // Slightly smaller than outskirts
                    Math.random() * Math.PI * 2
                );
            }
        }
    
        const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    
        // Trees around lake
        for (let i = 0; i < 40; i++) { // Increased from 30
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.3, 3),
                treeMaterial
            );
            const foliage = new THREE.Mesh(
                new THREE.SphereGeometry(2, 12, 12),
                treeMaterial
            );
            const angle = (i / 40) * Math.PI * 2;
            const radius = 65 + Math.random() * 5;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            trunk.position.set(x, 1, z);
            foliage.position.set(x, 2.5, z);
            this.scene.add(trunk, foliage);
        }
    
        // Additional scattered trees (more)
        for (let i = 0; i < 100; i++) { // Increased from 50
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.3, 3),
                treeMaterial
            );
            const foliage = new THREE.Mesh(
                new THREE.SphereGeometry(2, 12, 12),
                treeMaterial
            );
            const x = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            const z = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            if (Math.sqrt(x*x + z*z) > 80) {
                trunk.position.set(x, 1, z);
                foliage.position.set(x, 2.5, z);
                this.scene.add(trunk, foliage);
            }
        }
    
        // Street lights
        for (let i = 0; i < 20; i++) {
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.15, 6),
                lightMaterial
            );
            const lamp = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 12, 12),
                new THREE.MeshStandardMaterial({ color: 0xffff99, emissive: 0xffff99 })
            );
            const x = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            const z = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            if (Math.sqrt(x*x + z*z) > 80) {
                pole.position.set(x, 2.5, z);
                lamp.position.set(x, 3, z);
                this.scene.add(pole, lamp);
                const pointLight = new THREE.PointLight(0xffff99, 0.8, 30);
                pointLight.position.copy(lamp.position);
                this.scene.add(pointLight);
            }
        }
    
        // Urban details
        for (let i = 0; i < 80; i++) {
            const model = details[Math.floor(Math.random() * details.length)];
            const x = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            const z = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            if (Math.sqrt(x*x + z*z) > 80) {
                await loadModel(
                    `/assets/models/${model}`,
                    new THREE.Vector3(x, 0, z),
                    3,
                    Math.random() * Math.PI * 2
                );
            }
        }
    
        // Cars along streets
        for (let i = 0; i < 15; i++) {
            const carModel = cars[Math.floor(Math.random() * cars.length)];
            const isXStreet = Math.random() > 0.5;
            let x, z, rotationY;
            if (isXStreet) {
                x = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing;
                z = Math.round((Math.random() * 8 - 4)) + (Math.random() > 0.5 ? streetSpacing : -streetSpacing);
                rotationY = Math.PI / 2;
            } else {
                x = Math.round((Math.random() * 8 - 4)) + (Math.random() > 0.5 ? streetSpacing : -streetSpacing);
                z = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing;
                rotationY = 0;
            }
            if (Math.sqrt(x*x + z*z) > 80) {
                await loadModel(`/assets/cars/${carModel}`, 
                    new THREE.Vector3(x, 0, z), 
                    3.2,
                    rotationY + (Math.random() > 0.5 ? Math.PI : 0)
                ).then((car) => {
                    car.position.y = 0;
                });
            }
        }
    
        // Cars on circular street around lake
        for (let i = 0; i < 8; i++) {
            const carModel = cars[Math.floor(Math.random() * cars.length)];
            const angle = (i / 8) * Math.PI * 2;
            const x = Math.cos(angle) * lakeRingRadius;
            const z = Math.sin(angle) * lakeRingRadius;
            const rotationY = angle + Math.PI / 2; // Tangent to circle
            await loadModel(`/assets/cars/${carModel}`, 
                new THREE.Vector3(x, 0, z), 
                3.2,
                rotationY + (Math.random() > 0.5 ? Math.PI : 0)
            ).then((car) => {
                car.position.y = 0;
            });
        }
    
        // Video plane
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        const screenMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
        const screenGeometry = new THREE.PlaneGeometry(100, 50);
        this.videoPlane = new THREE.Mesh(screenGeometry, screenMaterial);
        this.videoPlane.position.set(250, 15, 5); // Adjusted for larger map
        this.scene.add(this.videoPlane);
    
        // Ammo pickups
        const ammoMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
        for (let i = 0; i < 40; i++) {
            const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ammoMaterial);
            const x = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            const z = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            if (Math.sqrt(x*x + z*z) > 80) {
                ammoBox.position.set(x, 0.5, z);
                this.scene.add(ammoBox);
                const ammoBody = new CANNON.Body({ mass: 0 });
                ammoBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
                ammoBody.position.copy(ammoBox.position);
                this.world.addBody(ammoBody);
                this.ammoPickups.push({ mesh: ammoBox, body: ammoBody });
            }
        }
    
        // Thunder boosts
        const thunderGeometry = new THREE.ConeGeometry(0.5, 2, 8);
        const thunderMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.5 
        });
        for (let i = 0; i < 50; i++) {
            const thunder = new THREE.Mesh(thunderGeometry, thunderMaterial);
            const x = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            const z = Math.round((Math.random() * 720 - 360) / streetSpacing) * streetSpacing + (streetWidth/2 + sidewalkWidth/2);
            if (Math.sqrt(x*x + z*z) > 80) {
                thunder.position.set(x, 1, z);
                this.scene.add(thunder);
    
                const thunderBody = new CANNON.Body({ mass: 0 });
                thunderBody.addShape(new CANNON.Cylinder(0.5, 0.5, 2, 8));
                thunderBody.position.copy(thunder.position);
                this.world.addBody(thunderBody);
                this.thunderBoosts.push({ mesh: thunder, body: thunderBody });
            }
        }
    
        // Borders
        const borderMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const borders = [
            { size: [3, 50, 800], pos: [-400, 25, 0] },
            { size: [3, 50, 800], pos: [400, 25, 0] },
            { size: [800, 50, 3], pos: [0, 25, 400] },
            { size: [800, 50, 3], pos: [0, 25, -400] },
        ];
        borders.forEach(({ size, pos }) => {
            const border = new THREE.Mesh(new THREE.BoxGeometry(...size), borderMaterial);
            border.position.set(...pos);
            border.visible = false;
            this.scene.add(border);
            const borderBody = new CANNON.Body({ mass: 0 });
            borderBody.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
            borderBody.position.copy(border.position);
            this.world.addBody(borderBody);
        });
    
        this.elevatorHeight = 80;
        this.camera.position.set(0, 4, -15);

    }
    private updateOtherPlayer(socketId: string, player: PlayerData): void {
        if (socketId === this.socket.id) {
            console.warn(`Attempted to update local player ${socketId} as other player - skipping`);
            return;
        }
        if (this.otherPlayers.has(socketId) || this.loadingPlayers.has(socketId)) {
            this.updateOtherPlayerPosition(socketId, player);
            return;
        }

        console.log(`Adding new player: ${socketId}`);
        this.loadingPlayers.add(socketId);
        const gltfLoader = new GLTFLoader();
        gltfLoader.load(`/assets/characters/${player.avatar || 'character-male-a.glb'}`, (gltf) => {
            const mesh = gltf.scene;
            mesh.scale.set(2, 2, 2);
            mesh.rotation.set(0, 0, 0);
            this.scene.add(mesh);

            const textGeometry = new THREE.PlaneGeometry(2, 0.5);
            const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
            const nameTag = new THREE.Mesh(textGeometry, textMaterial);
            nameTag.position.y = 5;
            nameTag.userData = { name: player.name };
            mesh.add(nameTag);

            const healthBarGeometry = new THREE.PlaneGeometry(2, 0.2);
            const healthBarMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
            healthBar.position.y = 4.4;
            mesh.add(healthBar);

            this.otherPlayers.set(socketId, { mesh, nameTag, healthBar });
            this.loadingPlayers.delete(socketId);
            this.updateOtherPlayerPosition(socketId, player);
        });

        
    }

    private updateOtherPlayerPosition(socketId: string, player: PlayerData): void {
        const playerObj = this.otherPlayers.get(socketId);
        if (playerObj) {
            playerObj.mesh.position.set(player.position.x, player.position.y, player.position.z);
            playerObj.mesh.rotation.y = player.rotation.y;
            const hitPercentage = 1 - (player.hits / 3);
            playerObj.healthBar.scale.x = hitPercentage;
            playerObj.healthBar.material.color.setHSL(hitPercentage * 0.33, 1, 0.5);
        }
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());

        if (!this.isPaused && this.roomId) {
            this.world.step(1 / 60);

            if (this.elevator) {
                this.elevatorTimer += 16.67;
                let targetY: number;
                let progress: number;

                switch (this.elevatorState) {
                    case "ground":
                        if (this.elevatorTimer >= this.elevatorWaitTime) {
                            this.elevatorState = "rising";
                            this.elevatorTimer = 0;
                        }
                        break;
                    case "rising":
                        progress = Math.min(this.elevatorTimer / this.elevatorTravelTime, 1);
                        targetY = this.elevatorStartY + (this.elevatorHeight - this.elevatorStartY) * progress;
                        this.elevator.mesh.position.y = targetY;
                        this.elevator.body.position.y = targetY;
                        if (progress === 1) {
                            this.elevatorState = "top";
                            this.elevatorTimer = 0;
                        }
                        break;
                    case "top":
                        if (this.elevatorTimer >= this.elevatorWaitTime) {
                            this.elevatorState = "falling";
                            this.elevatorTimer = 0;
                        }
                        break;
                    case "falling":
                        progress = Math.min(this.elevatorTimer / this.elevatorTravelTime, 1);
                        targetY = this.elevatorHeight - (this.elevatorHeight - this.elevatorStartY) * progress;
                        this.elevator.mesh.position.y = targetY;
                        this.elevator.body.position.y = targetY;
                        if (progress === 1) {
                            this.elevatorState = "ground";
                            this.elevatorTimer = 0;
                        }
                        break;
                }

                const heroBox = new THREE.Box3().setFromObject(this.hero);
                const elevatorBox = new THREE.Box3().setFromObject(this.elevator.mesh);
                if (heroBox.intersectsBox(elevatorBox) && this.hero.position.y <= this.elevator.mesh.position.y + 0.5) {
                    this.heroBody.position.y = this.elevator.body.position.y + 2;
                    this.hero.position.y = this.elevator.mesh.position.y + 2;
                }
            }

            this.hero.position.copy(this.heroBody.position);
            this.hero.rotation.y = this.camera.rotation.y;

            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            forward.y = 0;
            forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            right.y = 0;
            right.normalize();

            const SPEED = this.speedBoostActive ? this.boostSpeed : this.normalSpeed;
            let fSpeed = 0;
            let sSpeed = 0;
            if (this.moveForward) fSpeed = SPEED;
            if (this.moveBackward) fSpeed = -SPEED;
            if (this.moveRight) sSpeed = SPEED;
            if (this.moveLeft) sSpeed = -SPEED;

            const velocity = this.heroBody.velocity;
            if (this.jump && Math.abs(velocity.y) < 0.1) {
                velocity.y = 3.5;
                this.jump = false;
            }
            this.heroBody.velocity.set(forward.x * fSpeed + right.x * sSpeed, velocity.y, forward.z * fSpeed + right.z * sSpeed);

            this.camera.position.copy(this.hero.position).add(new THREE.Vector3(0, 2, 0));
            this.camera.rotation.order = "YXZ";
            this.camera.rotation.set(this.mouseY, this.mouseX, 0);

            this.socket.emit("updatePosition", {
                position: this.hero.position,
                rotation: { x: this.camera.rotation.x, y: this.camera.rotation.y, z: this.camera.rotation.z },
            });

            this.bullets.forEach((bullet, bulletIndex) => {
                bullet.mesh.position.copy(bullet.body.position);
                bullet.mesh.quaternion.copy(bullet.body.quaternion);

                const heroDistance = bullet.mesh.position.distanceTo(this.hero.position);
                if (bullet.owner !== this.socket.id && heroDistance < 2) {
                    this.socket.emit("playerHit", { targetSocketId: this.socket.id });
                    this.createSpark(this.hero.position);
                    this.scene.remove(bullet.mesh);
                    this.world.removeBody(bullet.body);
                    this.bullets.splice(bulletIndex, 1);
                    return;
                }

                this.otherPlayers.forEach((playerObj, socketId) => {
                    if (bullet.owner !== socketId) {
                        const distance = bullet.mesh.position.distanceTo(playerObj.mesh.position);
                        if (distance < 2) {
                            this.socket.emit("playerHit", { targetSocketId: socketId });
                            this.createSpark(playerObj.mesh.position);
                            this.scene.remove(bullet.mesh);
                            this.world.removeBody(bullet.body);
                            this.bullets.splice(bulletIndex, 1);
                        }
                    }
                });
            });

            this.ammoPickups.forEach((pickup, index) => {
                const distance = this.hero.position.distanceTo(pickup.mesh.position);
                if (distance < 3) {
                    this.ammo += 10;
                    this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
                    this.updateAmmoWarning();
                    this.scene.remove(pickup.mesh);
                    this.world.removeBody(pickup.body);
                    this.ammoPickups.splice(index, 1);
                }
            });

            this.thunderBoosts.forEach((boost, index) => {
                const distance = this.hero.position.distanceTo(boost.mesh.position);
                if (distance < 3) {
                    this.scene.remove(boost.mesh);
                    this.world.removeBody(boost.body);
                    this.thunderBoosts.splice(index, 1);

                    this.speedBoostActive = true;
                    if (this.boostTimeout) clearTimeout(this.boostTimeout);
                    this.boostTimeout = setTimeout(() => {
                        this.speedBoostActive = false;
                        this.speedBoostCounter.textContent = "Speed Boost: Inactive";
                    }, this.boostDuration);
                    this.speedBoostCounter.textContent = `Speed Boost: Active (${this.boostDuration / 1000}s)`;
                }
            });

            this.sparks.forEach((spark, index) => {
                spark.lifetime -= 16.67;
                if (spark.lifetime <= 0) {
                    this.scene.remove(spark.mesh);
                    this.sparks.splice(index, 1);
                } else {
                    spark.mesh.scale.multiplyScalar(0.95);
                }
            });

            if (this.ammo <= 0) {
                this.blinkTimer += 16.67;
                if (this.blinkTimer >= this.blinkInterval) {
                    this.ammoWarning.style.visibility = this.ammoWarning.style.visibility === "hidden" ? "visible" : "hidden";
                    this.blinkTimer = 0;
                }
            } else {
                this.ammoWarning.style.visibility = "visible";
            }

            this.renderer.render(this.scene, this.camera);
        }
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new App();
});