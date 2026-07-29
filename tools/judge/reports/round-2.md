# AETHERIUM — Visual Judge Report, Round 2

*Judged against the frozen rubric in `tools/judge/JUDGE.md`. All 17 PNGs in
`tools/judge/shots/round-2/` were read before scoring. Reference class judged from trained
visual memory of Starfield, Elite Dangerous: Odyssey, No Man's Sky (post-Waypoint), Mass
Effect: Andromeda, Deliver Us Mars and Chorus — I have no reference screenshots on disk.
Where my memory of a specific title's behaviour is uncertain I say so inline. The green
debug overlay in 14–17 is a harness overlay and was ignored for scoring.*

---

## VERDICT: FAIL

Category 10 shows at least five independently confirmed visible artifacts, no category
reaches 8, and the median category is a 3.

---

## SCORES

| # | Category | Score | Justification (cite files) |
|---|----------|-------|----------------------------|
| 1 | Geometry / meshes | **3** | The hero prop is a literal primitive: in `08-anchor.png` and `09-companion-sky.png` the anchor is an untapered cylinder with three `TorusGeometry` rings threaded on it and no cap, bevel, panel line, greeble or bolt anywhere on its 500px of screen height. Surface rocks (`08` at x≈430,y≈465 and `09` at x≈555,y≈340) are low-poly faceted hemispheres whose facets are individually countable at this distance. The character's limbs (`03-creator.png`, crop of torso/legs) are stacked capsules with visible ring seams at every joint and mitten hands built from four stubby prisms. |
| 2 | Materials / textures | **3** | Nothing reads as a specific material. The suit in `03-creator.png` is one uniform white-grey with a single horizontal rib pattern on the torso — no stitching, seam tape, scuffing, edge wear or roughness breakup, so it reads as vacuum-formed plastic. The anchor in `09-companion-sky.png` is pure black (RGB ≈ 12,10,9) on both the lit and unlit side simultaneously — it has no albedo, no spec lobe, no material at all. The planet in `15-orbit-limb.png` uses one high-frequency "cottage cheese" normal noise at a single scale identically across ocean-adjacent green, tan desert and mountain, so the whole globe is one material tinted three ways. |
| 3 | Terrain / world detail | **3** | In `05-surface-wide.png`, `06-surface-vista.png` and `07-first-person.png` the ground from two metres in front of the camera to the horizon is one smooth low-frequency height field with a single overlaid noise. There is no drainage, no erosion channel, no scree apron below the ridges, no strata banding on the cliff faces, no ground-type transition. The rock scatter is a handful of identical dark pebbles placed at uniform density with no clustering. On the ridge in `07` (x≈900–1300) the noise stretches into visible diagonal streaks at grazing angles. |
| 4 | Lighting | **3** | Single directional key plus a flat constant ambient, with nothing else. The anchor's shaded side in `09-companion-sky.png` receives zero bounce from the very bright sand it is standing on — a real reference frame would show strong warm upward bounce onto the lower third of that column. There is no ambient occlusion anywhere: no darkening in the sand where each rock meets it (`08`, `09`), none in the character's armpits, crotch or under the chest plate (`03`, `05`), none under the anchor's rings. The anchor rings are unlit emissive and read the same brightness on the sun-facing and shadow-facing halves of the torus. |
| 5 | Shadows | **2** | `06-surface-vista.png`, x≈870–1300, y≈740–800: the character's shadow is a detached, shapeless blurred lozenge lying a full body-width to the right of the boots with no connection to them — textbook peter-panning on top of a blob shadow that contains no limb, no head and no gap between the legs. The boots themselves (x≈780–830, y≈800) have no contact shadow of any kind. The anchor's shadow in `09` is a uniform-density hard-edged trapezoid whose penumbra does not widen at all over ~25 m of throw, and whose leading edge is a straight cut. Nothing in any frame self-shadows. |
| 6 | Atmosphere / volumetrics | **3** | The surface body is airless so no aerial perspective is owed, but nothing substitutes for it — `07-first-person.png` has identical contrast at 3 m and at the horizon. The planetary atmosphere shell in `14-orbit-day.png` / `17-orbit-ice.png` is a plausible single-scatter rim, but it is a constant-width halo with no forward-scatter brightening toward the sun and no Rayleigh blue-shift on the limb versus the sub-solar point, and in `16-orbit-crescent.png` it fails outright (see Defect 2). No god rays, no dust volumetrics, no cloud light shafts on any planet. |
| 7 | Post-processing | **3** | Every surface frame carries a heavy, uniform, non-directional blur that is not a defensible depth of field: in `07-first-person.png` the ground at y≈700 (a few metres away) is exactly as soft as the ridge at y≈300, and in `05-surface-wide.png` the in-focus subject at frame centre is softer than the HUD. Film grain is very heavy and chromatic — the starfield in `02-title.png` is full of red/blue single-pixel speckle. Bloom on the anchor rings (`09`, x≈880–990) has a boxy, squared-off falloff rather than a circular kernel. Highlight roll-off is acceptable; everything else is over-applied. |
| 8 | Colour grading | **5** | The best-graded frames are genuinely coherent: `02-title.png` and `13-pause.png` hold a disciplined cool-cyan-on-near-black palette with a controlled black point (7,14,17), and the surface shots keep a warm-sand-versus-cool-sky split that reads as an intentional look. But `01-boot.png` has no black anywhere in the frame — measured luma range is 159–233 over the entire 1600×900 image — so it is a flat wash, and the sky blacks in `05`/`06` are crushed into blotchy patches. Graded, but inconsistently. |
| 9 | UI / menus / typography | **6** | The strongest area. `02-title.png` has real hierarchy, restrained tracking, a coherent numeric-prefix menu and a diegetic status block; `12-codex.png` has believable panel architecture and corner brackets. It falls short of shipped because of content failures inside good containers: the codex rows in `12` have a ~700 px empty gutter between the diamond icon and a right-aligned category word, with the entry title simply absent; `11-starmap.png` renders no map at all with an empty list and an empty dossier panel; and `13-pause.png` leaves the entire lower-right two-thirds of the frame dead. |
| 10 | Artifacts | **2** | Multiple confirmed and independently verified at 3× magnification: (a) a bright 1 px white seam along the rock/terrain intersection in `09-companion-sky.png` at x≈490–620, y≈355–370; (b) a scattered gold speckle fringe on the *night* limb in `16-orbit-crescent.png` at x≈490–560, y≈360–660; (c) specular aliasing sparkle on the planet surface in `15-orbit-limb.png` at x≈740–800, y≈390–460; (d) chroma speckle throughout the starfield in `02-title.png`; (e) `04-creator-face.png` is entirely out of focus. Per rubric this alone caps the round at FAIL. |
| 11 | Character | **2** | `03-creator.png` at 2× shows capsule arms with ring seams at shoulder and elbow, cylindrical legs with a squashed-torus kneecap, wedge feet with no sole, mitten hands with four undifferentiated finger prisms and no knuckles, and a visor that is a flat rounded-rectangle card with a uniform orange emissive fill — no curvature, no reflection, no interior depth. The pose in `05-surface-wide.png` is a static A-pose with arms held out and legs pressed together, reading as an unposed rig. Face structure and skin material **cannot be scored at all** because the one shot dedicated to them (`04-creator-face.png`) is fully defocused. |
| 12 | Composition / scale | **4** | `08-anchor.png` and `09-companion-sky.png` do land a real sense of scale — the tiny character against the column and its long shadow is the one composition in the set that works. `14`/`16`/`17` are competent planet portraits. Against that, `05-surface-wide.png`, `06-surface-vista.png` and `07-first-person.png` are flat and empty: horizon parked near frame centre, no foreground element, midground and background separated only by a slight tonal shift, nothing to lead the eye. |

