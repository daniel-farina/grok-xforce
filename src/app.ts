import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const seedrandom = require('seedrandom');
import { createNoise3D } from 'simplex-noise';

// Inline type augmentation for cannon-es
declare module 'cannon-es' {
    interface Body {
        userData?: {
            debugMesh?: THREE.Mesh;
        };
    }
}

class PodRacingGame {
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    private renderer!: THREE.WebGLRenderer;
    private world: CANNON.World = new CANNON.World();
    private canvas!: HTMLCanvasElement;
    private pod!: THREE.Mesh;
    private podBody!: CANNON.Body;
    private obstacles: { mesh: THREE.Group | THREE.Mesh; body: CANNON.Body; velocity?: CANNON.Vec3; isFullAsteroid: boolean }[] = [];
    private speedBoosts: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private bullets: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private trackPath!: THREE.CatmullRomCurve3;
    private pathLine!: THREE.Line;
    private rng: () => number = Math.random;
    private lives: number = 10;
    private score: number = 0;
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    private moveUp: boolean = false;
    private moveDown: boolean = false;
    private isPaused: boolean = false;
    private raceStarted: boolean = false;
    private countdown: number = 3;
    private countdownTimer: number = 0;
    private survivalTime: number = 0;
    private podSpeed: number = 40;
    private podDistance: number = 0;
    private podOffsetX: number = 0;
    private podOffsetY: number = 0;
    private currentOffsetX: number = 0;
    private currentOffsetY: number = 0;
    private cameraMode: number = 0;
    private livesCounter!: HTMLElement;
    private scoreCounter!: HTMLElement;
    private countdownElement!: HTMLElement;
    private hud!: HTMLElement;
    private pauseMenu!: HTMLElement;
    private resumeButton!: HTMLElement;
    private thrusterParticles!: THREE.Points;
    private dynamicLight!: THREE.PointLight;
    private level: number = 1;
    private backgroundMusic!: HTMLAudioElement;
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
    private asteroidModel: THREE.Group | null = null;
    private introAudio!: HTMLAudioElement;
    private isIntroPlaying: boolean = true;
    private introTime: number = 0;
    private introDuration: number = 20;
    private startButton!: HTMLElement;
    private asteroidTexture: THREE.Texture | null = null;
    private fog!: THREE.Fog;
    private fogZones: { start: number; end: number }[] = [
        { start: 0.01, end: 0.4 },
        { start: 0.6, end: 0.8 }
    ];
    private earth!: THREE.Mesh;
    private mars!: THREE.Mesh;
    private moon!: THREE.Mesh;
    private earthAtmosphere!: THREE.Mesh;
    private moonOrbitRadius: number = 2000;
    private moonOrbitAngle: number = 0;

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

        this.backgroundMusic = new Audio('/assets/music.mp3');
        this.backgroundMusic.loop = true;
        this.explosionSound = new Audio('/assets/explosion.mp3');
        this.introAudio = new Audio('/assets/intro-pilot.mp3');
        this.audioContext = new AudioContext();

        this.assignDomElements();
        this.setupInput();

        this.countdownElement.style.display = "none";
        this.crosshair.style.display = "none";
        this.startButton.style.display = "block";

        const textureLoader = new THREE.TextureLoader();
        this.asteroidTexture = await new Promise<THREE.Texture>((resolve, reject) => {
            textureLoader.load(
                '/assets/asteroid/asteroid_texture.jpg',
                (texture) => resolve(texture),
                undefined,
                (error) => reject(error)
            );
        }).catch((error) => {
            console.error('Failed to load asteroid texture:', error);
            return null;
        });

