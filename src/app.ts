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


interface Planet {
    mesh: THREE.Mesh;
    rings?: THREE.Mesh;
    stars?: THREE.Mesh[];
    rotationSpeed: number;
    rotationSpeedX?: number; // Optional, defaults to 0
    rotationSpeedY?: number; // Optional, defaults to rotationSpeed
    rotationSpeedZ?: number; // Optional, defaults to 0
}

class PodRacingGame {
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100000);
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
    private fastShotCounter!: HTMLElement; // Add this line
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
    private introAudioGain!: GainNode; // Gain node for intro audio
    private introAudioVolume: number = 0.5; // Default volume (0.0 to 1.0)
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
    private additionalPlanets: Planet[] = [];
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
private startPrompt!: HTMLElement;

private nebulaSphere!: THREE.Mesh; // For Option 1
private nebulaParticles!: THREE.Points; // For Option 2

private countdownMain!: HTMLElement; // Main countdown text
private countdownSub!: HTMLElement;   // Subtext for instructions

private shotSounds: HTMLAudioElement[] = []; // For hitting enemies
private watchoutSounds: HTMLAudioElement[] = []; // For enemy spawns
private compass!: HTMLElement;
private compassN!: HTMLElement;
private compassE!: HTMLElement;
private compassS!: HTMLElement;
private compassW!: HTMLElement;
private bulletIndicators!: HTMLElement;
private activeBulletIndicators: HTMLElement[] = [];

private enemySpawnQueue: { time: number, count: number }[] = [];
private levelValue!: HTMLElement;
private progressBar!: HTMLElement;


private speedsterShips: { mesh: THREE.Mesh; body: CANNON.Body }[] = []; // Array for speedster enemies
private regularEnemySpawnCount: number = 0; // Counter for regular enemies
private speedsterSpawnsThisLevel: number = 0; // Counter for speedsters spawned
private speedsterSpawnQueue: { time: number }[] = []; // Queue for random speedster spawns
private passingBySound: HTMLAudioElement = new Audio('/assets/passing_by.mp3'); // Sound for speedster
private speedsterTrails: THREE.Points[] = []; // Array for speedster trails
private fastShotRounds: number = 0; // Remaining fast shots
private baseFireRate: number = 100; // Default fire rate (store separately)
private weavingTimers: Map<CANNON.Body, number> = new Map(); // Track weaving for each speedster

private flySounds: HTMLAudioElement[] = [
    new Audio('/assets/fly1.mp3'),
    new Audio('/assets/fly2.mp3'),
    new Audio('/assets/fly3.mp3')
];
private activeEnemySounds: Map<CANNON.Body, HTMLAudioElement> = new Map(); // Tracks which enemy has which sound
private maxSimultaneousSounds: number = 5;

private isIntroAudioPlaying: boolean = false;
private hasIntroPlayed: boolean = false; // New flag to ensure it plays only once per game session