---

## CAPTURE / STATE FAILURES (noted, not silently charged elsewhere)

- **`04-creator-face.png` is entirely out of focus.** The whole frame including the UI
  panels is blurred, so this is a post/DOF configuration problem or a capture timing
  problem, not a character-art fact. I have **not** used it to lower Materials or
  Lighting. It does lower Category 10 (a shipped build must not ship this frame) and it
  leaves face/skin unverifiable, which is why Category 11 is scored on the body only.
- **`11-starmap.png` shows an unpopulated screen.** `KNOWN SYSTEMS 00`, `SURVEYED 0/0`,
  `FURTHEST CHARTED 0.0 ly`, an empty dossier, and no starmap geometry drawn — the
  gameplay terrain is still fully visible behind it. Whether this is a capture taken
  before state loaded or the screen genuinely having no content, it cannot be scored as a
  starmap. It is charged only against Category 9.
- **`01-boot.png`** appears to be the terminal white-flash frame of the sync sequence
  (progress bar at 100%). Even granting that, all type in the frame is at roughly 2%
  contrast against the background and is illegible.

---

## TOP DEFECTS (ranked, most damaging first)

### 1. The character is capsule-and-cylinder programmer art at every distance
**[SEVERITY: CRITICAL]**
- **What** — The player avatar is assembled from primitives with visible joint seams,
  mitten hands, and a flat card for a visor; it holds up at neither close nor mid range.
