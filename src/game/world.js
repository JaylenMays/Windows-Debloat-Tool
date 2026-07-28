import * as THREE from '../../vendor/three.module.js';
import { LAYER } from '../core/engine.js';
import { Terrain, BIOME_PRESETS } from '../world/terrain.js';
import { Planet } from '../world/planet.js';

/* ===================================================================== *
 * World generation and the discoverable objects in it.
 *
 * Guidance is environmental rather than instructional: Anchors are tall,
 * self-lit monoliths placed so at least one is almost always visible on the
 * horizon. The player walks toward the interesting silhouette because it is
 * interesting, and the objective text only confirms what they already chose.
 * ===================================================================== */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SYSTEMS = [
  {
    id: 'kestrel', name: 'Kestrel III', biome: 'rocky', seed: 20481,
    distance: 0, hazard: 'Low', resources: 'Silicates, water ice',
    blurb: 'A weathered shield world. The founder\'s first cache was logged here.',
    keyName: 'The Iron Key', sunAngle: 0.17, sunColor: [1.0, 0.93, 0.82],
    companion: { type: 'terran', seed: 20117, angularSize: 0.30, azimuth: 2.1, elevation: 0.30 },
  },
  {
    id: 'saffron', name: 'Saffron Reach', biome: 'dunes', seed: 77213,
    distance: 4.7, hazard: 'Moderate', resources: 'Rare earths, glass',
    blurb: 'Endless dunes over a buried city. Something down there still answers.',
    keyName: 'The Glass Key', sunAngle: 0.13, sunColor: [1.0, 0.82, 0.60],
    companion: { type: 'barren', seed: 51221, angularSize: 0.18, azimuth: 4.4, elevation: 0.22 },
  },
  {
    id: 'vantage', name: 'Vantage', biome: 'glacier', seed: 30097,
    distance: 11.2, hazard: 'High', resources: 'Deuterium, exotic ice',
    blurb: 'A frozen ocean under a double star. The signal here is a countdown.',
    keyName: 'The Cold Key', sunAngle: 0.11, sunColor: [0.88, 0.94, 1.0],
    companion: { type: 'gasgiant', seed: 8831, angularSize: 0.52, azimuth: 1.2, elevation: 0.26 },
  },
  {
    id: 'ember', name: 'Ember Fall', biome: 'ashen', seed: 91334,
    distance: 19.8, hazard: 'Extreme', resources: 'Heavy metals',
    blurb: 'Where the lattice was first compiled. The Egg is here.',
    keyName: 'The Egg', sunAngle: 0.09, sunColor: [1.0, 0.48, 0.26], final: true,
    companion: { type: 'volcanic', seed: 66101, angularSize: 0.40, azimuth: 5.0, elevation: 0.20 },
  },
];

export const LORE = {
  kestrel: [
    'I built the lattice so that nobody would have to be only where they were born. — A. Vey, founder',
    'The first world was a test. I wanted to know if anyone would look up.',
    'Three keys. Not because it is hard. Because it takes three kinds of patience.',
  ],
  saffron: [
    'They asked me to put a map in it. A map would have made it a queue, not a world.',
    'The city under the sand was the first thing I ever rendered. I could not bring myself to delete it.',
    'If you are reading this, you went off the path. Good.',
  ],
  vantage: [
    'The countdown is not a threat. It is how long I have left to keep answering.',
    'Every explorer who arrives here has already been somewhere nobody told them to go.',
    'The last key is the easiest to find and the hardest to earn.',
  ],
  ember: [
    'This is where I compiled the first lattice, on a machine the size of a room.',
    'I am not hidden at the end of this. I am distributed across all of it.',
    'The Egg was never a prize. It is a key to the front door — and now it is yours.',
  ],
};

/* --------------------------------------------------------------------- *
 * Procedural props
 * --------------------------------------------------------------------- */

