import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const seedrandom = require('seedrandom');

class PodRacingGame {
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    private renderer!: THREE.WebGLRenderer;
    private world: CANNON.World = new CANNON.World();
    private canvas!: HTMLCanvasElement;
    private pod!: THREE.Mesh;
    private podBody!: CANNON.Body;
    private obstacles: { mesh: THREE.Group; body: CANNON.Body }[] = [];
    private ammoPickups: { mesh: THREE.Mesh; body: CANNON.Body; ammoValue: number }[] = [];
    private bullets: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private track!: THREE.Mesh;
    private trackPath!: THREE.CatmullRomCurve3;
    private rng: () => number = Math.random;
    private ammo: number = 20;
    private lives: number = 10;
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    private isPaused: boolean = false;
    private raceStarted: boolean = false;
    private countdown: number = 3;
    private countdownTimer: number = 0;
    private podSpeed: number = 40;
    private podDistance: number = 0;
    private podOffset: number = 0;
    private tubeRadius: number = 20;
    private cameraMode: number = 0;
    private ammoCounter!: HTMLElement;
    private livesCounter!: HTMLElement;
    private countdownElement!: HTMLElement;
    private hud!: HTMLElement;
    private pauseMenu!: HTMLElement;
    private resumeButton!: HTMLElement;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
        if (!this.canvas) throw new Error("Canvas not found");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
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
        this.countdownElement = document.getElementById("countdown") as HTMLElement;
        this.hud = document.getElementById("hud") as HTMLElement;
        this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
        this.resumeButton = document.getElementById("resumeButton") as HTMLElement;
        this.hud.style.display = "flex";
    }

    private setupInput(): void {
        document.addEventListener("keydown", (event) => {
            if (this.isPaused) return;
            switch (event.keyCode) {
                case 65: this.moveRight = true; break; // A (right)
                case 68: this.moveLeft = true; break; // D (left)
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
        const podMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2 });
        this.pod = new THREE.Mesh(podGeometry, podMaterial);
        this.pod.position.set(300, 2, 0); // Slightly above the plane
        this.scene.add(this.pod);

        this.podBody = new CANNON.Body({ mass: 1 });
        this.podBody.addShape(new CANNON.Sphere(2));
        this.podBody.position.copy(this.pod.position);
        this.world.addBody(this.podBody);

        // Longer, Flat Curved Plane Track with Concrete Texture
        const points = [
            new THREE.Vector3(300, 0, 0),
            new THREE.Vector3(250, 50*this.rng(), 100*this.rng()),
            new THREE.Vector3(150, 75*this.rng(), 200),
            new THREE.Vector3(0, 100*this.rng(), 300),
            new THREE.Vector3(-150, 50*this.rng(), 200*this.rng()),
            new THREE.Vector3(-250, -25*this.rng(), 100),
            new THREE.Vector3(-300, -50*this.rng(), 0),
            new THREE.Vector3(-250, -75*this.rng(), -100*this.rng()),
            new THREE.Vector3(-150, -100*this.rng(), -200),
            new THREE.Vector3(0, -50*this.rng(), -300),
            new THREE.Vector3(150, 25*this.rng(), -200*this.rng()),
            new THREE.Vector3(250, 50*this.rng(), -100),
            new THREE.Vector3(300, 0, 0)
        ];
        this.trackPath = new THREE.CatmullRomCurve3(points, true);

        // Create a flat plane and bend it along the path
        const trackGeometry = new THREE.PlaneGeometry(this.tubeRadius * 2, 100, 16, 64); // Width x Length, segments
        const positionAttribute = trackGeometry.attributes.position;
        for (let i = 0; i < positionAttribute.count; i++) {
            const t = i / (positionAttribute.count - 1); // Normalize along length
            const point = this.trackPath.getPointAt(t % 1);
            const tangent = this.trackPath.getTangentAt(t % 1);
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize(); // Now defined here
            const x = positionAttribute.getX(i); // Width offset
            const pos = point.clone().addScaledVector(binormal, x); // Use binormal for width
            positionAttribute.setXYZ(i, pos.x, pos.y, pos.z);
        }
        trackGeometry.computeVertexNormals();

        const textureLoader = new THREE.TextureLoader();
        const tubeTexture = textureLoader.load('/assets/textures/concrete.jpg');
        tubeTexture.wrapS = tubeTexture.wrapT = THREE.RepeatWrapping;
        tubeTexture.repeat.set(20, 2);
        const trackMaterial = new THREE.MeshStandardMaterial({ 
            map: tubeTexture,
            metalness: 0.9, 
            roughness: 0.1, 
            side: THREE.DoubleSide 
        });
        this.track = new THREE.Mesh(trackGeometry, trackMaterial);
        this.scene.add(this.track);

        const trackBody = new CANNON.Body({ mass: 0 });
        const segments = 64;
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const point = this.trackPath.getPointAt(t);
            trackBody.addShape(new CANNON.Box(new CANNON.Vec3(this.tubeRadius, 0.5, this.tubeRadius)), new CANNON.Vec3(point.x, point.y, point.z));
        }
        this.world.addBody(trackBody);

        // Obstacles (Rotating Asteroids)
        const loader = new GLTFLoader();
        const asteroidPromise = loader.loadAsync('assets/asteroid.gltf');
        for (let i = 0; i < 5; i++) {
            const t = this.rng();
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const offset = (this.rng() - 0.5) * (this.tubeRadius - 3);
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize(); // Define binormal here

            const asteroidData = await asteroidPromise;
            const asteroid = asteroidData.scene.clone();
            asteroid.scale.set(0.05, 0.05, 0.05);
            asteroid.position.copy(basePos).addScaledVector(binormal, offset).addScaledVector(normal, 2); // Above plane
            this.scene.add(asteroid);

            const obstacleBody = new CANNON.Body({ mass: 0 });
            obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 1)));
            obstacleBody.position.copy(asteroid.position);
            this.world.addBody(obstacleBody);
            this.obstacles.push({ mesh: asteroid, body: obstacleBody });
        }

        // Ammo Pickups
        const pickupTypes = [
            { geometry: new THREE.BoxGeometry(1, 1, 1), color: 0xffff00, ammoValue: 5 },
            { geometry: new THREE.SphereGeometry(0.75, 16, 16), color: 0x00ff00, ammoValue: 10 },
            { geometry: new THREE.ConeGeometry(0.5, 1.5, 8), color: 0x0000ff, ammoValue: 15 }
        ];
        for (let i = 0; i < 3; i++) {
            const type = pickupTypes[Math.floor(this.rng() * pickupTypes.length)];
            const pickup = new THREE.Mesh(type.geometry, new THREE.MeshStandardMaterial({ color: type.color }));
            const t = this.rng();
            const basePos = this.trackPath.getPointAt(t);
            const tangent = this.trackPath.getTangentAt(t);
            const offset = (this.rng() - 0.5) * (this.tubeRadius - 3);
            const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
            const binormal = tangent.clone().cross(normal).normalize(); // Define binormal here
            pickup.position.copy(basePos).addScaledVector(binormal, offset).addScaledVector(normal, 2);
            this.scene.add(pickup);

            const pickupBody = new CANNON.Body({ mass: 0 });
            pickupBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
            pickupBody.position.copy(pickup.position);
            this.world.addBody(pickupBody);
            this.ammoPickups.push({ mesh: pickup, body: pickupBody, ammoValue: type.ammoValue });
        }

        // Stars in Space
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 5000;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 4000;
            positions[i + 1] = (Math.random() - 0.5) * 4000;
            positions[i + 2] = (Math.random() - 0.5) * 4000;
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 3 });
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);

        // Lighting (brighter with ambient light)
        this.scene.add(new THREE.AmbientLight(0xaaaaaa, 2.5));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);
    }

    private shoot(): void {
        if (this.ammo <= 0 || !this.raceStarted) return;
        this.ammo--;
        this.ammoCounter.textContent = `Ammo: ${this.ammo}`;

        const bulletGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const bulletMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.position.copy(this.pod.position);
        this.scene.add(bullet);

        const direction = this.trackPath.getTangentAt(this.podDistance / this.trackPath.getLength());
        const bulletBody = new CANNON.Body({ mass: 1 });
        bulletBody.addShape(new CANNON.Sphere(0.5));
        bulletBody.position.copy(bullet.position);
        bulletBody.velocity.set(direction.x * 200, direction.y * 200, direction.z * 200);
        this.world.addBody(bulletBody);
        this.bullets.push({ mesh: bullet, body: bulletBody });

        setTimeout(() => {
            const index = this.bullets.findIndex(b => b.mesh === bullet);
            if (index !== -1) {
                this.scene.remove(this.bullets[index].mesh);
                this.world.removeBody(this.bullets[index].body);
                this.bullets.splice(index, 1);
            }
        }, 5000);
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());
        if (this.isPaused) return;

        this.world.step(1 / 60);

        // Countdown Logic
        if (!this.raceStarted) {
            this.countdownTimer += 1 / 60;
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

        // Pod Movement
        const trackLength = this.trackPath.getLength();
        this.podDistance += this.podSpeed * (1 / 60);
        if (this.podDistance > trackLength) this.podDistance -= trackLength;

        const t = this.podDistance / trackLength;
        const basePos = this.trackPath.getPointAt(t);
        const tangent = this.trackPath.getTangentAt(t);
        const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        const binormal = tangent.clone().cross(normal).normalize();

        const maxOffset = (this.tubeRadius - 2) / 2;
        if (this.moveLeft) this.podOffset -= 1;
        if (this.moveRight) this.podOffset += 1;
        this.podOffset = Math.max(-maxOffset, Math.min(maxOffset, this.podOffset));
        this.podOffset *= 0.9;

        const podOffsetVec = binormal.clone().multiplyScalar(this.podOffset);
        const podPos = basePos.clone().add(podOffsetVec).addScaledVector(normal, 2); // Above plane
        this.podBody.position.copy(podPos);
        this.pod.position.copy(this.podBody.position);
        this.pod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

        // Camera Modes
        switch (this.cameraMode) {
            case 0: // First-Person View
                this.camera.position.copy(this.pod.position);
                this.camera.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
                this.camera.rotateX(-Math.PI / 6); // Slight downward tilt
                break;
            case 1: // Close Chase View
                this.camera.position.copy(this.pod.position).addScaledVector(tangent.negate(), 10).addScaledVector(normal, 5);
                this.camera.lookAt(this.pod.position);
                break;
            case 2: // Far Map View
                this.camera.position.set(0, 500, 0);
                this.camera.lookAt(new THREE.Vector3(0, 0, 0));
                break;
        }

        // Rotate Asteroids
        this.obstacles.forEach(obstacle => {
            obstacle.mesh.rotation.x += 0.01;
            obstacle.mesh.rotation.y += 0.01;
            obstacle.mesh.rotation.z += 0.01;
        });

        // Bullet Collision
        this.bullets.forEach((bullet, bulletIndex) => {
            bullet.mesh.position.copy(bullet.body.position);
            this.obstacles.forEach((obstacle, obsIndex) => {
                if (bullet.mesh.position.distanceTo(obstacle.mesh.position) < 2) {
                    this.scene.remove(obstacle.mesh);
                    this.world.removeBody(obstacle.body);
                    this.obstacles.splice(obsIndex, 1);
                    this.scene.remove(bullet.mesh);
                    this.world.removeBody(bullet.body);
                    this.bullets.splice(bulletIndex, 1);
                }
            });
        });

        // Pickup Collision
        this.ammoPickups.forEach((pickup, index) => {
            if (this.pod.position.distanceTo(pickup.mesh.position) < 2) {
                this.ammo += pickup.ammoValue;
                this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
                this.scene.remove(pickup.mesh);
                this.world.removeBody(pickup.body);
                this.ammoPickups.splice(index, 1);
            }
        });

        // Obstacle Collision (Asteroids)
        this.obstacles.forEach((obstacle) => {
            if (this.pod.position.distanceTo(obstacle.mesh.position) < 3) {
                this.lives -= 1;
                this.livesCounter.textContent = `Lives: ${this.lives}`;
                if (this.lives <= 0) {
                    this.isPaused = true;
                    this.pauseMenu.style.display = "block";
                    alert("Game Over!");
                }
            }
        });

        this.renderer.render(this.scene, this.camera);
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