- **Where** — `03-creator.png`, figure at x≈650–1000, y≈260–780 (arms, hands, knees,
  visor); same rig in `05-surface-wide.png` at x≈700–920 and `06-surface-vista.png`.
- **Why it breaks the illusion** — In Starfield's or Andromeda's character screens the
  suit is the single densest asset on screen: hard-surface shoulder and chest plates with
  bevelled edges and separate trim geometry, a visor with real curvature, a Fresnel
  falloff and a reflected environment, fabric with visible stitch lines and seam tape,
  five separately modelled fingers, and an idle animation with weight on one leg. Here the
  arm is one smooth swept capsule and the hand has no knuckles.
- **Suggested fix** — Rebuild the suit as a hard-surface shell over a soft base: lathe the
  torso, then boolean/inset three separate armour plates with a 2–4 mm chamfer so edge
  highlights catch the key. Replace mitten hands with a 5-finger cage (even 3 segments per
  finger reads correctly at this distance). Make the visor a curved capsule slice with a
  `MeshPhysicalMaterial` at `metalness 1.0`, `roughness 0.05`, `clearcoat 1.0`, `iridescence`
  on, driven by a cube-camera or even a static env map, and put a dim emissive HUD plane a
  few centimetres *behind* it so it reads as glass over a screen. Break the A-pose: 6°
  hip drop, arms in at 15°, one foot forward.

### 2. Broken speckled gold fringe on the planet's night limb
**[SEVERITY: CRITICAL — artifact]**
- **What** — A ragged, sparkling gold/orange speckle band runs down the unlit limb, on the
  dark side of the terminator, where nothing should be emitting.
- **Where** — `16-orbit-crescent.png`, x≈490–560, y≈360–660 (verified at 3×; the band is
  discontinuous individual bright pixels, not a smooth rim).
- **Why it breaks the illusion** — This is either a scattering term evaluating with a
  negative or unclamped `dot(N,L)` on back-facing texels, or a bloom threshold catching an
  aliased specular highlight on the limb silhouette. In No Man's Sky and Elite the night
  limb is either black or carries a smooth, continuous, low-intensity twilight arc that is
  *widest* nearest the terminator and fades monotonically — it is never granular.
- **Suggested fix** — Clamp the scatter term with `max(dot(N,L), 0.0)` *before* the
  exponent/phase function, not after, and multiply by `smoothstep(-0.05, 0.15, NdotL)` so
  it dies smoothly across the terminator. Separately, raise the bloom threshold above the
  limb's peak luminance or apply a pre-bloom karis average to kill single-pixel fireflies.

### 3. Shadows are detached blobs with no contact and no penumbra behaviour
**[SEVERITY: CRITICAL]**
- **What** — The character's shadow is an amorphous blur sitting a body-width away from the
  feet, and the anchor's shadow is a constant-density hard trapezoid.
- **Where** — `06-surface-vista.png`, shadow lozenge at x≈870–1300, y≈740–800 versus boots
  at x≈780–830, y≈800; anchor shadow in `09-companion-sky.png`, x≈860–1050, y≈360–520.
- **Why it breaks the illusion** — On an airless body with a single hard sun, the reference
  behaviour is nearly the opposite of what is drawn: the shadow should be *sharp* at the
  boot and soften only slightly with distance, it should be legibly humanoid (two legs,
  gap between them, arms), and it should be welded to the contact point. A detached blob is
  the single loudest "this is a game object floating above a plane" signal in the set.
- **Suggested fix** — This looks like a blob-shadow decal, not a shadow map. Switch to a
  cascaded `DirectionalLightShadow` with cascade 0 at ~8 m / 2048², `shadow.bias ≈ -0.0005`
  and `normalBias ≈ 0.02` to kill acne without peter-panning. If a real shadow map is
  already in use, the offset means the shadow camera's target is not following the
  character — re-anchor `shadow.camera` to the player each frame. Add a small SSAO or a
  baked contact-darkening decal at the boot so the feet are attached to the ground.

### 4. Bright seam line where rocks intersect the terrain
**[SEVERITY: MAJOR — artifact]**
- **What** — A thin bright line traces the base of the rock exactly along its intersection
  with the sand.
- **Where** — `09-companion-sky.png`, the large rock at x≈490–620, y≈300–375; the seam runs
  along y≈355–370. Also faintly present on the rock in `08-anchor.png` at x≈380–470,y≈480.
