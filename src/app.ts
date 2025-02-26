import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const seedrandom = require('seedrandom');
import { createNoise3D } from 'simplex-noise';

declare module 'cannon-es' {
    interface Body {
        userData?: {
            debugMesh?: THREE.Mesh;
        };
    }
}

interface ExplosionInstance {
    particles: THREE.Points;
    velocities: THREE.Vector3[];
    lifetimes: number[];
    duration: number;
}

class PodRacingGame {
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    private renderer!: THREE.WebGLRenderer;
    private world: CANNON.World = new CANNON.World();
    private canvas!: HTMLCanvasElement;
    private pod!: THREE.Mesh;
    private spaceship!: THREE.Group;
    private podBody!: CANNON.Body;
    private obstacles: { mesh: THREE.Group | THREE.Mesh; body: CANNON.Body; velocity?: CANNON.Vec3; isFullAsteroid: boolean }[] = [];
    private bullets: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private enemyShips: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private enemyBullets: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private trackPath!: THREE.CatmullRomCurve3;
    private pathLine!: THREE.Line;
    private rng: () => number = Math.random;
    private lives: number = 10;
    private score: number = 0;
    private enemiesKilled: number = 0; // New counter for enemies killed
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    private moveUp: boolean = false;
    private moveDown: boolean = false;
    private isPaused: boolean = false;
    private raceStarted: boolean = false;
    private countdown: number = 3;
    private countdownTimer: number = 0;
    private survivalTime: number = 0;
    private basePodSpeed: number = 40;
    private podSpeed: number = this.basePodSpeed;
    private podDistance: number = 0;
    private podOffsetX: number = 0;
    private podOffsetY: number = 0;
    private currentOffsetX: number = 0;
    private currentOffsetY: number = 0;
    private cameraMode: number = 0;
    private livesCounter!: HTMLElement;
    private scoreCounter!: HTMLElement;
    private enemiesKilledCounter!: HTMLElement; // New counter for enemies killed
    private countdownElement!: HTMLElement;
    private hud!: HTMLElement;
    private pauseMenu!: HTMLElement;
    private gameOverMenu!: HTMLElement; // New game over menu
    private restartButton!: HTMLElement; // New restart button
    private resumeButton!: HTMLElement;
    private thrusterParticles!: THREE.Points;
    private hitParticles!: THREE.Points;
    private explosionInstances: ExplosionInstance[] = [];
    private dynamicLight!: THREE.PointLight;
    private level: number = 1;
    private songs: HTMLAudioElement[] = [];
    private currentSongIndex: number = 0;
    
    private explosionSound!: HTMLAudioElement;
    private niceShotSound!: HTMLAudioElement; // New audio for kills
    private holdTightSound!: HTMLAudioElement; // New audio for enemy spawns
    private enemySpottedSound!: HTMLAudioElement; // New audio for enemy spawns
    private audioContext!: AudioContext;
    private mouseSensitivity: number = 0.002;
    private yaw: number = 0;
    private pitch: number = 0;
    private crosshair!: HTMLElement;
    private lastShotTime: number = 0;
    private fireRate: number = 100;
    private asteroidSpawnTimer: number = 0;
    private asteroidSpawnInterval: number = 6;
    private enemySpawnTimer: number = 0;
    private enemySpawnInterval: number = 10;
    private enemySpawnsThisLevel: number = 0;
    private asteroidModel: THREE.Group | null = null;
    private introAudio!: HTMLAudioElement;
    private isIntroPlaying: boolean = true;
    private introTime: number = 0;
    private introDuration: number = 20;
    private startButton!: HTMLElement;
    private difficultyMenu!: HTMLElement;
    private asteroidTexture: THREE.Texture | null = null;
    private metalTexture: THREE.Texture | null = null;
    private earth!: THREE.Mesh;
    private mars!: THREE.Mesh;
    private moon!: THREE.Mesh;
    private earthAtmosphere!: THREE.Mesh;
    private additionalPlanets: { mesh: THREE.Mesh, rings?: THREE.Mesh, stars?: THREE.Mesh[], rotationSpeed: number }[] = [];
    private moonOrbitRadius: number = 2000;
    private moonOrbitAngle: number = 0;
    private showPathLine: boolean = false;
    private alertSounds: HTMLAudioElement[] = [];
    private lastAlertTime: number = 0;
    private alertCooldown: number = 1;
    private alertsThisLevel: number = 0;
    private maxAlertsPerLevel: number = 3;
    private enemySpawnDistance: number = 900;
    private enemyLateralOffset: number = 200;
    private enemyBaseSpeed: number = 25;
    private enemyFireRate: number = 1000;
    private enemyBulletSpeed: number = 500;
    private lastEnemyShotTimes: Map<CANNON.Body, number> = new Map();
    private enemyShotCounts: Map<CANNON.Body, number> = new Map();
    private enemyHits: Map<CANNON.Body, number> = new Map();
    private shotsToLoseLife: number = 10;
    private difficulty: 'easy' | 'normal' | 'hard' = 'normal';
    private spaceshipScale: number = 3.4;
    private spaceshipPositionX: number = 14;
    private spaceshipPositionY: number = -3;
    private spaceshipPositionZ: number = 15;
    private spaceshipRotationX: number = 0;
    private spaceshipRotationY: number = 0;
    private spaceshipRotationZ: number = 0;
    private spaceshipRotationAxisX: number = 0;
    private spaceshipRotationAxisY: number = 0;
    private spaceshipRotationAxisZ: number = -1;
    private neonSquare!: THREE.LineLoop;
    private showNeonSquare: boolean = false; // Off by default
    private showDebugControls: boolean = false; // Off by default
    private makePodVisible: boolean = false;
    private spaceshipEngineOscillator!: OscillatorNode; // Oscillator for engine sound
    private spaceshipEngineGain!: GainNode; // Gain node for volume control
    private spaceshipEngineFilter!: BiquadFilterNode; // New filter node
    private backgroundMusicGain!: GainNode;
    private backgroundMusicVolume: number = 0.09; // New private variable, default 20%
    private isEngineSoundStarted: boolean = false;
private laserSound: HTMLAudioElement = new Audio('/assets/laser.mp3');
// Add this as a private class property near other audio-related properties (e.g., after `explosionSound`)
private enemyLaserSound: HTMLAudioElement = new Audio('/assets/laser2.mp3');
private enemyBurstStates: Map<CANNON.Body, { isBursting: boolean; burstCount: number; burstDelay: number; lastBurstTime: number }> = new Map();
private enemyDamageCooldowns: Map<CANNON.Body, number> = new Map(); // Tracks when next damage is allowed
private burstInterval: number = 0.2; // Time between shots in a burst (e.g., 200ms)
private minBurstDelay: number = 0.5; // Min delay between bursts
private maxBurstDelay: number = 2.0; // Max delay between bursts


    constructor() {
        this.initialize().then(() => {
            console.log("Game initialized");
        });
    }

    private async initialize(): Promise<void> {
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
        if (!this.canvas) throw new Error("Canvas not found");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 1);
        this.world.gravity.set(0, 0, 0);

        // Setup spaceship engine sound
    this.audioContext = new AudioContext();
    this.spaceshipEngineOscillator = this.audioContext.createOscillator();
    this.spaceshipEngineGain = this.audioContext.createGain();
    this.spaceshipEngineFilter = this.audioContext.createBiquadFilter();

    // Oscillator settings
    this.spaceshipEngineOscillator.type = 'sawtooth';
    this.spaceshipEngineOscillator.frequency.setValueAtTime(70, this.audioContext.currentTime);
    this.spaceshipEngineGain.gain.setValueAtTime(0.0025, this.audioContext.currentTime);

    // Filter settings
    this.spaceshipEngineFilter.type = 'lowpass';
    this.spaceshipEngineFilter.frequency.setValueAtTime(2000, this.audioContext.currentTime); // Default cutoff
    this.spaceshipEngineFilter.Q.setValueAtTime(1, this.audioContext.currentTime); // Resonance

    // Connect: Oscillator -> Filter -> Gain -> Destination
    this.spaceshipEngineOscillator.connect(this.spaceshipEngineFilter);
    this.spaceshipEngineFilter.connect(this.spaceshipEngineGain);
    this.spaceshipEngineGain.connect(this.audioContext.destination);

    this.isEngineSoundStarted = false; 

    
        this.songs = [
            new Audio('/assets/music1.mp3'),
            new Audio('/assets/music2.mp3'),
            new Audio('/assets/music3.mp3')
        ];
        this.audioContext = new AudioContext();
        this.backgroundMusicGain = this.audioContext.createGain();
        this.backgroundMusicGain.gain.setValueAtTime(this.backgroundMusicVolume, this.audioContext.currentTime); // Use private variable
        this.backgroundMusicGain.connect(this.audioContext.destination);
    
        this.songs.forEach((song, index) => {
            const source = this.audioContext.createMediaElementSource(song);
            source.connect(this.backgroundMusicGain);
            song.addEventListener('ended', () => {
                this.currentSongIndex = (this.currentSongIndex + 1) % this.songs.length;
                this.songs[this.currentSongIndex].play().catch(err => console.error("Song playback failed:", err));
            });
        });
    
        this.explosionSound = new Audio('/assets/explosion.mp3');
        this.niceShotSound = new Audio('/assets/audio/nice_shot.mp3');
        this.holdTightSound = new Audio('/assets/audio/hold_tight.mp3');
        this.enemySpottedSound = new Audio('/assets/audio/enemy_spotted.mp3');
        this.introAudio = new Audio('/assets/intro-pilot.mp3');
        this.alertSounds = [];
        this.audioContext = new AudioContext();
    
