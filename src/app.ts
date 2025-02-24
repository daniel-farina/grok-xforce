import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const seedrandom = require('seedrandom');

class PodRacingGame {
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    private renderer!: THREE.WebGLRenderer;
    private world: CANNON.World = new CANNON.World();
    private canvas!: HTMLCanvasElement;
    private pod!: THREE.Mesh;
    private podBody!: CANNON.Body;
    private obstacles: { mesh: THREE.Group; body: CANNON.Body; velocity?: CANNON.Vec3 }[] = [];
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
    private laserLine!: THREE.Line;
    private backgroundMusic!: HTMLAudioElement;
    private explosionSound!: HTMLAudioElement;
    private audioContext!: AudioContext;

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
        this.createScene().then(() => this.animate());
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
                case 27: 
                    this.isPaused = !this.isPaused;
                    this.pauseMenu.style.display = this.isPaused ? "block" : "none";
                    break;
                case 76: // 'L' to toggle pointer lock (optional)
                    if (document.pointerLockElement === this.canvas) {
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

        this.canvas.addEventListener("mousedown", (event) => {
            if (this.isPaused || !this.raceStarted) return;
            this.shootLaser(event);
        });

        // Crosshair movement
        document.addEventListener("mousemove", (event) => {
            const crosshair = document.getElementById("crosshair") as HTMLElement;
            if (crosshair) {
                crosshair.style.left = `${event.clientX}px`;
                crosshair.style.top = `${event.clientY}px`;
            }
        });

        this.resumeButton.addEventListener("click", () => {
            this.isPaused = false;
            this.pauseMenu.style.display = "none";
        });
    }

