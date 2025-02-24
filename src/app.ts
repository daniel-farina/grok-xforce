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
    private obstacles: { mesh: THREE.Group; body: CANNON.Body }[] = [];
    private ammoPickups: { mesh: THREE.Mesh; body: CANNON.Body; ammoValue: number }[] = [];
    private speedBoosts: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private bullets: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private trackPath!: THREE.CatmullRomCurve3;
    private pathLine!: THREE.Line;
    private rng: () => number = Math.random;
    private ammo: number = 20;
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
    private podOffsetX: number = 0; // Target left/right offset
    private podOffsetY: number = 0; // Target up/down offset
    private currentOffsetX: number = 0; // Current left/right offset (animated)
    private currentOffsetY: number = 0; // Current up/down offset (animated)
    private cameraMode: number = 0;
    private ammoCounter!: HTMLElement;
    private livesCounter!: HTMLElement;
    private scoreCounter!: HTMLElement;
    private countdownElement!: HTMLElement;
    private hud!: HTMLElement;
    private pauseMenu!: HTMLElement;
    private resumeButton!: HTMLElement;
    private thrusterParticles!: THREE.Points;
    private dynamicLight!: THREE.PointLight;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
        if (!this.canvas) throw new Error("Canvas not found");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.world.gravity.set(0, 0, 0);

        this.assignDomElements();
        this.setupInput();
        this.createScene().then(() => this.animate());
        window.addEventListener('resize', () => this.handleResize());
    }

    private assignDomElements(): void {
        this.ammoCounter = document.getElementById("ammoCounter") as HTMLElement;
        this.livesCounter = document.getElementById("healthCounter") as HTMLElement;
        this.scoreCounter = document.getElementById("scoreCounter") as HTMLElement || document.createElement("div");
        this.scoreCounter.id = "scoreCounter";
        this.countdownElement = document.getElementById("countdown") as HTMLElement;
        this.hud = document.getElementById("hud") as HTMLElement;
        this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
        this.resumeButton = document.getElementById("resumeButton") as HTMLElement;
        this.hud.appendChild(this.scoreCounter);
        this.hud.style.display = "flex";
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
                case 32: this.shoot(); break; // Spacebar
                case 67: 
                    this.cameraMode = (this.cameraMode + 1) % 3;
                    break;
                case 27: 
                    this.isPaused = !this.isPaused;
                    this.pauseMenu.style.display = this.isPaused ? "block" : "none";
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
    
        this.resumeButton.addEventListener("click", () => {
            this.isPaused = false;
            this.pauseMenu.style.display = "none";
        });
    }

    private async createScene(): Promise<void> {
        this.rng = seedrandom("pod_racing_seed");
    
        // Pod (Sphere) - unchanged
        const podGeometry = new THREE.SphereGeometry(2, 32, 32);
        const podMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2, emissive: 0x550000, emissiveIntensity: 1.5 });
        this.pod = new THREE.Mesh(podGeometry, podMaterial);
        this.pod.position.set(1500, 0, 0);
        this.scene.add(this.pod);
    
        this.podBody = new CANNON.Body({ mass: 1 });
        this.podBody.addShape(new CANNON.Sphere(2));
        this.podBody.position.copy(this.pod.position);
        this.world.addBody(this.podBody);
    
        // Smoother, Non-Overlapping Path - unchanged
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
    
        // Glowing Path Line - unchanged
        const pathPoints = this.trackPath.getPoints(512);
        const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, emissive: 0x00ffff, linewidth: 5, emissiveIntensity: 2 });
        this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
        this.scene.add(this.pathLine);
    
        // Obstacles (Random Asteroids with Texture - 1500 initially)
        const loader = new GLTFLoader();
        const asteroidPromise = loader.loadAsync('assets/asteroid.gltf');
        const textureLoaderAsteroid = new THREE.TextureLoader();
        const asteroidTexture = textureLoaderAsteroid.load('/assets/textures/asteroid.jpg');
        for (let i = 0; i < 1500; i++) {
            const t = this.rng();
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const offsetX = (this.rng() - 0.5) * 1000; // Wider spread for camera view
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
                    child.material = new THREE.MeshStandardMaterial({ map: asteroidTexture });
                }
            });
            this.scene.add(asteroid);
    
            const obstacleBody = new CANNON.Body({ mass: 0 });
            obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 2)));
            obstacleBody.position.copy(asteroid.position);
            this.world.addBody(obstacleBody);
            this.obstacles.push({ mesh: asteroid, body: obstacleBody });
        }
    
        // Ammo Pickups (300, using Crystal GLTF)
        const crystalPromise = loader.loadAsync('/assets/textures/crystal/crystal.gltf');
        for (let i = 0; i < 300; i++) {
            const crystalData = await crystalPromise;
            const crystal = crystalData.scene.clone();
            crystal.scale.set(0.5, 0.5, 0.5); // Adjust size as needed
            const t = i / 300;
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const offsetX = (this.rng() - 0.5) * 10;
            const offsetY = (this.rng() - 0.5) * 10;
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize();
            crystal.position.copy(basePos).addScaledVector(normal, offsetX).addScaledVector(binormal, offsetY);
            this.scene.add(crystal);
    
            const pickupBody = new CANNON.Body({ mass: 0 });
            pickupBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
            pickupBody.position.copy(crystal.position);
            this.world.addBody(pickupBody);
            this.ammoPickups.push({ mesh: crystal, body: pickupBody, ammoValue: 10 }); // Fixed value for simplicity
        }
    
        // Speed Boost Pickups (50) - unchanged
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
    
        // Stars in Space - unchanged
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
    
        // Planets with Textures (No Rings)
        const textureLoader = new THREE.TextureLoader();
        
        // Earth
        const earthGeometry = new THREE.SphereGeometry(1000, 32, 32);
        const earthMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/earth.jpg') });
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        earth.position.set(5000, 2000, 10000);
        this.scene.add(earth);
    
        // Moon (Orbiting Earth)
        const moonGeometry = new THREE.SphereGeometry(300, 32, 32);
        const moonMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/moon.jpg') });
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.position.set(earth.position.x + 2000, earth.position.y, earth.position.z);
        this.scene.add(moon);
    
        // Mars
        const marsGeometry = new THREE.SphereGeometry(800, 32, 32);
        const marsMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('/assets/textures/mars.jpg') });
        const mars = new THREE.Mesh(marsGeometry, marsMaterial);
        mars.position.set(-6000, -3000, 12000);
        this.scene.add(mars);
    
        this.scene.userData = { earth, moon };
    
        // Thruster Particles - unchanged
        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleMaterial = new THREE.PointsMaterial({ color: 0xff4500, size: 0.7, transparent: true, opacity: 1 });
        this.thrusterParticles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(this.thrusterParticles);
    
        // Explosion Particles (for asteroid hits)
        const explosionGeometry = new THREE.BufferGeometry();
        const explosionPositions = new Float32Array(200 * 3); // 200 particles
        explosionGeometry.setAttribute('position', new THREE.BufferAttribute(explosionPositions, 3));
        const explosionMaterial = new THREE.PointsMaterial({ color: 0xff4500, size: 1, transparent: true, opacity: 0.8 });
        this.scene.userData.explosionParticles = new THREE.Points(explosionGeometry, explosionMaterial);
        this.scene.add(this.scene.userData.explosionParticles);
    
        // Lighting - unchanged
        this.scene.add(new THREE.AmbientLight(0xaaaaaa, 3));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight.position.set(5000, 5000, 5000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        this.dynamicLight = new THREE.PointLight(0xffaa00, 4, 20000);
        this.scene.add(this.dynamicLight);
    
        // Progress Bar Setup (assumes HTML element exists)
        this.scene.userData.level = 1; // Track level
    } 

    private shoot(): void {
        if (this.ammo <= 0 || !this.raceStarted) return;
        this.ammo--;
        this.updateHUD();

        const bulletGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const bulletMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.position.copy(this.pod.position);
        this.scene.add(bullet);

        const direction = this.trackPath.getTangentAt(this.podDistance / this.trackPath.getLength());
        const bulletBody = new CANNON.Body({ mass: 1 });
        bulletBody.addShape(new CANNON.Sphere(0.5));
        bulletBody.position.copy(bullet.position);
        bulletBody.velocity.set(direction.x * 300, direction.y * 300, direction.z * 300); // Faster bullets
        this.world.addBody(bulletBody);
        this.bullets.push({ mesh: bullet, body: bulletBody });
    }

    private updateHUD(): void {
        this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
        this.livesCounter.textContent = `Lives: ${this.lives}`;
        this.scoreCounter.textContent = `Score: ${Math.floor(this.score)}`;
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());
        if (this.isPaused) return;
    
        this.world.step(1 / 60);
        const deltaTime = 1 / 60;
    
        // Countdown Logic - unchanged
        if (!this.raceStarted) {
            this.countdownTimer += deltaTime;
            const timeLeft = Math.max(0, this.countdown - this.countdownTimer);
            this.countdownElement.textContent = timeLeft > 0 ? `Race starts in ${Math.ceil(timeLeft)}...` : "Go!";
            if (timeLeft <= 0) {
                this.raceStarted = true;
                this.countdownElement.style.display = "none";
            }
            const startPos = this.trackPath.getPointAt(0);
            this.camera.position.copy(startPos);
            const startTangent = this.trackPath.getTangentAt(0).negate();
            this.camera.lookAt(startPos.clone().add(startTangent));
            this.renderer.render(this.scene, this.camera);
            return;
        }
    
        // Survival Time and Speed Increase - unchanged
        this.survivalTime += deltaTime;
        this.score += this.podSpeed * deltaTime;
        if (this.survivalTime % 10 < deltaTime) {
            this.podSpeed += 10;
            console.log(`Speed increased to ${this.podSpeed}`);
        }
    
        // Pod Movement with Smoothing - unchanged
        const trackLength = this.trackPath.getLength();
        this.podDistance += this.podSpeed * deltaTime;
        if (this.podDistance > trackLength) {
            // Level Complete
            this.scene.userData.level += 1;
            this.podSpeed *= 1.01; // 1% speed increase
            const newAsteroidCount = Math.floor(this.obstacles.length * 1.02); // 2% more asteroids
            this.podDistance = 0;
            this.survivalTime = 0;
            this.scene.remove(this.pathLine);
            this.obstacles.forEach(o => {
                this.scene.remove(o.mesh);
                this.world.removeBody(o.body);
            });
            this.ammoPickups.forEach(p => {
                this.scene.remove(p.mesh);
                this.world.removeBody(p.body);
            });
            this.speedBoosts.forEach(b => {
                this.scene.remove(b.mesh);
                this.world.removeBody(b.body);
            });
            this.obstacles = [];
            this.ammoPickups = [];
            this.speedBoosts = [];
            this.createScene().then(() => {
                const asteroidDiff = newAsteroidCount - 1500;
                const loader = new GLTFLoader();
                const textureLoader = new THREE.TextureLoader();
                const asteroidTexture = textureLoader.load('/assets/asteroid_texture.jpg');
                loader.loadAsync('assets/asteroid.gltf').then(asteroidData => {
                    for (let i = 0; i < asteroidDiff; i++) {
                        const t = this.rng();
                        const basePos = this.trackPath.getPointAt(t);
                        const tangent = this.trackPath.getTangentAt(t);
                        const offsetX = (this.rng() - 0.5) * 1000;
                        const offsetY = (this.rng() - 0.5) * 1000;
                        const offsetZ = (this.rng() - 0.5) * 1000;
                        const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
                        const binormal = tangent.clone().cross(normal).normalize();
    
                        const asteroid = asteroidData.scene.clone();
                        asteroid.scale.set(0.1 + this.rng() * 0.1, 0.1 + this.rng() * 0.1, 0.1 + this.rng() * 0.1);
                        asteroid.position.copy(basePos).addScaledVector(normal, offsetX).addScaledVector(binormal, offsetY).addScaledVector(tangent, offsetZ);
                        asteroid.traverse(child => {
                            if (child instanceof THREE.Mesh) child.material = new THREE.MeshStandardMaterial({ map: asteroidTexture });
                        });
                        this.scene.add(asteroid);
    
                        const obstacleBody = new CANNON.Body({ mass: 0 });
                        obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 2)));
                        obstacleBody.position.copy(asteroid.position);
                        this.world.addBody(obstacleBody);
                        this.obstacles.push({ mesh: asteroid, body: obstacleBody });
                    }
                });
            });
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
    
        // Camera Modes - unchanged
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
    
        // Rotate Asteroids (Slower) - unchanged
        this.obstacles.forEach(obstacle => {
            obstacle.mesh.rotation.x += 0.005 * (1 + this.podSpeed / 40);
            obstacle.mesh.rotation.y += 0.005 * (1 + this.podSpeed / 40);
            obstacle.mesh.rotation.z += 0.005 * (1 + this.podSpeed / 40);
            obstacle.body.position.copy(obstacle.mesh.position);
        });
    
        // Moon Orbit around Earth - unchanged
        const earth = this.scene.userData.earth as THREE.Mesh;
        const moon = this.scene.userData.moon as THREE.Mesh;
        const orbitRadius = 2000;
        const orbitSpeed = 0.5;
        const angle = this.survivalTime * orbitSpeed;
        moon.position.set(
            earth.position.x + Math.cos(angle) * orbitRadius,
            earth.position.y + Math.sin(angle) * orbitRadius * 0.2,
            earth.position.z + Math.sin(angle) * orbitRadius
        );
    
        // Bullet Collision and Movement
        this.bullets.forEach((bullet, bulletIndex) => {
            bullet.mesh.position.copy(bullet.body.position);
            this.obstacles.forEach((obstacle, obsIndex) => {
                if (bullet.mesh.position.distanceTo(obstacle.mesh.position) < 4) {
                    this.explodeAsteroid(obstacle.mesh.position);
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
    
        // Pickup Collision (Ammo) - unchanged
        this.ammoPickups.forEach((pickup, index) => {
            if (this.pod.position.distanceTo(pickup.mesh.position) < 2.5) {
                this.ammo += pickup.ammoValue;
                this.scene.remove(pickup.mesh);
                this.world.removeBody(pickup.body);
                this.ammoPickups.splice(index, 1);
            }
        });
    
        // Speed Boost Collision - unchanged
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
    
        // Thruster Particles - unchanged
        const particlePositions = this.thrusterParticles.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < particlePositions.length; i += 3) {
            particlePositions[i] = this.pod.position.x - tangent.x * 3 + (this.rng() - 0.5) * 2;
            particlePositions[i + 1] = this.pod.position.y - tangent.y * 3 + (this.rng() - 0.5) * 2;
            particlePositions[i + 2] = this.pod.position.z - tangent.z * 3 + (this.rng() - 0.5) * 2;
        }
        this.thrusterParticles.geometry.attributes.position.needsUpdate = true;
    
        // Dynamic Light - unchanged
        this.dynamicLight.position.copy(this.pod.position);
        this.dynamicLight.intensity = 4 + Math.sin(this.survivalTime * 2) * 2;
    
        // Progress Bar
        const progress = (this.podDistance / trackLength) * 100;
        const progressBar = document.getElementById("progressBar") as HTMLElement;
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `Level ${this.scene.userData.level} - ${Math.floor(progress)}%`;
        }
    
        this.updateHUD();
        this.renderer.render(this.scene, this.camera);
    }
    
    // New method for asteroid explosion
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
                positions[i] = position.x + (this.rng() - 0.5) * 100; // Spread out then fade
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