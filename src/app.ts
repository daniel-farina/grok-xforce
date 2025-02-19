import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as CANNON from "cannon-es";

class App {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private world: CANNON.World;
    private canvas: HTMLCanvasElement;
    private hero: THREE.Mesh;
    private heroBody: CANNON.Body;
    private ammoPickups: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
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
    private pauseMenu: HTMLElement;
    private resumeButton: HTMLElement;
    private mouseX: number = 0;
    private mouseY: number = 0;

    constructor() {
        const getCanvas = (): HTMLCanvasElement => {
            const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
            if (!canvas) throw new Error("Canvas element not found after DOM load");
            return canvas;
        };

        const initialize = () => {
            this.canvas = getCanvas();
            this.ammoCounter = document.getElementById("ammoCounter") as HTMLElement;
            this.pauseMenu = document.getElementById("pauseMenu") as HTMLElement;
            this.resumeButton = document.getElementById("resumeButton") as HTMLElement;

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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

        // Ground (Half size)
        const groundGeometry = new THREE.PlaneGeometry(500, 500);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        this.scene.add(ground);
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(new CANNON.Plane());
        groundBody.position.set(0, -1, 0);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(100, 100, 100);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Load City Models
        const gltfLoader = new GLTFLoader();
        const loadModel = (path: string, position: THREE.Vector3, scale: number): Promise<THREE.Group> => {
            return new Promise((resolve) => {
                gltfLoader.load(`/assets/models/${path}`, (gltf) => {
                    const model = gltf.scene;
                    model.scale.set(scale, scale, scale);
                    const bbox = new THREE.Box3().setFromObject(model);
                    const minY = bbox.min.y; // Ground contact point
                    model.position.copy(position);
                    model.position.y = -minY * scale - 1; // Align base to ground
                    this.scene.add(model);

                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const body = new CANNON.Body({ mass: 0 });
                    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x * scale / 2, size.y * scale / 2, size.z * scale / 2)));
                    body.position.set(model.position.x, model.position.y + size.y * scale / 2, model.position.z);
                    this.world.addBody(body);
                    this.buildings.push({ mesh: model, body });

                    resolve(model);
                });
            });
        };

        // Building Types with Scales
        const skyscrapers = [
            "skyscraperA.glb", "skyscraperB.glb", "skyscraperC.glb",
            "skyscraperD.glb", "skyscraperE.glb", "skyscraperF.glb"
        ];
        const largeBuildings = [
            "large_buildingA.glb", "large_buildingB.glb", "large_buildingC.glb",
            "large_buildingD.glb", "large_buildingE.glb", "large_buildingF.glb",
            "large_buildingG.glb"
        ];
        const lowBuildings = [
            "low_buildingA.glb", "low_buildingB.glb", "low_buildingC.glb",
            "low_buildingD.glb", "low_buildingE.glb", "low_buildingF.glb",
            "low_buildingG.glb", "low_buildingH.glb", "low_buildingI.glb",
            "low_buildingJ.glb", "low_buildingK.glb", "low_buildingL.glb",
            "low_buildingM.glb", "low_buildingN.glb", "low_wideA.glb", "low_wideB.glb"
        ];
        const smallBuildings = [
            "small_buildingA.glb", "small_buildingB.glb", "small_buildingC.glb",
            "small_buildingD.glb", "small_buildingE.glb", "small_buildingF.glb"
        ];
        const details = [
            "detail_awning.glb", "detail_awningWide.glb", "detail_overhang.glb",
            "detail_overhangWide.glb", "detail_umbrella.glb", "detail_umbrellaDetailed.glb"
        ];

        // Downtown: Skyscrapers (5 units, tighter cluster)
        for (let i = 0; i < 5; i++) {
            const model = skyscrapers[Math.floor(Math.random() * skyscrapers.length)];
            const x = (i % 3 - 1) * 50 + (Math.random() * 20 - 10);
            const z = Math.floor(i / 3 - 1) * 50 + (Math.random() * 20 - 10);
            await loadModel(model, new THREE.Vector3(x, 0, z), 50);
        }

        // Mid-rise: Large and Low Buildings (smaller grid)
        for (let x = -150; x <= 150; x += 50) {
            for (let z = -150; z <= 150; z += 50) {
                if (Math.abs(x) > 50 || Math.abs(z) > 50) {
                    const type = Math.random() > 0.5 ? largeBuildings : lowBuildings;
                    const model = type[Math.floor(Math.random() * type.length)];
                    await loadModel(model, new THREE.Vector3(x, 0, z), 25);
                }
            }
        }

        // Suburbs: Small Buildings and Details (fewer scattered)
        for (let i = 0; i < 10; i++) {
            const model = smallBuildings[Math.floor(Math.random() * smallBuildings.length)];
            const x = Math.random() * 400 - 200;
            const z = Math.random() * 400 - 200;
            if (Math.abs(x) > 150 || Math.abs(z) > 150) {
                await loadModel(model, new THREE.Vector3(x, 0, z), 15);
            }
        }
        for (let i = 0; i < 15; i++) {
            const model = details[Math.floor(Math.random() * details.length)];
            const x = Math.random() * 400 - 200;
            const z = Math.random() * 400 - 200;
            await loadModel(model, new THREE.Vector3(x, 0, z), 5);
        }

        // Ammo Pickups
        const ammoMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
        for (let i = 0; i < 5; i++) {
            const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ammoMaterial);
            ammoBox.position.set(Math.random() * 400 - 200, 0.5, Math.random() * 400 - 200);
            this.scene.add(ammoBox);
            const ammoBody = new CANNON.Body({ mass: 0 });
            ammoBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
            ammoBody.position.copy(ammoBox.position);
            this.world.addBody(ammoBody);
            this.ammoPickups.push({ mesh: ammoBox, body: ammoBody });
        }

        // Borders (Half size)
        const borderMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const borders = [
            { size: [5, 100, 500], pos: [-250, 50, 0] },
            { size: [5, 100, 500], pos: [250, 50, 0] },
            { size: [500, 100, 5], pos: [0, 50, 250] },
            { size: [500, 100, 5], pos: [0, 50, -250] },
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

                const bulletGeometry = new THREE.SphereGeometry(0.1, 16, 16);
                const bulletMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
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

            const SPEED = 20;
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

            this.ammoPickups.forEach((pickup, index) => {
                const distance = this.hero.position.distanceTo(pickup.mesh.position);
                if (distance < 1.5) {
                    this.ammo += 10;
                    this.ammoCounter.textContent = `Ammo: ${this.ammo}`;
                    this.scene.remove(pickup.mesh);
                    this.world.removeBody(pickup.body);
                    this.ammoPickups.splice(index, 1);
                }
            });

            this.renderer.render(this.scene, this.camera);
        }
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new App();
});