        this.createScene().then(() => {
            this.animate();
        });
        window.addEventListener('resize', () => this.handleResize());
    }

    private generateAsteroid(scaleFactor: number): THREE.Mesh {
        const baseRadius = 40;
        const geometry = new THREE.SphereGeometry(baseRadius * scaleFactor, 16, 16);
        const positions = geometry.attributes.position.array as Float32Array;
        const noise = createNoise3D();

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const noiseValue = noise(x * 0.1, y * 0.1, z * 0.1) * 10;
            positions[i] += noiseValue * (x / baseRadius);
            positions[i + 1] += noiseValue * (y / baseRadius);
            positions[i + 2] += noiseValue * (z / baseRadius);
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x333333,
            map: this.asteroidTexture,
            metalness: 0.1,
            roughness: 0.9,
            side: THREE.DoubleSide,
            emissive: 0x000000,
            emissiveIntensity: 0
        });

        return new THREE.Mesh(geometry, material);
    }

    private assignDomElements(): void {
        this.livesCounter = document.getElementById("healthCounter") as HTMLElement;
        this.scoreCounter = document.getElementById("scoreCounter") as HTMLElement || document.createElement("div");
        this.scoreCounter.id = "scoreCounter";
        this.countdownElement = document.getElementById("countdown") as HTMLElement;
        this.hud = document.getElementById("hud") as HTMLElement;
        this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
        this.resumeButton = document.getElementById("resumeButton") as HTMLElement;
        this.crosshair = document.getElementById("crosshair") as HTMLElement;
        this.startButton = document.getElementById("startButton") as HTMLElement;
        this.hud.appendChild(this.scoreCounter);
        this.hud.style.display = "flex";
        this.hud.style.justifyContent = "center";
        this.hud.style.position = "absolute";
        this.hud.style.top = "10px";
        this.hud.style.left = "0";
        this.hud.style.width = "100%";
        this.countdownElement.style.position = "absolute";
        this.countdownElement.style.top = "50%";
        this.countdownElement.style.left = "50%";
        this.countdownElement.style.transform = "translate(-50%, -50%)";
        this.countdownElement.style.fontSize = "48px";
        this.countdownElement.style.color = "white";
        this.updateHUD();
    }

    private setupInput(): void {
        document.addEventListener("keydown", (event) => {
            if (this.isPaused) return;
            switch (event.keyCode) {
                case 65: this.moveRight = true; break;
                case 68: this.moveLeft = true; break;
                case 87: this.moveUp = true; break;
                case 83: this.moveDown = true; break;
                case 32:
                    if (this.raceStarted) this.shootBullet();
                    break;
                case 67:
                    this.cameraMode = (this.cameraMode + 1) % 3;
                    break;
                case 27:
                    this.isPaused = !this.isPaused;
                    this.pauseMenu.style.display = this.isPaused ? "block" : "none";
                    if (this.isPaused) {
                        document.exitPointerLock();
                    } else {
                        this.canvas.requestPointerLock();
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
            this.introAudio.play().catch(err => {
                console.error("Audio playback failed:", err);
            });
            this.backgroundMusic.play().catch(err => {
                console.error("Audio playback failed:", err);
            });
        });

        this.canvas.addEventListener("click", () => {
            if (!this.isPaused && document.pointerLockElement !== this.canvas && !this.isIntroPlaying && !this.raceStarted) {
                this.canvas.requestPointerLock();
            }
        });

        this.resumeButton.addEventListener("click", () => {
            this.isPaused = false;
            this.pauseMenu.style.display = "none";
            this.canvas.requestPointerLock();
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
    }

    private startCountdown(): void {
        this.countdownTimer = 0;
        this.raceStarted = false;
        this.countdownElement.textContent = `Race starts in ${this.countdown}...`;
        this.countdownElement.style.display = "block";
    }

    private async createScene(): Promise<void> {
        this.rng = seedrandom("pod_racing_seed");
        const podGeometry = new THREE.BoxGeometry(4, 4, 4);
        const podMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2, emissive: 0x550000, emissiveIntensity: 1.5 });
        this.pod = new THREE.Mesh(podGeometry, podMaterial);
        this.pod.position.set(1500, 0, 0);
        this.scene.add(this.pod);

        this.podBody = new CANNON.Body({ mass: 1 });
        this.podBody.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 2)));
        this.podBody.position.copy(this.pod.position);
        this.world.addBody(this.podBody);

        const points = [
            new THREE.Vector3(1500, 0, 0),
            new THREE.Vector3(1200, 100, 300),
            new THREE.Vector3(800, 200, 600),
            new THREE.Vector3(400, 300, 900),
            new THREE.Vector3(0, 400, 1200),
            new THREE.Vector3(-400, 300, 1500),
            new THREE.Vector3(-800, 200, 1800),
            new THREE.Vector3(-1200, 100, 2100),
            new THREE.Vector3(-1500, 0, 2400),
            new THREE.Vector3(-1200, -100, 2700),
            new THREE.Vector3(-800, -200, 3000),
            new THREE.Vector3(-400, -300, 3300),
            new THREE.Vector3(0, -400, 3600),
            new THREE.Vector3(400, -300, 3900),
            new THREE.Vector3(800, -200, 4200),
            new THREE.Vector3(1200, -100, 4500),
            new THREE.Vector3(1500, 0, 4800),
            new THREE.Vector3(1200, 100, 5100),
            new THREE.Vector3(800, 200, 5400),
            new THREE.Vector3(400, 300, 5700),
            new THREE.Vector3(0, 400, 6000),
            new THREE.Vector3(-400, 300, 6300),
            new THREE.Vector3(-800, 200, 6600),
            new THREE.Vector3(-1200, 100, 6900),
            new THREE.Vector3(-1500, 0, 7200),
            new THREE.Vector3(-1200, -100, 7500),
            new THREE.Vector3(-800, -200, 7800),
            new THREE.Vector3(-400, -300, 8100),
            new THREE.Vector3(0, -400, 8400),
            new THREE.Vector3(400, -300, 8700),
            new THREE.Vector3(800, -200, 9000),
            new THREE.Vector3(1200, -100, 9300),
            new THREE.Vector3(1500, 0, 9600)
        ];
        this.trackPath = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);

        const pathPoints = this.trackPath.getPoints(512);
        const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, emissive: 0x00ffff, linewidth: 5, emissiveIntensity: 2 });
        this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
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
            obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(40 * scaleFactor, 40 * scaleFactor, 40 * scaleFactor)));
            obstacleBody.position.copy(asteroid.position);
            this.world.addBody(obstacleBody);

            this.obstacles.push({ mesh: asteroid, body: obstacleBody, isFullAsteroid: true });
        }

        const boostGeometry = new THREE.TorusGeometry(1, 0.3, 16, 32);
        for (let i = 0; i < 50; i++) {
            const boost = new THREE.Mesh(boostGeometry, new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 2 }));
            const t = i / 50;
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const offsetX = (this.rng() - 0.5) * 10;
            const offsetY = (this.rng() - 0.5) * 10;
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize();
            boost.position.copy(basePos).addScaledVector(normal, offsetX).addScaledVector(binormal, offsetY);
            boost.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
            this.scene.add(boost);

            const boostBody = new CANNON.Body({ mass: 0 });
            boostBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 0.3)));
            boostBody.position.copy(boost.position);
            this.world.addBody(boostBody);
            this.speedBoosts.push({ mesh: boost, body: boostBody });
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

        this.fog = new THREE.Fog(0x8899aa, 50, 500); // Lighter bluish-gray fog

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

        this.scene.userData = { earth: this.earth, moon: this.moon, mars: this.mars };

        const ambientLight = new THREE.AmbientLight(0xddddbb, 6); // Slightly warm ambient
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
        directionalLight.position.set(5000, 5000, 5000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 5); // Sunlight
        sunLight.position.set(10000, 10000, 10000); // Far away
        sunLight.castShadow = true;
        this.scene.add(sunLight);

        this.dynamicLight = new THREE.PointLight(0xffffff, 5, 20000);
        this.scene.add(this.dynamicLight);
    }

    private shootBullet(): void {
        const currentTime = performance.now();
        if (currentTime - this.lastShotTime < this.fireRate) return;
        this.lastShotTime = currentTime;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(300, this.audioContext.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.1);

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

    private animate(): void {
        requestAnimationFrame(() => this.animate());
        if (this.isPaused) return;

        this.world.step(1 / 60);
        const deltaTime = 1 / 60;

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
            this.countdownElement.textContent = timeLeft > 0 ? `Race starts in ${Math.ceil(timeLeft)}...` : "Go!";
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
        if (this.survivalTime % (100 / 10) < deltaTime) {
            this.podSpeed += 0.6;
            console.log(`Speed increased to ${this.podSpeed}`);
        }

        const trackLength = this.trackPath.getLength();
        this.podDistance += this.podSpeed * deltaTime;
        if (this.podDistance > trackLength) {
            this.level += 1;
            if (this.level > 100) {
                alert("Congratulations! You’ve won the game!");
                this.isPaused = true;
                this.pauseMenu.style.display = "block";
                return;
            }
            this.podDistance = 0;
            this.survivalTime = 0;
            this.scene.remove(this.pathLine);
            this.obstacles.forEach(o => {
                this.scene.remove(o.mesh);
                this.world.removeBody(o.body);
                if (o.body.userData?.debugMesh) this.scene.remove(o.body.userData.debugMesh);
            });
            this.speedBoosts.forEach(b => {
                this.scene.remove(b.mesh);
                this.world.removeBody(b.body);
            });
            this.obstacles = [];
            this.speedBoosts = [];
            this.bullets = [];
            this.createScene();
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

        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tangent);
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
        quaternion.multiply(yawQuat).multiply(pitchQuat);
        this.pod.quaternion.copy(quaternion);

        if (!this.moveLeft && !this.moveRight) this.podOffsetX *= 0.9;
        if (!this.moveUp && !this.moveDown) this.podOffsetY *= 0.9;

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

        let inFogZone = false;
        for (const zone of this.fogZones) {
            if (t >= zone.start && t <= zone.end) {
                inFogZone = true;
                break;
            }
        }
        this.scene.fog = inFogZone ? this.fog : null;

        this.earth.rotation.y += 0.001;
        this.mars.rotation.y += 0.0009;
        this.moonOrbitAngle += 0.0005;
        this.moon.position.set(
            this.earth.position.x + Math.cos(this.moonOrbitAngle) * this.moonOrbitRadius,
            this.earth.position.y,
            this.earth.position.z + Math.sin(this.moonOrbitAngle) * this.moonOrbitRadius
        );
        this.moon.rotation.y += 0.0003;

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
            if (this.rng() < aggressionFactor * 0.1) {
                const directionToPod = this.pod.position.clone().sub(obstacle.mesh.position).normalize();
                obstacle.body.velocity.set(directionToPod.x * 30 * aggressionFactor, directionToPod.y * 30 * aggressionFactor, directionToPod.z * 30 * aggressionFactor);
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
                    if (obstacle.body.userData?.debugMesh) {
                        this.scene.remove(obstacle.body.userData.debugMesh);
                    }
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

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            if (!obstacle.mesh || !obstacle.body) continue;
            const scaleFactor = obstacle.mesh.scale.x;
            if (this.pod.position.distanceTo(obstacle.mesh.position) < 6 * scaleFactor) {
                this.explosionSound.play();
                const directionAway = obstacle.mesh.position.clone().sub(this.pod.position).normalize();
                obstacle.body.velocity.set(directionAway.x * 50, directionAway.y * 50, directionAway.z * 50);
                this.splitAsteroid(obstacle.mesh as THREE.Mesh, obstacle.body, scaleFactor);
                this.scene.remove(obstacle.mesh);
                this.world.removeBody(obstacle.body);
                if (obstacle.body.userData?.debugMesh) {
                    this.scene.remove(obstacle.body.userData.debugMesh);
                }
                this.obstacles.splice(i, 1);
                this.lives -= 1;
                this.podSpeed *= 0.8;
                if (this.lives <= 0) {
                    this.isPaused = true;
                    this.pauseMenu.style.display = "block";
                    alert(`Game Over! Final Score: ${Math.floor(this.score)}`);
                }
            }
        }

        this.speedBoosts.forEach((boost, index) => {
            if (!boost.mesh || !boost.body) return;
            if (this.pod.position.distanceTo(boost.mesh.position) < 2.5) {
                this.podSpeed += 20;
                this.scene.remove(boost.mesh);
                this.world.removeBody(boost.body);
                this.speedBoosts.splice(index, 1);
                this.score += 100;
            }
        });

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
                obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(40 * scaleFactor, 40 * scaleFactor, 40 * scaleFactor)));
                obstacleBody.position.copy(asteroid.position);
                this.world.addBody(obstacleBody);

                this.obstacles.push({ mesh: asteroid, body: obstacleBody, isFullAsteroid: true });
            }
            this.asteroidSpawnTimer = this.asteroidSpawnTimer % spawnInterval;
        }

        if (this.dynamicLight) {
            this.dynamicLight.position.copy(this.pod.position);
            this.dynamicLight.intensity = 4 + Math.sin(this.survivalTime * 2) * 2;
        }

        const progress = (this.podDistance / trackLength) * 100;
        const progressBar = document.getElementById("progressBar") as HTMLElement;
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `Level ${this.level} - ${Math.floor(progress)}%`;
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
            fragment.scale.set(newScale, newScale, newScale);
            fragment.position.copy(mesh.position);
            this.scene.add(fragment);

            const fragmentBody = new CANNON.Body({ mass: 1 });
            fragmentBody.addShape(new CANNON.Box(new CANNON.Vec3(40 * newScale, 40 * newScale, 40 * newScale)));
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