import * as THREE from "three";
import * as CANNON from "cannon-es";
const seedrandom = require('seedrandom');

class PodRacingGame {
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    private renderer!: THREE.WebGLRenderer;
    private world: CANNON.World = new CANNON.World();
    private canvas!: HTMLCanvasElement;
    private pod!: THREE.Mesh;
    private podBody!: CANNON.Body;
    private obstacles: { mesh: THREE.Mesh; body: CANNON.Body; velocity?: CANNON.Vec3 }[] = [];
    private asteroidFragments: { mesh: THREE.Mesh; body: CANNON.Body; lifetime: number }[] = [];
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

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
        if (!this.canvas) throw new Error("Canvas not found");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.world.gravity.set(0, 0, 0);

        this.backgroundMusic = new Audio('/assets/music.mp3');
        this.backgroundMusic.loop = true;
        this.explosionSound = new Audio('/assets/explosion.mp3');
        this.audioContext = new AudioContext();

        this.assignDomElements();
        this.setupInput();

        this.countdownElement.textContent = "Click to start";
        this.countdownElement.style.display = "block";
        this.crosshair.style.display = "none";

        this.createScene().then(() => {
            this.animate();
        });
        window.addEventListener('resize', () => this.handleResize());
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
                case 65: this.moveRight = true; break; // A (right)
                case 68: this.moveLeft = true; break; // D (left)
                case 87: this.moveUp = true; break; // W (up)
                case 83: this.moveDown = true; break; // S (down)
                case 67: 
                    this.cameraMode = (this.cameraMode + 1) % 3;
                    break;
                case 27: // Esc
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
                case 65: this.moveRight = false; break; // A
                case 68: this.moveLeft = false; break; // D
                case 87: this.moveUp = false; break; // W
                case 83: this.moveDown = false; break; // S
            }
        });

        document.addEventListener("mousemove", (event) => {
            if (this.isPaused || !this.raceStarted || document.pointerLockElement !== this.canvas) return;
            const yawDelta = -event.movementX * this.mouseSensitivity;
            const pitchDelta = -event.movementY * this.mouseSensitivity;
            this.yaw = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.yaw + yawDelta));
            this.pitch = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, this.pitch + pitchDelta));
        });

        this.canvas.addEventListener("mousedown", () => {
            if (this.isPaused || !this.raceStarted) return;
            this.shootBullet();
        });

        this.canvas.addEventListener("click", () => {
            if (!this.isPaused && document.pointerLockElement !== this.canvas) {
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
                if (!this.raceStarted && !this.isPaused) {
                    this.startCountdown();
                }
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
        const podGeometry = new THREE.SphereGeometry(2, 32, 32);
        const podMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2, emissive: 0x550000, emissiveIntensity: 1.5 });
        this.pod = new THREE.Mesh(podGeometry, podMaterial);
        this.pod.position.set(1500, 0, 0);
        this.scene.add(this.pod);

        this.podBody = new CANNON.Body({ mass: 1 });
        this.podBody.addShape(new CANNON.Sphere(2));
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

        const textureLoader = new THREE.TextureLoader();
        const asteroidBaseColor = textureLoader.load('/assets/asteroid_texture.jpg');
        asteroidBaseColor.flipY = false;
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

            const scaleFactor = 3 + this.rng() * 12;
            const asteroidGeometry = new THREE.SphereGeometry(4 * scaleFactor, 32, 32);
            const vertices = asteroidGeometry.attributes.position.array as Float32Array;
            for (let j = 0; j < vertices.length; j += 3) {
                const vertex = new THREE.Vector3(vertices[j], vertices[j + 1], vertices[j + 2]);
                const noise1 = (this.rng() - 0.5) * 2;
                const noise2 = Math.sin(vertex.x * 0.5 + vertex.y * 0.5 + vertex.z * 0.5) * 0.5;
                vertex.normalize().multiplyScalar(4 * scaleFactor + noise1 + noise2);
                vertices[j] = vertex.x;
                vertices[j + 1] = vertex.y;
                vertices[j + 2] = vertex.z;
            }
            asteroidGeometry.attributes.position.needsUpdate = true;
            asteroidGeometry.computeVertexNormals();

            const asteroidMaterial = new THREE.MeshStandardMaterial({
                map: asteroidBaseColor,
                metalness: 0.2,
                roughness: 0.8,
                side: THREE.DoubleSide,
                emissive: 0x222222,
                emissiveIntensity: 0.1
            });
            const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
            asteroid.position.copy(basePos).addScaledVector(normal, offsetX).addScaledVector(binormal, offsetY).addScaledVector(tangent, offsetZ);
            this.scene.add(asteroid);

            const obstacleBody = new CANNON.Body({ mass: 1 });
            obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(2 * scaleFactor, 2 * scaleFactor, 2 * scaleFactor)));
            obstacleBody.position.copy(asteroid.position);
            this.world.addBody(obstacleBody);
            this.obstacles.push({ mesh: asteroid, body: obstacleBody });
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

        const earthGeometry = new THREE.SphereGeometry(1000, 32, 32);
        const earthMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/earth.jpg') });
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        earth.position.set(5000, 2000, 10000);
        this.scene.add(earth);

        const moonGeometry = new THREE.SphereGeometry(300, 32, 32);
        const moonMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/moon.jpg') });
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.position.set(earth.position.x + 2000, earth.position.y, earth.position.z);
        this.scene.add(moon);

        const marsGeometry = new THREE.SphereGeometry(800, 32, 32);
        const marsMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/mars.jpg') });
        const mars = new THREE.Mesh(marsGeometry, marsMaterial);
        mars.position.set(-6000, -3000, 12000);
        this.scene.add(mars);

        this.scene.userData = { earth, moon };

        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleMaterial = new THREE.PointsMaterial({ color: 0xff4500, size: 0.7, transparent: true, opacity: 1 });
        this.thrusterParticles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(this.thrusterParticles);

        const explosionGeometry = new THREE.BufferGeometry();
        const explosionPositions = new Float32Array(200 * 3);
        explosionGeometry.setAttribute('position', new THREE.BufferAttribute(explosionPositions, 3));
        const explosionMaterial = new THREE.PointsMaterial({ color: 0xff4500, size: 1, transparent: true, opacity: 0.8 });
        this.scene.userData.explosionParticles = new THREE.Points(explosionGeometry, explosionMaterial);
        this.scene.add(this.scene.userData.explosionParticles);

        this.scene.add(new THREE.AmbientLight(0xaaaaaa, 4));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
        directionalLight.position.set(5000, 5000, 5000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        this.dynamicLight = new THREE.PointLight(0xffaa00, 5, 20000);
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

        // Simplified bullet creation, aligned with original code
        const bulletGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Basic material for guaranteed visibility
        const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bulletMesh.position.copy(this.pod.position);
        this.scene.add(bulletMesh);

        const bulletBody = new CANNON.Body({ mass: 1 });
        bulletBody.addShape(new CANNON.Sphere(0.5));
        bulletBody.position.copy(this.pod.position);

        // Use pod's forward direction adjusted by yaw and pitch
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.pod.quaternion);
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(up, this.yaw);
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, this.pitch);
        const shootDir = forward.clone().applyQuaternion(yawQuat).applyQuaternion(pitchQuat).normalize();

        bulletBody.velocity.set(shootDir.x * 1000, shootDir.y * 1000, shootDir.z * 1000);
        this.world.addBody(bulletBody);

        this.bullets.push({ mesh: bulletMesh, body: bulletBody });
        console.log("Bullet fired at:", bulletMesh.position); // Debug log
    }

    private updateHUD(): void {
        this.livesCounter.textContent = `Lives: ${this.lives}`;
        this.scoreCounter.textContent = `Score: ${Math.floor(this.score)}`;
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());
        if (this.isPaused) return;

        this.world.step(1 / 60);
        const deltaTime = 1 / 60;

        if (!this.raceStarted) {
            if (this.countdownElement.textContent === "Click to start") {
                const startPos = this.trackPath.getPointAt(0);
                this.camera.position.copy(startPos);
                const startTangent = this.trackPath.getTangentAt(0).negate();
                this.camera.lookAt(startPos.clone().add(startTangent));
                this.renderer.render(this.scene, this.camera);
                return;
            }

            this.countdownTimer += deltaTime;
            const timeLeft = Math.max(0, this.countdown - this.countdownTimer);
            this.countdownElement.textContent = timeLeft > 0 ? `Race starts in ${Math.ceil(timeLeft)}...` : "Go!";
            if (timeLeft <= 0) {
                this.raceStarted = true;
                this.countdownElement.style.display = "none";
                this.backgroundMusic.play();
            }
            const startPos = this.trackPath.getPointAt(0);
            this.camera.position.copy(startPos);
            const startTangent = this.trackPath.getTangentAt(0).negate();
            this.camera.lookAt(startPos.clone().add(startTangent));
            this.renderer.render(this.scene, this.camera);
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
            });
            this.speedBoosts.forEach(b => {
                this.scene.remove(b.mesh);
                this.world.removeBody(b.body);
            });
            this.asteroidFragments.forEach(f => {
                this.scene.remove(f.mesh);
                this.world.removeBody(f.body);
            });
            this.obstacles = [];
            this.speedBoosts = [];
            this.bullets = [];
            this.asteroidFragments = [];
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

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            if (!obstacle.mesh || !obstacle.body) continue;
            obstacle.mesh.rotation.x += 0.0025;
            obstacle.mesh.rotation.y += 0.0025;
            obstacle.mesh.rotation.z += 0.0025;

            const aggressionFactor = Math.min(this.level / 100, 1);
            if (this.rng() < aggressionFactor * 0.1) {
                const directionToPod = this.pod.position.clone().sub(obstacle.mesh.position).normalize();
                obstacle.body.velocity.set(directionToPod.x * 30 * aggressionFactor, directionToPod.y * 30 * aggressionFactor, directionToPod.z * 30 * aggressionFactor);
            }
            obstacle.mesh.position.copy(obstacle.body.position);
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet.mesh || !bullet.body) {
                this.bullets.splice(i, 1);
                continue;
            }
            bullet.mesh.position.copy(bullet.body.position);
            bullet.mesh.visible = true; // Ensure visibility

            let bulletHit = false;
            for (let j = this.obstacles.length - 1; j >= 0; j--) {
                const obstacle = this.obstacles[j];
                if (!obstacle.mesh || !obstacle.body) continue;
                const scaleFactor = obstacle.mesh.scale.x;
                const hitDistance = 2 + 0.5 * scaleFactor;
                if (bullet.mesh.position.distanceTo(obstacle.mesh.position) < hitDistance) {
                    this.explodeAsteroid(obstacle.mesh.position);
                    this.explosionSound.play();
                    this.splitAsteroid(obstacle.mesh, obstacle.body, scaleFactor);
                    this.scene.remove(obstacle.mesh);
                    this.world.removeBody(obstacle.body);
                    this.obstacles.splice(j, 1);
                    bulletHit = true;
                    this.score += 50;
                    break;
                }
            }

            if (bulletHit || bullet.mesh.position.length() > 20000) {
                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
                this.bullets.splice(i, 1);
            } else {
                console.log("Bullet position:", bullet.mesh.position); // Debug log
            }
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            if (!obstacle.mesh || !obstacle.body) continue;
            const scaleFactor = obstacle.mesh.scale.x;
            if (this.pod.position.distanceTo(obstacle.mesh.position) < 6 * scaleFactor) {
                this.explodeAsteroid(obstacle.mesh.position);
                this.explosionSound.play();
                this.splitAsteroid(obstacle.mesh, obstacle.body, scaleFactor);
                this.scene.remove(obstacle.mesh);
                this.world.removeBody(obstacle.body);
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

        for (let i = this.asteroidFragments.length - 1; i >= 0; i--) {
            const fragment = this.asteroidFragments[i];
            fragment.mesh.position.copy(fragment.body.position);
            fragment.mesh.rotation.x += 0.01;
            fragment.mesh.rotation.y += 0.01;
            fragment.mesh.rotation.z += 0.01;
            fragment.lifetime -= deltaTime;
            if (fragment.lifetime <= 0) {
                this.scene.remove(fragment.mesh);
                this.world.removeBody(fragment.body);
                this.asteroidFragments.splice(i, 1);
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

        const textureLoader = new THREE.TextureLoader();
        this.asteroidSpawnTimer += deltaTime;
        const spawnInterval = this.asteroidSpawnInterval * (1 - (this.level - 1) / 100);
        const asteroidsToSpawn = Math.floor(this.asteroidSpawnTimer / spawnInterval);
        if (asteroidsToSpawn > 0) {
            for (let i = 0; i < asteroidsToSpawn; i++) {
                const t = (this.podDistance + 500) / trackLength % 1;
                const basePos = this.trackPath.getPointAt(t);
                const tangent = this.trackPath.getTangentAt(t);
                const offsetX = (this.rng() - 0.5) * 100;
                const offsetY = (this.rng() - 0.5) * 100;
                const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
                const binormal = tangent.clone().cross(normal).normalize();

                const scaleFactor = 3 + this.rng() * 12;
                const asteroidGeometry = new THREE.SphereGeometry(4 * scaleFactor, 32, 32);
                const vertices = asteroidGeometry.attributes.position.array as Float32Array;
                for (let j = 0; j < vertices.length; j += 3) {
                    const vertex = new THREE.Vector3(vertices[j], vertices[j + 1], vertices[j + 2]);
                    const noise1 = (this.rng() - 0.5) * 2;
                    const noise2 = Math.sin(vertex.x * 0.5 + vertex.y * 0.5 + vertex.z * 0.5) * 0.5;
                    vertex.normalize().multiplyScalar(4 * scaleFactor + noise1 + noise2);
                    vertices[j] = vertex.x;
                    vertices[j + 1] = vertex.y;
                    vertices[j + 2] = vertex.z;
                }
                asteroidGeometry.attributes.position.needsUpdate = true;
                asteroidGeometry.computeVertexNormals();

                const asteroidMaterial = new THREE.MeshStandardMaterial({
                    map: textureLoader.load('/assets/asteroid_texture.jpg'),
                    metalness: 0.2,
                    roughness: 0.8,
                    side: THREE.DoubleSide,
                    emissive: 0x222222,
                    emissiveIntensity: 0.1
                });
                const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
                asteroid.position.copy(basePos).addScaledVector(normal, offsetX).addScaledVector(binormal, offsetY);
                this.scene.add(asteroid);

                const obstacleBody = new CANNON.Body({ mass: 1 });
                obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(2 * scaleFactor, 2 * scaleFactor, 2 * scaleFactor)));
                obstacleBody.position.copy(asteroid.position);
                this.world.addBody(obstacleBody);
                this.obstacles.push({ mesh: asteroid, body: obstacleBody });
            }
            this.asteroidSpawnTimer = this.asteroidSpawnTimer % spawnInterval;
        }

        const particlePositions = this.thrusterParticles.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < particlePositions.length; i += 3) {
            particlePositions[i] = this.pod.position.x - tangent.x * 3 + (this.rng() - 0.5) * 2;
            particlePositions[i + 1] = this.pod.position.y - tangent.y * 3 + (this.rng() - 0.5) * 2;
            particlePositions[i + 2] = this.pod.position.z - tangent.z * 3 + (this.rng() - 0.5) * 2;
        }
        this.thrusterParticles.geometry.attributes.position.needsUpdate = true;

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

    private explodeAsteroid(position: THREE.Vector3): void {
        const explosionParticles = this.scene.userData.explosionParticles as THREE.Points;
        const positions = explosionParticles.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] = position.x + (this.rng() - 0.5) * 10;
            positions[i + 1] = position.y + (this.rng() - 0.5) * 10;
            positions[i + 2] = position.z + (this.rng() - 0.5) * 10;
        }
        explosionParticles.geometry.attributes.position.needsUpdate = true;
        setTimeout(() => {
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] = position.x + (this.rng() - 0.5) * 100;
                positions[i + 1] = position.y + (this.rng() - 0.5) * 100;
                positions[i + 2] = position.z + (this.rng() - 0.5) * 100;
            }
            explosionParticles.geometry.attributes.position.needsUpdate = true;
        }, 100);
    }

    private splitAsteroid(mesh: THREE.Mesh, body: CANNON.Body, scaleFactor: number): void {
        if (scaleFactor < 1) return;
        const textureLoader = new THREE.TextureLoader();
        const asteroidBaseColor = textureLoader.load('/assets/asteroid_texture.jpg');
        asteroidBaseColor.flipY = false;
        const newScale = scaleFactor * 0.5;
        for (let i = 0; i < 3; i++) {
            const fragmentGeometry = new THREE.SphereGeometry(4 * newScale, 32, 32);
            const vertices = fragmentGeometry.attributes.position.array as Float32Array;
            for (let j = 0; j < vertices.length; j += 3) {
                const vertex = new THREE.Vector3(vertices[j], vertices[j + 1], vertices[j + 2]);
                const noise1 = (this.rng() - 0.5) * 2;
                const noise2 = Math.sin(vertex.x * 0.5 + vertex.y * 0.5 + vertex.z * 0.5) * 0.5;
                vertex.normalize().multiplyScalar(4 * newScale + noise1 + noise2);
                vertices[j] = vertex.x;
                vertices[j + 1] = vertex.y;
                vertices[j + 2] = vertex.z;
            }
            fragmentGeometry.attributes.position.needsUpdate = true;
            fragmentGeometry.computeVertexNormals();

            const fragmentMaterial = new THREE.MeshStandardMaterial({
                map: asteroidBaseColor,
                metalness: 0.2,
                roughness: 0.8,
                side: THREE.DoubleSide,
                emissive: 0x222222,
                emissiveIntensity: 0.1
            });
            const fragmentMesh = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
            fragmentMesh.position.copy(mesh.position);
            this.scene.add(fragmentMesh);

            const fragmentBody = new CANNON.Body({ mass: 0 });
            fragmentBody.addShape(new CANNON.Box(new CANNON.Vec3(2 * newScale, 2 * newScale, 2 * newScale)));
            fragmentBody.position.copy(mesh.position);
            const scatterVel = new THREE.Vector3((this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20);
            fragmentBody.velocity.set(scatterVel.x, scatterVel.y, scatterVel.z);
            this.world.addBody(fragmentBody);

            this.asteroidFragments.push({ mesh: fragmentMesh, body: fragmentBody, lifetime: 5 });
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