- **Why it breaks the illusion** — This is coplanar-surface z-fighting or a shader
  intersection highlight. A real boulder is bedded into the ground: partly buried, with
  drift accumulated on the windward side and a dark AO band, never outlined in white.
- **Suggested fix** — Push the rock instances 10–20 cm further into the height field so the
  intersection is never near-tangent, and add a soft blend-to-terrain in the rock shader
  (compare world-space Y against a sampled terrain height and lerp albedo/normal toward the
  ground material over ~0.3 m). Widen the depth buffer near/far ratio if the seam persists.

### 5. The anchor is a raw cylinder with torus rings and no material
**[SEVERITY: MAJOR]**
- **What** — The mission-critical hero prop is an untapered black cylinder with three
  unlit gold rings, with zero surface detail and zero lighting response.
- **Where** — `08-anchor.png`, x≈880–940, full column; `09-companion-sky.png`, x≈880–990,
  y≈0–360.
- **Why it breaks the illusion** — Both sides of the column are the same near-black under a
  strong raking sun, which means the material is not being lit at all. Any equivalent
  monolith in the reference class (the Starfield artefact structures, Elite's guardian
  obelisks) carries a silhouette break — a taper, a top cap, an antenna, an asymmetric
  notch — plus panel lines, edge wear on the exposed vertical corners, and a clear lit/
  unlit split with warm bounce from the ground.
- **Suggested fix** — Give it a silhouette: taper the profile, cap the top with a distinct
  head, add 3–4 asymmetric greeble volumes. Give it a real material —
  `roughness ≈ 0.4`, `metalness ≈ 0.9`, a triplanar scratch/grime mask driving roughness,
  and a dark-but-not-black base albedo (~0.04–0.06 linear, not 0.0). Make the rings
  emissive *plus* lit, and put a small `PointLight` at each ring so it spills onto the
  column and proves the rings are physically there.

### 6. One noise scale across the entire planet — no erosion, no hydrology, no biome blending
**[SEVERITY: MAJOR]**
- **What** — Every land texel on the globe uses the same high-frequency granular normal
  pattern, and biome boundaries are hard threshold cuts.
- **Where** — `15-orbit-limb.png`, the whole visible disc; clearest in the green/tan
  boundary at x≈700–950, y≈380–560, and the specular sparkle patch at x≈740–800, y≈390–460.
- **Why it breaks the illusion** — From 1.55 R the dominant visual features on a real
  terrestrial world are directional: mountain ranges with a coherent strike, river networks
  branching into deltas, glacial scouring, dune fields with parallel crests. Here there is
  no direction anywhere — the surface is isotropic, so it reads as a bumpy ball rather than
  a planet. The clouds are also flat painted decals: they cast no shadow onto the ground
  and have no vertical extent at the terminator.
- **Suggested fix** — Layer domain-warped ridged multifractal for orogeny, then run a cheap
  iterative hydraulic-erosion pass on the height field at generation time (even 20
  iterations produces visible drainage); derive the biome mask from the *eroded* height plus
  slope plus latitude rather than from raw noise, and widen the blend to 3–5 % of the range.
  Fade the detail normal's amplitude with distance to kill the specular sparkle, and project
  the cloud layer's shadow onto the ground with a second sample of the cloud texture offset
  along the light vector.

### 7. Uniform screen-wide softening masquerading as depth of field
**[SEVERITY: MAJOR]**
- **What** — Everything in the surface frames is soft, at every depth, including the subject.
- **Where** — `07-first-person.png` (ground at y≈700 is as soft as the ridge at y≈300);
  `05-surface-wide.png` (the character at frame centre is softer than the HUD text).
- **Why it breaks the illusion** — Real DOF in this class is a *narrow* effect: subject
  crisp, far background softened with recognisable bokeh, near foreground softened. A flat
  blur over the whole frame reads as a low-resolution render being upscaled, and it is
  destroying whatever surface detail the terrain shader does produce.
- **Suggested fix** — If this is DOF, set focus distance to the subject and pull the
  circle-of-confusion max down hard, or disable it for gameplay cameras entirely. If it is
  not DOF, it is a render-target resolution or a mipmap-bias problem — check that the
  terrain material is not stuck on a high LOD bias and that the composer's render targets
  match device pixel ratio.

### 8. Codex rows have no titles and the starmap has no map
**[SEVERITY: MAJOR]**
- **What** — Good UI containers holding placeholder or absent content.
- **Where** — `12-codex.png`, list rows at x≈90–410, y≈165–295 — icon at far left, category
  word right-aligned at x≈355, and ~250 px of empty space between them where the entry
  title should be. `11-starmap.png`, the entire centre of the frame.
