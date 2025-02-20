import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as CANNON from "cannon-es";

// Video setup for the display
const video = document.createElement("video");
video.src = "/assets/textures/screen_video.mp4";
video.loop = true;
video.muted = true;
video.play();

class App {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private world: CANNON.World;
    private canvas: HTMLCanvasElement;
    private hero: THREE.Mesh;
    private heroBody: CANNON.Body;
    private ammoPickups: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private thunderBoosts: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private bullets: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
    private buildings: { mesh: THREE.Object3D; body: CANNON.Body }[] = [];
    private ammo: number = 30;
    private moveForward: boolean = false;
    private moveBackward: boolean = false;
    private moveRight: boolean = false;
    private moveLeft: boolean = false;
    private jump: boolean = false;
    private isPaused: boolean = false;
    private ammoCounter: HTMLElement;
    private speedBoostCounter: HTMLElement;
    private pauseMenu: HTMLElement;
    private resumeButton: HTMLElement;
    private mouseX: number = 0;
    private mouseY: number = 0;
    private videoPlane: THREE.Mesh;
    private speedBoostActive: boolean = false;
    private normalSpeed: number = 20;
    private boostSpeed: number = 80;
    private boostDuration: number = 5000;
    private boostTimeout: NodeJS.Timeout | null = null;

    constructor() {
        const getCanvas = (): HTMLCanvasElement => {
            const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
            if (!canvas) throw new Error("Canvas element not found after DOM load");
            return canvas;
        };

        const initialize = () => {
            this.canvas = getCanvas();
            this.ammoCounter = document.getElementById("ammoCounter") as HTMLElement;
            this.speedBoostCounter = document.getElementById("speedBoostCounter") as HTMLElement;
            this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
            this.resumeButton = document.getElementById("resumeButton") as HTMLElement;

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
            this.renderer.setSize(window.innerWidth, window.innerHeight);

            this.world = new CANNON.World();
            this.world.gravity.set(0, -9.81, 0);

            this.createScene();
            this.setupInput();

            this.animate();
        };

        if (document.readyState === "complete" || document.readyState === "interactive") {
            initialize();
        } else {
            window.addEventListener("DOMContentLoaded", initialize);
        }
    }