function anchorMesh(accent) {
  // A tall faceted monolith with a glowing core seam. Readable in silhouette
  // from kilometres away, which is what makes it work as a landmark.
  const g = new THREE.Group();
  const h = 46;
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 5.6, h, 7, 4, false),
    new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.52, metalness: 0.62, flatShading: true })
  );
  shell.position.y = h / 2;
  shell.castShadow = true;
  g.add(shell);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, h * 0.86, 6, 1),
    new THREE.MeshBasicMaterial({ color: accent })
  );
  core.position.y = h / 2;
  g.add(core);

  const ringGeo = new THREE.TorusGeometry(6.4, 0.28, 8, 40);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
      color: 0x1a1e24, roughness: 0.35, metalness: 0.8, emissive: accent, emissiveIntensity: 0.25,
    }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 8 + i * 14;
    g.add(ring);
  }
  g.traverse(o => { if (o.isMesh) o.layers.set(LAYER.MID); });
  return g;
}

function scatterRocks(rnd, terrain, count, tint) {
  // One instanced draw for the whole field. A few hundred individual meshes
  // would cost more in draw calls than the rocks are worth.
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...tint), roughness: 0.92, metalness: 0.02, flatShading: true,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 40 + Math.pow(rnd(), 0.6) * 900;
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    p.y = terrain.heightAt(p.x, p.z) - 0.3;
    q.setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6));
    const sc = 0.6 + Math.pow(rnd(), 2.2) * 5.5;
    s.set(sc * (0.7 + rnd() * 0.6), sc * (0.5 + rnd() * 0.5), sc * (0.7 + rnd() * 0.6));
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  inst.layers.set(LAYER.MID);
  inst.frustumCulled = false;
  return inst;
}

function crystalCluster(rnd, accent) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const h = 1.6 + rnd() * 4.2;
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.3 + rnd() * 0.5, h, 5),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(accent).multiplyScalar(0.35),
        emissive: new THREE.Color(accent), emissiveIntensity: 0.55,
        roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.88,
      })
    );
    mesh.position.set((rnd() - 0.5) * 2.2, h / 2, (rnd() - 0.5) * 2.2);
    mesh.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5);
    mesh.castShadow = true;
    g.add(mesh);
  }
  g.traverse(o => { if (o.isMesh) o.layers.set(LAYER.MID); });
  return g;
}

/* --------------------------------------------------------------------- */

export class World {
  constructor(engine, system) {
    this.engine = engine;
    this.system = system;
    this.group = new THREE.Group();
    this.rnd = mulberry32(system.seed);
    this.biome = BIOME_PRESETS[system.biome];

    this.terrain = new Terrain(engine, { seed: system.seed, biome: system.biome, extent: 6000, res: 1024 });
    this.group.add(this.terrain.group);

    this.interactables = [];
    this._buildLighting();
    this._buildCompanion();
    this._buildAnchors();
    this._buildScatter();
    engine.scene.add(this.group);
  }

  _buildLighting() {
    const s = this.system;
    const ang = s.sunAngle;
    this.sunDir = new THREE.Vector3(Math.cos(ang) * 0.7, Math.sin(ang), Math.cos(ang) * 0.6).normalize();
    this.sunColor = new THREE.Color(...s.sunColor);

    const sun = new THREE.DirectionalLight(this.sunColor, 3.1);
    sun.position.copy(this.sunDir).multiplyScalar(600);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 160;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 1400;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.35;
    sun.layers.enableAll();
    this.sun = sun;
    this.group.add(sun);
    this.group.add(sun.target);

    const amb = new THREE.HemisphereLight(
      new THREE.Color(...this.biome.ambient).multiplyScalar(1.5),
      new THREE.Color(...this.biome.low).multiplyScalar(0.5), 0.85);
    this.group.add(amb);
  }

  // A sibling world hanging in the sky. It lives on the FAR depth layer at a
  // genuinely astronomical distance, so it never intersects the terrain and
  // never parallaxes as the player walks — which is exactly how a real body
  // millions of kilometres away behaves, and it gives every surface vista a
  // sense of scale that terrain alone cannot.
  _buildCompanion() {
    const c = this.system.companion;
    if (!c) return;
    const radius = 6.0e6;
    const distance = radius / Math.tan(c.angularSize * 0.5);

    this.companion = new Planet(this.engine, {
      seed: c.seed, radius, type: c.type,
      hasClouds: c.type === 'terran', hasCityLights: c.type === 'terran',
    });
    const az = c.azimuth, el = c.elevation;
    this.companion.group.position.set(
      Math.sin(az) * Math.cos(el) * distance,
      Math.sin(el) * distance,
      Math.cos(az) * Math.cos(el) * distance);
    this.group.add(this.companion.group);
  }

