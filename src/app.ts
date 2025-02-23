import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js"; // Add this import
import * as CANNON from "cannon-es";
import { io, Socket } from "socket.io-client";
const seedrandom = require('seedrandom');

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

interface Bot {
    id: string;
    mesh: THREE.Object3D;
    body: CANNON.Body;
    healthBar: THREE.Group;
    difficulty: 'easy' | 'medium' | 'hard';
    shootTimer: number;
    fleeTimer: number;
    ammo: number;
    health: number;
    lives: number;
    hits: number;
}

class App {
    private socket: Socket = io("http://localhost:3000");
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    private miniMapCamera!: THREE.OrthographicCamera;
    private renderer!: THREE.WebGLRenderer;
    private world: CANNON.World = new CANNON.World();
    private canvas!: HTMLCanvasElement;
    private hero!: THREE.Object3D;
    private heroBody!: CANNON.Body;
    private otherPlayers: Map<string, { mesh: THREE.Object3D; healthBar: THREE.Group }> = new Map();
    private bots: Map<string, Bot> = new Map();
    private isLoadingBots: boolean = false;
    private levelCounter!: HTMLElement;
    private ammoPickups: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private thunderBoosts: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private bullets: { mesh: THREE.Mesh; body: CANNON.Body; owner: string }[] = [];
    private sparks: { mesh: THREE.Mesh; lifetime: number }[] = [];
    private buildings: { mesh: THREE.Object3D; body: CANNON.Body }[] = [];
    private noise: SimplexNoise; // Will be initialized with seed in setupSocketEvents
    private rng: () => number = Math.random; // Seeded RNG function
    private streetXPositions: number[] = [];
    private streetZPositions: number[] = [];
    private ammo: number = 5000;
    private lives: number = 5;
    private health: number = 100;
    private hits: number = 0;
    private moveForward: boolean = false;
    private moveBackward: boolean = false;
    private moveRight: boolean = false;
    private moveLeft: boolean = false;
    private jump: boolean = false;
    private isPaused: boolean = false;
    private isSinglePlayer: boolean = false;
    private level: number = 1;
    private difficulty: 'easy' | 'medium' | 'hard' = 'easy';
    private ammoCounter!: HTMLElement;
    private speedBoostCounter!: HTMLElement;
    private livesCounter!: HTMLElement;
    private healthCounter!: HTMLElement;
    private ammoWarning!: HTMLElement;
    private pauseMenu!: HTMLElement;
    private lobby!: HTMLElement;
    private lobbyTitle!: HTMLElement;
    private hud!: HTMLElement;
    private resumeButton!: HTMLElement;
    private joinButton!: HTMLElement;
    private singlePlayerButton!: HTMLElement;
    private readyButton!: HTMLButtonElement;
    private usernameInput!: HTMLInputElement;
    private lobbyStatus!: HTMLElement;
    private countdown!: HTMLElement;
    private characterSelection!: HTMLElement;
    private characterPreview!: HTMLElement;
    private characterOptions!: HTMLElement;
    private difficultySelection!: HTMLElement;
    private mouseX: number = 0;
    private mouseY: number = 0;
    private videoPlane!: THREE.Mesh;
    private speedBoostActive: boolean = false;
    private normalSpeed: number = 20;
    private boostSpeed: number = 80;
    private boostDuration: number = 5000;
    private boostTimeout: NodeJS.Timeout | null = null;
    private roomId: string | null = null;
    private playerId: number | null = null;
    private playerName: string | null = null;
    private selectedCharacter: string = "character-male-a.glb";
    private isReady: boolean = false;
    private blinkTimer: number = 0;
    private blinkInterval: number = 500;
    private elevator!: { mesh: THREE.Mesh; body: CANNON.Body };
    private elevatorHeight: number = 80;
    private elevatorState: "ground" | "rising" | "top" | "falling" = "ground";
    private elevatorTimer: number = 0;
    private elevatorWaitTime: number = 5000;
    private elevatorTravelTime: number = 3000;
    private elevatorStartY: number = -0.25;
    private heroReady: boolean = false;
    private pendingPlayersUpdates: Array<{ [socketId: string]: PlayerData }> = [];
    private lastPlayersUpdateTimestamp: number = 0;
    private debounceInterval: number = 100;
    private loadingPlayers: Set<string> = new Set();
    private cameraMode: 'pov' | 'top' | 'front' | 'map' = 'pov';
    private cameraModes: ('pov' | 'top' | 'front' | 'map')[] = ['pov', 'top', 'front', 'map'];
    private cameraModeIndex: number = 0;
    private characterPreviewScene!: THREE.Scene;
    private characterPreviewCamera!: THREE.PerspectiveCamera;
    private characterPreviewRenderer!: THREE.WebGLRenderer;
    private characterPreviewModel!: THREE.Object3D | null;
    private previewAnimationFrameId: number | null = null;
    private characters: string[] = [
        "character-male-a.glb", "character-male-b.glb", "character-male-c.glb",
        "character-male-d.glb", "character-male-e.glb", "character-male-f.glb",
        "character-female-a.glb", "character-female-b.glb", "character-female-c.glb",
        "character-female-d.glb", "character-female-e.glb", "character-female-f.glb"
    ];
    private currentCharacterIndex: number = 0;
    private currentScreen: 'username' | 'character' | 'difficulty' = 'username';
    private portal!: { mesh: THREE.Mesh; body: CANNON.Body; particles: THREE.Points };
    private secondaryWorldActive: boolean = false;
    private secondaryWorldScene!: THREE.Scene;
    private secondaryWorldPickups: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private returnPortal!: { mesh: THREE.Mesh; body: CANNON.Body; particles: THREE.Points };

    constructor() {
        this.initialize();
        this.miniMapCamera = new THREE.OrthographicCamera(-400, 400, 400, -400, 1, 1000);
        this.miniMapCamera.position.set(0, 200, 0);
        this.miniMapCamera.lookAt(0, 0, 0);
        this.levelCounter = document.getElementById("levelCounter") as HTMLElement;
        if (this.levelCounter) this.levelCounter.textContent = `Level: ${this.level}`;
    }

    private initialize(): void {
        const init = () => {
            this.canvas = this.getCanvas();
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.world.gravity.set(0, -20, 0);

            this.assignDomElements();
            this.setupCharacterPreview();
            this.lobby.style.display = "block";

            this.setupSocketEvents();
            this.setupInput();
            this.handleResize();
            window.addEventListener('resize', () => this.handleResize());

            this.loadCharacterPreview(this.characters[this.currentCharacterIndex]);
        };

        if (document.readyState === "complete" || document.readyState === "interactive") {
            init();
        } else {
            window.addEventListener("DOMContentLoaded", init);
        }
    }

    private getCanvas(): HTMLCanvasElement {
        const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
        if (!canvas) throw new Error("Canvas element not found");
        return canvas;
    }

    private assignDomElements(): void {
        this.ammoCounter = document.getElementById("ammoCounter") as HTMLElement;
        this.speedBoostCounter = document.getElementById("speedBoostCounter") as HTMLElement;
        this.livesCounter = document.getElementById("livesCounter") as HTMLElement;
        this.healthCounter = document.getElementById("healthCounter") as HTMLElement;
        this.levelCounter = document.getElementById("levelCounter") as HTMLElement;
        this.ammoWarning = document.getElementById("ammoWarning") as HTMLElement;
        this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
        this.lobby = document.getElementById("lobby") as HTMLElement;
        this.lobbyTitle = document.getElementById("lobbyTitle") as HTMLElement;
        this.resumeButton = document.getElementById("resumeButton") as HTMLElement;
        this.joinButton = document.getElementById("joinButton") as HTMLElement;
        this.singlePlayerButton = document.getElementById("singlePlayerButton") as HTMLElement;
        this.readyButton = document.getElementById("readyButton") as HTMLButtonElement;
        this.usernameInput = document.getElementById("usernameInput") as HTMLInputElement;
        this.lobbyStatus = document.getElementById("lobbyStatus") as HTMLElement;
        this.countdown = document.getElementById("countdown") as HTMLElement;
        this.characterSelection = document.getElementById("characterSelection") as HTMLElement;
        this.characterPreview = document.getElementById("characterPreviewCanvas") as HTMLElement;
        this.difficultySelection = document.getElementById("difficultySelection") as HTMLElement;
        this.hud = document.getElementById("hud") as HTMLElement;
    }