    private async createScene(): Promise<void> {
        // Hero
        const heroGeometry = new THREE.BoxGeometry(2, 2, 2);
        const heroMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        this.hero = new THREE.Mesh(heroGeometry, heroMaterial);
        this.hero.position.set(0, 1.2, 0);
        this.scene.add(this.hero);
        this.heroBody = new CANNON.Body({ mass: 1 });
        this.heroBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 1)));
        this.heroBody.position.set(0, 1.2, 0);
        this.world.addBody(this.heroBody);

        // Ground with Texture
        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load('/assets/textures/ground.jpg');
        groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture });
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        this.scene.add(ground);
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(new CANNON.Plane());
        groundBody.position.set(0, -1, 0);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);

        // Streets and Sidewalks
        const streetWidth = 20;
        const sidewalkWidth = 5;
        const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const streetGeometryX = new THREE.PlaneGeometry(1000, streetWidth);
        const streetGeometryZ = new THREE.PlaneGeometry(streetWidth, 1000);
        const sidewalkGeometryX = new THREE.PlaneGeometry(1000, sidewalkWidth);
        const sidewalkGeometryZ = new THREE.PlaneGeometry(sidewalkWidth, 1000);

        for (let x = -450; x <= 450; x += 90) {
            const streetX = new THREE.Mesh(streetGeometryX, streetMaterial);
            streetX.rotation.x = -Math.PI / 2;
            streetX.position.set(x, -0.95, 0);
            this.scene.add(streetX);

            const sidewalkX1 = new THREE.Mesh(sidewalkGeometryX, sidewalkMaterial);
            sidewalkX1.rotation.x = -Math.PI / 2;
            sidewalkX1.position.set(x - streetWidth / 2 - sidewalkWidth / 2, -0.9, 0);
            this.scene.add(sidewalkX1);

            const sidewalkX2 = new THREE.Mesh(sidewalkGeometryX, sidewalkMaterial);
            sidewalkX2.rotation.x = -Math.PI / 2;
            sidewalkX2.position.set(x + streetWidth / 2 + sidewalkWidth / 2, -0.9, 0);
            this.scene.add(sidewalkX2);
        }

        for (let z = -450; z <= 450; z += 90) {
            const streetZ = new THREE.Mesh(streetGeometryZ, streetMaterial);
            streetZ.rotation.x = -Math.PI / 2;
            streetZ.position.set(0, -0.95, z);
            this.scene.add(streetZ);

            const sidewalkZ1 = new THREE.Mesh(sidewalkGeometryZ, sidewalkMaterial);
            sidewalkZ1.rotation.x = -Math.PI / 2;
            sidewalkZ1.position.set(0, -0.9, z - streetWidth / 2 - sidewalkWidth / 2);
            this.scene.add(sidewalkZ1);

            const sidewalkZ2 = new THREE.Mesh(sidewalkGeometryZ, sidewalkMaterial);
            sidewalkZ2.rotation.x = -Math.PI / 2;
            sidewalkZ2.position.set(0, -0.9, z + streetWidth / 2 + sidewalkWidth / 2);
            this.scene.add(sidewalkZ2);
        }

        // Night Sky with Stars
        const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x001133, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 2000;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 2000;
            positions[i * 3 + 1] = Math.random() * 1000;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: true });
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);

        // Adjusted Lighting
        const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
        this.scene.add(ambientLight);
        const light1 = new THREE.DirectionalLight(0x8080ff, 0.5);
        light1.position.set(100, 100, 100);
        light1.castShadow = true;
        this.scene.add(light1);
        const light2 = new THREE.DirectionalLight(0x8080ff, 0.3);
        light2.position.set(-100, 80, -100);
        this.scene.add(light2);
        const light3 = new THREE.DirectionalLight(0x8080ff, 0.3);
        light3.position.set(0, 90, -150);
        this.scene.add(light3);

        // Load Models (Buildings and Cars)
        const gltfLoader = new GLTFLoader();
        const loadModel = (path: string, position: THREE.Vector3, scale: number, rotationY = 0): Promise<THREE.Group> => {
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

        // Building Types
        const skyscrapers = ["skyscraperA.glb", "skyscraperB.glb", "skyscraperC.glb", "skyscraperD.glb", "skyscraperE.glb", "skyscraperF.glb"];
        const largeBuildings = ["large_buildingA.glb", "large_buildingB.glb", "large_buildingC.glb", "large_buildingD.glb", "large_buildingE.glb", "large_buildingF.glb", "large_buildingG.glb"];
        const lowBuildings = ["low_buildingA.glb", "low_buildingB.glb", "low_buildingC.glb", "low_buildingD.glb", "low_buildingE.glb", "low_buildingF.glb", "low_buildingG.glb", "low_buildingH.glb", "low_buildingI.glb", "low_buildingJ.glb", "low_buildingK.glb", "low_buildingL.glb", "low_buildingM.glb", "low_buildingN.glb", "low_wideA.glb", "low_wideB.glb"];
        const smallBuildings = ["small_buildingA.glb", "small_buildingB.glb", "small_buildingC.glb", "small_buildingD.glb", "small_buildingE.glb", "small_buildingF.glb"];
        const details = ["detail_awning.glb", "detail_awningWide.glb", "detail_overhang.glb", "detail_overhangWide.glb", "detail_umbrella.glb", "detail_umbrellaDetailed.glb"];
        const cars = [
            "ambulance.glb", "box.glb", "cone-flat.glb", "cone.glb", "delivery-flat.glb", "delivery.glb",
            "firetruck.glb", "garbage-truck.glb", "hatchback-sports.glb", "police.glb", "race-future.glb",
            "race.glb", "sedan-sports.glb", "sedan.glb", "suv-luxury.glb", "suv.glb", "taxi.glb",
            "tractor-police.glb", "tractor-shovel.glb", "tractor.glb", "truck-flat.glb", "truck.glb", "van.glb"
        ];

        // Downtown: Dense skyscrapers with video screen
        const downtownCenter = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < 15; i++) {
            const model = skyscrapers[Math.floor(Math.random() * skyscrapers.length)];
            const angle = (i / 15) * Math.PI * 2;
            const radius = 50 + Math.random() * 30;
            const x = Math.round((downtownCenter.x + Math.cos(angle) * radius) / 90) * 90 + (streetWidth + sidewalkWidth);
            const z = Math.round((downtownCenter.z + Math.sin(angle) * radius) / 90) * 90 + (streetWidth + sidewalkWidth);
            const rotationY = Math.random() * Math.PI * 2;
            const skyscraper = await loadModel(`/assets/models/${model}`, new THREE.Vector3(x, 0, z), 50, rotationY);

            if (i === 0) {
                const videoTexture = new THREE.VideoTexture(video);
                videoTexture.minFilter = THREE.LinearFilter;
                videoTexture.magFilter = THREE.LinearFilter;
                const screenMaterial = new THREE.MeshBasicMaterial({ map: videoTexture });
                const screenGeometry = new THREE.PlaneGeometry(20, 10);
                const screen = new THREE.Mesh(screenGeometry, screenMaterial);
                screen.position.set(x, 25, z + 10);
                screen.rotation.y = rotationY;
                this.scene.add(screen);
            }
        }

        // Mid-rise: Mixed large and low buildings along streets
        for (let x = -450; x <= 450; x += 90) {
            for (let z = -450; z <= 450; z += 90) {
                if (Math.abs(x - downtownCenter.x) > 100 || Math.abs(z - downtownCenter.z) > 100) {
                    const type = Math.random() > 0.5 ? largeBuildings : lowBuildings;
                    const model = type[Math.floor(Math.random() * type.length)];
                    const offsetX = streetWidth / 2 + sidewalkWidth + 5;
                    const offsetZ = streetWidth / 2 + sidewalkWidth + 5;
                    const rotationY = Math.round(Math.random() * 4) * (Math.PI / 2);
                    await loadModel(`/assets/models/${model}`, new THREE.Vector3(x + offsetX, 0, z + offsetZ), 25, rotationY);
                }
            }
        }

        // Suburbs: Small buildings and details
        for (let i = 0; i < 30; i++) {
            const model = smallBuildings[Math.floor(Math.random() * smallBuildings.length)];
            const x = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth + sidewalkWidth);
            const z = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth + sidewalkWidth);
            if (Math.abs(x) > 300 || Math.abs(z) > 300) {
                const rotationY = Math.random() * Math.PI * 2;
                await loadModel(`/assets/models/${model}`, new THREE.Vector3(x, 0, z), 15, rotationY);
            }
        }
        for (let i = 0; i < 50; i++) {
            const model = details[Math.floor(Math.random() * details.length)];
            const x = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            const z = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            const rotationY = Math.random() * Math.PI * 2;
            await loadModel(`/assets/models/${model}`, new THREE.Vector3(x, 0, z), 5, rotationY);
        }

        // Trees
        const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        for (let i = 0; i < 50; i++) {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5), treeMaterial);
            const foliage = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 16), treeMaterial);
            const x = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            const z = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            trunk.position.set(x, 1.5, z);
            foliage.position.copy(trunk.position);
            foliage.position.y += 4;
            this.scene.add(trunk, foliage);
        }

        // Streetlights (max 10)
        const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        const lightPositions = [];
        for (let i = 0; i < 10; i++) {
            const x = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            const z = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            lightPositions.push({ x, z });
        }
        lightPositions.forEach(({ x, z }) => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10), lightMaterial);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffff99, emissive: 0xffff99 }));
            pole.position.set(x, 4, z);
            lamp.position.copy(pole.position);
            lamp.position.y += 5;
            this.scene.add(pole, lamp);
            const pointLight = new THREE.PointLight(0xffff99, 1, 50);
            pointLight.position.copy(lamp.position);
            this.scene.add(pointLight);
        });

        // Vehicles
        for (let i = 0; i < 20; i++) {
            const carModel = cars[Math.floor(Math.random() * cars.length)];
            const x = Math.round((Math.random() * 900 - 450) / 90) * 90;
            const z = Math.round((Math.random() * 900 - 450) / 90) * 90;
            const rotationY = Math.round(Math.random() * 4) * (Math.PI / 2);
            await loadModel(`/assets/cars/${carModel}`, new THREE.Vector3(x, 0, z), 1, rotationY)
                .then((car) => {
                    car.position.y = 0;
                });
        }

        // Video Plane
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        const screenMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
        const screenGeometry = new THREE.PlaneGeometry(200, 100);
        this.videoPlane = new THREE.Mesh(screenGeometry, screenMaterial);
        this.videoPlane.position.set(200, 25, 10);
        this.scene.add(this.videoPlane);

        // Ammo Pickups
        const ammoMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
        for (let i = 0; i < 80; i++) { // Adjust this number to control ammo pickup count
            const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ammoMaterial);
            const x = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            const z = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            ammoBox.position.set(x, 0.5, z);
            this.scene.add(ammoBox);
            const ammoBody = new CANNON.Body({ mass: 0 });
            ammoBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
            ammoBody.position.copy(ammoBox.position);
            this.world.addBody(ammoBody);
            this.ammoPickups.push({ mesh: ammoBox, body: ammoBody });
        }

        // Multiple Thunder Speed Boosts
        const thunderGeometry = new THREE.ConeGeometry(0.5, 2, 8);
        const thunderMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.5 
        });
        for (let i = 0; i < 40; i++) { // Adjust this number to control thunder boost count
            const thunder = new THREE.Mesh(thunderGeometry, thunderMaterial);
            const x = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            const z = Math.round((Math.random() * 900 - 450) / 90) * 90 + (streetWidth / 2 + sidewalkWidth / 2);
            thunder.position.set(x, 1, z);
            this.scene.add(thunder);

            const thunderBody = new CANNON.Body({ mass: 0 });
            thunderBody.addShape(new CANNON.Cylinder(0.5, 0.5, 2, 8));
            thunderBody.position.copy(thunder.position);
            this.world.addBody(thunderBody);
            this.thunderBoosts.push({ mesh: thunder, body: thunderBody });
        }

        // Borders
        const borderMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const borders = [
            { size: [5, 100, 1000], pos: [-500, 50, 0] },
            { size: [5, 100, 1000], pos: [500, 50, 0] },
            { size: [1000, 100, 5], pos: [0, 50, 500] },
            { size: [1000, 100, 5], pos: [0, 50, -500] },
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

        this.camera.position.set(0, 2, -25);
    }

    private setupInput(): void {
        this.canvas.addEventListener("click", () => {
            if (!this.isPaused) this.canvas.requestPointerLock();
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
                    if (!this.isPaused) {
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
            if (this.isPaused || !document.pointerLockElement) return;
            if (this.ammo > 0) {
                this.ammo--;
                this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
    
                const bulletGeometry = new THREE.SphereGeometry(0.3, 16, 16);
                const bulletMaterial = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    emissive: 0xffff00,
                    emissiveIntensity: 1
                });
                const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
                bullet.position.copy(this.camera.position);
                this.scene.add(bullet);
  
                const bulletBody = new CANNON.Body({ mass: 1 });
                bulletBody.addShape(new CANNON.Sphere(0.1));
                bulletBody.position.copy(this.camera.position);
                const direction = this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(100);
                bulletBody.velocity.set(direction.x, direction.y, direction.z);
                this.world.addBody(bulletBody);
                this.bullets.push({ mesh: bullet, body: bulletBody });
    
                setTimeout(() => {
                    const index = this.bullets.findIndex(b => b.mesh === bullet);
                    if (index !== -1) {
                        this.scene.remove(this.bullets[index].mesh);
                        this.world.removeBody(this.bullets[index].body);
                        this.bullets.splice(index, 1);
                    }
                }, 2000);
            }
        });
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());

        if (!this.isPaused) {
            this.world.step(1 / 60);

            this.hero.position.copy(this.heroBody.position);
            this.hero.quaternion.copy(this.heroBody.quaternion);

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
                velocity.y = 7;
                this.jump = false;
            }
            this.heroBody.velocity.set(forward.x * fSpeed + right.x * sSpeed, velocity.y, forward.z * fSpeed + right.z * sSpeed);

            const cameraPosition = this.hero.position.clone().add(new THREE.Vector3(0, 1, 0));
            this.camera.position.copy(cameraPosition);
            this.camera.rotation.order = "YXZ";
            this.camera.rotation.set(this.mouseY, this.mouseX, 0);

            this.bullets.forEach(bullet => {
                bullet.mesh.position.copy(bullet.body.position);
                bullet.mesh.quaternion.copy(bullet.body.quaternion);
            });

            // Ammo pickup with increased proximity
            this.ammoPickups.forEach((pickup, index) => {
                const distance = this.hero.position.distanceTo(pickup.mesh.position);
                if (distance < 3) { // Increased from 1.5 to 3
                    this.ammo += 10; // Adds 10 ammo to the count
                    this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
                    this.scene.remove(pickup.mesh);
                    this.world.removeBody(pickup.body);
                    this.ammoPickups.splice(index, 1);
                }
            });

            // Thunder boost pickup with increased proximity
            this.thunderBoosts.forEach((boost, index) => {
                const distance = this.hero.position.distanceTo(boost.mesh.position);
                if (distance < 3) { // Increased from 1.5 to 3
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

            this.renderer.render(this.scene, this.camera);
        }
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new App();
});