  _buildAnchors() {
    const accent = new THREE.Color(6.0, 3.4, 1.4);
    this.anchors = [];
    // Placed on a jittered ring so one is nearly always on the horizon from
    // spawn, and reaching one puts another in view.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + this.rnd() * 0.7;
      const r = 340 + this.rnd() * 300;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = this.terrain.heightAt(x, z);
      const g = anchorMesh(accent);
      g.position.set(x, y - 1.5, z);
      g.rotation.y = this.rnd() * 6.28;
      this.group.add(g);

      const light = new THREE.PointLight(0xffb066, 26, 120, 2);
      light.position.set(x, y + 26, z);
      this.group.add(light);

      const anchor = {
        kind: 'anchor', index: i, object: g,
        position: new THREE.Vector3(x, y + 4, z),
        radius: 16, scanned: false,
        label: `Anchor ${'I'.repeat(i + 1)}`,
        lore: (LORE[this.system.id] || [])[i] || '',
      };
      this.anchors.push(anchor);
      this.interactables.push(anchor);
    }
  }

  _buildScatter() {
    const rnd = this.rnd;
    this.group.add(scatterRocks(rnd, this.terrain, 420, this.biome.slopeColor));

    // Scannable curiosities: these are the "discovery" layer that rewards
    // wandering off the direct route between anchors.
    const accents = ['#6fe3ff', '#ff8a4c', '#b98cff', '#7dffb0'];
    const kinds = [
      { t: 'Mineral', n: ['Vitrified silicate', 'Ferric nodule', 'Deuterium clathrate', 'Aureate vein'] },
      { t: 'Flora', n: ['Rime lichen', 'Glass fern', 'Ash bloom', 'Sable moss'] },
      { t: 'Relic', n: ['Founder-era marker', 'Lattice fragment', 'Survey stake', 'Sealed cache'] },
    ];
    this.curios = [];
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 60 + Math.pow(rnd(), 0.7) * 780;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = this.terrain.heightAt(x, z);
      const accent = accents[Math.floor(rnd() * accents.length)];
      const g = crystalCluster(rnd, accent);
      g.position.set(x, y - 0.2, z);
      this.group.add(g);
      const k = kinds[Math.floor(rnd() * kinds.length)];
      const c = {
        kind: 'curio', object: g,
        position: new THREE.Vector3(x, y + 1.6, z),
        radius: 9, scanned: false,
        category: k.t,
        label: k.n[Math.floor(rnd() * k.n.length)],
      };
      this.curios.push(c);
      this.interactables.push(c);
    }
  }

  // The nearest un-scanned thing within range, used for the interact prompt.
  nearest(pos, maxDist = 22) {
    let best = null, bestD = maxDist;
    for (const it of this.interactables) {
      if (it.scanned) continue;
      const d = pos.distanceTo(it.position);
      if (d < Math.max(it.radius, bestD)) {
        if (d < bestD) { bestD = d; best = it; }
      }
    }
    return best ? { target: best, distance: bestD } : null;
  }

  update(dt, camera) {
    this.terrain.update(dt, camera, this.sunDir);
    // Keep the companion centred on the camera so walking never closes the
    // distance to it — at these ranges any translation would be wrong anyway.
    if (this.companion) {
      this.companion.group.position.add(camera.position).sub(this._lastCam || camera.position);
      this._lastCam = camera.position.clone();
      this.companion.update(dt, camera, this.sunDir, this.sunColor);
    }
    // Keep the shadow frustum centred on the player, otherwise shadows vanish
    // as soon as they walk away from the origin.
    if (this.sun) {
      this.sun.position.copy(camera.position).addScaledVector(this.sunDir, 500);
      this.sun.target.position.copy(camera.position);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    this.companion?.dispose?.();
    this.terrain.dispose();
    this.engine.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.isMesh || o.isInstancedMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); }
    });
  }
}
