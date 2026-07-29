import * as THREE from '../../vendor/three.module.js';

/* ===================================================================== *
 * Player controller.
 *
 * Two modes sharing one camera rig:
 *   'walk'  — grounded, third-person orbit, terrain-following
 *   'fly'   — 6DoF thruster flight with inertia, used in orbit and space
 *
 * Camera motion is critically damped rather than snapped. Almost all of the
 * "feels like a game engine demo" impression comes from a camera that tracks
 * its target exactly; a little lag and overshoot is what reads as weight.
 * ===================================================================== */

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, locked: false, buttons: 0 };
    this.gamepadIndex = null;
    this._bind();
  }
  _bind() {
    const onKey = (e, down) => {
      if (down && ['Tab', 'Space', 'F1'].includes(e.code)) e.preventDefault();
      if (down) this.keys.add(e.code); else this.keys.delete(e.code);
    };
    this._kd = e => onKey(e, true);
    this._ku = e => onKey(e, false);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    this._mm = e => {
      if (!this.mouse.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._md = e => { this.mouse.buttons |= (1 << e.button); };
    this._mu = e => { this.mouse.buttons &= ~(1 << e.button); };
    this._wh = e => { this.mouse.wheel += e.deltaY; e.preventDefault(); };
    this._pl = () => { this.mouse.locked = document.pointerLockElement === this.dom; };
    window.addEventListener('mousemove', this._mm);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    this.dom.addEventListener('wheel', this._wh, { passive: false });
    document.addEventListener('pointerlockchange', this._pl);
  }
  requestLock() { this.dom.requestPointerLock?.(); }
  exitLock() { document.exitPointerLock?.(); }
  down(...codes) { return codes.some(c => this.keys.has(c)); }
  consumeMouse() {
    const m = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    return m;
  }
  // Gamepad axes are folded into the same movement vector as the keyboard.
  pad() {
    const pads = navigator.getGamepads?.() || [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    this.dom.removeEventListener('wheel', this._wh);
    document.removeEventListener('pointerlockchange', this._pl);
  }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class PlayerController {
  constructor(engine, input, opts = {}) {
    this.engine = engine;
    this.input = input;
    this.mode = 'walk';

    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.12;
    this.onGround = false;

    this.sensitivity = opts.sensitivity ?? 0.0022;
    this.invertY = false;
    this.walkSpeed = 4.2;
    this.runSpeed = 9.5;
    this.jumpSpeed = 6.2;
    this.gravity = 18.0;
    this.eyeHeight = 1.62;

    this.camDistance = 4.2;
    this._camDistCur = 4.2;
    this.thirdPerson = true;

    this.terrain = null;
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._bob = 0;
    this._stepAccum = 0;
    this.onFootstep = null;

    // Flight state
    this.flyVelocity = new THREE.Vector3();
    this.throttle = 0;
    this.boost = 0;
    this._roll = 0;
  }

  setTerrain(t) { this.terrain = t; }

  groundHeight(x, z) {
    return this.terrain ? this.terrain.heightAt(x, z) : 0;
  }

  update(dt, opts = {}) {
    const locked = this.input.mouse.locked;
    const m = this.input.consumeMouse();
    const pad = this.input.pad();

    if (locked || opts.forceLook) {
      this.yaw -= m.dx * this.sensitivity;
      this.pitch -= m.dy * this.sensitivity * (this.invertY ? -1 : 1);
    }
    if (pad) {
      const rx = Math.abs(pad.axes[2]) > 0.12 ? pad.axes[2] : 0;
      const ry = Math.abs(pad.axes[3]) > 0.12 ? pad.axes[3] : 0;
      this.yaw -= rx * dt * 2.6;
      this.pitch -= ry * dt * 2.0 * (this.invertY ? -1 : 1);
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.25);

    if (m.wheel) {
      this.camDistance = THREE.MathUtils.clamp(this.camDistance + m.wheel * 0.004, 0.0, 12);
      this.thirdPerson = this.camDistance > 0.6;
    }

    if (this.mode === 'walk') this._updateWalk(dt, pad);
    else this._updateFly(dt, pad);

    this._updateCamera(dt);
  }

  _moveVector(pad) {
    let fx = 0, fz = 0;
    if (this.input.down('KeyW', 'ArrowUp')) fz -= 1;
    if (this.input.down('KeyS', 'ArrowDown')) fz += 1;
    if (this.input.down('KeyA', 'ArrowLeft')) fx -= 1;
    if (this.input.down('KeyD', 'ArrowRight')) fx += 1;
    if (pad) {
      const lx = Math.abs(pad.axes[0]) > 0.15 ? pad.axes[0] : 0;
      const ly = Math.abs(pad.axes[1]) > 0.15 ? pad.axes[1] : 0;
      fx += lx; fz += ly;
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    return { fx, fz, moving: len > 0.05 };
  }

  _updateWalk(dt, pad) {
    const { fx, fz, moving } = this._moveVector(pad);
    const running = this.input.down('ShiftLeft', 'ShiftRight') || (pad && pad.buttons[10]?.pressed);
    const speed = running ? this.runSpeed : this.walkSpeed;

    // Movement is relative to camera yaw.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wantX = (fx * cos - fz * sin) * speed;
    const wantZ = (fx * sin + fz * cos) * speed;

    // Ground friction / air control. Approaching the target velocity rather
    // than setting it is what gives acceleration weight.
    const accel = this.onGround ? 12 : 3.2;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wantX, accel, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wantZ, accel, dt);

    this.velocity.y -= this.gravity * dt;
    if ((this.input.down('Space') || (pad && pad.buttons[0]?.pressed)) && this.onGround) {
      this.velocity.y = this.jumpSpeed;
      this.onGround = false;
      this.onJump?.();
    }

    this.position.addScaledVector(this.velocity, dt);

    const g = this.groundHeight(this.position.x, this.position.z);
    if (this.position.y <= g) {
      if (!this.onGround && this.velocity.y < -4) this.onLand?.(-this.velocity.y);
      this.position.y = g;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Footsteps keyed to distance travelled, not to a timer, so they stay in
    // sync at any speed.
    if (this.onGround && moving) {
      const dist = Math.hypot(this.velocity.x, this.velocity.z) * dt;
      this._stepAccum += dist;
      const stride = running ? 2.1 : 1.5;
      if (this._stepAccum > stride) {
        this._stepAccum = 0;
        this.onFootstep?.(running ? 1 : 0.6);
      }
      this._bob += dt * (running ? 11 : 7.5);
    } else {
      this._bob = THREE.MathUtils.damp(this._bob % (Math.PI * 2), 0, 4, dt);
    }
  }

  _updateFly(dt, pad) {
    const { fx, fz } = this._moveVector(pad);
    const up = this.input.down('Space') ? 1 : (this.input.down('ControlLeft', 'KeyC') ? -1 : 0);
    const boosting = this.input.down('ShiftLeft') || (pad && pad.buttons[7]?.value > 0.4);
    this.boost = THREE.MathUtils.damp(this.boost, boosting ? 1 : 0, 3, dt);

    const baseThrust = 42;
    const thrust = baseThrust * (1 + this.boost * 9);

    _q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this._roll, 'YXZ'));
    const fwd = _v.set(0, 0, -1).applyQuaternion(_q);
    const right = _v2.set(1, 0, 0).applyQuaternion(_q);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);

    const accel = new THREE.Vector3()
      .addScaledVector(fwd, -fz * thrust)
      .addScaledVector(right, fx * thrust)
      .addScaledVector(upv, up * thrust * 0.7);

    this.flyVelocity.addScaledVector(accel, dt);
    // Inertial damping — space has none, but a ship with attitude thrusters
    // behaves like this and it keeps flight controllable.
    const damp = accel.lengthSq() > 1e-3 ? 0.55 : 1.5;
    this.flyVelocity.multiplyScalar(Math.exp(-damp * dt));

    this.position.addScaledVector(this.flyVelocity, dt);
    this.throttle = THREE.MathUtils.clamp(this.flyVelocity.length() / 220, 0, 1);

    // Bank into turns.
    const targetRoll = -(fx) * 0.42;
    this._roll = THREE.MathUtils.damp(this._roll, targetRoll, 4, dt);
  }

  _updateCamera(dt) {
    const cam = this.engine.camera;
    const eye = this.mode === 'walk' ? this.eyeHeight : 0;

    if (this.mode === 'fly') {
      _q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this._roll, 'YXZ'));
      const back = _v.set(0, 0, 1).applyQuaternion(_q).multiplyScalar(this._camDistCur * 2.2);
      const upOff = _v2.set(0, 1, 0).applyQuaternion(_q).multiplyScalar(this._camDistCur * 0.45);
      const want = this.position.clone().add(back).add(upOff);
      cam.position.lerp(want, 1 - Math.exp(-9 * dt));
      cam.quaternion.slerp(_q, 1 - Math.exp(-11 * dt));
      this._camDistCur = THREE.MathUtils.damp(this._camDistCur, this.camDistance, 6, dt);
      return;
    }

    const headBob = Math.sin(this._bob) * 0.035 + Math.sin(this._bob * 2) * 0.012;
    const focus = _v.set(this.position.x, this.position.y + eye + headBob, this.position.z);

    this._camDistCur = THREE.MathUtils.damp(this._camDistCur, this.camDistance, 8, dt);

    if (this._camDistCur < 0.6) {
      // First person.
      cam.position.copy(focus);
      const ghFp = this.groundHeight(cam.position.x, cam.position.z) + 0.25;
      if (cam.position.y < ghFp) cam.position.y = ghFp;
      _q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      cam.quaternion.slerp(_q, 1 - Math.exp(-24 * dt));
    } else {
      const dir = _v2.set(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        -Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch));
      const want = focus.clone().addScaledVector(dir, this._camDistCur);
      const gh = this.groundHeight(want.x, want.z) + 0.6;
      if (want.y < gh) want.y = gh;
      cam.position.lerp(want, 1 - Math.exp(-14 * dt));

      // Re-clamp AFTER the interpolation. Clamping only the target lets the
      // eased position pass below the surface — and a camera inside the
      // terrain sees straight through it (back faces are culled), so the sky
      // appears to bleed through the ground.
      const ghNow = this.groundHeight(cam.position.x, cam.position.z) + 0.6;
      if (cam.position.y < ghNow) cam.position.y = ghNow;

      cam.lookAt(focus);
    }
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'fly') this.flyVelocity.set(0, 0, 0);
    else { this.velocity.set(0, 0, 0); this._roll = 0; }
  }

  get speed() {
    return this.mode === 'fly' ? this.flyVelocity.length() : Math.hypot(this.velocity.x, this.velocity.z);
  }
}
