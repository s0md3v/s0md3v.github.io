import { Config } from './Config.js';
import { Utils } from './Utils.js';

/**
 * PlayerInput handles Keyboard, Mouse, and Gamepad input
 * and translates it into agent movement + shooting.
 */
export class PlayerInput {
    constructor(canvas) {
        this.canvas = canvas;

        // Keyboard state
        this.keys = {};

        // Mouse state (world coordinates set externally)
        this.mouseWorldX = 0;
        this.mouseWorldY = 0;
        this.mouseDown = false;

        // Gamepad state
        this.gamepadIndex = null;

        // Bind listeners
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse button (left click = shoot)
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouseDown = true;
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouseDown = false;
        });

        // Gamepad connection
        window.addEventListener('gamepadconnected', (e) => {
            this.gamepadIndex = e.gamepad.index;
            console.log('Gamepad connected:', e.gamepad.id);
        });
        window.addEventListener('gamepaddisconnected', () => {
            this.gamepadIndex = null;
        });
    }

    /**
     * Update the mouse position in world coordinates.
     * Called from main.js on mousemove using the camera transform.
     */
    setMouseWorldPos(wx, wy) {
        this.mouseWorldX = wx;
        this.mouseWorldY = wy;
    }

    /**
     * Read gamepad state (must be polled each frame).
     */
    _getGamepad() {
        if (this.gamepadIndex === null) return null;
        const gamepads = navigator.getGamepads();
        return gamepads[this.gamepadIndex] || null;
    }

    /**
     * Apply input to the player agent each frame.
     * This replaces the AI brain entirely.
     */
    applyToAgent(agent, dt, world, camera) {
        const gp = this._getGamepad();
        const deadzone = 0.15;

        // --- INPUT SOURCE DETECTION ---
        // Detect if gamepad is actively being used this frame
        let gamepadActive = false;
        if (gp) {
            const lx = Math.abs(gp.axes[0] || 0);
            const ly = Math.abs(gp.axes[1] || 0);
            const rx = Math.abs(gp.axes[2] || 0);
            const ry = Math.abs(gp.axes[3] || 0);
            const anyButton = gp.buttons.some(b => b.pressed || b.value > 0.1);
            if (lx > deadzone || ly > deadzone || rx > deadzone || ry > deadzone || anyButton) {
                gamepadActive = true;
                this._inputSource = 'gamepad';
            }
        }

        // Detect keyboard/mouse activity
        const anyKey = this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'] ||
                       this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight'] ||
                       this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyR'];
        if (anyKey || this.mouseDown) {
            this._inputSource = 'kbm';
        }

        // Default to keyboard/mouse if nothing set
        if (!this._inputSource) this._inputSource = 'kbm';

        const useGamepad = this._inputSource === 'gamepad';

        // --- 1. MOVEMENT ---
        let moveX = 0;
        let moveY = 0;

        if (useGamepad && gp) {
            moveX = gp.axes[0] || 0;
            moveY = -(gp.axes[1] || 0); // User requested: Invert left stick Y
        } else {
            if (this.keys['KeyW'] || this.keys['ArrowUp'])    moveY -= 1;
            if (this.keys['KeyS'] || this.keys['ArrowDown'])  moveY += 1;
            if (this.keys['KeyA'] || this.keys['ArrowLeft'])  moveX -= 1;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
        }

        // Normalize
        const moveMag = Math.sqrt(moveX * moveX + moveY * moveY);
        if (moveMag > 1) {
            moveX /= moveMag;
            moveY /= moveMag;
        }

        // Sprint
        const sprinting = useGamepad
            ? (gp && gp.buttons[4] && gp.buttons[4].pressed)
            : (this.keys['ShiftLeft'] || this.keys['ShiftRight']);
        agent.movementMode = sprinting ? 'BOUNDING' : 'TACTICAL';

        // Apply movement
        if (moveMag > deadzone) {
            const moveAngle = Math.atan2(moveY, moveX);
            const speed = agent.motor.calculateCurrentSpeed(world);

            // Physics sub-stepping
            const STEP_MS = 10;
            let remaining = Math.min(dt, 50);
            while (remaining > 0) {
                const step = Math.min(remaining, STEP_MS);
                remaining -= step;
                const stepDist = speed * (step / 1000);
                const nx = agent.pos.x + Math.cos(moveAngle) * stepDist;
                const ny = agent.pos.y + Math.sin(moveAngle) * stepDist;
                if (isFinite(nx) && isFinite(ny)) {
                    agent.pos.x = nx;
                    agent.pos.y = ny;
                }
                const resolved = world.resolveCollision(agent.pos.x, agent.pos.y, agent.radius);
                if (isFinite(resolved.x) && isFinite(resolved.y)) {
                    agent.pos.x = resolved.x;
                    agent.pos.y = resolved.y;
                }
            }

            agent.isMoving = true;
            agent.motor.smoothedMoveAngle = moveAngle;

            // Stamina drain
            const drainRate = Config.AGENT.MODES[agent.movementMode].DRAIN;
            agent.state.consumeStamina(drainRate * dt);
        } else {
            agent.isMoving = false;
        }

        // --- 2. AIM ---
        let aimAngle = agent.angle;

        if (useGamepad && gp) {
            const rx = gp.axes[2] || 0;
            const ry = -(gp.axes[3] || 0); // Match inverted Y behavior from left-stick
            const rMag = Math.sqrt(rx * rx + ry * ry);
            if (rMag > deadzone) {
                aimAngle = Math.atan2(ry, rx);
            }
            // If right stick is idle on gamepad, keep current angle (don't snap to mouse)
        } else {
            // Mouse aim
            aimAngle = Math.atan2(
                this.mouseWorldY - agent.pos.y,
                this.mouseWorldX - agent.pos.x
            );
        }

        // Smoothly rotate towards aim
        agent.motor.rotateTowards(aimAngle, dt, Config.AGENT.MAX_TURN_SPEED);
        agent.targetAngle = aimAngle;

        // --- 3. SHOOT ---
        let wantsShoot = false;
        if (useGamepad && gp) {
            const rt = gp.buttons[7]; // R2 / RT
            const rb = gp.buttons[5]; // R1 / RB
            if (rt && (rt.pressed || rt.value > 0.1)) wantsShoot = true;
            if (rb && (rb.pressed || rb.value > 0.1)) wantsShoot = true;
        } else {
            wantsShoot = this.mouseDown;
        }

        if (wantsShoot) {
            const targetPos = {
                x: agent.pos.x + Math.cos(agent.angle) * 500,
                y: agent.pos.y + Math.sin(agent.angle) * 500
            };
            agent.weaponSystem.shootAt(targetPos, world);
        }

        // --- 4. RELOAD ---
        const wantsReload = useGamepad
            ? (gp && gp.buttons[2] && gp.buttons[2].pressed)
            : this.keys['KeyR'];
        if (wantsReload) {
            const weapon = agent.state.inventory.weapon;
            if (weapon.ammo < weapon.capacity && weapon.carriedAmmo > 0 && agent.state.reloadingUntil <= Date.now()) {
                agent.state.reloadingUntil = Date.now() + weapon.reloadTime;
                const refillAmount = Math.min(weapon.capacity, weapon.carriedAmmo);
                weapon.ammo = refillAmount;
                weapon.carriedAmmo -= refillAmount;
            }
        }

        // --- 5. AUTO-PICKUP ---
        this._autoPickup(agent, world);

        // --- 6. Footstep sounds ---
        agent.handleFootsteps(dt, world);

        // --- 7. CAMERA ZOOM (D-Pad Up/Down) ---
        if (useGamepad && gp && camera) {
            const zoomSpeed = 0.01 * dt; 
            if (gp.buttons[12] && (gp.buttons[12].pressed || gp.buttons[12].value > 0.5)) {
                camera.zoom += zoomSpeed;
            }
            if (gp.buttons[13] && (gp.buttons[13].pressed || gp.buttons[13].value > 0.5)) {
                camera.zoom -= zoomSpeed;
            }
            camera.zoom = Math.max(0.1, Math.min(5.0, camera.zoom));
        }
    }

    /**
     * Auto-pickup nearby loot if the player walks over it.
     */
    _autoPickup(agent, world) {
        const pickupRadius = 20;
        for (let i = world.loot.length - 1; i >= 0; i--) {
            const item = world.loot[i];
            const dist = Utils.distance(agent.pos, { x: item.x, y: item.y });
            if (dist < pickupRadius) {
                if (item.type === 'Medkit') {
                    if (agent.state.hp < agent.state.maxHp) {
                        agent.state.hp = Math.min(agent.state.maxHp, agent.state.hp + 3);
                        world.loot.splice(i, 1);
                    }
                } else if (item.type === 'AmmoCrate') {
                    const weapon = agent.state.inventory.weapon;
                    weapon.carriedAmmo += weapon.capacity * 2;
                    world.loot.splice(i, 1);
                } else if (item.type === 'WeaponCrate') {
                    // Pick up ammo from weapon crates too
                    const weapon = agent.state.inventory.weapon;
                    weapon.carriedAmmo += weapon.capacity * 3;
                    world.loot.splice(i, 1);
                }
            }
        }
    }
}