    private setupCharacterPreview(): void {
        this.characterPreviewScene = new THREE.Scene();
        this.characterPreviewCamera = new THREE.PerspectiveCamera(75, 300 / 300, 0.1, 1000);
        this.characterPreviewCamera.position.set(0, 2, 5);
        this.characterPreviewCamera.lookAt(0, 1, 0);

        this.characterPreviewRenderer = new THREE.WebGLRenderer({
            canvas: document.getElementById("characterPreviewCanvas") as HTMLCanvasElement,
            antialias: true,
        });
        this.characterPreviewRenderer.setSize(300, 300);
        this.characterPreviewRenderer.setClearColor(0x333333, 1);

// Existing lighting - let's enhance it
const ambientLight = new THREE.AmbientLight(0x606080, 3.0); // Increased intensity from 2.0 to 3.0, slightly bluer tone
this.scene.add(ambientLight);

const light1 = new THREE.DirectionalLight(0x8080ff, 1.5); // Increased intensity from 1.0 to 1.5
light1.position.set(100, 100, 100);
light1.castShadow = true;
light1.shadow.mapSize.width = 1024;  // Improve shadow quality
light1.shadow.mapSize.height = 1024;
light1.shadow.camera.near = 0.5;
light1.shadow.camera.far = 500;
this.scene.add(light1);

const light2 = new THREE.DirectionalLight(0x8080ff, 1.0); // Increased from 0.5 to 1.0
light2.position.set(-100, 100, -100);
this.scene.add(light2);

// Add a soft hemisphere light for natural ambient effect
const hemiLight = new THREE.HemisphereLight(0x8080ff, 0x404060, 0.6); // Sky color, ground color, intensity
hemiLight.position.set(0, 200, 0);
this.scene.add(hemiLight);

// Add point lights for dynamic ambient glow (e.g., street lamps or city glow)
const pointLight1 = new THREE.PointLight(0xffffaa, 1.0, 200); // Warm yellowish light
pointLight1.position.set(50, 20, 50);
this.scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0xffffaa, 1.0, 200);
pointLight2.position.set(-50, 20, -50);
this.scene.add(pointLight2);

// Optional: Add subtle fog to enhance lighting depth (adjust as needed)
this.scene.fog = new THREE.Fog(0x001133, 100, 1000); // Matches sky color, starts at 100, fades to 1000

    }

    private loadCharacterPreview(modelPath: string): void {
        const gltfLoader = new GLTFLoader();
        if (this.characterPreviewModel) {
            this.characterPreviewScene.remove(this.characterPreviewModel);
        }
        this.stopCharacterPreviewAnimation();

        gltfLoader.load(`/assets/characters/${modelPath}`, (gltf) => {
            this.characterPreviewModel = gltf.scene;
            this.characterPreviewModel.scale.set(2.68, 2.68, 2.68);
            this.characterPreviewModel.position.set(0, 0, 0);
            this.characterPreviewScene.add(this.characterPreviewModel);
            this.animateCharacterPreview();
        }, undefined, (error) => {
            console.error(`Error loading character model ${modelPath}:`, error);
        });
    }

    private animateCharacterPreview(): void {
        if (this.characterPreviewModel) {
            this.characterPreviewModel.rotation.y += 0.02;
            this.characterPreviewRenderer.render(this.characterPreviewScene, this.characterPreviewCamera);
            this.previewAnimationFrameId = requestAnimationFrame(() => this.animateCharacterPreview());
        }
    }

    private stopCharacterPreviewAnimation(): void {
        if (this.previewAnimationFrameId !== null) {
            cancelAnimationFrame(this.previewAnimationFrameId);
            this.previewAnimationFrameId = null;
        }
    }

    private setupSocketEvents(): void {
        this.joinButton.addEventListener("click", () => this.startLobby('multiplayer'));
        this.singlePlayerButton.addEventListener("click", () => this.startLobby('singleplayer'));

        this.readyButton.addEventListener("click", () => {
            if (!this.isReady) {
                if (this.isSinglePlayer) {
                    this.roomId = "singleplayer_" + Date.now();
                    const seededRng = seedrandom(this.roomId);
                    this.rng = () => seededRng(); // Assign to class property
                    this.noise = new SimplexNoise({ random: this.rng }); // Initialize noise with seeded RNG
                    this.characterSelection.style.display = "none";
                    this.difficultySelection.style.display = "none";
                    this.lobbyTitle.textContent = `Starting Single Player - Level ${this.level}`;
                    this.readyButton.style.display = "none";
                    this.isReady = true;
                    this.isPaused = true;
                    this.createScene({ x: 0, y: 2.68, z: 0 }).then(() => {
                        this.createBots();
                        this.lobby.style.display = "none";
                        this.animate();
                    });
                } else {
                    this.socket.emit("login", { name: this.playerName, avatar: this.selectedCharacter });
                }
            }
        });

        this.singlePlayerButton.addEventListener("click", () => {
            const username = this.usernameInput.value.trim();
            if (username) {
                this.playerName = username;
                this.isSinglePlayer = true;
                this.joinButton.style.display = "none";
                this.singlePlayerButton.style.display = "none";
                this.usernameInput.style.display = "none";
                this.characterSelection.style.display = "block";
                this.difficultySelection.style.display = "block";
                this.lobbyTitle.textContent = "Select Your Character and Difficulty";
            }
        });



        this.socket.on("loginSuccess", (data: { roomId: string; playerId: number; name: string; position?: { x: number; y: number; z: number } }) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.playerName = data.name;
            const seededRng = seedrandom(this.roomId); // Create seeded RNG
            this.rng = () => seededRng(); // Assign to class property
            this.noise = new SimplexNoise({ random: this.rng }); // Initialize noise with seeded RNG
            this.characterSelection.style.display = "none";
            this.lobbyTitle.textContent = "Waiting for Players";
            this.readyButton.style.display = "none";
            this.socket.emit("playerReady");
            this.isReady = true;
            this.readyButton.textContent = "Ready (Waiting)";
            this.readyButton.disabled = true;
            this.createScene({ x: data.position?.x || 0, y: 100, z: data.position?.z || 0 }).then(() => this.animate());
        });

        this.socket.on("playersUpdate", (players: { [socketId: string]: PlayerData }) => {
            if (!this.heroReady) {
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
            this.hud.style.display = "flex";
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

        this.socket.on("gameEnded", ({ winnerSocketId }: { winnerSocketId: string }) => {
            this.isPaused = true;
            this.pauseMenu.style.display = "block";
            alert(`Game Over! Winner: ${this.otherPlayers.get(winnerSocketId)?.mesh.userData.name || "Unknown"}`);
            this.resetGameForNewRoom();
        });
    }

    private startLobby(mode: 'multiplayer' | 'singleplayer'): void {
        const username = this.usernameInput.value.trim();
        if (username) {
            this.playerName = username;
            this.isSinglePlayer = mode === 'singleplayer';
            this.currentScreen = 'character';
            this.joinButton.style.display = "none";
            this.singlePlayerButton.style.display = "none";
            this.usernameInput.style.display = "none";
            this.characterSelection.style.display = "block";
            this.lobbyTitle.textContent = "Select Your Character";
        }
    }

// Add this property to the class (near other private properties, around line 50)
private playerStatsCache: Map<string, { health: number; lives: number; ammo: number }> = new Map();

private processPlayersUpdate(players: { [socketId: string]: PlayerData }): void {
    const now = Date.now();
    if (now - this.lastPlayersUpdateTimestamp < this.debounceInterval) return;
    this.lastPlayersUpdateTimestamp = now;

    Object.entries(players).forEach(([socketId, player]) => {
        const cacheKey = socketId;
        const cachedStats = this.playerStatsCache.get(cacheKey) || { health: -1, lives: -1, ammo: -1 };
        const newStats = {
            health: player.health,
            lives: player.lives,
            ammo: player.ammo || 50
        };

        // Only update if stats have changed
        if (cachedStats.health !== newStats.health || cachedStats.lives !== newStats.lives || cachedStats.ammo !== newStats.ammo) {
            this.playerStatsCache.set(cacheKey, newStats);

            if (socketId === this.socket.id) {
                this.lives = player.lives;
                this.health = player.health;
                this.ammo = player.ammo;
                this.hits = player.hits;
                this.livesCounter.textContent = `Lives: ${this.lives}`;
                this.healthCounter.textContent = `Health: ${this.health}`;
                this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
                this.updateAmmoWarning();
                this.updateIndicators(this.hero, this.health, this.lives, this.ammo);
            } else {
                this.updateOtherPlayer(socketId, player);
                const playerObj = this.otherPlayers.get(socketId);
                if (playerObj) {
                    this.updateIndicators(playerObj.mesh, player.health, player.lives, player.ammo || 50);
                }
            }
        }
    });
}

    private createBots(): void {
        if (this.isLoadingBots) return;
        this.isLoadingBots = true;

        const gltfLoader = new GLTFLoader();
        const botCount = this.level;
        console.log(`Creating ${botCount} bots for Level ${this.level}`);

        this.bots.forEach((bot) => {
            this.scene.remove(bot.mesh);
            this.world.removeBody(bot.body);
        });
        this.bots.clear();

        let botsLoaded = 0;

        for (let i = 0; i < botCount; i++) {
            const botId = `bot_${i}_${Date.now()}`;
            let x, z;
            let attempts = 0;
            do {
                x = (this.rng() - 0.5) * 800;
                z = (this.rng() - 0.5) * 800;
                attempts++;
            } while (!this.isPositionClear(new THREE.Vector3(x, 0, z), 10) && attempts < 100);

            if (attempts >= 100) {
                console.warn(`Could not find clear position for bot ${botId}`);
                x = (this.rng() - 0.5) * 800;
                z = (this.rng() - 0.5) * 800;
            }

            const difficulty = ['easy', 'medium', 'hard'][Math.floor(this.rng() * 3)] as 'easy' | 'medium' | 'hard';
            gltfLoader.load('/assets/characters/character-male-a.glb', (gltf) => {
                const mesh = gltf.scene;
                mesh.scale.set(2.68, 2.68, 2.68);
                mesh.position.set(x, 0, z);
                this.scene.add(mesh);
                console.log(`Bot ${botId} mesh added at position: ${x}, 0, ${z}`);

                const body = new CANNON.Body({ mass: 1 });
                body.addShape(new CANNON.Box(new CANNON.Vec3(0.5 * 2.68, 1 * 2.68, 0.5 * 2.68)));
                body.position.set(x, 0, z);
                this.world.addBody(body);

                const healthBar = new THREE.Group();
                for (let j = 0; j < 5; j++) {
                    const dotGeometry = new THREE.CircleGeometry(0.2, 16);
                    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
                    dot.position.set((j - 2) * 0.5, 2.33, 0);
                    healthBar.add(dot);
                }
                mesh.add(healthBar);

                if (!this.bots.has(botId)) {
                    this.bots.set(botId, {
                        id: botId,
                        mesh,
                        body,
                        healthBar,
                        difficulty,
                        shootTimer: this.rng() * 3000,
                        fleeTimer: this.rng() * 5000,
                        ammo: 50,
                        health: 100,
                        lives: 5,
                        hits: 0
                    });
                }

                this.updateIndicators(mesh, 100, 5, 50);

                botsLoaded++;
                if (botsLoaded === botCount) {
                    console.log(`All ${botCount} bots loaded for Level ${this.level}`);
                    this.isPaused = false;
                    this.isLoadingBots = false;
                }
            });
        }
    }

    private isPositionClear(pos: THREE.Vector3, minDistance: number): boolean {
        const elevatorHalfSize = 15;
        if (Math.abs(pos.x) < elevatorHalfSize + minDistance && 
            Math.abs(pos.z) < elevatorHalfSize + minDistance) {
            return false;
        }

        for (const building of this.buildings) {
            const distance = pos.distanceTo(building.mesh.position);
            const buildingSize = new THREE.Box3().setFromObject(building.mesh).getSize(new THREE.Vector3());
            if (distance < Math.max(buildingSize.x, buildingSize.z) / 2 + minDistance) return false;
        }
        for (const pickup of this.ammoPickups) {
            if (pos.distanceTo(pickup.mesh.position) < minDistance) return false;
        }
        for (const boost of this.thunderBoosts) {
            if (pos.distanceTo(boost.mesh.position) < minDistance) return false;
        }
        for (const bot of this.bots.values()) {
            if (pos.distanceTo(bot.mesh.position) < minDistance * 2) return false;
        }
        for (const player of this.otherPlayers.values()) {
            if (pos.distanceTo(player.mesh.position) < minDistance) return false;
        }
        if (this.hero && pos.distanceTo(this.hero.position) < minDistance) return false;
        return true;
    }

    private updateBotBehavior(): void {
        this.bots.forEach((bot) => {
            const directionToPlayer = this.hero.position.clone().sub(bot.mesh.position).normalize();
            const distanceToPlayer = bot.mesh.position.distanceTo(this.hero.position);
            const pursuitSpeed = this.normalSpeed;

            bot.fleeTimer += 16.67;
            const fleeDuration = 3000;
            const pursueDuration = 5000;
            const cycleTime = fleeDuration + pursueDuration;

            if (bot.ammo === 0 || (bot.fleeTimer % cycleTime < fleeDuration && distanceToPlayer < 50)) {
                const fleeDirection = bot.ammo === 0 && this.ammoPickups.length > 0
                    ? this.ammoPickups.reduce((closest, pickup) => {
                        const dist = bot.mesh.position.distanceTo(pickup.mesh.position);
                        return dist < closest.dist ? { pos: pickup.mesh.position, dist } : closest;
                    }, { pos: bot.mesh.position, dist: Infinity }).pos.clone().sub(bot.mesh.position).normalize()
                    : directionToPlayer.clone().negate();
                bot.body.velocity.set(
                    fleeDirection.x * pursuitSpeed * 0.8,
                    bot.body.velocity.y,
                    fleeDirection.z * pursuitSpeed * 0.8
                );
            } else if (distanceToPlayer > 10) {
                bot.body.velocity.set(
                    directionToPlayer.x * pursuitSpeed,
                    bot.body.velocity.y,
                    directionToPlayer.z * pursuitSpeed
                );
            } else {
                bot.body.velocity.set(0, bot.body.velocity.y, 0);
            }

            const shootInterval = bot.difficulty === 'easy' ? 3000 : bot.difficulty === 'medium' ? 2000 : 1000;
            bot.shootTimer += 16.67;
            if (bot.shootTimer > shootInterval && distanceToPlayer < 100 && bot.ammo > 0 && distanceToPlayer > 10) {
                const shootDirection = directionToPlayer.clone();
                const accuracy = bot.difficulty === 'easy' ? 0.2 : bot.difficulty === 'medium' ? 0.1 : 0.05;
                shootDirection.add(new THREE.Vector3(
                    (this.rng() - 0.5) * accuracy,
                    (this.rng() - 0.5) * accuracy,
                    (this.rng() - 0.5) * accuracy
                )).normalize();
                this.spawnBullet(bot.mesh.position.clone().add(new THREE.Vector3(0, 6, 0)), shootDirection, bot.id);
                bot.ammo--;
                bot.shootTimer = this.rng() * 1000;
                this.updateIndicators(bot.mesh, bot.health, bot.lives, bot.ammo);
            }

            bot.mesh.position.copy(bot.body.position);
            bot.mesh.rotation.y = Math.atan2(directionToPlayer.x, directionToPlayer.z);
        });

        if (this.isSinglePlayer && this.bots.size === 0 && !this.isLoadingBots) {
            this.level++;
            this.levelCounter.textContent = `Level: ${this.level}`;
            this.lobbyTitle.textContent = `Starting Single Player - Level ${this.level}`;
            this.isPaused = true;
            this.createBots();
        }
    }

    private updateIndicators(character: THREE.Object3D, health: number, lives: number, ammo: number): void {
        const healthBar = character.children.find(child => child instanceof THREE.Group && child.children.length === 5) as THREE.Group;
        if (healthBar) {
            for (let i = 0; i < 5; i++) {
                const dot = healthBar.children[i] as THREE.Mesh;
                if (i < lives) {
                    const healthPerLife = 100 / lives; // Dynamic health per life based on remaining lives
                    const lifeHealth = health - (i * healthPerLife); // Calculate remaining health for this life
                    dot.visible = true;
                    if (lifeHealth > healthPerLife * 0.75) dot.material.color.set(0x00ff00); // Green: >75%
                    else if (lifeHealth > healthPerLife * 0.50) dot.material.color.set(0xffff00); // Yellow: >50%
                    else if (lifeHealth > healthPerLife * 0.25) dot.material.color.set(0xffa500); // Orange: >25%
                    else dot.material.color.set(0xff0000); // Red: ≤25%
                } else {
                    dot.visible = false;
                }
            }
        }
    }

    private setupInput(): void {
        document.addEventListener("keydown", (event) => {
            if (this.currentScreen === 'character') {
                switch (event.key) {
                    case "ArrowLeft":
                        this.currentCharacterIndex = (this.currentCharacterIndex - 1 + this.characters.length) % this.characters.length;
                        this.loadCharacterPreview(this.characters[this.currentCharacterIndex]);
                        break;
                    case "ArrowRight":
                        this.currentCharacterIndex = (this.currentCharacterIndex + 1) % this.characters.length;
                        this.loadCharacterPreview(this.characters[this.currentCharacterIndex]);
                        break;
                    case "Enter":
                        this.selectedCharacter = this.characters[this.currentCharacterIndex];
                        this.currentScreen = 'difficulty';
                        this.characterSelection.style.display = "none";
                        this.difficultySelection.style.display = "block";
                        this.lobbyTitle.textContent = "Select Difficulty";
                        break;
                }
            } else if (this.currentScreen === 'difficulty' && event.key === "Enter") {
                this.readyButton.click();
            }
        });

        const difficultyButtons = Array.from(this.difficultySelection.getElementsByTagName("button"));
        difficultyButtons.forEach(button => {
            if (button.id !== "readyButton") {
                button.addEventListener("click", () => {
                    difficultyButtons.forEach(btn => btn.classList.remove("selected"));
                    button.classList.add("selected");
                    this.difficulty = button.dataset.difficulty as 'easy' | 'medium' | 'hard';
                    this.readyButton.style.display = "block";
                });
            }
        });

        this.canvas.addEventListener("click", () => {
            if (!this.isPaused && this.lobby.style.display === "none" && !document.pointerLockElement) {
                this.canvas.requestPointerLock();
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
                case 67:
                    this.cameraModeIndex = (this.cameraModeIndex + 1) % this.cameraModes.length;
                    this.cameraMode = this.cameraModes[this.cameraModeIndex];
                    break;
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
            this.canvas.requestPointerLock();
        });

        document.addEventListener("mousemove", (event) => {
            if (this.isPaused || !document.pointerLockElement) return;
            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;
            this.mouseX -= movementX * 0.002;
            this.mouseY -= movementY * 0.002;
            this.mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouseY));
        });

        this.canvas.addEventListener("mousedown", () => {
            if (this.isPaused || !document.pointerLockElement || this.ammo <= 0) return;
            this.ammo--;
            this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
            this.updateAmmoWarning();

            const direction = this.camera.getWorldDirection(new THREE.Vector3());
            if (this.isSinglePlayer) {
                this.spawnBullet(this.camera.position, direction, "player");
            } else {
                this.socket.emit("playerShot", {
                    origin: this.camera.position,
                    direction: direction,
                });
                this.spawnBullet(this.camera.position, direction, this.socket.id);
            }
        });
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
        if (this.miniMapCamera) {
            this.miniMapCamera.left = -400;
            this.miniMapCamera.right = 400;
            this.miniMapCamera.top = 400;
            this.miniMapCamera.bottom = -400;
            this.miniMapCamera.updateProjectionMatrix();
        }
        if (this.characterPreviewRenderer) {
            this.characterPreviewRenderer.setSize(300, 300);
        }
    }

    private resetGameForNewRoom(): void {
        this.roomId = null;
        this.isReady = false;
        this.heroReady = false;
        this.isSinglePlayer = false;
        this.level = 1;
        this.pendingPlayersUpdates = [];
        this.loadingPlayers.clear();
        this.hud.style.display = "none";
        this.otherPlayers.forEach((playerObj) => this.scene.remove(playerObj.mesh));
        this.otherPlayers.clear();
        this.bots.forEach((bot) => {
            this.scene.remove(bot.mesh);
            this.world.removeBody(bot.body);
        });
        this.bots.clear();
        this.bullets.forEach(bullet => {
            this.scene.remove(bullet.mesh);
            this.world.removeBody(bullet.body);
        });
        this.bullets = [];
        this.sparks.forEach(spark => this.scene.remove(spark.mesh));
        this.sparks = [];
        this.ammoPickups.forEach(pickup => {
            this.scene.remove(pickup.mesh);
            this.world.removeBody(pickup.body);
        });
        this.ammoPickups = [];
        this.thunderBoosts.forEach(boost => {
            this.scene.remove(boost.mesh);
            this.world.removeBody(boost.body);
        });
        this.thunderBoosts = [];
        this.buildings.forEach(building => {
            this.scene.remove(building.mesh);
            this.world.removeBody(building.body);
        });
        this.buildings = [];
        if (this.hero) this.scene.remove(this.hero);
        if (this.heroBody) this.world.removeBody(this.heroBody);
        this.lobby.style.display = "block";
        this.lobbyTitle.textContent = "Enter Username";
        this.usernameInput.style.display = "block";
        this.joinButton.style.display = "block";
        this.singlePlayerButton.style.display = "block";
        this.readyButton.style.display = "none";
        this.characterSelection.style.display = "none";
        this.difficultySelection.style.display = "none";
        this.readyButton.textContent = "Ready";
        this.readyButton.disabled = false;
        this.pauseMenu.style.display = "none";
        this.cameraMode = 'pov';
        this.cameraModeIndex = 0;
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

    private getNoise(x: number, z: number, scale: number = 0.005): number {
        // Simple fractal noise using SimplexNoise
        const octaves = 4;
        let total = 0;
        let frequency = scale;
        let amplitude = 1;
        let maxValue = 0;
    
        for (let i = 0; i < octaves; i++) {
            total += this.noise.noise(x * frequency, z * frequency) * amplitude; // Changed to .noise
            maxValue += amplitude;
            amplitude *= 0.5; // Persistence
            frequency *= 2;   // Lacunarity
        }
        return total / maxValue * 0.5 + 0.5; // Normalize to [0, 1]
    }

    private async createScene(initialPosition?: { x: number; y: number; z: number }): Promise<void> {
        const gltfLoader = new GLTFLoader();
        const heroGltf = await gltfLoader.loadAsync(`/assets/characters/${this.selectedCharacter}`);
        this.hero = heroGltf.scene;
        this.hero.scale.set(2.68, 2.68, 2.68);
        this.hero.position.set(initialPosition?.x || 0, initialPosition?.y || 2.68, initialPosition?.z || 0);
        this.scene.add(this.hero);

        const healthBar = new THREE.Group();
        for (let i = 0; i < 5; i++) {
            const dotGeometry = new THREE.CircleGeometry(0.2, 16);
            const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const dot = new THREE.Mesh(dotGeometry, dotMaterial);
            dot.position.set((i - 2) * 0.5, 2.33, 0);
            healthBar.add(dot);
        }
        this.hero.add(healthBar);

        const heroMaterial = new CANNON.Material({ friction: 1.0, restitution: 0 });
        this.heroBody = new CANNON.Body({ mass: 1, material: heroMaterial });
        this.heroBody.addShape(new CANNON.Cylinder(0.5 * 2.68, 0.5 * 2.68, 2 * 2.68, 16));
        this.heroBody.position.set(initialPosition?.x || 0, initialPosition?.y || 2.68, initialPosition?.z || 0);
        this.heroBody.linearDamping = 0;
        this.world.addBody(this.heroBody);
        this.heroReady = true;
        while (this.pendingPlayersUpdates.length > 0) {
            this.processPlayersUpdate(this.pendingPlayersUpdates.shift()!);
        }

        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load('/assets/textures/concrete.jpg');
        groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(10, 10);
        const groundVisualMaterial = new THREE.MeshStandardMaterial({ map: groundTexture });
        const groundGeometry = new THREE.PlaneGeometry(800, 800);
        const ground = new THREE.Mesh(groundGeometry, groundVisualMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        this.scene.add(ground);

        const earthTextureLoader = new THREE.TextureLoader();
        const earthTexture = earthTextureLoader.load('/assets/textures/earth.jpg');
        const earthGeometry = new THREE.SphereGeometry(20, 64, 64);
        const earthMaterial = new THREE.MeshBasicMaterial({ map: earthTexture });
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        earth.position.set(200, 300, -400);
        this.scene.add(earth);

        const groundPhysicsMaterial = new CANNON.Material({ friction: 0.5, restitution: 0 });
        const groundBody = new CANNON.Body({ mass: 0, material: groundPhysicsMaterial });
        groundBody.addShape(new CANNON.Plane());
        groundBody.position.set(0, -1, 0);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);

        const streetWidth = 10;
        const sidewalkWidth = 3;
        const streetSpacing = 50;
        const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

        this.streetXPositions = [];
        this.streetZPositions = [];

        // Perturbed streets
        for (let x = -400; x <= 400; x += streetSpacing) {
            const offset = this.getNoise(x, 0) * 10 - 5; // ±5 units perturbation
            const streetXPos = x + offset;
            this.streetXPositions.push(streetXPos);

            const streetX = new THREE.Mesh(new THREE.PlaneGeometry(800, streetWidth), streetMaterial);
            streetX.rotation.x = -Math.PI / 2;
            streetX.position.set(streetXPos, -0.95, 0);
            this.scene.add(streetX);

            const sidewalkX1 = new THREE.Mesh(new THREE.PlaneGeometry(800, sidewalkWidth), sidewalkMaterial);
            sidewalkX1.rotation.x = -Math.PI / 2;
            sidewalkX1.position.set(streetXPos - streetWidth / 2 - sidewalkWidth / 2, -0.9, 0);
            this.scene.add(sidewalkX1);

            const sidewalkX2 = new THREE.Mesh(new THREE.PlaneGeometry(800, sidewalkWidth), sidewalkMaterial);
            sidewalkX2.rotation.x = -Math.PI / 2;
            sidewalkX2.position.set(streetXPos + streetWidth / 2 + sidewalkWidth / 2, -0.9, 0);
            this.scene.add(sidewalkX2);
        }

        for (let z = -400; z <= 400; z += streetSpacing) {
            const offset = this.getNoise(0, z) * 10 - 5;
            const streetZPos = z + offset;
            this.streetZPositions.push(streetZPos);

            const streetZ = new THREE.Mesh(new THREE.PlaneGeometry(streetWidth, 800), streetMaterial);
            streetZ.rotation.x = -Math.PI / 2;
            streetZ.position.set(0, -0.95, streetZPos);
            this.scene.add(streetZ);

            const sidewalkZ1 = new THREE.Mesh(new THREE.PlaneGeometry(streetWidth, 800), sidewalkMaterial);
            sidewalkZ1.rotation.x = -Math.PI / 2;
            sidewalkZ1.position.set(0, -0.9, streetZPos - streetWidth / 2 - sidewalkWidth / 2);
            this.scene.add(sidewalkZ1);

            const sidewalkZ2 = new THREE.Mesh(new THREE.PlaneGeometry(streetWidth, 800), sidewalkMaterial);
            sidewalkZ2.rotation.x = -Math.PI / 2;
            sidewalkZ2.position.set(0, -0.9, streetZPos + streetWidth / 2 + sidewalkWidth / 2);
            this.scene.add(sidewalkZ2);
        }

        const skyscrapers = ["skyscraperA.glb", "skyscraperB.glb", "skyscraperC.glb", "skyscraperD.glb", "skyscraperE.glb"];
        const largeBuildings = ["large_buildingA.glb", "large_buildingB.glb", "large_buildingC.glb"];
        const lowBuildings = ["small_buildingD.glb"];
        const cars = ["sedan.glb", "suv.glb", "taxi.glb"];

        const staticMaterial = new CANNON.Material({ friction: 0.5, restitution: 0 });

        const loadModel = (path: string, position: THREE.Vector3, scale: number, rotationY = 0): Promise<THREE.Object3D> => {
            return new Promise((resolve) => {
                gltfLoader.load(path, (gltf) => {
                    const model = gltf.scene;
                    model.scale.set(scale, scale, scale);
                    model.rotation.y = rotationY;
                    model.position.copy(position);
                    model.position.y = -1;
                    this.scene.add(model);

                    const bbox = new THREE.Box3().setFromObject(model);
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const body = new CANNON.Body({ mass: 0, material: staticMaterial });
                    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
                    body.position.copy(model.position);
                    body.quaternion.copy(model.quaternion);
                    this.world.addBody(body);
                    this.buildings.push({ mesh: model, body });

                    resolve(model);
                });
            });
        };

        for (let x = -400; x <= 400; x += streetSpacing) {
            for (let z = -400; z <= 400; z += streetSpacing) {
                const noiseValue = this.getNoise(x, z);
                const distance = Math.sqrt(x * x + z * z);
        
                if (Math.abs(x) < streetWidth / 2 || Math.abs(z) < streetWidth / 2) continue;
        
                let spawnX = x + (this.rng() - 0.5) * streetSpacing * 0.8;
                let spawnZ = z + (this.rng() - 0.5) * streetSpacing * 0.8;
        
                spawnX += this.getNoise(x, z, 0.01) * 10 - 5; // Additional noise perturbation
                spawnZ += this.getNoise(z, x, 0.01) * 10 - 5;
        
                let buildingType: string[];
                let scale: number;
        
                // Zoning and building type selection
                if (noiseValue > 0.7 && distance < 250 && this.isPositionClear(new THREE.Vector3(spawnX, -1, spawnZ), 25)) {
                    buildingType = skyscrapers;
                    scale = 25 + this.rng() * 15;
                } else if (noiseValue > 0.5 && noiseValue <= 0.7 && distance < 350 && this.rng() < 0.6 && this.isPositionClear(new THREE.Vector3(spawnX, -1, spawnZ), 15)) {
                    buildingType = largeBuildings;
                    scale = 12.5 + this.rng() * 5;
                } else if (noiseValue > 0.3 && noiseValue <= 0.5 && this.rng() < 0.4 && this.isPositionClear(new THREE.Vector3(spawnX, -1, spawnZ), 10)) {
                    buildingType = lowBuildings;
                    scale = 9 + this.rng() * 2;
                } else if (noiseValue <= 0.3 && this.isPositionClear(new THREE.Vector3(spawnX, -1, spawnZ), 10)) { // Adjusted threshold
                    // Park/Natural area
                    this.addPark(spawnX, spawnZ);
                    continue;
                } else {
                    continue;
                }

                const offset = streetWidth / 2 + sidewalkWidth + 5;
                const positions = [
                    new THREE.Vector3(spawnX + offset, -1, spawnZ),
                    new THREE.Vector3(spawnX - offset, -1, spawnZ),
                    new THREE.Vector3(spawnX, -1, spawnZ + offset),
                    new THREE.Vector3(spawnX, -1, spawnZ - offset)
                ];

                for (const pos of positions) {
                    if (this.isPositionClear(pos, 10)) {
                        await loadModel(
                            `/assets/models/${buildingType[Math.floor(this.rng() * buildingType.length)]}`,
                            pos,
                            scale,
                            this.rng() * Math.PI * 2
                        );
                    }
                }
            }
        }

        // Car placement with noise-based variation
        for (let i = 0; i < 20; i++) {
            const carModel = cars[Math.floor(this.rng() * cars.length)];
            const isXStreet = this.rng() > 0.5;
            let x, z, rotationY;
            let attempts = 0;
            do {
                if (isXStreet) {
                    x = this.streetXPositions[Math.floor(this.rng() * this.streetXPositions.length)];
                    z = -400 + this.rng() * 800;
                    rotationY = Math.PI / 2;
                } else {
                    x = -400 + this.rng() * 800;
                    z = this.streetZPositions[Math.floor(this.rng() * this.streetZPositions.length)];
                    rotationY = 0;
                }
                attempts++;
            } while (!this.isPositionClear(new THREE.Vector3(x, 0, z), 10) && attempts < 50);

            if (Math.abs(x) > streetWidth / 2 && Math.abs(z) > streetWidth / 2) {
                await loadModel(
                    `/assets/cars/${carModel}`,
                    new THREE.Vector3(x, 0, z),
                    3.2,
                    rotationY + (this.rng() > 0.5 ? Math.PI : 0)
                ).then((car) => {
                    car.position.y = 0;
                    const body = this.buildings[this.buildings.length - 1].body;
                    body.position.y = 0;
                });
            }
        }

        const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x001133, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);

        const starGeometry = new THREE.BufferGeometry();
        const starCount = 2000;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (this.rng() - 0.5) * 2000;
            positions[i * 3 + 1] = this.rng() * 1000;
            positions[i * 3 + 2] = (this.rng() - 0.5) * 2000;
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: true });
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);

        const ambientLight = new THREE.AmbientLight(0x404060, 2.0);
        this.scene.add(ambientLight);
        const light1 = new THREE.DirectionalLight(0x8080ff, 1.0);
        light1.position.set(100, 100, 100);
        light1.castShadow = true;
        this.scene.add(light1);
        const light2 = new THREE.DirectionalLight(0x8080ff, 0.5);
        light2.position.set(-100, 100, -100);
        this.scene.add(light2);

        const elevatorGeometry = new THREE.BoxGeometry(30, 1, 30);
        const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
        const elevatorMesh = new THREE.Mesh(elevatorGeometry, elevatorMaterial);
        elevatorMesh.position.set(0, -0.25, 0);
        this.scene.add(elevatorMesh);

        const elevatorBody = new CANNON.Body({ mass: 0, material: staticMaterial });
        elevatorBody.addShape(new CANNON.Box(new CANNON.Vec3(15, 0.5, 15)));
        elevatorBody.position.set(0, -0.25, 0);
        this.world.addBody(elevatorBody);
        this.elevator = { mesh: elevatorMesh, body: elevatorBody };

        const ammoPickupMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
        for (let i = 0; i < 80; i++) {
            let x, z;
            let attempts = 0;
            do {
                x = this.streetXPositions[Math.floor(this.rng() * this.streetXPositions.length)] + (this.rng() - 0.5) * 20;
                z = this.streetZPositions[Math.floor(this.rng() * this.streetZPositions.length)] + (this.rng() - 0.5) * 20;
                attempts++;
            } while (!this.isPositionClear(new THREE.Vector3(x, 0.5, z), 10) && attempts < 50);

            if (Math.abs(x) > streetWidth && Math.abs(z) > streetWidth) {
                const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ammoPickupMaterial);
                ammoBox.position.set(x, 0.5, z);
                this.scene.add(ammoBox);
                const ammoBody = new CANNON.Body({ mass: 0, material: staticMaterial });
                ammoBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
                ammoBody.position.copy(ammoBox.position);
                this.world.addBody(ammoBody);
                this.ammoPickups.push({ mesh: ammoBox, body: ammoBody });
            }
        }

        const thunderGeometry = new THREE.ConeGeometry(0.5, 2, 8);
        const thunderMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.5 });
        for (let i = 0; i < 40; i++) {
            let x, z;
            let attempts = 0;
            do {
                x = this.streetXPositions[Math.floor(this.rng() * this.streetXPositions.length)] + (this.rng() - 0.5) * 20;
                z = this.streetZPositions[Math.floor(this.rng() * this.streetZPositions.length)] + (this.rng() - 0.5) * 20;
                attempts++;
            } while (!this.isPositionClear(new THREE.Vector3(x, 1, z), 10) && attempts < 50);

            if (Math.abs(x) > streetWidth && Math.abs(z) > streetWidth) {
                const thunder = new THREE.Mesh(thunderGeometry, thunderMaterial);
                thunder.position.set(x, 1, z);
                this.scene.add(thunder);

                const thunderBody = new CANNON.Body({ mass: 0, material: staticMaterial });
                thunderBody.addShape(new CANNON.Cylinder(0.5, 0.5, 2, 8));
                thunderBody.position.copy(thunder.position);
                this.world.addBody(thunderBody);
                this.thunderBoosts.push({ mesh: thunder, body: thunderBody });
            }
        }

        this.camera.position.set(0, 2.68, -15);


        // Portal to Secondary World
