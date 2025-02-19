import * as THREE from "three";
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
    private mouseX: number = 0; // Track horizontal mouse movement
    private mouseY: number = 0; // Track vertical mouse movement

    constructor() {
        const getCanvas = (): HTMLCanvasElement => {
            const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
            if (!canvas) {
                throw new Error("Canvas element not found after DOM load");
            }
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

    private createScene(): void {
        const heroGeometry = new THREE.BoxGeometry(2, 2, 2);
        const heroMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.hero = new THREE.Mesh(heroGeometry, heroMaterial);
        this.hero.position.set(0, 1.2, 0);
        this.scene.add(this.hero);
        this.heroBody = new CANNON.Body({ mass: 1 });
        this.heroBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 1)));
        this.heroBody.position.set(0, 1.2, 0);
        this.world.addBody(this.heroBody);

        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        this.scene.add(ground);
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(new CANNON.Plane());
        groundBody.position.set(0, -1, 0);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);

        const light1 = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        light1.position.set(0, 10, 0);
        this.scene.add(light1);
        const light2 = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        light2.position.set(60, 60, 0);
        this.scene.add(light2);

        const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0xb0b0b0 });
        const mainBuilding = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), buildingMaterial);
        mainBuilding.position.set(20, 10, 20);
        this.scene.add(mainBuilding);
        const mainBuildingBody = new CANNON.Body({ mass: 0 });
        mainBuildingBody.addShape(new CANNON.Box(new CANNON.Vec3(15, 10, 15)));
        mainBuildingBody.position.set(20, 10, 20);
        this.world.addBody(mainBuildingBody);

        for (let i = 0; i < 10; i++) {
            const stair = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 2), buildingMaterial);
            stair.position.set(5, i * 1 + 0.5, 20 + i * 2);
            this.scene.add(stair);
            const stairBody = new CANNON.Body({ mass: 0 });
            stairBody.addShape(new CANNON.Box(new CANNON.Vec3(2.5, 0.5, 1)));
            stairBody.position.set(5, i * 1 + 0.5, 20 + i * 2);
            this.world.addBody(stairBody);
        }

        for (let i = 0; i < 4; i++) {
            const height = Math.random() * 20 + 10;
            const width = Math.random() * 20 + 10;
            const depth = Math.random() * 20 + 10;
            const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), buildingMaterial);
            building.position.set(Math.random() * 180 - 90, height / 2, Math.random() * 180 - 90);
            this.scene.add(building);
            const buildingBody = new CANNON.Body({ mass: 0 });
            buildingBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
            buildingBody.position.copy(building.position);
            this.world.addBody(buildingBody);
        }

        const ammoMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        for (let i = 0; i < 5; i++) {
            const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ammoMaterial);
            ammoBox.position.set(Math.random() * 180 - 90, 0.5, Math.random() * 180 - 90);
            this.scene.add(ammoBox);
            const ammoBody = new CANNON.Body({ mass: 0 });
            ammoBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
            ammoBody.position.copy(ammoBox.position);
            this.world.addBody(ammoBody);
            this.ammoPickups.push({ mesh: ammoBox, body: ammoBody });
        }

        const borderMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const borders = [
            { size: [5, 100, 200], pos: [-100, 50, 0] },
            { size: [5, 100, 200], pos: [100, 50, 0] },
            { size: [200, 100, 5], pos: [0, 50, 100] },
            { size: [200, 100, 5], pos: [0, 50, -100] },
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
                case 27: // Escape
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
            this.mouseX -= movementX * 0.002; // Update yaw
            this.mouseY -= movementY * 0.002; // Update pitch
            this.mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouseY)); // Clamp pitch
        });

        this.canvas.addEventListener("mousedown", () => {
            if (this.isPaused || !document.pointerLockElement) return;
            if (this.ammo > 0) {
                this.ammo--;
                this.ammoCounter.textContent = `Ammo: ${this.ammo}`;

                const bulletGeometry = new THREE.SphereGeometry(0.1, 16, 16);
                const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
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

            // Update camera position and orientation
            const cameraPosition = this.hero.position.clone().add(new THREE.Vector3(0, 1, 0));
            this.camera.position.copy(cameraPosition);

            // Set camera rotation with fixed up vector
            this.camera.rotation.order = "YXZ"; // Ensure yaw (Y) applies first, then pitch (X)
            this.camera.rotation.set(this.mouseY, this.mouseX, 0); // No roll (Z = 0)

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