- **Why it breaks the illusion** — A shipped codex row is left-aligned title, secondary
  metadata right-aligned, with the icon reading as a type indicator. The current layout has
  the category doing double duty as the title *and* sitting in the metadata slot, which is
  what a data-binding failure looks like.
- **Suggested fix** — Bind the entry name to a left-aligned title at the icon's baseline;
  move the category to a small right-aligned muted label; add a discovered-date or
  record-ID line beneath. For the starmap, ensure the scene is populated (or at minimum
  render the local system) before the screen is reachable.

### 9. The nebula is a crack pattern, not a molecular cloud
**[SEVERITY: MINOR]**
- **What** — The title-screen nebula's dust lanes are uniformly thin dark cracks of even
  width and even spacing, distributed with no density gradient.
- **Where** — `02-title.png`, x≈600–1500, y≈60–420.
- **Why it breaks the illusion** — This reads as Worley/Voronoi edge output, i.e. cracked
  mud. Real nebulae in the reference skyboxes are filamentary and layered, with emission
  colour (Hα red, OIII teal), strong density falloff toward the edges, and bright rims where
  the cloud faces an embedded star. This one is desaturated grey and structurally uniform.
- **Suggested fix** — Domain-warp the Worley input with two octaves of fBm so the lanes
  become sinuous and variable-width, multiply the whole cloud by a large-scale density mask
  so it thins toward the frame edges, and add a second emissive layer in Hα red tinted where
  density is highest.

### 10. Chroma speckle and coloured grain across the starfield
**[SEVERITY: MINOR — artifact]**
- **What** — Single-pixel red/blue speckle throughout the star background.
- **Where** — `02-title.png` at 1× in the region x≈900–1500, y≈100–400; also visible in the
  sky of `05-surface-wide.png` and `08-anchor.png`.
- **Why it breaks the illusion** — Coloured single-pixel noise crawls badly in motion. The
  reference class applies grain as a luma-only, temporally-stable, slightly blurred layer.
- **Suggested fix** — Make the grain monochrome (`vec3(n)` rather than three independent
  channel samples), reduce its intensity by roughly half, and blur the noise texture by one
  pixel before applying so it does not alias against the star sprites.

---

## WHAT IS ALREADY AT THE BAR

Honestly assessed, only two things, and neither is a full category:

- **The title screen's typographic system** (`02-title.png`). The wide-tracked thin
  display face with the single cyan accent glyph, the numeric menu prefixes at a
  deliberately smaller optical size, the rule under the subtitle, the corner telemetry
  block, and the build-string footer — the *layout logic* here is genuinely close to
  shipped. I would accept the type treatment in a AAA main menu; the background behind it
  is what fails.
- **The scale read in `08-anchor.png` and `09-companion-sky.png`.** The decision to put a
  tiny figure against a very tall vertical with a long raking shadow produces real awe, and
  the shadow's direction sells the sun's position. The composition is right even though
  every asset inside it is wrong.

Everything else in the set — all geometry, all materials, all terrain, the character, the
shadows, the post chain — is below the bar.

---

## CHEAPEST PATH TO THE BIGGEST GAIN

1. **Fix the shadow pipeline and add contact occlusion.** (Defect 3, and it also cleans up
   Defect 4.) Replacing the blob decal with a properly-targeted cascaded shadow map and
   adding SSAO is a bounded engine change that touches no art, yet it is the single largest
   lever on perceived grounding: right now every object in every surface frame appears to
   float. Attached, shaped shadows plus AO at every ground contact would move Categories 4,
   5 and 12 simultaneously.

2. **Turn off the global blur and re-tune the post chain.** (Defect 7, 10.) Removing the
   screen-wide softening, halving the grain and making it luma-only, and raising the bloom
   threshold is an afternoon of shader-parameter work with no asset cost. It immediately
   returns whatever surface detail already exists, kills the "low-res upscale" read, and
   removes two of the five confirmed artifacts. It will also expose the terrain's real
   quality, which is a prerequisite for judging any terrain fix.

3. **Rebuild the character silhouette and the anchor silhouette.** (Defects 1 and 5.) These
   are the only two hero assets in the game and both are currently raw primitives. Adding a
   5-finger hand, three bevelled armour plates, a curved reflective visor, and a taper +
   cap + greebles on the anchor is a contained amount of procedural-geometry work — but it
   is what stands between "someone's three.js scene" and "a game". Nothing in Categories 1,
   2 or 11 can move above 4 until this is done.