const portalGeometry = new THREE.CircleGeometry(5, 32);
const portalMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00aaff, 
    emissive: 0x00aaff, 
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.8 
});
const portalMesh = new THREE.Mesh(portalGeometry, portalMaterial);
portalMesh.rotation.x = -Math.PI / 2;
portalMesh.position.set(20, 0.1, 20); // Near center but offset
this.scene.add(portalMesh);

// Portal Physics
const portalBody = new CANNON.Body({ mass: 0 });
portalBody.addShape(new CANNON.Cylinder(5, 5, 0.1, 32));
portalBody.position.set(20, 0.1, 20);
this.world.addBody(portalBody);

// Portal Particles
const particleGeometry = new THREE.BufferGeometry();
const particleCount = 200;
const particlePositions = new Float32Array(particleCount * 3);
const particleVelocities = new Float32Array(particleCount * 3);

const particleTimes = new Float32Array(particleCount); // For animation timing
for (let i = 0; i < particleCount; i++) {
    particleTimes[i] = this.rng() * Math.PI * 2; // Random phase offset
}

for (let i = 0; i < particleCount; i++) {
    const angle = this.rng() * Math.PI * 2;
    const radius = this.rng() * 5;
    particlePositions[i * 3] = Math.cos(angle) * radius + 20;     // x
    particlePositions[i * 3 + 1] = this.rng() * 0.5;             // y
    particlePositions[i * 3 + 2] = Math.sin(angle) * radius + 20; // z
    particleVelocities[i * 3] = 0;                                // vx
    particleVelocities[i * 3 + 1] = 0.05 + this.rng() * 0.1;     // vy
    particleVelocities[i * 3 + 2] = 0;                            // vz
}
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMaterial = new THREE.PointsMaterial({ 
    color: 0x00ffff, 
    size: 0.2, 
    transparent: true, 
    blending: THREE.AdditiveBlending 
});
const portalParticles = new THREE.Points(particleGeometry, particleMaterial);
this.scene.add(portalParticles);