        this.assignDomElements();
        this.setupInput();
        this.setupControls();
    
        this.countdownElement.style.display = "none";
        this.crosshair.style.display = "none";
        this.startButton.style.display = "none";
        this.difficultyMenu.style.display = "block";
        const controlsElement = document.getElementById("controls") as HTMLElement;
        controlsElement.style.display = this.showDebugControls ? "block" : "none"; // Off by default
    
        const textureLoader = new THREE.TextureLoader();
        this.asteroidTexture = await textureLoader.loadAsync('/assets/asteroid.jpg').catch(() => null);
        this.metalTexture = await textureLoader.loadAsync('/assets/metal.png').catch(() => null);
    }

    private assignDomElements(): void {
        this.livesCounter = document.getElementById("healthCounter") as HTMLElement;
        this.scoreCounter = document.getElementById("scoreCounter") as HTMLElement || document.createElement("div");
        this.scoreCounter.id = "scoreCounter";
        this.enemiesKilledCounter = document.getElementById("enemiesKilledCounter") as HTMLElement || document.createElement("div");
        this.enemiesKilledCounter.id = "enemiesKilledCounter";
        this.countdownElement = document.getElementById("countdown") as HTMLElement;
        this.hud = document.getElementById("hud") as HTMLElement;
        this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
        this.gameOverMenu = document.getElementById("gameOverMenu") as HTMLElement;
        this.restartButton = document.getElementById("restartButton") as HTMLElement;
        this.resumeButton = document.getElementById("resumeButton") as HTMLElement;
        this.crosshair = document.getElementById("crosshair") as HTMLElement;
        this.startButton = document.getElementById("startButton") as HTMLElement;
        this.difficultyMenu = document.getElementById("difficultyMenu") as HTMLElement;
        this.hud.appendChild(this.scoreCounter);
        this.hud.appendChild(this.enemiesKilledCounter);
        this.hud.style.display = "flex";
        this.hud.style.flexDirection = "column"; // Stack vertically on left
        this.hud.style.justifyContent = "flex-start";
        this.hud.style.alignItems = "flex-start";
        this.hud.style.position = "absolute";
        this.hud.style.top = "10px";
        this.hud.style.left = "10px"; // Left side
        this.hud.style.width = "auto";
        this.countdownElement.style.position = "absolute";
        this.countdownElement.style.top = "50%";
        this.countdownElement.style.left = "50%";
        this.countdownElement.style.transform = "translate(-50%, -50%)";
        this.countdownElement.style.fontSize = "48px";
        this.countdownElement.style.color = "white";
        this.updateHUD();
    }

    private setupDifficultyButtons(): void {
        const easyButton = document.getElementById("easyButton") as HTMLElement;
        const normalButton = document.getElementById("normalButton") as HTMLElement;
        const hardButton = document.getElementById("hardButton") as HTMLElement;

        easyButton.addEventListener("click", () => {
            this.difficulty = 'easy';
            this.lives = 15;
            this.basePodSpeed = 30;
            this.podSpeed = this.basePodSpeed;
            this.startGame();
            this.introAudio.play().catch(err => console.error("Audio playback failed:", err));
            this.songs[this.currentSongIndex].play().catch(err => console.error("Song playback failed:", err));
        });

        normalButton.addEventListener("click", () => {
            this.difficulty = 'normal';
            this.lives = 10;
            this.basePodSpeed = 40;
            this.podSpeed = this.basePodSpeed;
            this.startGame();
            this.introAudio.play().catch(err => console.error("Audio playback failed:", err));
            this.songs[this.currentSongIndex].play().catch(err => console.error("Song playback failed:", err));
        });

        hardButton.addEventListener("click", () => {
            this.difficulty = 'hard';
            this.lives = 5;
            this.basePodSpeed = 50;
            this.podSpeed = this.basePodSpeed;
            this.startGame();
            this.introAudio.play().catch(err => console.error("Audio playback failed:", err));
            this.songs[this.currentSongIndex].play().catch(err => console.error("Song playback failed:", err));
        });

        
    }

    private startGame(): void {
        this.difficultyMenu.style.display = "none";
        this.createScene().then(() => {
            this.animate();
            if (!this.isEngineSoundStarted) {
                this.spaceshipEngineOscillator.start();
                this.isEngineSoundStarted = true;
            }
        });
        window.addEventListener('resize', () => this.handleResize());
    }

    private restartGame(): void {
        this.lives = 10; // Reset to initial lives based on difficulty could be added here
        this.score = 0;
        this.enemiesKilled = 0;
        this.level = 1;
        this.podDistance = 0;
        this.survivalTime = 0;
        this.podSpeed = this.basePodSpeed;
        this.isPaused = false;
        this.raceStarted = false;
        this.gameOverMenu.style.display = "none";
        this.scene.children.length = 0; // Clear scene
        this.world.bodies.length = 0; // Clear physics world
        this.obstacles = [];
        this.bullets = [];
        this.enemyShips = [];
        this.enemyBullets = [];
        this.explosionInstances = [];
        this.lastEnemyShotTimes.clear();
        this.enemyShotCounts.clear();
        this.enemyHits.clear();
        this.enemySpawnsThisLevel = 0;
        this.alertsThisLevel = 0;
        this.createScene().then(() => {
            this.startCountdown();
        });
    }

    private setupInput(): void {
        document.addEventListener("keydown", (event) => {
            if (this.isPaused && event.keyCode !== 27 && event.keyCode !== 82) return; // Allow Esc and R through
            switch (event.keyCode) {
                case 65: this.moveRight = true; break;
                case 68: this.moveLeft = true; break;
                case 87: this.moveUp = true; break;
                case 83: this.moveDown = true; break;
                case 32:
                    if (this.isIntroPlaying) {
                        this.isIntroPlaying = false;
                        this.introAudio.pause();
                        this.introTime = 0;
                        this.countdownTimer = 0;
                        this.countdownElement.style.display = "block";
                    } else if (this.raceStarted) {
                        this.shootBullet();
                    }
                    break;
                case 67:
                    this.cameraMode = (this.cameraMode + 1) % 3;
                    break;
                case 76:
                    this.showPathLine = !this.showPathLine;
                    this.pathLine.visible = this.showPathLine;
                    break;
                case 80:
                    this.spawnEnemyShip();
                    break;
                case 27:
                    this.isPaused = !this.isPaused;
                    this.pauseMenu.style.display = this.isPaused ? "block" : "none";
                    if (this.isPaused) {
                        document.exitPointerLock();
                    } else {
                        this.canvas.requestPointerLock();
                        // Start engine sound after countdown
                        if (!this.isEngineSoundStarted) {
                            this.spaceshipEngineOscillator.start();
                            this.isEngineSoundStarted = true;
                        }
                    }
                    break;
                case 78:
                    this.showNeonSquare = !this.showNeonSquare;
                    break;
                case 72:
                    this.showDebugControls = !this.showDebugControls;
                    const controlsElement = document.getElementById("controls") as HTMLElement;
                    controlsElement.style.display = this.showDebugControls ? "block" : "none";
                    break;
                case 82: // 'R' toggles pod visibility or restarts game
                    if (this.lives <= 0) {
                        this.restartGame();
                    } else {
                        this.makePodVisible = !this.makePodVisible;
                        this.pod.visible = this.makePodVisible;
                    }
                    break;
            }
        });
    
        document.addEventListener("keyup", (event) => {
            switch (event.keyCode) {
                case 65: this.moveRight = false; break;
                case 68: this.moveLeft = false; break;
                case 87: this.moveUp = false; break;
                case 83: this.moveDown = false; break;
            }
        });
    
        document.addEventListener("mousemove", (event) => {
            if (this.isPaused || !this.raceStarted || document.pointerLockElement !== this.canvas) return;
            const yawDelta = -event.movementX * this.mouseSensitivity;
            const pitchDelta = -event.movementY * this.mouseSensitivity;
            this.yaw = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.yaw + yawDelta));
            this.pitch = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, this.pitch + pitchDelta));
        });
    
        this.startButton.addEventListener("click", () => {
            this.startButton.style.display = "none";
            this.isIntroPlaying = true;
        });
    
        this.canvas.addEventListener("click", () => {
            if (!this.isPaused && document.pointerLockElement !== this.canvas && !this.isIntroPlaying && !this.raceStarted) {
                this.canvas.requestPointerLock();
            }
            if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
    }
        });
    
        this.resumeButton.addEventListener("click", () => {
            this.isPaused = false;
            this.pauseMenu.style.display = "none";
            this.canvas.requestPointerLock();
        });
    
        this.restartButton.addEventListener("click", () => {
            this.restartGame();
        });
    
        document.addEventListener("pointerlockchange", () => {
            if (document.pointerLockElement === this.canvas) {
                this.crosshair.style.display = "block";
            } else {
                this.crosshair.style.display = "none";
                if (this.raceStarted && !this.isPaused) {
                    this.isPaused = true;
                    this.pauseMenu.style.display = "block";
                }
            }
        });
    
        this.setupDifficultyButtons();
    }

    private setupControls(): void {
        const podTab = document.getElementById("podTab") as HTMLElement;
        const enemyTab = document.getElementById("enemyTab") as HTMLElement;
        const engineTab = document.getElementById("engineTab") as HTMLElement;
        const podControls = document.getElementById("podControls") as HTMLElement;
        const enemyControls = document.getElementById("enemyControls") as HTMLElement;
        const engineControls = document.getElementById("engineControls") as HTMLElement;
    
        podTab.addEventListener("click", () => {
            podTab.classList.add("active");
            enemyTab.classList.remove("active");
            engineTab.classList.remove("active");
            podControls.style.display = "block";
            enemyControls.style.display = "none";
            engineControls.style.display = "none";
        });
    
        enemyTab.addEventListener("click", () => {
            enemyTab.classList.add("active");
            podTab.classList.remove("active");
            engineTab.classList.remove("active");
            enemyControls.style.display = "block";
            podControls.style.display = "none";
            engineControls.style.display = "none";
        });
    
        engineTab.addEventListener("click", () => {
            engineTab.classList.add("active");
            podTab.classList.remove("active");
            enemyTab.classList.remove("active");
            engineControls.style.display = "block";
            podControls.style.display = "none";
            enemyControls.style.display = "none";
        });
    
        // Spaceship Model Controls (unchanged)
        const scaleSlider = document.getElementById("spaceshipScale") as HTMLInputElement;
        const posXSlider = document.getElementById("spaceshipPosX") as HTMLInputElement;
        const posYSlider = document.getElementById("spaceshipPosY") as HTMLInputElement;
        const posZSlider = document.getElementById("spaceshipPosZ") as HTMLInputElement;
        const rotXSlider = document.getElementById("spaceshipRotX") as HTMLInputElement;
        const rotYSlider = document.getElementById("spaceshipRotY") as HTMLInputElement;
        const rotZSlider = document.getElementById("spaceshipRotZ") as HTMLInputElement;
        const axisXSlider = document.getElementById("spaceshipAxisX") as HTMLInputElement;
        const axisYSlider = document.getElementById("spaceshipAxisY") as HTMLInputElement;
        const axisZSlider = document.getElementById("spaceshipAxisZ") as HTMLInputElement;
    
        const scaleValue = document.getElementById("spaceshipScaleValue") as HTMLSpanElement;
        const posXValue = document.getElementById("spaceshipPosXValue") as HTMLSpanElement;
        const posYValue = document.getElementById("spaceshipPosYValue") as HTMLSpanElement;
        const posZValue = document.getElementById("spaceshipPosZValue") as HTMLSpanElement;
        const rotXValue = document.getElementById("spaceshipRotXValue") as HTMLSpanElement;
        const rotYValue = document.getElementById("spaceshipRotYValue") as HTMLSpanElement;
        const rotZValue = document.getElementById("spaceshipRotZValue") as HTMLSpanElement;
        const axisXValue = document.getElementById("spaceshipAxisXValue") as HTMLSpanElement;
        const axisYValue = document.getElementById("spaceshipAxisYValue") as HTMLSpanElement;
        const axisZValue = document.getElementById("spaceshipAxisZValue") as HTMLSpanElement;
    
        scaleSlider.addEventListener("input", () => {
            this.spaceshipScale = parseFloat(scaleSlider.value);
            this.spaceship.scale.set(this.spaceshipScale, this.spaceshipScale, this.spaceshipScale);
            scaleValue.textContent = this.spaceshipScale.toFixed(2);
        });
    
        posXSlider.addEventListener("input", () => {
            this.spaceshipPositionX = parseFloat(posXSlider.value);
            this.updateSpaceshipPosition();
            posXValue.textContent = this.spaceshipPositionX.toFixed(2);
        });
    
        posYSlider.addEventListener("input", () => {
            this.spaceshipPositionY = parseFloat(posYSlider.value);
            this.updateSpaceshipPosition();
            posYValue.textContent = this.spaceshipPositionY.toFixed(2);
        });
    
        posZSlider.addEventListener("input", () => {
            this.spaceshipPositionZ = parseFloat(posZSlider.value);
            this.updateSpaceshipPosition();
            posZValue.textContent = this.spaceshipPositionZ.toFixed(2);
        });
    
        rotXSlider.addEventListener("input", () => {
            this.spaceshipRotationX = parseFloat(rotXSlider.value) * Math.PI / 180;
            this.spaceship.rotation.x = this.spaceshipRotationX;
            rotXValue.textContent = rotXSlider.value;
        });
    
        rotYSlider.addEventListener("input", () => {
            this.spaceshipRotationY = parseFloat(rotYSlider.value) * Math.PI / 180;
            this.spaceship.rotation.y = this.spaceshipRotationY;
            rotYValue.textContent = rotYSlider.value;
        });
    
        rotZSlider.addEventListener("input", () => {
            this.spaceshipRotationZ = parseFloat(rotZSlider.value) * Math.PI / 180;
            this.spaceship.rotation.z = this.spaceshipRotationZ;
            rotZValue.textContent = rotZSlider.value;
        });
    
        axisXSlider.addEventListener("input", () => {
            this.spaceshipRotationAxisX = parseFloat(axisXSlider.value);
            axisXValue.textContent = this.spaceshipRotationAxisX.toFixed(2);
        });
    
        axisYSlider.addEventListener("input", () => {
            this.spaceshipRotationAxisY = parseFloat(axisYSlider.value);
            axisYValue.textContent = this.spaceshipRotationAxisY.toFixed(2);
        });
    
        axisZSlider.addEventListener("input", () => {
            this.spaceshipRotationAxisZ = parseFloat(axisZSlider.value);
            axisZValue.textContent = this.spaceshipRotationAxisZ.toFixed(2);
        });
    
        // Enemy Controls (unchanged)
        const spawnDistanceSlider = document.getElementById("spawnDistance") as HTMLInputElement;
        const lateralOffsetSlider = document.getElementById("lateralOffset") as HTMLInputElement;
        const baseSpeedSlider = document.getElementById("baseSpeed") as HTMLInputElement;
        const fireRateSlider = document.getElementById("fireRate") as HTMLInputElement;
        const bulletSpeedSlider = document.getElementById("bulletSpeed") as HTMLInputElement;
    
        const spawnDistanceValue = document.getElementById("spawnDistanceValue") as HTMLSpanElement;
        const lateralOffsetValue = document.getElementById("lateralOffsetValue") as HTMLSpanElement;
        const baseSpeedValue = document.getElementById("baseSpeedValue") as HTMLSpanElement;
        const fireRateValue = document.getElementById("fireRateValue") as HTMLSpanElement;
        const bulletSpeedValue = document.getElementById("bulletSpeedValue") as HTMLSpanElement;
    
        spawnDistanceSlider.addEventListener("input", () => {
            this.enemySpawnDistance = parseInt(spawnDistanceSlider.value);
            spawnDistanceValue.textContent = this.enemySpawnDistance.toString();
        });
    
        lateralOffsetSlider.addEventListener("input", () => {
            this.enemyLateralOffset = parseInt(lateralOffsetSlider.value);
            lateralOffsetValue.textContent = this.enemyLateralOffset.toString();
        });
    
        baseSpeedSlider.addEventListener("input", () => {
            this.enemyBaseSpeed = parseInt(baseSpeedSlider.value);
            baseSpeedValue.textContent = this.enemyBaseSpeed.toString();
        });
    
        fireRateSlider.addEventListener("input", () => {
            this.enemyFireRate = parseInt(fireRateSlider.value);
            fireRateValue.textContent = this.enemyFireRate.toString();
        });
    
        bulletSpeedSlider.addEventListener("input", () => {
            this.enemyBulletSpeed = parseInt(bulletSpeedSlider.value);
            bulletSpeedValue.textContent = this.enemyBulletSpeed.toString();
        });
    
        // Engine Sound Controls
        const engineVolumeSlider = document.getElementById("engineVolume") as HTMLInputElement;
        const engineFrequencySlider = document.getElementById("engineFrequency") as HTMLInputElement;
        const engineDetuneSlider = document.getElementById("engineDetune") as HTMLInputElement;
        const engineYawModSlider = document.getElementById("engineYawMod") as HTMLInputElement;
        const engineFilterFreqSlider = document.getElementById("engineFilterFreq") as HTMLInputElement;
        const engineTypeSelect = document.getElementById("engineType") as HTMLSelectElement;
    
        const engineVolumeValue = document.getElementById("engineVolumeValue") as HTMLSpanElement;
        const engineFrequencyValue = document.getElementById("engineFrequencyValue") as HTMLSpanElement;
        const engineDetuneValue = document.getElementById("engineDetuneValue") as HTMLSpanElement;
        const engineYawModValue = document.getElementById("engineYawModValue") as HTMLSpanElement;
        const engineFilterFreqValue = document.getElementById("engineFilterFreqValue") as HTMLSpanElement;
    
        engineVolumeSlider.addEventListener("input", () => {
            const volume = parseFloat(engineVolumeSlider.value);
            this.spaceshipEngineGain.gain.setValueAtTime(volume, this.audioContext.currentTime);
            engineVolumeValue.textContent = volume.toFixed(2);
        });
    
        engineFrequencySlider.addEventListener("input", () => {
            const frequency = parseInt(engineFrequencySlider.value);
            this.spaceshipEngineOscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            engineFrequencyValue.textContent = frequency.toString();
        });
    
        engineDetuneSlider.addEventListener("input", () => {
            const detune = parseInt(engineDetuneSlider.value);
            this.spaceshipEngineOscillator.detune.setValueAtTime(detune, this.audioContext.currentTime);
            engineDetuneValue.textContent = detune.toString();
        });
    
        engineYawModSlider.addEventListener("input", () => {
            const yawMod = parseInt(engineYawModSlider.value);
            engineYawModValue.textContent = yawMod.toString();
        });
    
        engineFilterFreqSlider.addEventListener("input", () => {
            const filterFreq = parseInt(engineFilterFreqSlider.value);
            this.spaceshipEngineFilter.frequency.setValueAtTime(filterFreq, this.audioContext.currentTime);
            engineFilterFreqValue.textContent = filterFreq.toString(); 
        });
    
        engineTypeSelect.addEventListener("change", () => {
            this.spaceshipEngineOscillator.type = engineTypeSelect.value as OscillatorType;
        });
    }

    private updateSpaceshipPosition(): void {
        if (this.spaceship && this.pod) {
            const offset = new THREE.Vector3(this.spaceshipPositionX, this.spaceshipPositionY, this.spaceshipPositionZ);
            offset.applyQuaternion(this.pod.quaternion);
            this.spaceship.position.copy(this.pod.position).add(offset);
            this.spaceship.quaternion.copy(this.pod.quaternion);
        }
    }

    private generateAsteroid(scaleFactor: number): THREE.Mesh {
        const baseRadius = 40;
        const segments = 32; // Keep higher resolution for detail
        const geometry = new THREE.SphereGeometry(baseRadius * scaleFactor, segments, segments);
        const positions = geometry.attributes.position.array as Float32Array;
        const noise = createNoise3D();
        const vertices = geometry.attributes.position.count;
    
        // Step 1: Initial deformation to break spherical shape
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const vertex = new THREE.Vector3(x, y, z);
            const distance = vertex.length();
            
            // Low-frequency noise for overall shape deformation
            const deformNoise = noise(x * 0.02, y * 0.02, z * 0.02) * 15; // Larger-scale deformation
            vertex.normalize().multiplyScalar(distance + deformNoise);
            
            positions[i] = vertex.x;
            positions[i + 1] = vertex.y;
            positions[i + 2] = vertex.z;
        }
    
        // Step 2: Scraping for more, smaller craters/flat spots
        const scrapeCount = Math.floor(15 + Math.random() * 15); // 15 to 30 scrapes (5x more)
        const scrapedVertices = new Set<number>();
    
        for (let scrape = 0; scrape < scrapeCount; scrape++) {
            // Random point on sphere as scrape center
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);
            const scrapeCenter = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.sin(phi) * Math.sin(theta),
                Math.cos(phi)
            ).normalize();
    
            // Smaller scrape parameters
            const scrapeRadius = 0.06 + Math.random() * 0.11; // 0.06 to 0.17 radians (~3° to 10°, 3–5x smaller)
            const scrapeDepth = baseRadius * (0.05 + Math.random() * 0.1); // Depth: 5% to 15% of radius, scaled down
    
            for (let i = 0; i < vertices; i++) {
                const x = positions[i * 3];
                const y = positions[i * 3 + 1];
                const z = positions[i * 3 + 2];
                const vertex = new THREE.Vector3(x, y, z).normalize();
                
                // Calculate angular distance
                const angle = Math.acos(vertex.dot(scrapeCenter));
                if (angle < scrapeRadius) {
                    const distance = new THREE.Vector3(x, y, z).length();
                    const newDistance = distance - scrapeDepth * (1 - angle / scrapeRadius);
                    vertex.multiplyScalar(newDistance / distance);
                    positions[i * 3] = vertex.x;
                    positions[i * 3 + 1] = vertex.y;
                    positions[i * 3 + 2] = vertex.z;
                    scrapedVertices.add(i);
                }
            }
        }
    
        // Step 3: Apply layered noise for surface detail
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const vertex = new THREE.Vector3(x, y, z);
            const distance = vertex.length();
    
            // Adjusted noise layers: coarse and fine
            const coarseNoise = noise(x * 0.05, y * 0.05, z * 0.05) * 8;  // Reduced amplitude for balance
            const fineNoise = noise(x * 0.2, y * 0.2, z * 0.2) * 2;     // Fine details
            const noiseValue = coarseNoise + fineNoise;
    
            // Slightly less amplification on scraped areas
            const amplification = scrapedVertices.has(i / 3) ? 0.7 : 1.0;
            vertex.normalize().multiplyScalar(distance + noiseValue * amplification * (vertex.length() / baseRadius));
            
            positions[i] = vertex.x;
            positions[i + 1] = vertex.y;
            positions[i + 2] = vertex.z;
        }
    
        geometry.computeVertexNormals();
    
        const material = new THREE.MeshStandardMaterial({
            color: 0x333333,
            map: this.asteroidTexture,
            metalness: 0.2,
            roughness: 0.85,
            side: THREE.DoubleSide,
            emissive: 0x111111,
            emissiveIntensity: 0.2
        });
    
        return new THREE.Mesh(geometry, material);
    }

    // Replace the oscillator sound code in the `shootBullet` method with this
    private shootBullet(): void {
        const currentTime = performance.now();
        if (currentTime - this.lastShotTime < this.fireRate) return;
        this.lastShotTime = currentTime;

        // Clone the laser sound to allow overlapping plays
        const laserClone = this.laserSound.cloneNode(true) as HTMLAudioElement;
        laserClone.volume = 0.5; // Adjust volume as needed (0.0 to 1.0)
        laserClone.play().catch(err => console.error("Laser sound playback failed:", err));

        const bulletGeometry = new THREE.SphereGeometry(1, 16, 16);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 3 });
        const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);

        const spawnOffset = new THREE.Vector3(0, 0, -3).applyQuaternion(this.pod.quaternion);
        bulletMesh.position.copy(this.pod.position).add(spawnOffset);
        this.scene.add(bulletMesh);

        const bulletBody = new CANNON.Body({ mass: 1 });
        bulletBody.addShape(new CANNON.Sphere(1));
        bulletBody.position.copy(bulletMesh.position);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.pod.quaternion).normalize();
        bulletBody.velocity.set(forward.x * 1000, forward.y * 1000, forward.z * 1000);
        this.world.addBody(bulletBody);

        this.bullets.push({ mesh: bulletMesh, body: bulletBody });
    }

    private startCountdown(): void {
        this.countdownTimer = 0;
        this.raceStarted = false;
        this.countdownElement.textContent = `${this.countdown}`;
        this.countdownElement.style.display = "block";
    }

    private spawnEnemyShip(): void {
        const enemyGroup = new THREE.Group();
        const bodyGeometry = new THREE.SphereGeometry(7, 16, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            map: this.metalTexture,
            metalness: 0.8,
            roughness: 0.4
        });
        const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        enemyGroup.add(bodyMesh);

        const windowGeometry = new THREE.SphereGeometry(4.2, 16, 16);
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0xd3d3d3,
            metalness: 0.9,
            roughness: 0.1
        });
        const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
        windowMesh.scale.z = 0.2;
        windowMesh.position.set(0, 0, -7);
        enemyGroup.add(windowMesh);

        const t = (this.podDistance + this.enemySpawnDistance) / this.trackPath.getLength() % 1;
        const basePos = this.trackPath.getPointAt(t);
        const tangent = this.trackPath.getTangentAt(t);
        const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        const binormal = tangent.clone().cross(normal).normalize();
        enemyGroup.position.copy(basePos)
            .addScaledVector(normal, (this.rng() - 0.5) * this.enemyLateralOffset)
            .addScaledVector(binormal, (this.rng() - 0.5) * this.enemyLateralOffset);
            enemyGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent); // Changed from tangent.negate()
        this.scene.add(enemyGroup);

        const enemyBody = new CANNON.Body({ mass: 1 });
        enemyBody.addShape(new CANNON.Sphere(7));
        enemyBody.position.copy(enemyGroup.position);
        this.world.addBody(enemyBody);

        this.enemyShips.push({ mesh: enemyGroup, body: enemyBody });
        this.enemyShotCounts.set(enemyBody, 0);
        this.enemyHits.set(enemyBody, 0);
        this.enemySpawnsThisLevel++;

            // Initialize burst state with random start delay
        const initialDelay = this.rng() * this.maxBurstDelay; // Random start time (0 to 2s)
        this.enemyBurstStates.set(enemyBody, {
            isBursting: false,
            burstCount: 0,
            burstDelay: initialDelay, // Starts with a random delay
            lastBurstTime: performance.now() / 1000 - initialDelay // Offset for staggered starts
        });
    }

    private async createScene(): Promise<void> {
        this.rng = seedrandom("pod_racing_seed");
    
        const squareSize = 2.6;
        const squareGeometry = new THREE.BufferGeometry();
        const squareVertices = new Float32Array([
            -squareSize, -squareSize, -3,
            squareSize, -squareSize, -3,
            squareSize, squareSize, -3,
            -squareSize, squareSize, -3
        ]);
        squareGeometry.setAttribute('position', new THREE.BufferAttribute(squareVertices, 3));
        const squareMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2, linewidth: 2 });
        this.neonSquare = new THREE.LineLoop(squareGeometry, squareMaterial);
        this.neonSquare.visible = this.showNeonSquare; // Off by default
        this.scene.add(this.neonSquare);
    
        const podGeometry = new THREE.BoxGeometry(4, 4, 4);
        const podMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2, emissive: 0x550000, emissiveIntensity: 1.5 });
        this.pod = new THREE.Mesh(podGeometry, podMaterial);
        this.pod.position.set(1500, 0, 0);
        this.pod.visible = this.makePodVisible;
        this.scene.add(this.pod);
    
        const loader = new GLTFLoader();
        this.spaceship = await loader.loadAsync('/assets/spaceship/scene.gltf').then(gltf => gltf.scene).catch(() => {
            const fallbackGeometry = new THREE.BoxGeometry(4, 4, 4);
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
            return new THREE.Group().add(new THREE.Mesh(fallbackGeometry, fallbackMaterial));
        });
    
        this.spaceship.position.set(this.pod.position.x + this.spaceshipPositionX, this.pod.position.y + this.spaceshipPositionY, this.pod.position.z + this.spaceshipPositionZ);
        this.spaceship.scale.set(this.spaceshipScale, this.spaceshipScale, this.spaceshipScale);
        this.spaceship.rotation.set(this.spaceshipRotationX, this.spaceshipRotationY, this.spaceshipRotationZ);
        this.scene.add(this.spaceship);
    
        this.podBody = new CANNON.Body({ mass: 1 });
        this.podBody.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 2)));
        this.podBody.position.copy(this.pod.position);
        this.world.addBody(this.podBody);
    
        // Track length reduced by 50% (from 120s to 60s)
        const trackLength = this.basePodSpeed * 60; // Distance = speed * time (1 minute)
        const points = [];
        const numPoints = 33;
        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1);
            const x = 1500 * Math.cos(t * 4 * Math.PI);
            const y = 400 * Math.sin(t * 4 * Math.PI);
            const z = t * trackLength;
            points.push(new THREE.Vector3(x, y, z));
        }
        this.trackPath = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    
        const pathPoints = this.trackPath.getPoints(512);
        const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, emissive: 0x00ffff, linewidth: 5, emissiveIntensity: 2 });
        this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
        this.pathLine.visible = this.showPathLine;
        this.scene.add(this.pathLine);
    
        const baseAsteroidCount = 150;
        const asteroidCount = baseAsteroidCount + Math.floor((this.level - 1) * (1350 / 99));
        for (let i = 0; i < asteroidCount; i++) {
            const t = this.rng();
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const offsetX = (this.rng() - 0.5) * 1000;
            const offsetY = (this.rng() - 0.5) * 1000;
            const offsetZ = (this.rng() - 0.5) * 1000;
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize();
    
            const scaleFactor = 0.2 + this.rng() * 0.8;
            const asteroid = this.generateAsteroid(scaleFactor);
            asteroid.position.copy(basePos).addScaledVector(normal, offsetX).addScaledVector(binormal, offsetY).addScaledVector(tangent, offsetZ);
            this.scene.add(asteroid);
    
            const obstacleBody = new CANNON.Body({ mass: 1 });
            obstacleBody.addShape(new CANNON.Sphere(40 * scaleFactor * 0.85)); // Adjusted for more intrusions
            obstacleBody.position.copy(asteroid.position);
            this.world.addBody(obstacleBody);
    
            this.obstacles.push({ mesh: asteroid, body: obstacleBody, isFullAsteroid: true });
        }

        const starGeometry = new THREE.BufferGeometry();
        const starCount = 20000;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount * 3; i += 3) {
            positions[i] = (this.rng() - 0.5) * 30000;
            positions[i + 1] = (this.rng() - 0.5) * 30000;
            positions[i + 2] = (this.rng() - 0.5) * 30000;
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 3 });
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);

        const textureLoader = new THREE.TextureLoader();
        const earthGeometry = new THREE.SphereGeometry(1000, 32, 32);
        const earthMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/earth.jpg') });
        this.earth = new THREE.Mesh(earthGeometry, earthMaterial);
        this.earth.position.set(5000, 2000, 10000);
        this.scene.add(this.earth);

        const atmosphereGeometry = new THREE.SphereGeometry(1050, 32, 32);
        const atmosphereMaterial = new THREE.MeshStandardMaterial({
            color: 0x87ceeb,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        this.earthAtmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        this.earthAtmosphere.position.copy(this.earth.position);
        this.scene.add(this.earthAtmosphere);

        const moonGeometry = new THREE.SphereGeometry(300, 32, 32);
        const moonMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/moon.jpg') });
        this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
        this.moon.position.set(this.earth.position.x + this.moonOrbitRadius, this.earth.position.y, this.earth.position.z);
        this.scene.add(this.moon);

        const marsGeometry = new THREE.SphereGeometry(800, 32, 32);
        const marsMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/mars.jpg') });
        this.mars = new THREE.Mesh(marsGeometry, marsMaterial);
        this.mars.position.set(-6000, -3000, 12000);
        this.scene.add(this.mars);

        this.addAdditionalPlanets();

        this.scene.userData = { earth: this.earth, moon: this.moon, mars: this.mars };

        const ambientLight = new THREE.AmbientLight(0xddddbb, 6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
        directionalLight.position.set(5000, 5000, 5000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 8);
        sunLight.position.set(10000, 10000, 10000);
        sunLight.castShadow = true;
        this.scene.add(sunLight);

        const sunSpotLight = new THREE.SpotLight(0xffffaa, 10, 30000, Math.PI / 4, 0.3);
        sunSpotLight.position.copy(sunLight.position);
        sunSpotLight.target.position.set(0, 0, 0);
        this.scene.add(sunSpotLight);
        this.scene.add(sunSpotLight.target);

        const sunGeometry = new THREE.SphereGeometry(100, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffaa, 
            emissive: 0xffffaa, 
            emissiveIntensity: 2 
        });
        const sun = new THREE.Mesh(sunGeometry, sunMaterial);
        sun.position.copy(sunLight.position);
        this.scene.add(sun);

        const glareTexture = textureLoader.load('/assets/textures/glare.png', undefined, undefined, () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            gradient.addColorStop(0, 'rgba(255, 255, 170, 1)');
            gradient.addColorStop(1, 'rgba(255, 255, 170, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(canvas);
        });
        const glareMaterial = new THREE.SpriteMaterial({
            map: glareTexture,
            color: 0xffffaa,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });
        const glareSprite = new THREE.Sprite(glareMaterial);
        glareSprite.scale.set(4000, 4000, 1);
        glareSprite.position.copy(sunLight.position);
        this.scene.add(glareSprite);

        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = 50;
        const particlePositions = new Float32Array(particleCount * 3);
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleMaterial = new THREE.PointsMaterial({ color: 0xff0000, size: 2, transparent: true });
        this.thrusterParticles = new THREE.Points(particleGeometry, particleMaterial);

        const hitParticleGeometry = new THREE.BufferGeometry();
        const hitParticlePositions = new Float32Array(particleCount * 3);
        hitParticleGeometry.setAttribute('position', new THREE.BufferAttribute(hitParticlePositions, 3));
        const hitParticleMaterial = new THREE.PointsMaterial({ color: 0xff0000, size: 3, transparent: true });
        this.hitParticles = new THREE.Points(hitParticleGeometry, hitParticleMaterial);
        this.scene.add(this.hitParticles);

        this.dynamicLight = new THREE.PointLight(0xffffff, 5, 20000);
        this.scene.add(this.dynamicLight);

        // Adjust pod speed for current level
        this.podSpeed = this.basePodSpeed * (1 + (this.level - 1) * 0.01); // 1% increase per level
    }

    private addAdditionalPlanets(): void {
        const textureLoader = new THREE.TextureLoader();
        const planetConfigs = [
            { color: 0x00ff00, size: 600, pos: [-8000, 6000, 15000], rings: true, rotationSpeed: 0.0008, texture: '/assets/textures/jupiter.jpg' },
            { color: 0xff00ff, size: 700, pos: [6000, -4000, 20000], stars: 3, rotationSpeed: 0.0006, texture: '/assets/textures/uranus.jpg' },
            { color: 0x0000ff, size: 500, pos: [-12000, 2000, 18000], rings: false, rotationSpeed: 0.0007, texture: '/assets/textures/neptune.jpg' },
            { color: 0xffff00, size: 650, pos: [10000, 8000, 25000], rings: true, rotationSpeed: 0.0005, texture: '/assets/textures/saturn.jpg' },
            { color: 0xffa500, size: 550, pos: [-4000, -8000, 14000], stars: 2, rotationSpeed: 0.0009, texture: '/assets/textures/venus.jpg' },
            { color: 0x00ffff, size: 720, pos: [0, 10000, 22000], rings: false, rotationSpeed: 0.0004, texture: '/assets/textures/mercury.jpg' }
        ];

        planetConfigs.forEach(config => {
            const planetGeometry = new THREE.SphereGeometry(config.size, 32, 32);
            const planetMaterial = new THREE.MeshStandardMaterial({ 
                map: textureLoader.load(config.texture),
                color: config.color 
            });
            const planet = new THREE.Mesh(planetGeometry, planetMaterial);
            planet.position.set(config.pos[0], config.pos[1], config.pos[2]);
            this.scene.add(planet);

            let rings: THREE.Mesh | undefined;
            let stars: THREE.Mesh[] | undefined;

            if (config.rings) {
                const ringGeometry = new THREE.RingGeometry(config.size * 1.2, config.size * 1.5, 32);
                const ringMaterial = new THREE.MeshStandardMaterial({ color: config.color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
                rings = new THREE.Mesh(ringGeometry, ringMaterial);
                rings.rotation.x = Math.PI / 2;
                rings.position.copy(planet.position);
                this.scene.add(rings);
            }

            if (config.stars) {
                stars = [];
                for (let i = 0; i < config.stars; i++) {
                    const starGeometry = new THREE.SphereGeometry(50, 16, 16);
                    const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    const star = new THREE.Mesh(starGeometry, starMaterial);
                    const angle = (i / config.stars) * 2 * Math.PI;
                    star.position.set(
                        planet.position.x + Math.cos(angle) * config.size * 2,
                        planet.position.y,
                        planet.position.z + Math.sin(angle) * config.size * 2
                    );
                    this.scene.add(star);
                    stars.push(star);
                }
            }

            this.additionalPlanets.push({ mesh: planet, rings, stars, rotationSpeed: config.rotationSpeed });
        });
    }

    // Replace the explosion sound in triggerEnemyExplosion
    private triggerEnemyExplosion(position: THREE.Vector3): void {
        const explosionParticleCount = 100;
        const explosionGeometry = new THREE.BufferGeometry();
        const explosionPositions = new Float32Array(explosionParticleCount * 3);
        const velocities: THREE.Vector3[] = [];
        const lifetimes: number[] = [];
        const duration = 1.5;

        for (let i = 0; i < explosionPositions.length; i += 3) {
            explosionPositions[i] = position.x;
            explosionPositions[i + 1] = position.y;
            explosionPositions[i + 2] = position.z;

            const velocity = new THREE.Vector3(
                (this.rng() - 0.5) * 20,
                (this.rng() - 0.5) * 20,
                (this.rng() - 0.5) * 20
            ).normalize().multiplyScalar(50 + this.rng() * 20);

            velocities.push(velocity);
            lifetimes.push(duration);
        }

        explosionGeometry.setAttribute('position', new THREE.BufferAttribute(explosionPositions, 3));
        const explosionMaterial = new THREE.PointsMaterial({
            color: 0xff5500,
            size: 4,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        explosionMaterial.color.setHSL(this.rng() * 0.1 + 0.05, 1, 0.5);

        const particles = new THREE.Points(explosionGeometry, explosionMaterial);
        this.scene.add(particles);
        this.explosionInstances.push({ particles, velocities, lifetimes, duration });

        // Clone the explosion sound to allow overlapping plays
        const explosionClone = this.explosionSound.cloneNode(true) as HTMLAudioElement;
        explosionClone.volume = 0.5; // Adjust volume as needed
        explosionClone.play().catch(err => console.error("Explosion sound playback failed:", err));
    }

    private triggerHitParticles(): void {
        const particleCount = 50;
        const positions = this.hitParticles.geometry.attributes.position.array as Float32Array;
        const velocities: THREE.Vector3[] = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = this.pod.position.x;
            positions[i * 3 + 1] = this.pod.position.y;
            positions[i * 3 + 2] = this.pod.position.z;

            const velocity = new THREE.Vector3(
                (this.rng() - 0.5) * 20,
                (this.rng() - 0.5) * 20,
                (this.rng() - 0.5) * 20
            ).normalize().multiplyScalar(10 + this.rng() * 10);
            velocities.push(velocity);
        }

        this.hitParticles.userData = { velocities, lifetimes: new Array(particleCount).fill(1.0) };
        this.hitParticles.geometry.attributes.position.needsUpdate = true;
    }

    private updateHitParticles(deltaTime: number): void {
        if (!this.hitParticles.userData.velocities) return;

        const positions = this.hitParticles.geometry.attributes.position.array as Float32Array;
        const velocities = this.hitParticles.userData.velocities as THREE.Vector3[];
        const lifetimes = this.hitParticles.userData.lifetimes as number[];
        let allExpired = true;

        for (let i = 0; i < positions.length / 3; i++) {
            if (lifetimes[i] > 0) {
                positions[i * 3] += velocities[i].x * deltaTime;
                positions[i * 3 + 1] += velocities[i].y * deltaTime;
                positions[i * 3 + 2] += velocities[i].z * deltaTime;
                lifetimes[i] -= deltaTime;
                allExpired = false;
            }
        }

        this.hitParticles.geometry.attributes.position.needsUpdate = true;
        const material = this.hitParticles.material as THREE.PointsMaterial;
        material.opacity = Math.max(0, lifetimes[0] / 1.0);

        if (allExpired) {
            this.hitParticles.userData = {};
        }
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());
    
        this.updateSpaceshipPosition();
    
        const tangentSpaship = this.trackPath.getTangentAt(this.podDistance / this.trackPath.getLength());
        if (this.cameraMode === 0) {
            this.neonSquare.visible = this.showNeonSquare; // Controlled by showNeonSquare
            if (this.showNeonSquare) {
                this.neonSquare.position.copy(this.pod.position).addScaledVector(tangentSpaship, -3);
                const tangentNeon = this.trackPath.getTangentAt(this.podDistance / this.trackPath.getLength());
                const quaternionNeon = new THREE.Quaternion();
                quaternionNeon.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tangentNeon);
                this.neonSquare.quaternion.copy(quaternionNeon);
            }
        } else {
            this.neonSquare.visible = false;
        }
    
        if (this.isPaused) {
            this.renderer.render(this.scene, this.camera);
            return;
        }
        this.world.step(1 / 60);
        const deltaTime = 1 / 60;
    
        if (this.difficultyMenu.style.display === "block") {
            this.renderer.render(this.scene, this.camera);
            return;
        }
    
        if (this.startButton.style.display !== "none") {
            const startPos = this.trackPath.getPointAt(0);
            this.camera.position.copy(startPos);
            const startTangent = this.trackPath.getTangentAt(0).negate();
            this.camera.lookAt(startPos.clone().add(startTangent));
            this.renderer.render(this.scene, this.camera);
            return;
        }
    
        if (this.isIntroPlaying) {
            this.introTime += deltaTime;
            const angle = (this.introTime / (this.introDuration * 5)) * 2 * Math.PI;
            const radius = 20;
            const podPos = this.pod.position;
    
            this.camera.position.set(
                podPos.x + radius * Math.cos(angle),
                podPos.y + 5,
                podPos.z + radius * Math.sin(angle)
            );
            this.camera.lookAt(podPos);
    
            this.renderer.render(this.scene, this.camera);
    
            if (this.introTime >= this.introDuration || this.introAudio.ended) {
                this.isIntroPlaying = false;
                this.introTime = 0;
                this.countdownTimer = 0;
                this.countdownElement.style.display = "block";
            }
            return;
        }
    
        if (!this.raceStarted) {
            if (this.introTime < 1) {
                this.introTime += deltaTime * 2;
                const t = this.podDistance / this.trackPath.getLength();
                const tangent = this.trackPath.getTangentAt(t);
                const targetPos = this.pod.position.clone().addScaledVector(tangent, -2);
                const startPos = this.camera.position.clone();
    
                this.camera.position.lerpVectors(startPos, targetPos, this.introTime);
                this.camera.lookAt(this.pod.position);
            }
    
            this.countdownTimer += deltaTime;
            const timeLeft = Math.max(0, this.countdown - this.countdownTimer);
            this.countdownElement.textContent = timeLeft > 0 ? `${Math.ceil(timeLeft)}` : `Level ${this.level} - Go!`;
            this.renderer.render(this.scene, this.camera);
    
            if (timeLeft <= 0) {
                this.raceStarted = true;
                this.countdownElement.style.display = "none";
                this.canvas.requestPointerLock();
            }
            return;
        }
    
        this.survivalTime += deltaTime;
        this.score += this.podSpeed * deltaTime;
    
        const trackLength = this.trackPath.getLength();
        this.podDistance += this.podSpeed * deltaTime;
    
        if (this.podDistance >= trackLength) {
            this.level += 1;
            if (this.level > 100) {
                alert("Congratulations! You’ve won the game!");
                this.isPaused = true;
                this.pauseMenu.style.display = "block";
                return;
            }
            this.podDistance = 0;
            this.survivalTime = 0;
            this.podSpeed = this.basePodSpeed * (1 + (this.level - 1) * 0.01);
            this.scene.remove(this.pathLine);
            this.obstacles.forEach(o => {
                this.scene.remove(o.mesh);
                this.world.removeBody(o.body);
                if (o.body.userData?.debugMesh) this.scene.remove(o.body.userData.debugMesh);
            });
    
            this.enemyShips.forEach(enemy => {
                this.scene.remove(enemy.mesh);
                this.world.removeBody(enemy.body);
            });
            this.enemyBullets.forEach(bullet => {
                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
            });
            this.explosionInstances.forEach(instance => {
                this.scene.remove(instance.particles);
            });
            this.obstacles = [];
            this.bullets = [];
            this.enemyShips = [];
            this.enemyBullets = [];
            this.explosionInstances = [];
            this.lastEnemyShotTimes.clear();
            this.enemyShotCounts.clear();
            this.enemyHits.clear();
            this.enemySpawnsThisLevel = 0;
            this.alertsThisLevel = 0;
            this.createScene();
            this.pathLine.visible = this.showPathLine;
            this.startCountdown();
            return;
        }
    
        const t = this.podDistance / trackLength;
        const basePos = this.trackPath.getPointAt(t);
        const tangent = this.trackPath.getTangentAt(t);
        const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        const binormal = tangent.clone().cross(normal).normalize();
    
        const maxOffset = 20;
        const moveSpeed = 30;
        const lerpFactor = 0.1;
    
        const rightDir = new THREE.Vector3(1, 0, 0);
        const upDir = new THREE.Vector3(0, 1, 0);
        if (this.moveLeft) this.podOffsetX -= moveSpeed * deltaTime;
        if (this.moveRight) this.podOffsetX += moveSpeed * deltaTime;
        if (this.moveUp) this.podOffsetY += moveSpeed * deltaTime;
        if (this.moveDown) this.podOffsetY -= moveSpeed * deltaTime;
    
        this.podOffsetX = Math.max(-maxOffset, Math.min(maxOffset, this.podOffsetX));
        this.podOffsetY = Math.max(-maxOffset, Math.min(maxOffset, this.podOffsetY));
    
        this.currentOffsetX = THREE.MathUtils.lerp(this.currentOffsetX, this.podOffsetX, lerpFactor);
        this.currentOffsetY = THREE.MathUtils.lerp(this.currentOffsetY, this.podOffsetY, lerpFactor);
    
        const podOffsetVec = rightDir.clone().multiplyScalar(this.currentOffsetX).add(upDir.clone().multiplyScalar(this.currentOffsetY));
        const podPos = basePos.clone().add(podOffsetVec);
        this.podBody.position.copy(podPos);
        this.pod.position.copy(this.podBody.position);
    
        const quaternionPod = new THREE.Quaternion();
        quaternionPod.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tangent);
        const yawQuatPod = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        const pitchQuatPod = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
        quaternionPod.multiply(yawQuatPod).multiply(pitchQuatPod);
        this.pod.quaternion.copy(quaternionPod);
    
        if (!this.moveLeft && !this.moveRight) this.podOffsetX *= 0.9;
        if (!this.moveUp && !this.moveDown) this.podOffsetY *= 0.9;
    
         // Update spaceship engine sound based on yaw
    const baseFrequency = 100; // Base engine frequency
    const yawRange = Math.PI / 4; // Max yaw range from setupInput
    const frequencyShift = (this.yaw / yawRange) * 50; // Shift frequency by ±50 Hz
    this.spaceshipEngineOscillator.frequency.setValueAtTime(baseFrequency + frequencyShift, this.audioContext.currentTime);

        const tNext = Math.min(t + 0.01, 1);
        const tangentNext = this.trackPath.getTangentAt(tNext);
        const curvature = tangent.distanceTo(tangentNext) / 0.01;
        const currentTime = performance.now() / 1000;
        if (curvature > 0.1 && currentTime - this.lastAlertTime > this.alertCooldown && this.alertsThisLevel < this.maxAlertsPerLevel) {
            this.alertSounds.forEach((sound, index) => {
                setTimeout(() => sound.play().catch(err => console.error("Alert playback failed:", err)), index * 500);
            });
            this.lastAlertTime = currentTime;
            this.alertsThisLevel++;
        }
    
        switch (this.cameraMode) {
            case 0:
                this.camera.position.copy(this.pod.position).addScaledVector(tangent, -2);
                this.camera.quaternion.copy(this.pod.quaternion);
                break;
            case 1:
                this.camera.position.copy(this.pod.position).addScaledVector(tangent.negate(), 15).addScaledVector(normal, 5);
                this.camera.lookAt(this.pod.position);
                break;
            case 2:
                this.camera.position.set(0, 25000, 0);
                this.camera.lookAt(new THREE.Vector3(0, 0, 0));
                break;
        }
    
        this.earth.rotation.y += 0.001;
        this.mars.rotation.y += 0.0009;
        this.moonOrbitAngle += 0.0005;
        this.moon.position.set(
            this.earth.position.x + Math.cos(this.moonOrbitAngle) * this.moonOrbitRadius,
            this.earth.position.y,
            this.earth.position.z + Math.sin(this.moonOrbitAngle) * this.moonOrbitRadius
        );
        this.moon.rotation.y += 0.0003;
    
        this.additionalPlanets.forEach(planet => {
            planet.mesh.rotation.y += planet.rotationSpeed;
            if (planet.rings) planet.rings.rotation.z += planet.rotationSpeed * 0.5;
            if (planet.stars) {
                planet.stars.forEach((star, index) => {
                    const angle = this.survivalTime * planet.rotationSpeed + (index / planet.stars!.length) * 2 * Math.PI;
                    const radius = planet.mesh.geometry.parameters.radius * 2;
                    star.position.set(
                        planet.mesh.position.x + Math.cos(angle) * radius,
                        planet.mesh.position.y,
                        planet.mesh.position.z + Math.sin(angle) * radius
                    );
                });
            }
        });
    
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            if (!obstacle.mesh || !obstacle.body) continue;
            obstacle.mesh.rotation.x += 0.0025;
            obstacle.mesh.rotation.y += 0.0025;
            obstacle.mesh.rotation.z += 0.0025;
    
            obstacle.mesh.position.copy(obstacle.body.position);
            if (obstacle.body.userData?.debugMesh) {
                obstacle.body.userData.debugMesh.position.copy(obstacle.body.position);
            }
    
            const aggressionFactor = Math.min(this.level / 100, 1);
            if (this.rng() < aggressionFactor * 0.12) {
                const directionToPod = this.pod.position.clone().sub(obstacle.mesh.position).normalize();
                obstacle.body.velocity.set(directionToPod.x * 30 * aggressionFactor, directionToPod.y * 30 * aggressionFactor, directionToPod.z * 30 * aggressionFactor);
            }
    
            const scaleFactor = obstacle.mesh.scale.x;
            if (this.pod.position.distanceTo(obstacle.mesh.position) < 6 * scaleFactor) {
                this.explosionSound.play();
                const directionAway = obstacle.mesh.position.clone().sub(this.pod.position).normalize();
                obstacle.body.velocity.set(directionAway.x * 50, directionAway.y * 50, directionAway.z * 50);
                this.splitAsteroid(obstacle.mesh as THREE.Mesh, obstacle.body, scaleFactor);
                this.scene.remove(obstacle.mesh);
                this.world.removeBody(obstacle.body);
                if (obstacle.body.userData?.debugMesh) this.scene.remove(obstacle.body.userData.debugMesh);
                this.obstacles.splice(i, 1);
                this.lives -= 1;
                this.podSpeed *= 0.8;
                this.triggerHitParticles();
                if (this.lives <= 0) {
                    this.isPaused = true;
                    this.gameOverMenu.style.display = "block"; // Show game over menu
                }
            }
        }
    
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet.mesh || !bullet.body) {
                this.bullets.splice(i, 1);
                continue;
            }
            bullet.mesh.position.copy(bullet.body.position);
            bullet.mesh.visible = true;
    
            let bulletHit = false;
            for (let j = this.obstacles.length - 1; j >= 0; j--) {
                const obstacle = this.obstacles[j];
                if (!obstacle.mesh || !obstacle.body) continue;
                const scaleFactor = obstacle.mesh.scale.x;
                const hitDistance = 3 + 2 * scaleFactor;
                const distance = bullet.mesh.position.distanceTo(obstacle.mesh.position);
                if (distance < hitDistance) {
                    this.explosionSound.play();
                    const pushDirection = obstacle.mesh.position.clone().sub(bullet.mesh.position).normalize();
                    const pushForce = 300;
                    obstacle.body.velocity.set(pushDirection.x * pushForce, pushDirection.y * pushForce, pushDirection.z * pushForce);
                    this.splitAsteroid(obstacle.mesh as THREE.Mesh, obstacle.body, scaleFactor);
                    this.scene.remove(obstacle.mesh);
                    this.world.removeBody(obstacle.body);
                    if (obstacle.body.userData?.debugMesh) this.scene.remove(obstacle.body.userData.debugMesh);
                    this.obstacles.splice(j, 1);
                    bulletHit = true;
                    this.score += 50;
                    break;
                }
            }
    
            const distanceFromOrigin = bullet.mesh.position.length();
            if (bulletHit || distanceFromOrigin > 20000) {
                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
                this.bullets.splice(i, 1);
            }
        }
    
        this.asteroidSpawnTimer += deltaTime;
        const spawnInterval = this.asteroidSpawnInterval * (1 - (this.level - 1) / 100);
        const asteroidsToSpawn = Math.floor(this.asteroidSpawnTimer / spawnInterval);
        if (asteroidsToSpawn > 0) {
            for (let i = 0; i < asteroidsToSpawn; i++) {
                const tSpawn = (this.podDistance + 500) / trackLength % 1;
                const basePos = this.trackPath.getPointAt(tSpawn);
                const tangent = this.trackPath.getTangentAt(tSpawn);
                const minOffset = 150;
                const maxOffset = 300;
                const offsetX = minOffset + this.rng() * (maxOffset - minOffset);
                const offsetY = minOffset + this.rng() * (maxOffset - minOffset);
                const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
                const binormal = tangent.clone().cross(normal).normalize();
    
                const scaleFactor = 0.2 + this.rng() * 0.8;
                const asteroid = this.generateAsteroid(scaleFactor);
                asteroid.position.copy(basePos)
                    .addScaledVector(normal, offsetX * (this.rng() < 0.5 ? 1 : -1))
                    .addScaledVector(binormal, offsetY * (this.rng() < 0.5 ? 1 : -1));
                this.scene.add(asteroid);
    
                const obstacleBody = new CANNON.Body({ mass: 1 });
                obstacleBody.addShape(new CANNON.Sphere(40 * scaleFactor * 0.85));
                obstacleBody.position.copy(asteroid.position);
                this.world.addBody(obstacleBody);
    
                this.obstacles.push({ mesh: asteroid, body: obstacleBody, isFullAsteroid: true });
            }
            this.asteroidSpawnTimer = this.asteroidSpawnTimer % spawnInterval;
        }
    
        this.enemySpawnTimer += deltaTime;
        if (this.enemySpawnTimer >= this.enemySpawnInterval) {
            const enemyCount = Math.floor(3 + (this.level - 1) * (17 / 99));
            for (let i = 0; i < enemyCount; i++) {
                if (this.rng() < 0.5) {
                    this.spawnEnemyShip();
                    // Randomly play hold_tight or enemy_spotted every 20-30 enemies
                    if (this.enemySpawnsThisLevel % (20 + Math.floor(this.rng() * 11)) === 0) {
                        const sound = this.rng() < 0.5 ? this.holdTightSound : this.enemySpottedSound;
                        sound.play().catch(err => console.error("Audio playback failed:", err));
                    }
                }
            }
            this.enemySpawnTimer = 0;
        }
    
        function makeDistortionCurve(amount) {
            const samples = 44100;
            const curve = new Float32Array(samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < samples; ++i) {
                const x = i * 2 / samples - 1;
                curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
            }
            return curve;
        }
    
        for (let i = this.enemyShips.length - 1; i >= 0; i--) {
            const enemy = this.enemyShips[i];
            enemy.mesh.position.copy(enemy.body.position);
    
            const distanceToPod = enemy.mesh.position.distanceTo(this.pod.position);
            const speed = this.enemyBaseSpeed * (1 + (this.enemySpawnDistance - distanceToPod) / this.enemySpawnDistance);
            const directionToPod = this.pod.position.clone().sub(enemy.mesh.position).normalize();
            const erraticFactor = this.level * 0.1;
            const erraticOffset = new THREE.Vector3(
                (this.rng() - 0.5) * erraticFactor,
                (this.rng() - 0.5) * erraticFactor,
                (this.rng() - 0.5) * erraticFactor
            );
            directionToPod.add(erraticOffset).normalize();
            enemy.body.velocity.set(directionToPod.x * speed, directionToPod.y * speed, directionToPod.z * speed);
    
            const currentTime = performance.now() / 1000;
            let burstState = this.enemyBurstStates.get(enemy.body) || {
                isBursting: false,
                burstCount: 0,
                burstDelay: this.minBurstDelay,
                lastBurstTime: currentTime
            };
            let shotsFired = this.enemyShotCounts.get(enemy.body) || 0;
            

            // Check if it's time to start or continue a burst
    if (!burstState.isBursting && currentTime - burstState.lastBurstTime >= burstState.burstDelay && shotsFired < this.shotsToLoseLife) {
        burstState.isBursting = true;
        burstState.burstCount = this.rng() < 0.5 ? 1 : 2; // Randomly 1 or 2 shots
        burstState.lastBurstTime = currentTime;
    }

    // Handle burst firing
    if (burstState.isBursting && burstState.burstCount > 0) {
        const timeSinceLastShot = currentTime - burstState.lastBurstTime;
        if (timeSinceLastShot >= this.burstInterval || timeSinceLastShot === 0) {
            // Fire a bullet
            const laserClone = this.enemyLaserSound.cloneNode(true) as HTMLAudioElement;
            laserClone.volume = 0.5;
            laserClone.play().catch(err => console.error("Enemy laser sound playback failed:", err));

            const bulletGeometry = new THREE.SphereGeometry(1, 8, 8);
            const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
            bulletMesh.position.copy(enemy.mesh.position).add(directionToPod.clone().multiplyScalar(8));
            this.scene.add(bulletMesh);

            const bulletBody = new CANNON.Body({ mass: 1 });
            bulletBody.addShape(new CANNON.Sphere(1));
            bulletBody.position.copy(bulletMesh.position);
            bulletBody.velocity.set(directionToPod.x * this.enemyBulletSpeed, directionToPod.y * this.enemyBulletSpeed, directionToPod.z * this.enemyBulletSpeed);
            this.world.addBody(bulletBody);

            this.enemyBullets.push({ mesh: bulletMesh, body: bulletBody });
            burstState.burstCount--;
            burstState.lastBurstTime = currentTime;
            shotsFired++;
            this.enemyShotCounts.set(enemy.body, shotsFired);

            // Set damage cooldown after first shot in burst
            if (!this.enemyDamageCooldowns.has(enemy.body)) {
                this.enemyDamageCooldowns.set(enemy.body, currentTime + this.burstInterval * 2); // Cooldown lasts beyond burst
            }
        }

        // End burst and set random delay for next
        if (burstState.burstCount === 0) {
            burstState.isBursting = false;
            burstState.burstDelay = this.minBurstDelay + this.rng() * (this.maxBurstDelay - this.minBurstDelay);
        }
    }

    this.enemyBurstStates.set(enemy.body, burstState);



            
    
            for (let j = this.bullets.length - 1; j >= 0; j--) {
                const bullet = this.bullets[j];
                if (bullet.mesh.position.distanceTo(enemy.mesh.position) < 8) {
                    this.triggerEnemyExplosion(enemy.mesh.position);
                    this.scene.remove(enemy.mesh);
                    this.world.removeBody(enemy.body);
                    this.lastEnemyShotTimes.delete(enemy.body);
                    this.enemyHits.delete(enemy.body);
                    this.enemyShotCounts.delete(enemy.body);
                    this.enemyShips.splice(i, 1);
                    this.scene.remove(bullet.mesh);
                    this.world.removeBody(bullet.body);
                    this.bullets.splice(j, 1);
                    this.score += 100;
                    this.enemiesKilled += 1;
                    // Play nice_shot.mp3 every 10-15 kills
                    if (this.enemiesKilled % (10 + Math.floor(this.rng() * 6)) === 0) {
                        this.niceShotSound.play().catch(err => console.error("Audio playback failed:", err));
                    }
                    break;
                }
            }
    
            if (distanceToPod < 12) {
                this.lives -= 2;
                this.triggerHitParticles();
                this.scene.remove(enemy.mesh);
                this.world.removeBody(enemy.body);
                this.lastEnemyShotTimes.delete(enemy.body);
                this.enemyHits.delete(enemy.body);
                this.enemyShotCounts.delete(enemy.body);
                this.enemyShips.splice(i, 1);
                if (this.lives <= 0) {
                    this.isPaused = true;
                    this.gameOverMenu.style.display = "block";
                }
            } else if (distanceToPod > 1000 && shotsFired < this.shotsToLoseLife) {
                this.lives -= 1;
                this.triggerHitParticles();
                this.scene.remove(enemy.mesh);
                this.world.removeBody(enemy.body);
                this.lastEnemyShotTimes.delete(enemy.body);
                this.enemyHits.delete(enemy.body);
                this.enemyShotCounts.delete(enemy.body);
                this.enemyShips.splice(i, 1);
                if (this.lives <= 0) {
                    this.isPaused = true;
                    this.gameOverMenu.style.display = "block";
                }
            }
        }
    
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            bullet.mesh.position.copy(bullet.body.position);
    
            let firingEnemy: CANNON.Body | undefined;
            for (const enemy of this.enemyShips) {
                if (bullet.body.position.distanceTo(enemy.body.position) < 100) {
                    firingEnemy = enemy.body;
                    break;
                }
            }
    
            if (bullet.mesh.position.distanceTo(this.pod.position) < 5 && firingEnemy) {
                let hits = (this.enemyHits.get(firingEnemy) || 0) + 1;
                this.enemyHits.set(firingEnemy, hits);
                if (hits >= this.shotsToLoseLife) {
                    this.lives -= 1;
                    this.triggerHitParticles();
                    this.enemyHits.set(firingEnemy, 0);
                    if (this.lives <= 0) {
                        this.isPaused = true;
                        this.gameOverMenu.style.display = "block";
                    }
                }
                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
                this.enemyBullets.splice(i, 1);
            } else if (bullet.mesh.position.length() > 20000) {
                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
                this.enemyBullets.splice(i, 1);
            }
        }
    
        if (this.dynamicLight) {
            this.dynamicLight.position.copy(this.pod.position);
            this.dynamicLight.intensity = 4 + Math.sin(this.survivalTime * 2) * 2;
        }
    
        for (let i = this.explosionInstances.length - 1; i >= 0; i--) {
            const instance = this.explosionInstances[i];
            const positions = instance.particles.geometry.attributes.position.array as Float32Array;
            let allExpired = true;
    
            for (let j = 0; j < positions.length; j += 3) {
                if (instance.lifetimes[j / 3] > 0) {
                    positions[j] += instance.velocities[j / 3].x * deltaTime;
                    positions[j + 1] += instance.velocities[j / 3].y * deltaTime;
                    positions[j + 2] += instance.velocities[j / 3].z * deltaTime;
    
                    instance.lifetimes[j / 3] -= deltaTime;
                    allExpired = false;
    
                    const material = instance.particles.material as THREE.PointsMaterial;
                    material.opacity = Math.max(0, instance.lifetimes[j / 3] / instance.duration);
                }
            }
    
            instance.particles.geometry.attributes.position.needsUpdate = true;
            if (allExpired) {
                this.scene.remove(instance.particles);
                this.explosionInstances.splice(i, 1);
            }
        }
    
        this.updateHitParticles(deltaTime);
    
        const progress = (this.podDistance / trackLength) * 100;
        const progressBar = document.getElementById("progressBar") as HTMLElement;
        if (progressBar) {
            progressBar.style.setProperty('--progress-width', `${progress}%`);
            const progressText = progressBar.querySelector('span') as HTMLElement;
            if (progressText) {
                progressText.textContent = `${Math.floor(progress)}%`;
            }
        }
    
        this.updateHUD();
        this.renderer.render(this.scene, this.camera);
    }

    private updateHUD(): void {
        this.livesCounter.textContent = `Lives: ${this.lives}`;
        this.scoreCounter.textContent = `Score: ${Math.floor(this.score)}`;
    }

    private splitAsteroid(mesh: THREE.Mesh, body: CANNON.Body, scaleFactor: number): void {
        if (scaleFactor < 0.067) return;
        const newScale = scaleFactor * 0.5;
        const fragmentCount = Math.floor(3 + this.rng() * 2);
        for (let i = 0; i < fragmentCount; i++) {
            const fragment = this.generateAsteroid(newScale);
            fragment.scale.set(1, 1, 1); // Scale applied in generateAsteroid
            fragment.position.copy(mesh.position);
            this.scene.add(fragment);
    
            const fragmentBody = new CANNON.Body({ mass: 1 });
            fragmentBody.addShape(new CANNON.Sphere(40 * newScale * 0.85)); // Adjusted radius
            fragmentBody.position.copy(mesh.position);
            const scatterVel = new THREE.Vector3((this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20);
            fragmentBody.velocity.set(scatterVel.x, scatterVel.y, scatterVel.z);
            this.world.addBody(fragmentBody);
    
            this.obstacles.push({ mesh: fragment, body: fragmentBody, isFullAsteroid: false });
        }
    
        if (body.userData?.debugMesh) {
            this.scene.remove(body.userData.debugMesh);
        }
    }

    private handleResize(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new PodRacingGame();
});