private speedsterParticles: { points: THREE.Points, velocities: THREE.Vector3[], lifetimes: number[] }[] = [];
    private nebulaColors = [0x0000ff, 0x800080, 0xff00ff, 0x00ff00]; // Blue, purple, pink, green
    private enemyVideoTexture: THREE.VideoTexture | null = null;
    private purplePlanetVideoTexture: THREE.VideoTexture | null = null;

    constructor() {
        this.initialize().then(() => {
            console.log("Game initialized");
            this.baseFireRate = this.fireRate; // Store initial fire rate
        });
    }

    private async initialize(): Promise<void> {
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
        if (!this.canvas) throw new Error("Canvas not found");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 1);
        this.world.gravity.set(0, 0, 0);

        // Initialize AudioContext
        this.audioContext = new AudioContext();

        // Setup fly sounds
        this.flySounds.forEach(sound => {
            sound.volume = 0.2;
            sound.loop = true;
        });

        // Setup spaceship engine sound
        this.spaceshipEngineOscillator = this.audioContext.createOscillator();
        this.spaceshipEngineGain = this.audioContext.createGain();
        this.spaceshipEngineFilter = this.audioContext.createBiquadFilter();
        this.spaceshipEngineOscillator.type = 'sawtooth';
        this.spaceshipEngineOscillator.frequency.setValueAtTime(70, this.audioContext.currentTime);
        this.spaceshipEngineGain.gain.setValueAtTime(0.0025, this.audioContext.currentTime);
        this.spaceshipEngineFilter.type = 'lowpass';
        this.spaceshipEngineFilter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
        this.spaceshipEngineFilter.Q.setValueAtTime(1, this.audioContext.currentTime);
        this.spaceshipEngineOscillator.connect(this.spaceshipEngineFilter);
        this.spaceshipEngineFilter.connect(this.spaceshipEngineGain);
        this.spaceshipEngineGain.connect(this.audioContext.destination);
        this.isEngineSoundStarted = false;

        // Setup intro audio (initialize but don’t play yet)
        this.introAudio = new Audio('/assets/intro.mp3');
        this.introAudio.volume = this.introAudioVolume;
        const introSource = this.audioContext.createMediaElementSource(this.introAudio);
        this.introAudioGain = this.audioContext.createGain();
        this.introAudioGain.gain.setValueAtTime(this.introAudioVolume, this.audioContext.currentTime);
        introSource.connect(this.introAudioGain);
        this.introAudioGain.connect(this.audioContext.destination);
        this.introAudio.addEventListener('ended', () => {
            this.isIntroAudioPlaying = false;
            this.isIntroPlaying = false;
            console.log("Intro audio ended");
        });

        // Setup background music
        this.songs = [
            new Audio('/assets/music1.mp3'),
            // new Audio('/assets/music2.mp3'),
            // new Audio('/assets/music3.mp3')
        ];
        this.backgroundMusicGain = this.audioContext.createGain();
        this.backgroundMusicGain.gain.setValueAtTime(this.backgroundMusicVolume, this.audioContext.currentTime);
        this.backgroundMusicGain.connect(this.audioContext.destination);

        this.songs.forEach((song) => {
            const source = this.audioContext.createMediaElementSource(song);
            source.connect(this.backgroundMusicGain);
            song.addEventListener('ended', () => this.playNextBackgroundSong());
        });
        this.currentSongIndex = Math.floor(Math.random() * this.songs.length);

        this.explosionSound = new Audio('/assets/explosion.mp3');

        // Load shot and watchout sounds (unchanged)
        this.shotSounds = [
            new Audio('/assets/audio/shot/another_hit.mp3'),
            new Audio('/assets/audio/shot/direc_hit.mp3'),
            new Audio('/assets/audio/shot/dont_let_up.mp3'),
            new Audio('/assets/audio/shot/great_shot.mp3'),
            new Audio('/assets/audio/shot/keep_firing.mp3'),
            new Audio('/assets/audio/shot/watch_those_Asteroids.mp3'),
            new Audio('/assets/audio/shot/we_got_more_incoming.mp3'),
            new Audio('/assets/audio/shot/you_doing_great.mp3')
        ];
        this.shotSounds.forEach(sound => sound.volume = 0.5);

        this.watchoutSounds = [
            new Audio('/assets/audio/watchout/fire_at_will.mp3'),
            new Audio('/assets/audio/watchout/keep_nose_up.mp3'),
            new Audio('/assets/audio/watchout/keep_us_moving.mp3'),
            new Audio('/assets/audio/watchout/look_out_enemy_12_oclock.mp3'),
            new Audio('/assets/audio/watchout/stay_focus.mp3'),
            new Audio('/assets/audio/watchout/stay_sharp_they_are_closing_in.mp3'),
            new Audio('/assets/audio/watchout/they_are_not_make_easy.mp3'),
            new Audio('/assets/audio/watchout/watch_for_those_asteroids.mp3'),
            new Audio('/assets/audio/watchout/we_cant_stay_Still.mp3'),
            new Audio('/assets/audio/watchout/we_got_to_take_them_down.mp3')
        ];
        this.watchoutSounds.forEach(sound => sound.volume = 0.5);

        this.alertSounds = [];
        this.assignDomElements();
        this.setupInput();
        this.setupControls();

        this.countdownElement.style.display = "none";
        this.crosshair.style.display = "none";
        this.startButton.style.display = "none";
        this.difficultyMenu.style.display = "block";
        this.startPrompt.style.display = "none";

        const textureLoader = new THREE.TextureLoader();
        this.asteroidTexture = await textureLoader.loadAsync('/assets/asteroid.jpg').then(texture => {
            console.log("Asteroid texture loaded successfully");
            return texture;
        }).catch(err => {
            console.error("Failed to load asteroid texture:", err);
            return null;
        });
        this.metalTexture = await textureLoader.loadAsync('/assets/metal.png').catch(() => null);

        // Video textures (unchanged)
        const enemyVideo = document.getElementById('enemyVideo') as HTMLVideoElement;
        if (!enemyVideo) {
            console.error("Enemy video element not found in DOM");
            this.enemyVideoTexture = null;
        } else {
            enemyVideo.play().catch(err => console.error("Enemy video playback failed:", err));
            this.enemyVideoTexture = new THREE.VideoTexture(enemyVideo);
            this.enemyVideoTexture.minFilter = THREE.LinearFilter;
            this.enemyVideoTexture.magFilter = THREE.LinearFilter;
            this.enemyVideoTexture.format = THREE.RGBFormat;
        }

        const purplePlanetVideo = document.getElementById('purplePlanetVideo') as HTMLVideoElement;
        if (!purplePlanetVideo) {
            console.error("Purple planet video element not found in DOM");
            this.purplePlanetVideoTexture = null;
        } else {
            purplePlanetVideo.play().catch(err => console.error("Purple planet video playback failed:", err));
            this.purplePlanetVideoTexture = new THREE.VideoTexture(purplePlanetVideo);
            this.purplePlanetVideoTexture.minFilter = THREE.LinearFilter;
            this.purplePlanetVideoTexture.magFilter = THREE.LinearFilter;
            this.purplePlanetVideoTexture.format = THREE.RGBFormat;
        }
    }

    private playNextBackgroundSong(): void {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * this.songs.length);
        } while (newIndex === this.currentSongIndex && this.songs.length > 1);
        this.currentSongIndex = newIndex;
        this.songs[this.currentSongIndex].currentTime = 0;
        this.songs[this.currentSongIndex].play()
            .catch(err => console.error("Background music playback failed:", err));
    }
    
    private assignDomElements(): void {
        this.livesCounter = document.getElementById("healthCounter") as HTMLElement;
        this.scoreCounter = document.getElementById("scoreCounter") as HTMLElement;
        this.enemiesKilledCounter = document.getElementById("enemiesKilledCounter") as HTMLElement;
        this.countdownElement = document.getElementById("countdown") as HTMLElement;
        this.fastShotCounter = document.getElementById("fastShotCounter") as HTMLElement; // Add this
        this.countdownMain = document.getElementById("countdownMain") as HTMLElement;
        this.countdownSub = document.getElementById("countdownSub") as HTMLElement;
        this.hud = document.getElementById("hud") as HTMLElement;
        this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
        this.gameOverMenu = document.getElementById("gameOverMenu") as HTMLElement;
        this.restartButton = document.getElementById("restartButton") as HTMLElement;
        this.resumeButton = document.getElementById("resumeButton") as HTMLElement;
        this.crosshair = document.getElementById("crosshair") as HTMLElement;
        this.startButton = document.getElementById("startButton") as HTMLElement;
        this.difficultyMenu = document.getElementById("difficultyMenu") as HTMLElement;
        this.startPrompt = document.getElementById("startPrompt") as HTMLElement; // Add this line
        this.bulletIndicators = document.getElementById("bulletIndicators") as HTMLElement;
        this.progressBar = document.getElementById("progressBar") as HTMLElement;
        this.levelValue = document.getElementById("levelValue") as HTMLElement;
        
        
        // Add controls element
        const controlsElement = document.getElementById("controls") as HTMLElement;
        if (controlsElement) {
            controlsElement.style.display = this.showDebugControls ? "block" : "none";
        } else {
            console.error("Controls element not found");
        }
    
        // Error checking
        if (!this.countdownElement) console.error("countdown element not found");
        if (!this.countdownMain) console.error("countdownMain element not found");
        if (!this.countdownSub) console.error("countdownSub element not found");
        if (!this.startPrompt) console.error("startPrompt element not found"); // Add this for debugging
    

         // Add compass elements
    this.compass = document.getElementById("compass") as HTMLElement;
    this.compassN = document.getElementById("compassN") as HTMLElement;
    this.compassE = document.getElementById("compassE") as HTMLElement;
    this.compassS = document.getElementById("compassS") as HTMLElement;
    this.compassW = document.getElementById("compassW") as HTMLElement;


        this.updateHUD();
    }

    private spawnSpeedsterShip(): void {
        const speedsterGroup = new THREE.Group();
        
        const sphereGeometry = new THREE.SphereGeometry(10, 32, 32);
        const video = document.getElementById('nebulaVideo') as HTMLVideoElement;
        video.play().catch(err => console.error("Video playback failed:", err));
    
        const nebulaTexture = new THREE.VideoTexture(video);
        nebulaTexture.wrapS = THREE.RepeatWrapping;
        nebulaTexture.wrapT = THREE.RepeatWrapping;
        nebulaTexture.minFilter = THREE.LinearFilter;
        nebulaTexture.magFilter = THREE.LinearFilter;
    
        const sphereMaterial = new THREE.MeshStandardMaterial({
            map: nebulaTexture,
            transparent: true,
            opacity: 0.7,
            metalness: 0.5,
            roughness: 0.4,
            emissive: 0x0000ff,
            emissiveIntensity: 1.0
        });
        const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        speedsterGroup.add(sphereMesh);
    
        const glowLight = new THREE.PointLight(0x0000ff, 1, 50);
        glowLight.position.set(0, 0, 0);
        speedsterGroup.add(glowLight);
    
        speedsterGroup.userData = { material: sphereMaterial, light: glowLight, colorPhase: 0 };
    
        const t = (this.podDistance + this.enemySpawnDistance) / this.trackPath.getLength();
        const basePos = this.trackPath.getPointAt(t % 1);
        const tangent = this.trackPath.getTangentAt(t % 1);
        const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        const binormal = tangent.clone().cross(normal).normalize();
    
        const spawnLateral = (this.rng() - 0.5) * this.enemyLateralOffset;
        const spawnVertical = (this.rng() - 0.5) * this.enemyLateralOffset;
    
        speedsterGroup.position.copy(basePos)
            .addScaledVector(normal, spawnLateral)
            .addScaledVector(binormal, spawnVertical);
        if (isNaN(speedsterGroup.position.x)) {
            speedsterGroup.position.copy(this.pod.position).addScaledVector(tangent, this.enemySpawnDistance);
        }
        this.scene.add(speedsterGroup);
    
        console.log("Speedster spawned at:", speedsterGroup.position, "Pod at:", this.pod.position);
    
        const speedsterBody = new CANNON.Body({ mass: 1 });
        speedsterBody.addShape(new CANNON.Sphere(10));
        speedsterBody.position.copy(speedsterGroup.position);
        this.world.addBody(speedsterBody);
    
        const podPos = this.pod.position.clone();
        const directionToPod = podPos.clone().sub(speedsterGroup.position).normalize();
        const speed = this.enemyBaseSpeed * 3;
        const randomPerturbation = new THREE.Vector3(
            (this.rng() - 0.5) * 0.2,
            (this.rng() - 0.5) * 0.2,
            (this.rng() - 0.5) * 0.2
        ).normalize();
        const flybyDirection = directionToPod.clone().add(randomPerturbation).normalize();
        speedsterBody.velocity.set(
            flybyDirection.x * speed,
            flybyDirection.y * speed,
            flybyDirection.z * speed
        );
        console.log("Speedster velocity:", speedsterBody.velocity, "Direction:", flybyDirection);
        speedsterGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flybyDirection);
    
        // Nebula particles
        const particleCount = 30;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const velocities: THREE.Vector3[] = [];
        const lifetimes: number[] = [];
        const nebulaColors = [0x0000ff, 0x800080, 0xff00ff, 0x00ff00]; // Blue, purple, pink, green
    
        for (let i = 0; i < particleCount; i++) {
            particlePositions[i * 3] = speedsterGroup.position.x;
            particlePositions[i * 3 + 1] = speedsterGroup.position.y;
            particlePositions[i * 3 + 2] = speedsterGroup.position.z;
    
            const velocity = new THREE.Vector3(
                (this.rng() - 0.5) * 20, // Random direction, ±10 units/sec
                (this.rng() - 0.5) * 20,
                (this.rng() - 0.5) * 20
            ).normalize().multiplyScalar(5 + this.rng() * 5); // Speed 5-10 units/sec
            velocities.push(velocity);
            lifetimes.push(1.0 + this.rng() * 1.0); // Lifetime 1-2 seconds
        }
    
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleMaterial = new THREE.PointsMaterial({
            size: 3,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            vertexColors: true // Enable per-particle colors
        });
        const colors = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            const color = new THREE.Color(nebulaColors[Math.floor(this.rng() * nebulaColors.length)]);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);
        this.speedsterParticles.push({ points: particles, velocities, lifetimes });
    
        // Existing trail (unchanged)
        const trailGeometry = new THREE.BufferGeometry();
        const trailCount = 20;
        const trailPositions = new Float32Array(trailCount * 3);
        for (let i = 0; i < trailCount * 3; i += 3) {
            trailPositions[i] = speedsterGroup.position.x;
            trailPositions[i + 1] = speedsterGroup.position.y;
            trailPositions[i + 2] = speedsterGroup.position.z;
        }
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        const trailMaterial = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 5,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        const trail = new THREE.Points(trailGeometry, trailMaterial);
        trail.userData = { speedsterBody, lifetimes: new Array(trailCount).fill(1.0) };
        this.scene.add(trail);
        this.speedsterTrails.push(trail);
    
        this.weavingTimers.set(speedsterBody, 0);
        speedsterGroup.userData = { material: sphereMaterial, light: glowLight, colorPhase: 0, hasGrantedLives: false };
        this.speedsterShips.push({ mesh: speedsterGroup, body: speedsterBody });
        this.speedsterSpawnsThisLevel++;
    
        const soundClone = this.passingBySound.cloneNode(true) as HTMLAudioElement;
        soundClone.volume = 0.7;
        soundClone.play().catch(err => console.error("Passing by sound playback failed:", err));
    }

    private showLevelUpNotification(): void {
        const notification = document.createElement("div");
        notification.id = "levelUpNotification";
        notification.className = "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center font-orbitron text-cyan-400 drop-shadow-[0_0_15px_#00ffff] z-20 text-3xl font-bold";
        notification.textContent = `Level ${this.level - 1} Completed! +5 Bonus Lives`;
        document.body.appendChild(notification);
    
        // Fade out after 2 seconds
        setTimeout(() => {
            notification.style.transition = "opacity 0.5s";
            notification.style.opacity = "0";
            setTimeout(() => notification.remove(), 500);
        }, 2000);
    }

    private setupDifficultyButtons(): void {
        const easyButton = document.getElementById("easyButton") as HTMLElement;
        const normalButton = document.getElementById("normalButton") as HTMLElement;
        const hardButton = document.getElementById("hardButton") as HTMLElement;

        easyButton.addEventListener("click", () => {
            this.difficulty = 'easy';
            this.lives = 20;
            this.basePodSpeed = 25;
            this.podSpeed = this.basePodSpeed;
            this.asteroidSpawnInterval = 8;
            this.enemySpawnInterval = 15;
            this.enemyBaseSpeed = 20;
            this.enemyFireRate = 1500;
            this.enemyBulletSpeed = 400;
            this.startGame();
            this.startIntroAudio(); // Play intro here
            this.songs[this.currentSongIndex].play().catch(err => console.error("Song playback failed:", err));
        });

        normalButton.addEventListener("click", () => {
            this.difficulty = 'normal';
            this.lives = 15;
            this.basePodSpeed = 40;
            this.podSpeed = this.basePodSpeed;
            this.asteroidSpawnInterval = 6;
            this.enemySpawnInterval = 10;
            this.enemyBaseSpeed = 25;
            this.enemyFireRate = 1000;
            this.enemyBulletSpeed = 500;
            this.startGame();
            this.startIntroAudio(); // Play intro here
            this.songs[this.currentSongIndex].play().catch(err => console.error("Song playback failed:", err));
        });

        hardButton.addEventListener("click", () => {
            this.difficulty = 'hard';
            this.lives = 10;
            this.basePodSpeed = 60;
            this.podSpeed = this.basePodSpeed;
            this.asteroidSpawnInterval = 4;
            this.enemySpawnInterval = 7;
            this.enemyBaseSpeed = 35;
            this.enemyFireRate = 700;
            this.enemyBulletSpeed = 600;
            this.startGame();
            this.startIntroAudio(); // Play intro here
            this.songs[this.currentSongIndex].play().catch(err => console.error("Song playback failed:", err));
        });
    }

    private startIntroAudio(): void {
        if (this.hasIntroPlayed) {
            console.log("Intro audio already played, skipping");
            this.isIntroPlaying = true; // Proceed with animation
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log("AudioContext resumed for intro");
                this.playIntro();
            }).catch(err => console.error("Failed to resume AudioContext:", err));
        } else {
            this.playIntro();
        }
    }

    private playIntro(): void {
        this.introAudio.pause(); // Ensure it’s stopped
        this.introAudio.currentTime = 0; // Reset to start
        this.introAudio.play()
            .then(() => {
                this.isIntroAudioPlaying = true;
                this.hasIntroPlayed = true;
                this.isIntroPlaying = true;
                console.log("Intro audio started successfully");
            })
            .catch(err => {
                console.error("Intro audio playback failed:", err);
                this.isIntroPlaying = true; // Proceed with animation if audio fails
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
        this.activeEnemySounds.forEach((sound, body) => this.stopEnemySound(body));
        this.activeEnemySounds.clear();
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
                case 32: // Spacebar
                if (this.isIntroPlaying) {
                    this.isIntroPlaying = false;
                    this.introAudio.pause();
                    this.isIntroAudioPlaying = false;
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
                case 79: // Add "O" to spawn speedster
                this.spawnSpeedsterShip();
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
                    case 82: // 'R'
                    if (this.lives > 0) {
                        this.yaw = 0;
                        this.pitch = 0;
                    } else {
                        this.restartGame();
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
            // Full 360-degree yaw (no clamping)
            this.yaw += yawDelta;
            // Clamp pitch to ±45 degrees (π/4 radians), adjust as needed
            this.pitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.pitch + pitchDelta));
        });
    
        this.startButton.addEventListener("click", () => {
            this.startButton.style.display = "none";
            this.isIntroPlaying = true; // Only affects animation, not audio
        });
    
        this.canvas.addEventListener("click", () => {
            if (!this.isPaused && !this.isIntroPlaying && !this.raceStarted) {
                this.raceStarted = true;
                this.canvas.requestPointerLock(); // Lock pointer on click
                this.countdownElement.style.display = "none"; // Hide countdown on click
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        });
    
        this.resumeButton.addEventListener("click", () => {
            this.isPaused = false;
            this.pauseMenu.style.display = "none";
            
            // Request pointer lock with error handling
            const lockPromise = this.canvas.requestPointerLock();
            if (lockPromise) {
                lockPromise.then(() => {
                    console.log("Pointer lock successfully re-engaged");
                    // Start engine sound if not already started
                    if (!this.isEngineSoundStarted) {
                        this.spaceshipEngineOscillator.start();
                        this.isEngineSoundStarted = true;
                    }
                }).catch((err: Error) => {
                    console.error("Failed to re-engage pointer lock:", err.message);
                    // If lock fails, show a prompt to click again
                    this.showPointerLockPrompt();
                });
            } else {
                // Fallback for older browsers not returning a promise
                this.canvas.requestPointerLock();
                setTimeout(() => {
                    if (document.pointerLockElement !== this.canvas) {
                        console.error("Pointer lock failed (no promise support)");
                        this.showPointerLockPrompt();
                    }
                }, 100);
            }
        });
    
        this.restartButton.addEventListener("click", () => {
            this.restartGame();
        });
    
        document.addEventListener("pointerlockchange", () => {
            if (document.pointerLockElement === this.canvas) {
                this.crosshair.style.display = "block";
                this.isPaused = false; // Ensure game resumes when lock is re-engaged
                this.pauseMenu.style.display = "none";
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

    // New helper method to show a prompt if pointer lock fails
private showPointerLockPrompt(): void {
    const prompt = document.createElement("div");
    prompt.id = "pointerLockPrompt";
    prompt.className = "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/90 border-2 border-cyan-400 rounded-lg p-5 text-cyan-400 text-center shadow-[0_0_15px_rgba(0,255,255,0.5)] z-20 font-orbitron";
    prompt.innerHTML = `
        <p class="text-lg">Click anywhere to resume game</p>
    `;
    document.body.appendChild(prompt);

    // Remove prompt and try locking again on next click
    const resumeHandler = () => {
        this.canvas.requestPointerLock();
        prompt.remove();
        document.removeEventListener("click", resumeHandler);
    };
    document.addEventListener("click", resumeHandler);
}

    private setupControls(): void {
        const podTab = document.getElementById("podTab") as HTMLElement;
        const enemyTab = document.getElementById("enemyTab") as HTMLElement;
        const speedsterTab = document.getElementById("speedsterTab") as HTMLElement; // New tab
        const engineTab = document.getElementById("engineTab") as HTMLElement;
        const podControls = document.getElementById("podControls") as HTMLElement;
        const enemyControls = document.getElementById("enemyControls") as HTMLElement;
        const speedsterControls = document.getElementById("speedsterControls") as HTMLElement; // New controls
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

        speedsterTab.addEventListener("click", () => { // New tab handler
            speedsterTab.classList.add("active");
            podTab.classList.remove("active");
            enemyTab.classList.remove("active");
            engineTab.classList.remove("active");
            speedsterControls.style.display = "block";
            podControls.style.display = "none";
            enemyControls.style.display = "none";
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

        // New Speedster Controls
    const speedsterSpawnDistanceSlider = document.getElementById("speedsterSpawnDistance") as HTMLInputElement;
    const speedsterLateralOffsetSlider = document.getElementById("speedsterLateralOffset") as HTMLInputElement;
    const speedsterBaseSpeedSlider = document.getElementById("speedsterBaseSpeed") as HTMLInputElement;

    const speedsterSpawnDistanceValue = document.getElementById("speedsterSpawnDistanceValue") as HTMLSpanElement;
    const speedsterLateralOffsetValue = document.getElementById("speedsterLateralOffsetValue") as HTMLSpanElement;
    const speedsterBaseSpeedValue = document.getElementById("speedsterBaseSpeedValue") as HTMLSpanElement;

    speedsterSpawnDistanceSlider.addEventListener("input", () => {
        this.enemySpawnDistance = parseInt(speedsterSpawnDistanceSlider.value); // Shared with regular enemies
        speedsterSpawnDistanceValue.textContent = this.enemySpawnDistance.toString();
    });

    speedsterLateralOffsetSlider.addEventListener("input", () => {
        this.enemyLateralOffset = parseInt(speedsterLateralOffsetSlider.value); // Shared with regular enemies
        speedsterLateralOffsetValue.textContent = this.enemyLateralOffset.toString();
    });

    speedsterBaseSpeedSlider.addEventListener("input", () => {
        this.enemyBaseSpeed = parseInt(speedsterBaseSpeedSlider.value); // Shared with regular enemies
        speedsterBaseSpeedValue.textContent = this.enemyBaseSpeed.toString();
    });

    
        // Engine Sound Contro
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
    
        if (this.fastShotRounds > 0) {
            this.fastShotRounds--;
            if (this.fastShotRounds === 0) {
                this.fireRate = this.baseFireRate; // Reset to normal
            }
        }
    
        const laserClone = this.laserSound.cloneNode(true) as HTMLAudioElement;
        laserClone.volume = 0.5;
        laserClone.play().catch(err => console.error("Laser sound playback failed:", err));
    
        const bulletGeometry = new THREE.SphereGeometry(1, 16, 16);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 3 });
        const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
        const spawnOffset = new THREE.Vector3(0, 0, -3).applyQuaternion(this.camera.quaternion);
        bulletMesh.position.copy(this.pod.position).add(spawnOffset);
        this.scene.add(bulletMesh);
    
        const bulletBody = new CANNON.Body({ mass: 1 });
        bulletBody.addShape(new CANNON.Sphere(1));
        bulletBody.position.copy(bulletMesh.position);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
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
            map: this.enemyVideoTexture,
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
    
        const targetIndicator = this.createEnemyTargetIndicator();
        targetIndicator.position.set(0, 10, 0);
        enemyGroup.add(targetIndicator);
        enemyGroup.userData = { targetIndicator };
    
        const t = (this.podDistance + this.enemySpawnDistance) / this.trackPath.getLength() % 1;
        const basePos = this.trackPath.getPointAt(t);
        const tangent = this.trackPath.getTangentAt(t);
        const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        const binormal = tangent.clone().cross(normal).normalize();
        enemyGroup.position.copy(basePos)
            .addScaledVector(normal, (this.rng() - 0.5) * this.enemyLateralOffset)
            .addScaledVector(binormal, (this.rng() - 0.5) * this.enemyLateralOffset);
        enemyGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
        
        // Assign spawn position relative to track progress
        enemyGroup.userData.spawnPodDistance = this.podDistance + this.enemySpawnDistance;
    
        this.scene.add(enemyGroup);
    
        const enemyBody = new CANNON.Body({ mass: 1 });
        enemyBody.addShape(new CANNON.Sphere(7));
        enemyBody.position.copy(enemyGroup.position);
        this.world.addBody(enemyBody);

        // Add fly sound
    if (this.activeEnemySounds.size < this.maxSimultaneousSounds) {
        const soundIndex = Math.floor(this.rng() * this.flySounds.length);
        const flySound = this.flySounds[soundIndex].cloneNode(true) as HTMLAudioElement;
        flySound.volume = 0.5; // Ensure cloned sound has volume
        flySound.loop = true;
        flySound.play().catch(err => console.error("Failed to play fly sound:", err));
        this.activeEnemySounds.set(enemyBody, flySound);
    }
    
        this.enemyShips.push({ mesh: enemyGroup, body: enemyBody });
        this.enemyShotCounts.set(enemyBody, 0);
        this.enemyHits.set(enemyBody, 0);
        this.enemySpawnsThisLevel++;
    
        // Increment regular enemy counter and spawn first speedster after 3rd enemy
        this.regularEnemySpawnCount++;
        if (this.regularEnemySpawnCount === 3 && this.speedsterSpawnsThisLevel === 0) {
            this.spawnSpeedsterShip();
        }
    
        // Play watchout sound every 15 regular spawns
        if (this.enemySpawnsThisLevel % 15 === 0) {
            const randomWatchoutSound = this.watchoutSounds[Math.floor(this.rng() * this.watchoutSounds.length)];
            (randomWatchoutSound.cloneNode(true) as HTMLAudioElement).play().catch(err => console.error("Watchout audio playback failed:", err));
        }
    }

    private async createScene(): Promise<void> {
        this.rng = seedrandom(`pod_racing_seed_level_${this.level}`); 

        this.activeEnemySounds.forEach((sound, body) => this.stopEnemySound(body));
    this.activeEnemySounds.clear();

        const fogColor = new THREE.Color(0x555555); // Very dark blue, almost black
const fogDensity = 0.00002; // Start with a low value for distant fog

// Create exponential fog (better for space)
this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
    
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
    
 
    // Base track length: doubled from 60s to 120s at base speed
    const baseTrackDuration = 120; // Time in seconds at base speed
    const trackLength = this.basePodSpeed * baseTrackDuration * 2; // 2x longer
    const points = [];

    // Increase number of points for smoothness with longer track
    const numPoints = 65; // Doubled from 33 to maintain detail over longer distance
    const amplitudeX = 1500; // Horizontal amplitude (unchanged)
    const amplitudeY = 400;  // Vertical amplitude (unchanged)
    const rotationFactor = 8; // Base rotations (originally 4 * 2π, now doubled to 8 * 2π)

    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1); // Normalized [0, 1]
        
        // Dynamic rotations: 2x more spins (8π instead of 4π), plus level-based variation
        const rotations = rotationFactor * Math.PI + (this.level - 1) * 0.5 * Math.PI; // Add 0.5π per level
        const x = amplitudeX * Math.cos(t * rotations) * (1 + this.rng() * 0.2); // Add slight randomness
        const y = amplitudeY * Math.sin(t * rotations) * (1 + this.rng() * 0.2);
        const z = t * trackLength;

        // Add extra cinematic twists with secondary oscillation
        const twistFactor = Math.sin(t * rotations * 2); // Double frequency for more action
        const twistedX = x + twistFactor * amplitudeX * 0.3; // 30% extra twist
        const twistedY = y + twistFactor * amplitudeY * 0.3;

        points.push(new THREE.Vector3(twistedX, twistedY, z));
    }

    // Create the smooth path
    this.trackPath = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);

    // Update path visualization
    const pathPoints = this.trackPath.getPoints(512); // More points for longer track
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, emissive: 0x00ffff, linewidth: 20, emissiveIntensity: 6 });
    this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
    this.pathLine.visible = this.showPathLine;
    this.scene.add(this.pathLine);

        
    
    const baseAsteroidCount = this.difficulty === 'easy' ? 100 : this.difficulty === 'normal' ? 150 : 200;
    const asteroidCount = baseAsteroidCount + Math.floor((this.level - 1) * (300 / 99)); // Max +300 by level 100
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
        const earthMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/earth.png') });
        this.earth = new THREE.Mesh(earthGeometry, earthMaterial);
        this.earth.position.set(5000, 2000, 10000);
        this.scene.add(this.earth);

       

        const moonGeometry = new THREE.SphereGeometry(300, 32, 32);
        const moonMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/moon.jpg') });
        this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
        this.moon.position.set(this.earth.position.x + this.moonOrbitRadius, this.earth.position.y, this.earth.position.z);
        this.scene.add(this.moon);

        // Create Mars with video texture
        const marsGeometry = new THREE.SphereGeometry(1200, 32, 32);

        // Get the video element
        const marsVideo = document.getElementById('marsVideo') as HTMLVideoElement;
        marsVideo.play().catch(err => console.error("Mars video playback failed:", err));

        // Create VideoTexture
        const marsVideoTexture = new THREE.VideoTexture(marsVideo);
        marsVideoTexture.minFilter = THREE.LinearFilter; // Smooths the texture
        marsVideoTexture.magFilter = THREE.LinearFilter;
        marsVideoTexture.format = THREE.RGBFormat; // Adjust if needed based on video

        // Apply to material
        const marsMaterial = new THREE.MeshStandardMaterial({ map: marsVideoTexture });
        this.mars = new THREE.Mesh(marsGeometry, marsMaterial);
        this.mars.position.set(-6000, -3000, 12000);
        this.scene.add(this.mars);

        this.addAdditionalPlanets();

        this.scene.userData = { earth: this.earth, moon: this.moon, mars: this.mars };

        const ambientLight = new THREE.AmbientLight(0xddddbb, 3);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
        directionalLight.position.set(5000, 5000, 5000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);


        // Add this in createScene, after the stars
const textureLoaderMilky = new THREE.TextureLoader();
// Load a Milky Way-style texture (you’ll need an asset, or use a placeholder)
const milkyWayTexture = textureLoaderMilky.load('/assets/milkyway2.png', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
}, undefined, (err) => {
    console.error('Failed to load Milky Way texture:', err);
    // Fallback: generate a simple gradient
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(512, 512, 0, 512, 512, 512);
    gradient.addColorStop(0, 'rgba(50, 50, 100, 0.8)');
    gradient.addColorStop(0.5, 'rgba(100, 50, 150, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 1024);
    return new THREE.CanvasTexture(canvas);
});

const nebulaGeometry = new THREE.SphereGeometry(15000, 64, 64); // Large enough to surround the scene
const nebulaMaterial = new THREE.MeshBasicMaterial({
    map: milkyWayTexture,
    side: THREE.BackSide, // Render inside the sphere
    transparent: true,
    opacity: 0.8,
    depthWrite: false // Prevent z-fighting with other objects
});
this.nebulaSphere = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
this.nebulaSphere.position.set(0, 0, 0); // Center of the galaxy
this.scene.add(this.nebulaSphere);

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
        this.basePodSpeed *= 2; // Double the base speed (e.g., from 40 to 80)
        this.podSpeed = this.basePodSpeed * (1 + (this.level - 1) * 0.01); // Apply level scaling
    
   
   
   
    }

    private addAdditionalPlanets(): void {
        this.additionalPlanets = [];
        const textureLoader = new THREE.TextureLoader();
        const planetConfigs = [
            { color: 0x6e1101, size: 800, rings: true, rotationSpeed: 0.0006, texture: '/assets/planets/01.png' },
            { 
                color: 0x803e33, 
                size: 950, 
                stars: 3, 
                rotationSpeed: 0.0005,
                texture: '/assets/planets/02.png',
                rotationX: Math.PI / 1, // Example: 45° on X
                rotationY: Math.PI / 2, // Example: 90° on Y
                rotationZ: Math.PI / 6, // Example: 30° on Z
                rotationSpeedX: 0.0002, // Example X speed
                rotationSpeedY: 0.0005, // Matches original Y speed
                rotationSpeedZ: 0.0003  // Example Z speed
            },
            { color: 0x7a6c50, size: 650, rings: false, rotationSpeed: 0.0008, texture: '/assets/planets/03.png' },
            { color: 0x141338, size: 900, rings: true, rotationSpeed: 0.0004, texture: '/assets/planets/04.png' },
            { color: 0x300952, size: 700, stars: 2, rotationSpeed: 0.0010, texture: '/assets/planets/05.png' },
            { color: 0x521e08, size: 1000, rings: false, rotationSpeed: 0.0003, texture: '/assets/planets/06.png' }
        ];
    
        const trackLength = this.trackPath.getLength();
        const numPlanets = planetConfigs.length;
        const minSeparation = trackLength / numPlanets * 0.8;
        const baseSpreadFactor = 2;
        const additionalSpreadFactor = 5;
        const totalSpreadFactor = baseSpreadFactor * additionalSpreadFactor;
    
        const baseTs = [];
        for (let i = 0; i < numPlanets; i++) {
            const baseT = (i / numPlanets) + (this.rng() - 0.5) * 0.1;
            baseTs.push(Math.max(0.05, Math.min(0.95, baseT)));
        }
        baseTs.sort((a, b) => a - b);
    
        planetConfigs.forEach((config, index) => {
            const planetGeometry = new THREE.SphereGeometry(config.size, 64, 64);
            let planetMaterial: THREE.MeshLambertMaterial;
    
            if (config.color === 0x803e33 && config.size === 950 && config.texture === '/assets/planets/02.png') {
                planetMaterial = new THREE.MeshLambertMaterial({
                    map: this.purplePlanetVideoTexture || textureLoader.load(config.texture),
                    color: config.color
                });
            } else {
                planetMaterial = new THREE.MeshLambertMaterial({
                    map: textureLoader.load(config.texture),
                    color: config.color
                });
            }
    
            const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    
            // Apply initial rotations
            planet.rotation.x = config.rotationX || 0;
            planet.rotation.y = config.rotationY || 0;
            planet.rotation.z = config.rotationZ || 0;
    
            const t = baseTs[index];
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize();
    
            const minOffset = 1000 * totalSpreadFactor;
            const maxOffset = 3000 * totalSpreadFactor;
            const offsetX = (this.rng() - 0.5) * (maxOffset - minOffset) + minOffset;
            const offsetY = (this.rng() - 0.5) * (maxOffset - minOffset) + minOffset;
            const offsetZ = (this.rng() - 0.5) * 500 * totalSpreadFactor;
    
            planet.position.copy(basePos)
                .addScaledVector(normal, offsetX)
                .addScaledVector(binormal, offsetY)
                .addScaledVector(tangent, offsetZ);
            this.scene.add(planet);
    
            let rings: THREE.Mesh | undefined;
            let stars: THREE.Mesh[] | undefined;
    
            if (config.rings) {
                const ringGeometry = new THREE.RingGeometry(config.size * 1.2, config.size * 1.5, 64);
                const ringMaterial = new THREE.MeshLambertMaterial({ 
                    color: config.color, 
                    side: THREE.DoubleSide, 
                    transparent: true, 
                    opacity: 0.7
                });
                rings = new THREE.Mesh(ringGeometry, ringMaterial);
                rings.rotation.x = Math.PI / 2 + (this.rng() - 0.5) * 0.2;
                rings.position.copy(planet.position);
                this.scene.add(rings);
            }
    
            if (config.stars) {
                stars = [];
                for (let i = 0; i < config.stars; i++) {
                    const starGeometry = new THREE.SphereGeometry(50, 16, 16);
                    const starMaterial = new THREE.MeshBasicMaterial({ 
                        color: 0xffffff,
                        emissive: 0xffffff,
                        emissiveIntensity: 1
                    });
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
    
            this.additionalPlanets.push({ 
                mesh: planet, 
                rings, 
                stars, 
                rotationSpeed: config.rotationSpeed,
                rotationSpeedX: config.rotationSpeedX || 0,
                rotationSpeedY: config.rotationSpeedY || config.rotationSpeed,
                rotationSpeedZ: config.rotationSpeedZ || 0
            });
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

    // Helper method to stop enemy sound gracefully
private stopEnemySound(enemyBody: CANNON.Body): void {
    const sound = this.activeEnemySounds.get(enemyBody);
    if (sound) {
        try {
            sound.pause();
            sound.currentTime = 0; // Reset for reuse
        } catch (err) {
            console.error("Failed to stop enemy fly sound:", err);
        }
        this.activeEnemySounds.delete(enemyBody);
    }
}

// Helper method to remove enemy
private removeEnemy(enemy: { mesh: THREE.Mesh; body: CANNON.Body }, index: number): void {
    this.scene.remove(enemy.mesh);
    this.world.removeBody(enemy.body);
    this.lastEnemyShotTimes.delete(enemy.body);
    this.enemyHits.delete(enemy.body);
    this.enemyShotCounts.delete(enemy.body);
    this.enemyBurstStates.delete(enemy.body); // Clean up burst state too
    this.enemyDamageCooldowns.delete(enemy.body);
    this.enemyShips.splice(index, 1);
}

private animate(): void {
    requestAnimationFrame(() => this.animate());

    // Only proceed if pointer is locked or game is not started/paused
    if (this.raceStarted && !document.pointerLockElement && !this.isPaused) {
        return; // Wait for pointer lock to resume
    }

    this.updateSpaceshipPosition();

    const tangentSpaship = this.trackPath.getTangentAt(this.podDistance / this.trackPath.getLength());
    if (this.cameraMode === 0) {
        this.neonSquare.visible = this.showNeonSquare;
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
        this.activeEnemySounds.forEach(sound => {
            try {
                sound.pause();
            } catch (err) {
                console.error("Failed to pause enemy fly sound:", err);
            }
        });
        this.renderer.render(this.scene, this.camera);
        return;
    }
    this.activeEnemySounds.forEach(sound => {
        if (sound.paused && !this.isPaused) {
            sound.play().catch(err => console.error("Failed to resume fly sound:", err));
        }
    });

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
        const startAngle = Math.PI;
        const angle = startAngle + (this.introTime / this.introDuration) * (2 * Math.PI / 6);
        const radius = 20;
        const podPos = this.pod.position;

        this.camera.position.set(
            podPos.x + radius * Math.cos(angle),
            podPos.y + 80,
            podPos.z + radius * Math.sin(angle)
        );
        this.camera.lookAt(podPos);

        this.renderer.render(this.scene, this.camera);

        if (this.introTime >= this.introDuration || this.introAudio.ended) {
            this.isIntroPlaying = false;
            this.introTime = 0;
            this.countdownTimer = 0;
            this.countdownElement.style.display = "block";

            const t = this.podDistance / this.trackPath.getLength();
            const tangent = this.trackPath.getTangentAt(t);
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            this.camera.position.copy(this.pod.position)
                .addScaledVector(tangent, -1)
                .addScaledVector(up, 2)
                .addScaledVector(normal, 1);
            this.camera.quaternion.copy(this.pod.quaternion);
        }
        return;
    }

    if (!this.raceStarted) {
        this.countdownTimer += deltaTime;
        const timeLeft = Math.max(0, this.countdown - this.countdownTimer);
        let mainText = "";
        if (timeLeft > 1) {
            mainText = `${Math.ceil(timeLeft - 1)}`;
            if (this.countdownSub) this.countdownSub.style.display = "none";
        } else if (timeLeft > 0) {
            mainText = "Click to Start";
            if (this.countdownSub) {
                this.countdownSub.textContent = "Use Spacebar to shoot, mouse to aim";
                this.countdownSub.style.display = "block";
            }
        } else {
            mainText = `Level ${this.level} - Go!`;
            if (this.countdownSub) this.countdownSub.style.display = "none";
            this.raceStarted = true;
            this.canvas.requestPointerLock();
        }
        if (this.countdownMain) this.countdownMain.textContent = mainText;
        if (this.countdownElement) this.countdownElement.style.display = "block";
        this.renderer.render(this.scene, this.camera);

        if (timeLeft <= 0 && this.countdownElement) {
            this.countdownElement.style.display = "none";
        }
        return;
    }

    this.survivalTime += deltaTime;
    this.score += this.podSpeed * deltaTime;

    const trackLength = this.trackPath.getLength();
    this.podDistance += this.podSpeed * deltaTime;

    // Accumulate life changes for this frame
    let lifeDelta = 0;

    if (this.podDistance >= trackLength) {
        this.level += 1;
        if (this.level > 100) {
            alert("Congratulations! You’ve won the game!");
            this.isPaused = true;
            this.pauseMenu.style.display = "block";
            return;
        }
        lifeDelta += this.difficulty === 'easy' ? 7 : this.difficulty === 'normal' ? 5 : 3;
        this.showLevelUpNotification();
        this.podDistance = 0;
        this.survivalTime = 0;

        const targetSpeedMultiplier = this.difficulty === 'hard' ? 3 : 2;
        const speedIncreasePerLevel = (targetSpeedMultiplier - 1) * this.basePodSpeed / 19;
        const cappedLevel = Math.min(this.level - 1, 19);
        this.podSpeed = this.basePodSpeed + cappedLevel * speedIncreasePerLevel;

        const spawnReduction = 1 - Math.min(0.5, cappedLevel * 0.025);
        this.asteroidSpawnInterval = this.asteroidSpawnInterval * spawnReduction;
        this.enemySpawnInterval = this.enemySpawnInterval * spawnReduction;

        const aggressionFactor = 1 + cappedLevel * 0.05;
        this.enemyBaseSpeed = Math.min(this.enemyBaseSpeed * 2, this.enemyBaseSpeed * aggressionFactor);
        this.enemyFireRate = Math.max(300, this.enemyFireRate / aggressionFactor);
        this.enemyBulletSpeed = Math.min(this.enemyBulletSpeed * 2, this.enemyBulletSpeed * aggressionFactor);

        this.scene.remove(this.pathLine);
        this.obstacles.forEach(o => {
            this.scene.remove(o.mesh);
            this.world.removeBody(o.body);
            if (o.body.userData?.debugMesh) this.scene.remove(o.body.userData.debugMesh);
        });
        this.enemyShips.forEach(enemy => {
            this.stopEnemySound(enemy.body);
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
        this.lastEnemyShotTimes.clear();
        this.enemyShotCounts.clear();
        this.enemyHits.clear();
        this.enemySpawnsThisLevel = 0;
        this.alertsThisLevel = 0;
        this.activeEnemySounds.clear();
        this.createScene();
        this.pathLine.visible = this.showPathLine;
        this.startCountdown();

        this.speedsterShips = [];
        this.speedsterTrails = [];
        this.speedsterParticles.forEach(p => this.scene.remove(p.points));
        this.speedsterParticles = [];
        this.weavingTimers.clear();
        this.fastShotRounds = 0;
        this.fireRate = this.baseFireRate;
        this.regularEnemySpawnCount = 0;
        this.speedsterSpawnsThisLevel = 0;
        this.speedsterSpawnQueue = [];

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

    const baseFrequency = 100;
    const yawRange = Math.PI / 4;
    const frequencyShift = (this.yaw / yawRange) * 50;
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
            const baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), tangent);
            this.camera.quaternion.copy(baseQuat);
            const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
            this.camera.quaternion.multiply(yawQuat).multiply(pitchQuat);
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
        planet.mesh.rotation.x += planet.rotationSpeedX || 0;
        planet.mesh.rotation.y += planet.rotationSpeedY || planet.rotationSpeed;
        planet.mesh.rotation.z += planet.rotationSpeedZ || 0;

        if (planet.rings) planet.rings.rotation.z += (planet.rotationSpeedY || planet.rotationSpeed) * 0.5;
        if (planet.stars) {
            planet.stars.forEach((star, index) => {
                const angle = this.survivalTime * (planet.rotationSpeedY || planet.rotationSpeed) + (index / planet.stars!.length) * 2 * Math.PI;
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
            lifeDelta -= 1;
            this.podSpeed *= 0.8;
            this.triggerHitParticles();
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
        const baseEnemyCount = this.difficulty === 'easy' ? 2 : this.difficulty === 'normal' ? 3 : 2;
        const levelFactor = this.difficulty === 'hard' ? Math.min(19, this.level - 1) * 0.026315 : (this.level - 1) * (10 / 99);
        const enemyCount = Math.floor(baseEnemyCount + levelFactor);
        for (let i = 0; i < enemyCount; i++) {
            const spawnTime = this.survivalTime + (i / enemyCount) * this.enemySpawnInterval;
            this.enemySpawnQueue.push({ time: spawnTime, count: 1 });
        }
        if (this.speedsterSpawnsThisLevel === 0) {
            const extraSpeedsters = this.rng() < 0.5 ? 1 : 2;
            for (let i = 0; i < extraSpeedsters; i++) {
                const randomTime = this.survivalTime + this.rng() * (this.trackPath.getLength() / this.podSpeed);
                this.speedsterSpawnQueue.push({ time: randomTime });
            }
        }
        this.enemySpawnTimer = 0;
    }

    this.enemySpawnQueue = this.enemySpawnQueue.filter(spawn => {
        if (this.survivalTime >= spawn.time) {
            if (this.rng() < 0.5) {
                this.spawnEnemyShip();
            }
            return false;
        }
        return true;
    });

    this.speedsterSpawnQueue = this.speedsterSpawnQueue.filter(spawn => {
        if (this.survivalTime >= spawn.time && this.speedsterSpawnsThisLevel < 3) {
            this.spawnSpeedsterShip();
            return false;
        }
        return true;
    });

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

        const indicator = enemy.mesh.userData.targetIndicator as THREE.Mesh;
        if (indicator) {
            const time = performance.now() / 1000;
            const pulse = Math.sin(time * 4) * 0.5 + 0.5;
            const scale = 10 + pulse * 5;
            indicator.scale.set(scale, scale, scale);
            indicator.material.opacity = 0.5 + pulse * 0.3;
            indicator.lookAt(this.camera.position);
        }

        const distanceToPod = enemy.mesh.position.distanceTo(this.pod.position);
        const trackDistanceFromPod = enemy.mesh.userData.spawnPodDistance - this.podDistance;
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

        if (!burstState.isBursting && currentTime - burstState.lastBurstTime >= burstState.burstDelay && shotsFired < this.shotsToLoseLife) {
            burstState.isBursting = true;
            burstState.burstCount = this.rng() < 0.5 ? 1 : 2;
            burstState.lastBurstTime = currentTime;
        }

        if (burstState.isBursting && burstState.burstCount > 0) {
            const timeSinceLastShot = currentTime - burstState.lastBurstTime;
            if (timeSinceLastShot >= this.burstInterval || timeSinceLastShot === 0) {
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

                if (!this.enemyDamageCooldowns.has(enemy.body)) {
                    this.enemyDamageCooldowns.set(enemy.body, currentTime + this.burstInterval * 2);
                }
            }

            if (burstState.burstCount === 0) {
                burstState.isBursting = false;
                burstState.burstDelay = this.minBurstDelay + this.rng() * (this.maxBurstDelay - this.minBurstDelay);
            }
        }

        this.enemyBurstStates.set(enemy.body, burstState);

        for (let j = this.bullets.length - 1; j >= 0; j--) {
            const bullet = this.bullets[j];
            if (bullet.mesh.position.distanceTo(enemy.mesh.position) < 8) {
                this.stopEnemySound(enemy.body);
                this.triggerEnemyExplosion(enemy.mesh.position);
                this.removeEnemy(enemy, i);
                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
                this.bullets.splice(j, 1);
                this.score += 100;
                this.enemiesKilled++;

                if (this.enemiesKilled % 10 === 0) {
                    const randomShotSound = this.shotSounds[Math.floor(this.rng() * this.shotSounds.length)];
                    (randomShotSound.cloneNode(true) as HTMLAudioElement).play().catch(err => console.error("Shot audio playback failed:", err));
                }
                break;
            }
        }

        if (distanceToPod < 12) {
            this.stopEnemySound(enemy.body);
            lifeDelta -= 2;
            this.triggerHitParticles();
            this.removeEnemy(enemy, i);
        } else if (trackDistanceFromPod < -100) {
            this.stopEnemySound(enemy.body);
            this.removeEnemy(enemy, i);
            console.log(`Enemy despawned at trackDistanceFromPod: ${trackDistanceFromPod}, podDistance: ${this.podDistance}`);
            continue;
        } else if (distanceToPod > 1000 && shotsFired < this.shotsToLoseLife) {
            this.stopEnemySound(enemy.body);
            lifeDelta -= 1;
            this.triggerHitParticles();
            this.removeEnemy(enemy, i);
        }
    }

    for (let i = this.speedsterShips.length - 1; i >= 0; i--) {
        const speedster = this.speedsterShips[i];
        speedster.mesh.position.copy(speedster.body.position);

        const weavingTimer = this.weavingTimers.get(speedster.body) || 0;
        const weaveOffset = Math.sin(weavingTimer * 5) * 20;
        const tangent = new THREE.Vector3(
            speedster.body.velocity.x,
            speedster.body.velocity.y,
            speedster.body.velocity.z
        ).normalize();

        if (tangent.lengthSq() === 0) {
            tangent.set(0, 0, -1);
        }

        const normal = new THREE.Vector3(0, 1, 0).cross(tangent);
        if (isNaN(normal.x) || isNaN(normal.y) || isNaN(normal.z)) {
            normal.set(1, 0, 0);
        } else {
            normal.normalize();
        }
        const weaveVector = normal.clone().multiplyScalar(weaveOffset * 0.01667);
        speedster.body.position.vadd(weaveVector as any, speedster.body.position);

        this.weavingTimers.set(speedster.body, weavingTimer + 0.01667);

        const time = performance.now() * 0.001;
        const pulse = Math.sin(time * 2) * 0.5 + 0.5;

        speedster.mesh.children[0].rotation.x += 0.01;
        speedster.mesh.children[0].rotation.y += 0.015;
        speedster.mesh.children[0].rotation.z += 0.005;

        const baseColor = new THREE.Color(0x0000ff);
        speedster.mesh.userData.material.emissive.copy(baseColor).multiplyScalar(pulse + 0.5);
        speedster.mesh.userData.light.color.copy(baseColor);
        speedster.mesh.userData.light.intensity = 1 + pulse;

        const flybyDirection = new THREE.Vector3(
            speedster.body.velocity.x,
            speedster.body.velocity.y,
            speedster.body.velocity.z
        ).normalize();

        if (isNaN(flybyDirection.x) || isNaN(flybyDirection.y) || isNaN(flybyDirection.z)) {
            flybyDirection.set(0, 0, -1);
        }
        speedster.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flybyDirection);

        for (let j = this.bullets.length - 1; j >= 0; j--) {
            const bullet = this.bullets[j];
            if (bullet.mesh.position.distanceTo(speedster.mesh.position) < 15) {
                this.fastShotRounds = 100;
                this.fireRate = this.baseFireRate / 3;
                if (!speedster.mesh.userData.hasGrantedLives) {
                    lifeDelta += 10; // Speedster bonus
                    speedster.mesh.userData.hasGrantedLives = true;
                }

                const escapeSpeed = this.enemyBaseSpeed * 6;
                const escapeDirection = new THREE.Vector3();
                speedster.body.position.vsub(this.pod.position, escapeDirection as any);
                if (isNaN(escapeDirection.x) || isNaN(escapeDirection.y) || isNaN(escapeDirection.z)) {
                    escapeDirection.set(0, 0, 1);
                } else {
                    escapeDirection.normalize();
                }
                speedster.body.velocity.set(
                    escapeDirection.x * escapeSpeed,
                    escapeDirection.y * escapeSpeed,
                    escapeDirection.z * escapeSpeed
                );

                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
                this.bullets.splice(j, 1);
                break;
            }
        }

        const distanceToPod = speedster.mesh.position.distanceTo(this.pod.position);
        const zDistance = speedster.mesh.position.z - this.pod.position.z;
        if (isNaN(distanceToPod) || distanceToPod > 1200 || zDistance < -1200) {
            console.log("Speedster removed:", speedster.mesh.position, "Distance:", distanceToPod, "Z Distance:", zDistance);
            this.scene.remove(speedster.mesh);
            this.world.removeBody(speedster.body);
            this.weavingTimers.delete(speedster.body);
            this.speedsterShips.splice(i, 1);
        } else {
            console.log("Speedster alive at:", speedster.mesh.position, "Distance:", distanceToPod, "Z:", zDistance);
        }
    }

    for (let i = this.speedsterParticles.length - 1; i >= 0; i--) {
        const particleSystem = this.speedsterParticles[i];
        const positions = particleSystem.points.geometry.attributes.position.array as Float32Array;
        const velocities = particleSystem.velocities;
        const lifetimes = particleSystem.lifetimes;
        let allExpired = true;

        for (let j = 0; j < positions.length; j += 3) {
            if (lifetimes[j / 3] > 0) {
                positions[j] += velocities[j / 3].x * 0.01667;
                positions[j + 1] += velocities[j / 3].y * 0.01667;
                positions[j + 2] += velocities[j / 3].z * 0.01667;
                lifetimes[j / 3] -= 0.01667;
                allExpired = false;
            } else if (lifetimes[j / 3] <= 0 && lifetimes[j / 3] > -1) {
                const nearestSpeedster = this.speedsterShips.reduce((closest, s) => {
                    const dist = s.mesh.position.distanceTo(new THREE.Vector3(positions[j], positions[j + 1], positions[j + 2]));
                    return dist < closest.dist ? { mesh: s.mesh, dist } : closest;
                }, { mesh: null as THREE.Group | null, dist: Infinity }).mesh;
                if (nearestSpeedster) {
                    positions[j] = nearestSpeedster.position.x;
                    positions[j + 1] = nearestSpeedster.position.y;
                    positions[j + 2] = nearestSpeedster.position.z;
                    velocities[j / 3].set(
                        (this.rng() - 0.5) * 20,
                        (this.rng() - 0.5) * 20,
                        (this.rng() - 0.5) * 20
                    ).normalize().multiplyScalar(5 + this.rng() * 5);
                    lifetimes[j / 3] = 1.0 + this.rng() * 1.0;
                    const color = new THREE.Color(this.nebulaColors[Math.floor(this.rng() * this.nebulaColors.length)]);
                    const colors = particleSystem.points.geometry.attributes.color.array as Float32Array;
                    colors[j] = color.r;
                    colors[j + 1] = color.g;
                    colors[j + 2] = color.b;
                    particleSystem.points.geometry.attributes.color.needsUpdate = true;
                }
            }
        }

        particleSystem.points.geometry.attributes.position.needsUpdate = true;
        particleSystem.points.material.opacity = Math.max(0, lifetimes[0] / 2.0);

        if (allExpired) {
            this.scene.remove(particleSystem.points);
            this.speedsterParticles.splice(i, 1);
        } else {
            particleSystem.points.geometry.computeBoundingSphere();
        }
    }

    for (let i = this.speedsterTrails.length - 1; i >= 0; i--) {
        const trail = this.speedsterTrails[i];
        const positions = trail.geometry.attributes.position.array as Float32Array;
        const lifetimes = trail.userData.lifetimes as number[];
        const speedsterBody = trail.userData.speedsterBody as CANNON.Body;

        if (!speedsterBody || !this.world.bodies.includes(speedsterBody)) {
            this.scene.remove(trail);
            this.speedsterTrails.splice(i, 1);
            continue;
        }

        let allExpired = true;

        for (let j = 0; j < positions.length; j += 3) {
            if (lifetimes[j / 3] > 0) {
                const offset = (j / 3) * 0.05;
                const velocity = new THREE.Vector3(
                    speedsterBody.velocity.x,
                    speedsterBody.velocity.y,
                    speedsterBody.velocity.z
                );
                positions[j] = speedsterBody.position.x - velocity.x * offset;
                positions[j + 1] = speedsterBody.position.y - velocity.y * offset;
                positions[j + 2] = speedsterBody.position.z - velocity.z * offset;

                if (isNaN(positions[j]) || isNaN(positions[j + 1]) || isNaN(positions[j + 2])) {
                    positions[j] = speedsterBody.position.x;
                    positions[j + 1] = speedsterBody.position.y;
                    positions[j + 2] = speedsterBody.position.z;
                }

                lifetimes[j / 3] -= 0.01667;
                allExpired = false;
            }
        }

        trail.geometry.attributes.position.needsUpdate = true;
        trail.material.opacity = Math.max(0, lifetimes[0] / 1.0);

        if (allExpired) {
            this.scene.remove(trail);
            this.speedsterTrails.splice(i, 1);
        } else {
            trail.geometry.computeBoundingSphere();
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
                lifeDelta -= 1;
                this.triggerHitParticles();
                this.enemyHits.set(firingEnemy, 0);
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

    // Apply life changes and check game over
    this.lives += lifeDelta;
    console.log(`Lives after frame: ${this.lives}, Delta: ${lifeDelta}`); // Debug log
    if (this.lives <= 0) {
        console.log("Game Over triggered with lives:", this.lives);
        this.isPaused = true;
        this.gameOverMenu.style.display = "block";
    }

    this.updateBulletIndicators();

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


    private updateBulletIndicators(): void {
        // Clear existing indicators
        this.activeBulletIndicators.forEach(indicator => this.bulletIndicators.removeChild(indicator));
        this.activeBulletIndicators = [];
    
        if (!this.raceStarted || this.isPaused) return;
    
        this.enemyShips.forEach(enemy => {
            // Project enemy position to screen space
            const enemyPos = enemy.mesh.position.clone();
            const screenPos = enemyPos.project(this.camera);
    
            // Check if enemy is on-screen (within viewport and in front of camera)
            const isOnScreen = screenPos.x >= -1 && screenPos.x <= 1 && 
                              screenPos.y >= -1 && screenPos.y <= 1 && 
                              screenPos.z > 0;
    
            // Show indicator if enemy is off-screen or behind the camera
            if (!isOnScreen || screenPos.z <= 0) {
                // Create indicator
                const indicator = document.createElement("div");
                indicator.className = "bullet-indicator";
                this.bulletIndicators.appendChild(indicator);
                this.activeBulletIndicators.push(indicator);
    
                // Handle enemies behind the camera
                let normalizedX = screenPos.x;
                let normalizedY = screenPos.y;
                if (screenPos.z <= 0) {
                    // Reflect position for enemies behind (invert x and y)
                    normalizedX = -screenPos.x;
                    normalizedY = -screenPos.y;
                }
    
                // Normalize screen position to handle off-screen cases
                const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
                if (magnitude > 1) {
                    normalizedX = normalizedX / magnitude;
                    normalizedY = normalizedY / magnitude;
                }
    
                // Clamp to screen edges with a margin
                const clampedX = Math.max(-0.95, Math.min(0.95, normalizedX));
                const clampedY = Math.max(-0.95, Math.min(0.95, normalizedY));
    
                // Convert to pixel coordinates
                const left = ((clampedX + 1) / 2) * window.innerWidth;
                const top = ((1 - clampedY) / 2) * window.innerHeight;
                indicator.style.left = `${left}px`;
                indicator.style.top = `${top}px`;
    
                // Calculate angle to point toward enemy (adjust for upward-pointing triangle)
                const angle = (Math.atan2(normalizedY, normalizedX) * (180 / Math.PI) + 90) % 360;
                indicator.style.transform = `rotate(${angle}deg)`;
            }
        });
    }

    private createEnemyTargetIndicator(): THREE.Mesh {
        // Create a simple arrow shape pointing upward
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            0, 0, 0,    // Bottom center
            -0.5, 1, 0, // Top left
            0.5, 1, 0   // Top right
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex([0, 1, 2]); // Triangle indices
    
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000, // Red
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending // Glow effect
        });
    
        const arrow = new THREE.Mesh(geometry, material);
        arrow.scale.set(10, 10, 10); // Base size, will animate
        return arrow;
    }

    private updateHUD(): void {
        const healthCounter = document.getElementById("healthCounter") as HTMLElement;
        const scoreCounter = document.getElementById("scoreCounter") as HTMLElement;
        const enemiesKilledCounter = document.getElementById("enemiesKilledCounter") as HTMLElement;
        const progressBar = document.getElementById("progressBar") as HTMLElement;
        const fastShotCounter = document.getElementById("fastShotCounter") as HTMLElement; // Add this
        // Explicitly set level
        this.levelValue.textContent = `${this.level}`;
    
        const healthValue = healthCounter.querySelector(".value") as HTMLElement;
        const healthBar = healthCounter.querySelector(".bar") as HTMLElement;
        const scoreValue = scoreCounter.querySelector(".value") as HTMLElement;
        const enemiesKilledValue = enemiesKilledCounter.querySelector(".value") as HTMLElement;
        const progressBarElement = progressBar.querySelector(".progress-bar") as HTMLElement;
        const progressValue = progressBar.querySelector(".value:not(#levelValue)") as HTMLElement; // Select the percentage span
        const fastShotValue = fastShotCounter.querySelector(".value") as HTMLElement; // Add this

        healthValue.textContent = `${this.lives}`;
        const shieldPercent = (this.lives / (this.difficulty === 'easy' ? 15 : this.difficulty === 'normal' ? 10 : 5)) * 100;
        healthBar.style.setProperty('--bar-width', `${shieldPercent}%`);
        healthBar.style.background = shieldPercent > 50 ? '#00ff00' : shieldPercent > 25 ? '#ffff00' : '#ff0000';
    
        scoreValue.textContent = `${Math.floor(this.score)}`;
        enemiesKilledValue.textContent = `${this.enemiesKilled}`;
    fastShotValue.textContent = `${this.fastShotRounds}`; // Display remaining fast shots

        // Update progress bar and percentage
        if (this.trackPath) {
            const progress = (this.podDistance / this.trackPath.getLength()) * 100;
            progressValue.textContent = `${Math.floor(progress)}%`; // Percentage in its own span
            progressBarElement.style.setProperty('--bar-width', `${progress}%`);
        } else {
            progressValue.textContent = "0%";
            progressBarElement.style.setProperty('--bar-width', "0%");
        }
    
        // Compass update (unchanged)
        if (this.raceStarted && this.trackPath) {
            const t = this.podDistance / this.trackPath.getLength();
            const tangent = this.trackPath.getTangentAt(t).normalize();
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
            const angle = Math.atan2(forward.x, forward.z) - Math.atan2(tangent.x, tangent.z);
            const normalizedAngle = ((angle + Math.PI) % (2 * Math.PI)) - Math.PI;
            const highlightThreshold = Math.PI / 4;
            this.compassN.style.opacity = (Math.abs(normalizedAngle) < highlightThreshold) ? "1" : "0.3";
            this.compassE.style.opacity = (Math.abs(normalizedAngle - Math.PI / 2) < highlightThreshold) ? "1" : "0.3";
            this.compassS.style.opacity = (Math.abs(Math.abs(normalizedAngle) - Math.PI) < highlightThreshold) ? "1" : "0.3";
            this.compassW.style.opacity = (Math.abs(normalizedAngle + Math.PI / 2) < highlightThreshold) ? "1" : "0.3";
        }
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