this.portal = { mesh: portalMesh, body: portalBody, particles: portalParticles };

// Initialize Secondary World
this.secondaryWorldScene = new THREE.Scene();
const secondaryGroundGeometry = new THREE.PlaneGeometry(200, 200);
const secondaryGroundTexture = textureLoader.load('/assets/textures/grass.jpg');
secondaryGroundTexture.wrapS = secondaryGroundTexture.wrapT = THREE.RepeatWrapping;
secondaryGroundTexture.repeat.set(5, 5);
const secondaryGroundMaterial = new THREE.MeshStandardMaterial({ map: secondaryGroundTexture });
const secondaryGround = new THREE.Mesh(secondaryGroundGeometry, secondaryGroundMaterial);
secondaryGround.rotation.x = -Math.PI / 2;
secondaryGround.position.y = -1;
this.secondaryWorldScene.add(secondaryGround);

// Trees in Secondary World
const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
for (let i = 0; i < 20; i++) {
    const x = (this.rng() - 0.5) * 180;
    const z = (this.rng() - 0.5) * 180;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5), treeMaterial);
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 12), treeMaterial);
    trunk.position.set(x, 2, z);
    foliage.position.set(x, 4, z);
    this.secondaryWorldScene.add(trunk, foliage);
}

// Ammo Pickups in Secondary World
const secondaryAmmoMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
for (let i = 0; i < 30; i++) {
    const x = (this.rng() - 0.5) * 180;
    const z = (this.rng() - 0.5) * 180;
    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), secondaryAmmoMaterial);
    ammoBox.position.set(x, 0.5, z);
    this.secondaryWorldScene.add(ammoBox);
    const ammoBody = new CANNON.Body({ mass: 0 });
    ammoBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
    ammoBody.position.copy(ammoBox.position);
    this.world.addBody(ammoBody);
    this.secondaryWorldPickups.push({ mesh: ammoBox, body: ammoBody });
}