    private async createScene(): Promise<void> {
        this.rng = seedrandom("pod_racing_seed");

        // Pod (Sphere)
        const podGeometry = new THREE.SphereGeometry(2, 32, 32);
        const podMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2, emissive: 0x550000, emissiveIntensity: 1.5 });
        this.pod = new THREE.Mesh(podGeometry, podMaterial);
        this.pod.position.set(1500, 0, 0);
        this.scene.add(this.pod);

        this.podBody = new CANNON.Body({ mass: 1 });
        this.podBody.addShape(new CANNON.Sphere(2));
        this.podBody.position.copy(this.pod.position);
        this.world.addBody(this.podBody);

        // Smoother, Non-Overlapping Path
        const points = [
            new THREE.Vector3(1500, 0, 0),
            new THREE.Vector3(1200, 200, 600),
            new THREE.Vector3(800, 400, 1200),
            new THREE.Vector3(400, 600, 1800),
            new THREE.Vector3(0, 800, 2400),
            new THREE.Vector3(-400, 600, 3000),
            new THREE.Vector3(-800, 400, 3600),
            new THREE.Vector3(-1200, 200, 4200),
            new THREE.Vector3(-1500, 0, 4800),
            new THREE.Vector3(-1200, -200, 5400),
            new THREE.Vector3(-800, -400, 6000),
            new THREE.Vector3(-400, -600, 6600),
            new THREE.Vector3(0, -800, 7200),
            new THREE.Vector3(400, -600, 7800),
            new THREE.Vector3(800, -400, 8400),
            new THREE.Vector3(1200, -200, 9000),
            new THREE.Vector3(1500, 0, 9600),
            new THREE.Vector3(1200, 200, 10200),
            new THREE.Vector3(800, 400, 10800),
            new THREE.Vector3(400, 600, 11400),
            new THREE.Vector3(0, 800, 12000),
            new THREE.Vector3(-400, 600, 12600),
            new THREE.Vector3(-800, 400, 13200),
            new THREE.Vector3(-1200, 200, 13800),
            new THREE.Vector3(-1500, 0, 14400),
            new THREE.Vector3(-1200, -200, 15000),
            new THREE.Vector3(-800, -400, 15600),
            new THREE.Vector3(-400, -600, 16200),
            new THREE.Vector3(0, -800, 16800),
            new THREE.Vector3(400, -600, 17400),
            new THREE.Vector3(800, -400, 18000),
            new THREE.Vector3(1200, -200, 18600),
            new THREE.Vector3(1500, 0, 19200)
        ];
        this.trackPath = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);

        // Glowing Path Line
        const pathPoints = this.trackPath.getPoints(512);
        const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, emissive: 0x00ffff, linewidth: 5, emissiveIntensity: 2 });
        this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
        this.scene.add(this.pathLine);

        // Obstacles (Asteroids with progressive difficulty)
        const loader = new GLTFLoader();
        const asteroidPromise = loader.loadAsync('assets/asteroid.gltf');
        const textureLoaderRoid = new THREE.TextureLoader();
        const asteroidBaseColor = textureLoaderRoid.load('/assets/asteroid_texture.jpg');
        asteroidBaseColor.flipY = false;
        const baseAsteroidCount = 50;
        const asteroidCount = baseAsteroidCount + Math.floor((this.level - 1) * baseAsteroidCount * 0.5);
        for (let i = 0; i < asteroidCount; i++) {
            const t = this.rng();
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const offsetX = (this.rng() - 0.5) * 1000;
            const offsetY = (this.rng() - 0.5) * 1000;
            const offsetZ = (this.rng() - 0.5) * 1000;
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize();

            const asteroidData = await asteroidPromise;
            const asteroid = asteroidData.scene.clone();
            asteroid.scale.set(0.1 + this.rng() * 0.1, 0.1 + this.rng() * 0.1, 0.1 + this.rng() * 0.1);
            asteroid.position.copy(basePos).addScaledVector(normal, offsetX).addScaledVector(binormal, offsetY).addScaledVector(tangent, offsetZ);
            asteroid.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        map: asteroidBaseColor,
                        metalness: 0.2,
                        roughness: 0.8,
                        side: THREE.DoubleSide,
                        emissive: 0x222222,
                        emissiveIntensity: 0.1
                    });
                    child.material.needsUpdate = true;
                }
            });
            this.scene.add(asteroid);

            const obstacleBody = new CANNON.Body({ mass: 1 });
            obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 2)));
            obstacleBody.position.copy(asteroid.position);
            this.world.addBody(obstacleBody);
            this.obstacles.push({ mesh: asteroid, body: obstacleBody });
        }

        // Speed Boost Pickups (50)
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

        // Stars in Space
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

        // Planets with Textures
        const textureLoader = new THREE.TextureLoader();
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

        // Thruster Particles
        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleMaterial = new THREE.PointsMaterial({ color: 0xff4500, size: 0.7, transparent: true, opacity: 1 });
        this.thrusterParticles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(this.thrusterParticles);

        // Explosion Particles
        const explosionGeometry = new THREE.BufferGeometry();
        const explosionPositions = new Float32Array(200 * 3);
        explosionGeometry.setAttribute('position', new THREE.BufferAttribute(explosionPositions, 3));
        const explosionMaterial = new THREE.PointsMaterial({ color: 0xff4500, size: 1, transparent: true, opacity: 0.8 });
        this.scene.userData.explosionParticles = new THREE.Points(explosionGeometry, explosionMaterial);
        this.scene.add(this.scene.userData.explosionParticles);

        // Laser Line
        const laserGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const laserMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 }); // Increased linewidth
        this.laserLine = new THREE.Line(laserGeometry, laserMaterial);
        this.scene.add(this.laserLine);

        // Lighting
        this.scene.add(new THREE.AmbientLight(0xaaaaaa, 4));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
        directionalLight.position.set(5000, 5000, 5000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        this.dynamicLight = new THREE.PointLight(0xffaa00, 5, 20000);
        this.scene.add(this.dynamicLight);
    }

    private shootLaser(event: MouseEvent): void {
        // Synthesized laser sound
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.2);

        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const direction = raycaster.ray.direction.clone();
        const startPos = this.pod.position.clone();
        const endPos = startPos.clone().add(direction.multiplyScalar(20000));

        this.laserLine.geometry.setFromPoints([startPos, endPos]);
        this.laserLine.material.color.set(0xff0000);
        this.laserLine.visible = true;
        setTimeout(() => {
            this.laserLine.geometry.setFromPoints([startPos, startPos]);
            this.laserLine.visible = false;
        }, 100);

        const laserBody = new CANNON.Body({ mass: 1 });
        laserBody.addShape(new CANNON.Sphere(0.1));
        laserBody.position.copy(startPos);
        laserBody.velocity.set(direction.x * 500, direction.y * 500, direction.z * 500);
        this.world.addBody(laserBody);
        const laserMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        laserMesh.position.copy(startPos);
        this.scene.add(laserMesh);
        this.bullets.push({ mesh: laserMesh, body: laserBody });
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

        // Countdown Logic
        if (!this.raceStarted) {
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

        // Survival Time and Speed Increase
        this.survivalTime += deltaTime;
        this.score += this.podSpeed * deltaTime;
        if (this.survivalTime % 10 < deltaTime) {
            this.podSpeed += 10;
            console.log(`Speed increased to ${this.podSpeed}`);
        }

        // Pod Movement with Smoothing
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
            this.podSpeed *= 1.01;
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
            this.obstacles = [];
            this.speedBoosts = [];
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

        if (this.moveLeft) this.podOffsetX -= moveSpeed * deltaTime;
        if (this.moveRight) this.podOffsetX += moveSpeed * deltaTime;
        if (this.moveUp) this.podOffsetY += moveSpeed * deltaTime;
        if (this.moveDown) this.podOffsetY -= moveSpeed * deltaTime;

        this.podOffsetX = Math.max(-maxOffset, Math.min(maxOffset, this.podOffsetX));
        this.podOffsetY = Math.max(-maxOffset, Math.min(maxOffset, this.podOffsetY));

        this.currentOffsetX = THREE.MathUtils.lerp(this.currentOffsetX, this.podOffsetX, lerpFactor);
        this.currentOffsetY = THREE.MathUtils.lerp(this.currentOffsetY, this.podOffsetY, lerpFactor);

        const podOffsetVec = normal.clone().multiplyScalar(this.currentOffsetX).add(binormal.clone().multiplyScalar(this.currentOffsetY));
        const podPos = basePos.clone().add(podOffsetVec);
        this.podBody.position.copy(podPos);
        this.pod.position.copy(this.podBody.position);
        this.pod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tangent);

        if (!this.moveLeft && !this.moveRight) this.podOffsetX *= 0.9;
        if (!this.moveUp && !this.moveDown) this.podOffsetY *= 0.9;

        // Camera Modes
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
                this.camera.position.set(0, 5000, 0);
                this.camera.lookAt(new THREE.Vector3(0, 0, 0));
                break;
        }

        // Asteroid Movement and Rotation
        this.obstacles.forEach(obstacle => {
            obstacle.mesh.rotation.x += 0.005 * (1 + this.podSpeed / 40);
            obstacle.mesh.rotation.y += 0.005 * (1 + this.podSpeed / 40);
            obstacle.mesh.rotation.z += 0.005 * (1 + this.podSpeed / 40);
            
            const aggressionFactor = Math.min(this.level / 100, 1);
            if (this.rng() < aggressionFactor * 0.05) {
                const directionToPod = this.pod.position.clone().sub(obstacle.mesh.position).normalize();
                obstacle.body.velocity.set(directionToPod.x * 20 * aggressionFactor, directionToPod.y * 20 * aggressionFactor, directionToPod.z * 20 * aggressionFactor);
            }
            obstacle.mesh.position.copy(obstacle.body.position);
        });

        // Laser Collision and Movement
        this.bullets.forEach((bullet, bulletIndex) => {
            bullet.mesh.position.copy(bullet.body.position);
            this.obstacles.forEach((obstacle, obsIndex) => {
                if (bullet.mesh.position.distanceTo(obstacle.mesh.position) < 4) {
                    this.explodeAsteroid(obstacle.mesh.position);
                    this.explosionSound.play();
                    this.scene.remove(obstacle.mesh);
                    this.world.removeBody(obstacle.body);
                    this.obstacles.splice(obsIndex, 1);
                    this.scene.remove(bullet.mesh);
                    this.world.removeBody(bullet.body);
                    this.bullets.splice(bulletIndex, 1);
                    this.score += 50;
                    return;
                }
            });
            if (bullet.mesh.position.length() > 20000) {
                this.scene.remove(bullet.mesh);
                this.world.removeBody(bullet.body);
                this.bullets.splice(bulletIndex, 1);
            }
        });

        // Speed Boost Collision
        this.speedBoosts.forEach((boost, index) => {
            if (this.pod.position.distanceTo(boost.mesh.position) < 2.5) {
                this.podSpeed += 20;
                this.scene.remove(boost.mesh);
                this.world.removeBody(boost.body);
                this.speedBoosts.splice(index, 1);
                this.score += 100;
            }
        });

        // Obstacle Collision (Asteroids)
        this.obstacles.forEach((obstacle, index) => {
            if (this.pod.position.distanceTo(obstacle.mesh.position) < 6) {
                this.explodeAsteroid(obstacle.mesh.position);
                this.explosionSound.play();
                this.scene.remove(obstacle.mesh);
                this.world.removeBody(obstacle.body);
                this.obstacles.splice(index, 1);
                this.lives -= 1;
                this.podSpeed *= 0.8;
                if (this.lives <= 0) {
                    this.isPaused = true;
                    this.pauseMenu.style.display = "block";
                    alert(`Game Over! Final Score: ${Math.floor(this.score)}`);
                }
            }
        });

        // Thruster Particles
        const particlePositions = this.thrusterParticles.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < particlePositions.length; i += 3) {
            particlePositions[i] = this.pod.position.x - tangent.x * 3 + (this.rng() - 0.5) * 2;
            particlePositions[i + 1] = this.pod.position.y - tangent.y * 3 + (this.rng() - 0.5) * 2;
            particlePositions[i + 2] = this.pod.position.z - tangent.z * 3 + (this.rng() - 0.5) * 2;
        }
        this.thrusterParticles.geometry.attributes.position.needsUpdate = true;

        // Dynamic Light
        this.dynamicLight.position.copy(this.pod.position);
        this.dynamicLight.intensity = 4 + Math.sin(this.survivalTime * 2) * 2;

        // Progress Bar
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