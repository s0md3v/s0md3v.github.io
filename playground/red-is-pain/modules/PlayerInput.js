import { Config } from './Config.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';

/**
 * PlayerInput handles Keyboard, Mouse, and Gamepad input
 * and translates it into agent movement + shooting.
 */
export class PlayerInput {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.mouseWorldX = 0;
        this.mouseWorldY = 0;
        this.mouseScreenX = canvas.clientWidth / 2;
        this.mouseScreenY = canvas.clientHeight / 2;
        this.hasMousePosition = false;
        this.mouseDown = false;
        this.queuedFireUntil = 0;
        this.queuedReload = false;
        this.gamepadIndex = null;
        this.virtualMove = { x: 0, y: 0, active: false };
        this.virtualAim = { x: 0, y: 0, active: false };
        this.virtualSprint = false;
        this.virtualReload = false;
        this._listenerCleanups = [];

        this._onKeyDown = (e) => {
            this.keys[e.code] = true;
            if (e.code === 'KeyR') this.queuedReload = true;
        };
        this._onKeyUp = (e) => {
            this.keys[e.code] = false;
        };
        this._onMouseDown = (e) => {
            if (e.button === 0) {
                this.mouseDown = true;
                // Keep a tap alive briefly while the operative turns toward the cursor.
                // Without this buffer, a quick click can be consumed before the weapon
                // is inside its firing arc.
                this.queuedFireUntil = performance.now() + 750;
                this._inputSource = 'kbm';
            }
        };
        this._onMouseUp = (e) => {
            if (e.button === 0) this.mouseDown = false;
        };
        this._onGamepadConnected = (e) => {
            this.gamepadIndex = e.gamepad.index;
        };
        this._onGamepadDisconnected = () => {
            this.gamepadIndex = null;
        };

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        canvas.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('gamepadconnected', this._onGamepadConnected);
        window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);

        this.setupTouchControls();
    }

    /**
     * Update the mouse position in world coordinates.
     * Called from main.js on mousemove using the camera transform.
     */
    setMouseWorldPos(wx, wy) {
        this.mouseWorldX = wx;
        this.mouseWorldY = wy;
    }

    setMouseScreenPos(x, y) {
        this.mouseScreenX = x;
        this.mouseScreenY = y;
        this.hasMousePosition = true;
        this._inputSource = 'kbm';
    }

    updateMouseWorldPos(camera) {
        if (!camera || !this.hasMousePosition) return;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const screenX = (this.mouseScreenX / rect.width) * this.canvas.width;
        const screenY = (this.mouseScreenY / rect.height) * this.canvas.height;
        this.mouseWorldX = (screenX - this.canvas.width / 2) / camera.zoom + camera.x;
        this.mouseWorldY = (screenY - this.canvas.height / 2) / camera.zoom + camera.y;
    }

    getAimScreenPosition(agent, camera) {
        if (this._inputSource === 'kbm' && this.hasMousePosition) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (this.mouseScreenX / rect.width) * this.canvas.width,
                y: (this.mouseScreenY / rect.height) * this.canvas.height
            };
        }

        const distance = 90;
        const worldX = agent.pos.x + Math.cos(agent.angle) * distance;
        const worldY = agent.pos.y + Math.sin(agent.angle) * distance;
        return {
            x: (worldX - camera.x) * camera.zoom + this.canvas.width / 2,
            y: (worldY - camera.y) * camera.zoom + this.canvas.height / 2
        };
    }

    setupTouchControls() {
        const bindStick = (stickId, knobId, state, fires = false) => {
            const stick = document.getElementById(stickId);
            const knob = document.getElementById(knobId);
            if (!stick || !knob) return;

            const update = (event) => {
                const rect = stick.getBoundingClientRect();
                const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.36);
                let dx = event.clientX - (rect.left + rect.width / 2);
                let dy = event.clientY - (rect.top + rect.height / 2);
                const magnitude = Math.hypot(dx, dy);
                if (magnitude > radius) {
                    dx = dx / magnitude * radius;
                    dy = dy / magnitude * radius;
                }
                state.x = dx / radius;
                state.y = dy / radius;
                knob.style.setProperty('--knob-x', `${dx}px`);
                knob.style.setProperty('--knob-y', `${dy}px`);
                if (fires) this.virtualFire = Math.hypot(state.x, state.y) > 0.2;
            };
            const down = (event) => {
                state.active = true;
                this._inputSource = 'touch';
                stick.setPointerCapture?.(event.pointerId);
                update(event);
                event.preventDefault();
            };
            const move = (event) => {
                if (!state.active) return;
                update(event);
                event.preventDefault();
            };
            const up = (event) => {
                state.x = 0;
                state.y = 0;
                state.active = false;
                if (fires) this.virtualFire = false;
                knob.style.setProperty('--knob-x', '0px');
                knob.style.setProperty('--knob-y', '0px');
                event.preventDefault();
            };

            stick.addEventListener('pointerdown', down);
            stick.addEventListener('pointermove', move);
            stick.addEventListener('pointerup', up);
            stick.addEventListener('pointercancel', up);
            this._listenerCleanups.push(() => {
                stick.removeEventListener('pointerdown', down);
                stick.removeEventListener('pointermove', move);
                stick.removeEventListener('pointerup', up);
                stick.removeEventListener('pointercancel', up);
            });
        };

        bindStick('move-stick', 'move-knob', this.virtualMove);
        bindStick('aim-stick', 'aim-knob', this.virtualAim, true);

        const bindHoldButton = (id, setter) => {
            const button = document.getElementById(id);
            if (!button) return;
            const down = (event) => { this._inputSource = 'touch'; setter(true); event.preventDefault(); };
            const up = (event) => { setter(false); event.preventDefault(); };
            button.addEventListener('pointerdown', down);
            button.addEventListener('pointerup', up);
            button.addEventListener('pointercancel', up);
            this._listenerCleanups.push(() => {
                button.removeEventListener('pointerdown', down);
                button.removeEventListener('pointerup', up);
                button.removeEventListener('pointercancel', up);
            });
        };

        bindHoldButton('btn-touch-sprint', value => { this.virtualSprint = value; });
        const reloadButton = document.getElementById('btn-touch-reload');
        if (reloadButton) {
            const reload = (event) => {
                this._inputSource = 'touch';
                this.virtualReload = true;
                event.preventDefault();
            };
            reloadButton.addEventListener('pointerdown', reload);
            this._listenerCleanups.push(() => reloadButton.removeEventListener('pointerdown', reload));
        }
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('gamepadconnected', this._onGamepadConnected);
        window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
        this._listenerCleanups.forEach(cleanup => cleanup());
        this._listenerCleanups = [];
        this.mouseDown = false;
        this.queuedFireUntil = 0;
        this.queuedReload = false;
        this.virtualFire = false;
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
        agent.weaponSystem.update(Date.now());
        this.updateMouseWorldPos(camera);
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

        if (this.virtualMove.active || this.virtualAim.active || this.virtualSprint || this.virtualReload) {
            this._inputSource = 'touch';
        }

        // Default to keyboard/mouse if nothing set
        if (!this._inputSource) this._inputSource = 'kbm';

        const useGamepad = this._inputSource === 'gamepad';
        const useTouch = this._inputSource === 'touch';

        // --- 1. MOVEMENT ---
        let moveX = 0;
        let moveY = 0;

        if (useTouch) {
            moveX = this.virtualMove.x;
            moveY = this.virtualMove.y;
        } else if (useGamepad && gp) {
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
        const sprinting = useTouch
            ? this.virtualSprint
            : useGamepad
                ? Boolean(gp && ((gp.buttons[6] && (gp.buttons[6].pressed || gp.buttons[6].value > 0.1)) || (gp.buttons[4] && gp.buttons[4].pressed)))
                : (this.keys['ShiftLeft'] || this.keys['ShiftRight']);
        agent.movementMode = sprinting ? 'BOUNDING' : 'TACTICAL';

        // Apply movement
        if (moveMag > deadzone) {
            const moveAngle = Math.atan2(moveY, moveX);
            const speed = agent.motor.calculateCurrentSpeed(world);
            // The player can deliberately squeeze through narrow doorways and
            // gaps. Keep the visual/combat radius unchanged; only direct-control
            // movement uses this slightly smaller collision footprint.
            const collisionRadius = Config.AGENT.PLAYER_COLLISION_RADIUS;

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
                const resolved = world.resolveCollision(agent.pos.x, agent.pos.y, collisionRadius, {
                    coverRadius: Config.AGENT.PLAYER_COVER_COLLISION_RADIUS
                });
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

        if (useTouch) {
            const aimMagnitude = Math.hypot(this.virtualAim.x, this.virtualAim.y);
            if (aimMagnitude > deadzone) {
                aimAngle = Math.atan2(this.virtualAim.y, this.virtualAim.x);
            }
        } else if (useGamepad && gp) {
            const rx = gp.axes[2] || 0;
            const ry = -(gp.axes[3] || 0); // Match inverted Y behavior from left-stick
            const rMag = Math.sqrt(rx * rx + ry * ry);
            if (rMag > deadzone) {
                aimAngle = Math.atan2(ry, rx);
            }
            // If right stick is idle on gamepad, keep current angle (don't snap to mouse)
        } else if (this.hasMousePosition) {
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
        if (useTouch) {
            wantsShoot = Boolean(this.virtualFire);
        } else if (useGamepad && gp) {
            const rt = gp.buttons[7]; // R2 / RT
            const rb = gp.buttons[5]; // R1 / RB
            if (rt && (rt.pressed || rt.value > 0.1)) wantsShoot = true;
            if (rb && (rb.pressed || rb.value > 0.1)) wantsShoot = true;
        } else {
            wantsShoot = this.mouseDown || performance.now() < this.queuedFireUntil;
        }

        let fired = false;
        if (wantsShoot) {
            const targetPos = {
                x: agent.pos.x + Math.cos(agent.angle) * 500,
                y: agent.pos.y + Math.sin(agent.angle) * 500
            };
            fired = agent.weaponSystem.shootAt(targetPos, world);
        }
        if (fired || performance.now() >= this.queuedFireUntil) this.queuedFireUntil = 0;

        // --- 4. RELOAD ---
        const wantsReload = useTouch
            ? this.virtualReload
            : useGamepad
                ? (gp && gp.buttons[2] && gp.buttons[2].pressed)
                : (this.keys['KeyR'] || this.queuedReload);
        if (wantsReload) {
            agent.weaponSystem.reload();
        }
        this.queuedReload = false;
        this.virtualReload = false;

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