// Return Portal
const returnPortalGeometry = new THREE.CircleGeometry(5, 32);
const returnPortalMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff00aa, 
    emissive: 0xff00aa, 
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.8 
});
const returnPortalMesh = new THREE.Mesh(returnPortalGeometry, returnPortalMaterial);
returnPortalMesh.rotation.x = -Math.PI / 2;
returnPortalMesh.position.set(0, 0.1, 0);
this.secondaryWorldScene.add(returnPortalMesh);

const returnPortalBody = new CANNON.Body({ mass: 0 });
returnPortalBody.addShape(new CANNON.Cylinder(5, 5, 0.1, 32));
returnPortalBody.position.set(0, 0.1, 0);
this.world.addBody(returnPortalBody);

// Return Portal Particles
const returnParticleGeometry = new THREE.BufferGeometry();
const returnParticlePositions = new Float32Array(particleCount * 3);
const returnParticleVelocities = new Float32Array(particleCount * 3);

const returnParticleTimes = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) {
    returnParticleTimes[i] = this.rng() * Math.PI * 2;
}

for (let i = 0; i < particleCount; i++) {
    const angle = this.rng() * Math.PI * 2;
    const radius = this.rng() * 5;
    returnParticlePositions[i * 3] = Math.cos(angle) * radius;     // x
    returnParticlePositions[i * 3 + 1] = this.rng() * 0.5;         // y
    returnParticlePositions[i * 3 + 2] = Math.sin(angle) * radius; // z
    returnParticleVelocities[i * 3] = 0;                           // vx
    returnParticleVelocities[i * 3 + 1] = 0.05 + this.rng() * 0.1; // vy
    returnParticleVelocities[i * 3 + 2] = 0;                       // vz
}
returnParticleGeometry.setAttribute('position', new THREE.BufferAttribute(returnParticlePositions, 3));
const returnParticleMaterial = new THREE.PointsMaterial({ 
    color: 0xffff00, 
    size: 0.2, 
    transparent: true, 
    blending: THREE.AdditiveBlending 
});
const returnPortalParticles = new THREE.Points(returnParticleGeometry, returnParticleMaterial);
this.secondaryWorldScene.add(returnPortalParticles);

this.returnPortal = { mesh: returnPortalMesh, body: returnPortalBody, particles: returnPortalParticles };

// Add ambient lighting to secondary world (additional 30% brighter)
const secondaryAmbientLight = new THREE.AmbientLight(0x404060, 3.38); // Previous 2.6 * 1.3 = 3.38
this.secondaryWorldScene.add(secondaryAmbientLight);
const secondaryDirectionalLight = new THREE.DirectionalLight(0xffffaa, 1.69); // Previous 1.3 * 1.3 = 1.69
secondaryDirectionalLight.position.set(50, 50, 50);
this.secondaryWorldScene.add(secondaryDirectionalLight);

    }

    private addPark(x: number, z: number): void {
        const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const treeCount = 5 + Math.floor(this.rng() * 5);
        for (let i = 0; i < treeCount; i++) {
            const offsetX = (this.rng() - 0.5) * 20;
            const offsetZ = (this.rng() - 0.5) * 20;
            const pos = new THREE.Vector3(x + offsetX, 1, z + offsetZ);
            if (this.isPositionClear(pos, 5)) {
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3), treeMaterial);
                const foliage = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 12), treeMaterial);
                trunk.position.set(pos.x, 1, pos.z);
                foliage.position.set(pos.x, 2.5, pos.z);
                this.scene.add(trunk, foliage);
            }
        }
    }

    private updateOtherPlayer(socketId: string, player: PlayerData): void {
        if (socketId === this.socket.id) return;
    
        if (!this.otherPlayers.has(socketId) && !this.loadingPlayers.has(socketId)) {
            this.loadingPlayers.add(socketId);
            const gltfLoader = new GLTFLoader();
            gltfLoader.load(`/assets/characters/${player.avatar || 'character-male-a.glb'}`, (gltf) => {
                const mesh = gltf.scene;
                mesh.scale.set(2.68, 2.68, 2.68);
                mesh.position.set(player.position.x, player.position.y, player.position.z);
                // Apply initial 180-degree Y rotation to flip model orientation
                mesh.rotation.set(player.rotation.x, player.rotation.y + Math.PI, player.rotation.z);
                this.scene.add(mesh);
    
                const healthBar = new THREE.Group();
                for (let i = 0; i < 5; i++) {
                    const dotGeometry = new THREE.CircleGeometry(0.2, 16);
                    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
                    dot.position.set((i - 2) * 0.5, 2.33, 0);
                    healthBar.add(dot);
                }
                mesh.add(healthBar);
    
                this.otherPlayers.set(socketId, { mesh, healthBar });
                this.loadingPlayers.delete(socketId);
    
                this.updateIndicators(mesh, player.health, player.lives, player.ammo || 50);
            });
        } else {
            this.updateOtherPlayerPosition(socketId, player);
        }
    }

    private updateOtherPlayerPosition(socketId: string, player: PlayerData): void {
        const playerObj = this.otherPlayers.get(socketId);
        if (playerObj) {
            playerObj.mesh.position.set(player.position.x, player.position.y, player.position.z);
            // Apply server-provided rotation and flip 180 degrees around Y-axis
            playerObj.mesh.rotation.set(player.rotation.x, player.rotation.y + Math.PI, player.rotation.z);
            this.updateIndicators(playerObj.mesh, player.health, player.lives, player.ammo || 50);
        }
    }
    private animate(): void {
        requestAnimationFrame(() => this.animate());

        if (!this.isPaused && (this.roomId || this.isSinglePlayer)) {
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

                const elevatorHalfSize = 15;
                const heroPos = this.heroBody.position;
                const isOnElevator = Math.abs(heroPos.x) < elevatorHalfSize && 
                                  Math.abs(heroPos.z) < elevatorHalfSize;

                if (isOnElevator) {
                    const heroBottom = this.heroBody.position.y - (1 * 2.68);
                    const elevatorTop = this.elevator.body.position.y + 0.5;
                    if (heroBottom <= elevatorTop + 0.1) {
                        this.heroBody.position.y = elevatorTop + (1 * 2.68);
                    }
                }
            }

            this.hero.position.copy(this.heroBody.position);
            this.hero.rotation.y = this.camera.rotation.y + Math.PI; // Flip hero model 180 degrees

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
                velocity.y = 10;
                this.jump = false;
            } else if (velocity.y > 0 && velocity.y < 0.5 && !this.jump) {
                velocity.y = 0;
            }
            this.heroBody.velocity.set(forward.x * fSpeed + right.x * sSpeed, velocity.y, forward.z * fSpeed + right.z * sSpeed);
            switch (this.cameraMode) {
                case 'pov':
                    this.camera.position.copy(this.hero.position).add(new THREE.Vector3(0, 2.68, 0));
                    this.camera.rotation.order = "YXZ";
                    this.camera.rotation.set(this.mouseY, this.mouseX, 0);
                    break;
                case 'top':
                    this.camera.position.set(this.hero.position.x, this.hero.position.y + 50, this.hero.position.z);
                    this.camera.lookAt(this.hero.position);
                    break;
                case 'front':
                    this.camera.position.copy(this.hero.position).add(new THREE.Vector3(0, 2.68, 20));
                    this.camera.lookAt(this.hero.position);
                    break;
                case 'map':
                    this.camera.position.set(0, 200, 0);
                    this.camera.rotation.set(-Math.PI / 2, 0, 0);
                    break;
            }

            if (!this.isSinglePlayer) {
                this.socket.emit("updatePosition", {
                    position: this.hero.position,
                    rotation: { x: this.camera.rotation.x, y: this.camera.rotation.y, z: this.camera.rotation.z },
                });
            }

            this.bullets.forEach((bullet, bulletIndex) => {
                bullet.mesh.position.copy(bullet.body.position);
                bullet.mesh.quaternion.copy(bullet.body.quaternion);

                const heroDistance = bullet.mesh.position.distanceTo(this.hero.position);
                const ownerId = this.isSinglePlayer ? "player" : this.socket.id;
                if (bullet.owner !== ownerId && heroDistance < 3) {
                    this.health -= 10;
                    this.hits++;
                    this.healthCounter.textContent = `Health: ${this.health}`;
                    this.updateIndicators(this.hero, this.health, this.lives, this.ammo);
                    this.createSpark(this.hero.position);
                    this.scene.remove(bullet.mesh);
                    this.world.removeBody(bullet.body);
                    this.bullets.splice(bulletIndex, 1);
                    if (this.health <= 0 && this.lives > 0) {
                        this.lives--;
                        this.health = 100;
                        this.livesCounter.textContent = `Lives: ${this.lives}`;
                        this.healthCounter.textContent = `Health: ${this.health}`;
                        this.updateIndicators(this.hero, this.health, this.lives, this.ammo);
                    }
                    if (this.lives <= 0) {
                        this.isPaused = true;
                        this.pauseMenu.style.display = "block";
                        alert("Game Over!");
                        this.resetGameForNewRoom();
                    }
                    return;
                }

                if (this.isSinglePlayer) {
                    this.bots.forEach((bot) => {
                        if (bullet.owner !== bot.id) {
                            const distance = bullet.mesh.position.distanceTo(bot.mesh.position);
                            if (distance < 3) {
                                bot.health -= 10;
                                bot.hits = (bot.hits || 0) + 1;
                                this.createSpark(bot.mesh.position);
                                this.scene.remove(bullet.mesh);
                                this.world.removeBody(bullet.body);
                                this.bullets.splice(bulletIndex, 1);
                                if (bot.health <= 0 && bot.lives > 0) {
                                    bot.lives--;
                                    bot.health = 100;
                                }
                                if (bot.lives <= 0) {
                                    this.scene.remove(bot.mesh);
                                    this.world.removeBody(bot.body);
                                    this.bots.delete(bot.id);
                                } else {
                                    this.updateIndicators(bot.mesh, bot.health, bot.lives, bot.ammo);
                                }
                                return;
                            }
                        }
                    });
                } else {
                    this.otherPlayers.forEach((playerObj, socketId) => {
                        if (bullet.owner !== socketId) {
                            const distance = bullet.mesh.position.distanceTo(playerObj.mesh.position);
                            if (distance < 3) {
                                this.socket.emit("playerHit", { targetSocketId: socketId });
                                this.createSpark(playerObj.mesh.position);
                                this.scene.remove(bullet.mesh);
                                this.world.removeBody(bullet.body);
                                this.bullets.splice(bulletIndex, 1);
                            }
                        }
                    });
                }
            });

            this.ammoPickups.forEach((pickup, index) => {
                const heroDistance = this.hero.position.distanceTo(pickup.mesh.position);
                if (heroDistance < 3) {
                    this.ammo += 10;
                    this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
                    this.updateAmmoWarning();
                    this.scene.remove(pickup.mesh);
                    this.world.removeBody(pickup.body);
                    this.ammoPickups.splice(index, 1);
                    return;
                }

                if (this.isSinglePlayer) {
                    this.bots.forEach((bot) => {
                        const botDistance = bot.mesh.position.distanceTo(pickup.mesh.position);
                        if (botDistance < 3 && bot.ammo < 50) {
                            bot.ammo += 10;
                            this.updateIndicators(bot.mesh, bot.health, bot.lives, bot.ammo);
                            this.scene.remove(pickup.mesh);
                            this.world.removeBody(pickup.body);
                            this.ammoPickups.splice(index, 1);
                        }
                    });
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

            if (this.isSinglePlayer) {
                this.updateBotBehavior();
            }
            const particleGeometry = new THREE.BufferGeometry();
            const particleCount = 200;
            const particlePositions = new Float32Array(particleCount * 3);
            const particleVelocities = new Float32Array(particleCount * 3);
            const returnParticleGeometry = new THREE.BufferGeometry();
const returnParticlePositions = new Float32Array(particleCount * 3);
const returnParticleVelocities = new Float32Array(particleCount * 3);
        // Update Portal Particles
// Update Portal Particles
const portalPositions = this.portal.particles.geometry.attributes.position.array as Float32Array;
const portalVelocities = particleVelocities;
const time = Date.now() * 0.001; // For continuous animation
const particleTimes = new Float32Array(particleCount); // For animation timing
for (let i = 0; i < particleCount; i++) {
    particleTimes[i] = this.rng() * Math.PI * 2; // Random phase offset
}

const returnParticleTimes = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) {
    returnParticleTimes[i] = this.rng() * Math.PI * 2;
}

for (let i = 0; i < particleCount; i++) {
    const t = time + particleTimes[i];
    const radius = 5 * (0.5 + 0.5 * Math.sin(t)); // Pulsing radius
    const angle = t * 2 + (i / particleCount) * Math.PI * 2; // Swirling motion
    
    // Base position with swirl
    portalPositions[i * 3] = Math.cos(angle) * radius + 20;     // x
    portalPositions[i * 3 + 2] = Math.sin(angle) * radius + 20; // z
    
    // Vertical motion
    portalPositions[i * 3 + 1] += portalVelocities[i * 3 + 1];
    if (portalPositions[i * 3 + 1] > 5) {
        portalPositions[i * 3 + 1] = 0;
        portalVelocities[i * 3 + 1] = 0.05 + this.rng() * 0.1; // Reset with random speed
    }
}
this.portal.particles.geometry.attributes.position.needsUpdate = true;

if (this.secondaryWorldActive) {
    const returnPositions = this.returnPortal.particles.geometry.attributes.position.array as Float32Array;
    const returnVelocities = returnParticleVelocities;
    for (let i = 0; i < particleCount; i++) {
        const t = time + returnParticleTimes[i];
        const radius = 5 * (0.5 + 0.5 * Math.sin(t * 1.5)); // Slightly faster pulse
        const angle = t * 2.5 + (i / particleCount) * Math.PI * 2; // Faster swirl
        
        returnPositions[i * 3] = Math.cos(angle) * radius;     // x
        returnPositions[i * 3 + 2] = Math.sin(angle) * radius; // z
        
        returnPositions[i * 3 + 1] += returnVelocities[i * 3 + 1];
        if (returnPositions[i * 3 + 1] > 5) {
            returnPositions[i * 3 + 1] = 0;
            returnVelocities[i * 3 + 1] = 0.05 + this.rng() * 0.1;
        }
    }
    this.returnPortal.particles.geometry.attributes.position.needsUpdate = true;
}

// Teleportation Logic
// Update Portal Particles (we'll update this in step 2 below)

// Teleportation Logic
if (!this.secondaryWorldActive) {
    const distanceToPortal = this.hero.position.distanceTo(this.portal.mesh.position);
    if (distanceToPortal < 6) {
        this.secondaryWorldActive = true;
        this.heroBody.position.set(50, 0.1, 50); // Ground level (0.1 to be just above surface)
        this.heroBody.velocity.set(0, 0, 0);    // Reset velocity to prevent jumping
        this.hero.position.copy(this.heroBody.position);
        this.scene.traverse(obj => obj.visible = false);
        this.secondaryWorldScene.traverse(obj => obj.visible = true);
    }
} else {
    const distanceToReturnPortal = this.hero.position.distanceTo(this.returnPortal.mesh.position);
    if (distanceToReturnPortal < 6) {
        this.secondaryWorldActive = false;
        this.heroBody.position.set(50, 0.1, 50); // Ground level return position
        this.heroBody.velocity.set(0, 0, 0);    // Reset velocity
        this.hero.position.copy(this.heroBody.position);
        this.scene.traverse(obj => obj.visible = true);
        this.secondaryWorldScene.traverse(obj => obj.visible = false);
    }

    // Secondary World Ammo Pickups
    this.secondaryWorldPickups.forEach((pickup, index) => {
        const distance = this.hero.position.distanceTo(pickup.mesh.position);
        if (distance < 3) {
            this.ammo += 20;
            this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
            this.updateAmmoWarning();
            this.secondaryWorldScene.remove(pickup.mesh);
            this.world.removeBody(pickup.body);
            this.secondaryWorldPickups.splice(index, 1);
        }
    });
}  

if (!this.secondaryWorldActive) {
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);

    const miniMapSize = 150;
    this.renderer.setViewport(window.innerWidth - miniMapSize - 10, 10, miniMapSize, miniMapSize);
    this.renderer.setScissor(window.innerWidth - miniMapSize - 10, 10, miniMapSize, miniMapSize);
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(0x000000, 0.5);
    this.renderer.clear();

    this.scene.traverse((object) => {
        if (object === this.hero || 
            (object.userData && this.bots.has(object.userData.id)) || 
            (object.userData && this.otherPlayers.has(object.userData.socketId)) || 
            (object instanceof THREE.Mesh && object.scale.y >= 20)) {
            object.visible = true;
        } else {
            object.visible = false;
        }
    });

    if (this.miniMapCamera) {
        this.renderer.render(this.scene, this.miniMapCamera);
    }
} else {
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.secondaryWorldScene, this.camera);

    const miniMapSize = 150;
    this.renderer.setViewport(window.innerWidth - miniMapSize - 10, 10, miniMapSize, miniMapSize);
    this.renderer.setScissor(window.innerWidth - miniMapSize - 10, 10, miniMapSize, miniMapSize);
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(0x000000, 0.5);
    this.renderer.clear();

    this.secondaryWorldScene.traverse((object) => {
        if (object === this.hero || object === this.returnPortal.mesh) {
            object.visible = true;
        } else {
            object.visible = false;
        }
    });

    if (this.miniMapCamera) {
        this.miniMapCamera.position.set(this.hero.position.x, 200, this.hero.position.z);
        this.miniMapCamera.lookAt(this.hero.position);
        this.renderer.render(this.secondaryWorldScene, this.miniMapCamera);
    }
}

this.renderer.setScissorTest(false);
this.scene.traverse((object) => object.visible = !this.secondaryWorldActive);
this.secondaryWorldScene.traverse((object) => object.visible = this.secondaryWorldActive);
        }
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new App();
});