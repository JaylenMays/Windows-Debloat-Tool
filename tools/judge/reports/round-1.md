# AETHERIUM — Visual Judge Report, Round 1

Judged against the rubric in `tools/judge/JUDGE.md`. All 17 PNGs in
`tools/judge/shots/round-1/` were opened and inspected, several at 2–6x pixel
magnification. Reference comparison is from my own trained visual memory of
Starfield, Elite Dangerous: Odyssey, No Man's Sky (post-Waypoint), Mass Effect:
Andromeda, Deliver Us Mars and Chorus — I have no reference frames on disk, and
where my memory of a specific title's exact treatment is uncertain I say so
inline.

## VERDICT: FAIL

Not close — the round contains at least six independently disqualifying visible artifacts, no shadow casting anywhere in the game shots, and character/prop geometry that is unshaded primitive blockout.

## SCORES

| # | Category | Score | Justification (cite files) |
|---|----------|-------|----------------------------|
| 1 | Geometry / meshes | **2** | The anchor in `08-anchor.png` (centre, x≈915–990) is a vertical stack of four un-bevelled boxes of decreasing width with three flat torus rings — no panel lines, no greebles, no chamfers; the player in `03-creator.png` and `05-surface-wide.png` is a sphere helmet on a stack of capsules with cone feet and a segmented-tube neck. Only the planet spheres (14–17) avoid reading as primitives, and a planet is legitimately a sphere. |
| 2 | Materials / textures | **3** | Nothing on the surface reads as a specific material: the suit in `05-surface-wide.png` is uniform-roughness plastic with flat colour blocks and zero wear, edge damage or dirt; the anchor in `08-anchor.png` is literally albedo-zero black with no surface information at any point on it. The orbital shots are the only material work approaching competence, and even there `15-orbit-limb.png` has a specular hotspot sitting on *land* at ≈(770,430) where only water should glint. |
| 3 | Terrain / world detail | **2** | In `05-surface-wide.png` and `07-first-person.png` the ground from three metres out to the horizon is one noise octave at one frequency — no rock outcrops, no drainage, no erosion channels, no ground-type transitions, no scatter. `15-orbit-limb.png` shows the same failure from orbit: continents are a uniform fine stipple with no mountain ranges, no river networks, and coastlines that are a hard binary threshold with noise fringing rather than a shelf. |
| 4 | Lighting | **3** | Key direction is readable (`08-anchor.png` rim on the dunes, `14-orbit-day.png` terminator) but there is no bounce and no ambient occlusion anywhere: in `06-surface-vista.png` the entire character shadow side clips to pure black with zero readable detail, and in `08-anchor.png` the anchor base at (915–990, 430–445) meets the ground with no darkening whatsoever, so it reads as pasted on. |
| 5 | Shadows | **1** | There are no cast shadows in any game shot. The character in `05-surface-wide.png` casts nothing onto the sand directly beneath it; the anchor tower in `08-anchor.png` casts nothing despite a clearly directional key; the rocks scattered across `08-anchor.png` (e.g. at (620,405), (1290,395), (1450,350)) each sit on the surface with no contact shadow at all. |
| 6 | Atmosphere / volumetrics | **2** | No aerial perspective on the surface — in `07-first-person.png` the ridge at (600–900, 260–330) is the same contrast and saturation as sand two metres from camera. In orbit the terminator in `14-orbit-day.png` goes from lit blue to pure black across roughly ten pixels with no scattering band and no atmospheric halo extending past the silhouette; every AAA reference in this class renders a visible blue-to-orange limb gradient and an outward glow. |
| 7 | Post-processing | **3** | The motion blur in `06-surface-vista.png` resolves into discrete ghost copies rather than a smear (see defect 2), the DOF in `04-creator-face.png` blurs the entire subject of a face close-up into unreadable mush, the film grain is a fixed ordered-dither weave rather than noise (defect 3), and the bloom on the anchor rings in `08-anchor.png` is an untextured symmetric blob with no lens character. |
| 8 | Colour grading | **4** | The 2D screens (`12-codex.png`, `13-pause.png`) do have a coherent cyan-on-near-black palette, but the 3D output is ungraded: clouds in `15-orbit-limb.png` clip to pure 255 white across large areas with no highlight roll-off, and shadow regions in `06-surface-vista.png` clip to pure black. That is raw render output, not a grade. |
| 9 | UI / menus / typography | **4** | The strongest area — `12-codex.png` and `13-pause.png` have real hierarchy, restrained tracking and disciplined spacing. But it fails on execution: `10-scan.png` top-right has two text blocks drawn into the same pixels and rendered illegible, `11-starmap.png` is a screen titled STARMAP that contains no map, an empty "KNOWN SYSTEMS 00" list and an empty "SYSTEM DOSSIER" panel, and `01-boot.png` is white-on-pale-blue at a contrast ratio where the body text is essentially invisible. |
| 10 | Artifacts | **1** | Six-plus distinct visible artifacts across the round; see the defect list. Per the rubric this alone caps the verdict at FAIL. |
| 11 | Character | **1** | Primitive assembly with no anatomy: `03-creator.png` shows a featureless sphere head, tube neck, capsule limbs and wedge feet with no hands, no hair, no cloth, no suit softgoods. `04-creator-face.png`, the shot that should verify face structure, contains no visible face at all. |
| 12 | Composition / scale | **3** | `08-anchor.png` is the only frame with real foreground/midground/background separation and a sense of a large object. `05-surface-wide.png` and `07-first-person.png` have a flat, uninterrupted horizon with no silhouette interest and nothing to read scale against; `14-orbit-day.png` composes the planet dead centre with no scale cue. |

### Capture integrity notes (flagged so they do not silently depress unrelated scores)

- **`09-companion-sky.png`, `10-scan.png`, `11-starmap.png` are compromised captures.** The full title menu (AETHERIUM wordmark, JACK IN / CONTINUE / STARMAP / CODEX / SETTINGS / CREDITS) is drawn on top of live gameplay and live HUD in all three. I have scored the 3D content in these frames but not treated the menu-over-gameplay layering itself as a UI design failure. The *text collision* in `10-scan.png` and `11-starmap.png` is a separate matter and is counted, because two competing text blocks writing to the same pixels is a defect no matter which layer is at fault.
- **`04-creator-face.png` appears to be a mistimed capture** — the entire 3D viewport including the background nebula is blurred while the UI panels are sharp, consistent with the shot landing mid-transition or mid-DOF-ramp. Category 11 is therefore scored from `03-creator.png`, `05-surface-wide.png` and `06-surface-vista.png` only, and I have not verified face structure at all.
- **`01-boot.png` may be a mistimed capture** — a near-uniform pale blue field with barely legible text, consistent with a white flash frame. If it is intentional, the contrast is unshippable; if it is a capture artifact, the boot sequence remains unverified.

## TOP DEFECTS (ranked, most damaging first)

### 1. No shadow casting anywhere in the game
**[SEVERITY: CRITICAL]**
- **What** — Not a single object in the game shots casts a shadow, and there is no ambient occlusion at any contact point.
- **Where** — `05-surface-wide.png`: the character at (760–900, 440–760) sits on lit sand with nothing beneath it. `08-anchor.png`: the anchor at (915–990, 130–445) casts nothing across the dunes, and the ~15 rocks between x=500 and x=1550, y=340–470 each float without contact darkening.
- **Why it breaks the illusion** — Cast shadow and contact occlusion are the primary depth and grounding cues in every reference title; Starfield and Deliver Us Mars both put a hard sun shadow plus a tight AO gradient at every object/ground junction. Without them the whole scene reads as sprites composited onto a backdrop, which is precisely how `08-anchor.png` reads now.
- **Suggested fix** — Add a `DirectionalLight` with `castShadow` enabled, a fitted orthographic shadow camera (cascade or a single tight frustum snapped to the player), PCF-soft filtering at 2048², and a normal-bias tuned to kill acne on the dune slopes. Independently, add a cheap screen-space AO pass (or, for the static props, bake a small darkening decal at each object's base) so contact points read even before shadows land.

### 2. Ghosted duplicate character and a detached floating limb
**[SEVERITY: CRITICAL]**
- **What** — The character renders as two offset copies, and a forearm has separated from the body entirely.
- **Where** — `06-surface-vista.png`, character at (670–930, 440–800). The dark silhouette body has a second, lighter copy of the same suit panels offset roughly 40 px to the right (visible down the torso and both legs), and a detached forearm/glove sits unattached in mid-air at approximately (835–930, 570–635). The sky in the same frame shows every star drawn as a dash rather than a point.
- **Why it breaks the illusion** — This is per-object motion blur accumulating with too few samples spaced too far apart, so it resolves into discrete ghosts instead of a continuous smear; the reference titles either use velocity-buffer motion blur with a reconstruction filter or none at all, and none of them produce a visible second copy of the player. A duplicated character is the single most attention-grabbing failure in the round.
- **Suggested fix** — Replace accumulation-style blur with a velocity-buffer approach: render object velocity to an RG16F target and do a tile-max/neighbour-max reconstruction blur in the composite pass. If that is too costly, clamp the blur to camera rotation only, cap the maximum blur radius at ~8 px, and exclude the player mesh from the blur mask entirely. Separately, investigate the detached forearm — that is skinning or parent-transform breakage, not blur.

### 3. Fixed-pattern ordered dither over the entire frame
**[SEVERITY: MAJOR]**
- **What** — Every frame is overlaid with a regular, static crosshatch/weave pattern rather than random grain, visible as a screen-door texture in every dark region.
- **Where** — Most legible in `02-title.png` in the black sky between stars (sampled at (900–1060, 600–700) at 6x, the weave is a perfectly periodic 2-px checker). The same pattern is present over the ground in `05-surface-wide.png`, over the anchor body in `08-anchor.png`, and over the background of `14-orbit-day.png`.
- **Why it breaks the illusion** — Film grain in the reference class is temporally varying and spatially random; a static periodic pattern reads as a display defect or a JPEG-era dither, and it will crawl and shimmer the moment the camera moves. It also flattens the anchor in `08-anchor.png` into a textured cutout.
- **Suggested fix** — Replace the ordered/Bayer dither with blue-noise sampled from a 64² tiling texture, offset per-frame by a golden-ratio sequence so it decorrelates temporally, and scale its amplitude by luminance so it lifts banding in near-blacks without sitting visibly on midtones. Amplitude should be at or below 1/255 in the mids.

### 4. Overlapping UI text rendered illegible
**[SEVERITY: MAJOR]**
- **What** — Two independent text blocks are drawn into the same screen region, interleaving letterforms into unreadable noise.
- **Where** — `10-scan.png`, top-right panel (1210–1590, 30–120): "Sync the Kestrel III anchors" is superimposed directly over "SHARD EU-LATTICE-07", and "OBJECTIVE" over "LINK STABLE". The same collision appears in `11-starmap.png` top-right, and the STARMAP header at (795–1070, 30–100) collides with the compass readout "045° SECTOR 00-00". A third instance: the ghost text "ANALYSING / 9%" bleeds through the Codex panel in `12-codex.png` at approximately (760–840, 605–640).
- **Why it breaks the illusion** — No shipped game UI allows two elements to occupy the same pixels. This immediately reads as a web page with two absolutely-positioned divs at the same coordinates, which is the exact impression a diegetic sci-fi HUD must avoid.
- **Suggested fix** — Give the HUD a single layout owner with explicit z-ordered, mutually exclusive regions, and make screen state a proper state machine so opening Scan/Starmap/Codex tears down or hides the conflicting HUD widgets rather than stacking a new layer on top. Reserve fixed safe-area rectangles for the top-right stack and assert at build time that no two registered widgets overlap.

### 5. Gold speckle fringe on the night side of the planet
**[SEVERITY: MAJOR]**
- **What** — A ragged band of bright gold/orange pixels runs along the unlit limb, partly extending into the black of space beyond the planet silhouette.
- **Where** — `16-orbit-crescent.png`, left limb, roughly (485–560, 370–670). At 3x it is a sparse scatter of saturated gold dots that do not follow the surface, sitting outside the terminator.
- **Why it breaks the illusion** — This is either city-light emissive leaking past the NdotL mask or a specular term evaluating on back-facing/grazing texels; it makes the planet's edge look like it is disintegrating. A real night side in the reference class shows either clean city lights confined to landmass or nothing at all, and the silhouette edge stays hard.
- **Suggested fix** — Multiply the emissive/night-lights term by `smoothstep(-0.05, 0.15, dot(N, L))` inverted, and clamp specular with a geometric shadowing term (`GGX` visibility) so grazing angles cannot produce energy. Also verify the emissive is masked by the land mask, not applied to ocean.

### 6. Blocky, straight-edged texture patches on the ice planet
**[SEVERITY: MAJOR]**
- **What** — The ice surface is composed of hard-edged polygonal patches of teal against grey with straight, geometric boundaries.
- **Where** — `17-orbit-ice.png`, clearest in the region (600–1050, 450–750); at 2x the patches are unmistakably straight-sided quads and triangles, e.g. the teal block at approximately (760–900, 530–620).
- **Why it breaks the illusion** — Real ice sheets and leads have fractal, curved, branching boundaries; straight polygon edges expose the underlying noise-cell or triangle-face structure and read as a texture generation bug. This is the single clearest "procedural" tell in the round.
- **Suggested fix** — The biome mask is being quantised on a cell or face basis. Move the biome/ice classification into the fragment shader on continuous world-space coordinates, domain-warp the input (`p += warpAmp * fbm(p * warpFreq)`) before thresholding, and replace the hard threshold with a `smoothstep` band whose width scales with the derivative so the transition stays soft at every LOD.

### 7. Character is unshaded primitive blockout
**[SEVERITY: MAJOR]**
- **What** — The player and the creator-screen avatar are assemblies of engine primitives with no anatomy, no hands, and no suit softgoods.
- **Where** — `03-creator.png`, character at (655–975, 290–765): perfect sphere helmet with a single specular dot, cylindrical segmented neck, capsule upper/lower arms terminating in orange cone stubs where hands should be, and wedge feet. `05-surface-wide.png` confirms the same read in-game.
- **Why it breaks the illusion** — This is a character creator, a screen whose entire purpose is showing off the character; presenting a mannequin of capsules against a reference class where suit fabric folds, hard-surface chest plates, articulated gloves and visor reflections are table stakes makes the fidelity gap unmissable.
- **Suggested fix** — Even without imported meshes, this is recoverable procedurally: build the suit from lathed profile curves rather than uniform capsules so limbs taper and joints have volume; add hands as five-digit low-poly clusters; inset panel seams as actual geometry (extruded loops) rather than painted cyan lines; give the visor a separate low-roughness, high-metalness material with an environment reflection so it stops reading as a matte ball. Add a normal map generated from the same procedural noise used elsewhere so fabric regions break up under the key light.

### 8. Single-octave ground with no macro variation
**[SEVERITY: MAJOR]**
- **What** — The walkable terrain is one noise frequency repeated uniformly from foreground to horizon.
- **Where** — `05-surface-wide.png`, ground across the entire lower two-thirds of frame (0–1600, 380–900); `07-first-person.png` shows the same pattern at the same apparent scale in both the near field at (0–600, 600–900) and the midground at (400–1000, 400–500).
- **Why it breaks the illusion** — Real terrain at these distances shows drainage channels, deflation hollows, rock scatter clustering along slope breaks, and a change in apparent detail scale with distance. Because there is no distance-dependent scale change here, the ground also destroys the sense of how far away the horizon is.
- **Suggested fix** — Composite at least three octaves at decade-separated frequencies, add a curvature/slope mask driving a second material (exposed rock on slopes above ~25°, fines in hollows), scatter instanced rocks with density weighted by slope and by a large-scale mask so they cluster, and drive the detail-noise UV scale by triplanar world position so it does not read as one tile size everywhere.

### 9. No aerial perspective and no atmospheric limb
**[SEVERITY: MINOR]**
- **What** — Distance does not desaturate or lift contrast on the surface, and the planet limb has no scattering halo.
- **Where** — `07-first-person.png`, the ridge at (600–900, 260–330) versus foreground sand at (0–400, 700–900) — same value range, same saturation. `14-orbit-day.png`, terminator at x≈1030–1060: lit surface to pure black in under ten pixels, and no glow outside the silhouette anywhere on the circumference.
- **Why it breaks the illusion** — This is the cheapest depth cue in the medium and its absence is why both surface shots read as flat. From orbit, the atmospheric ring is the signature look of the reference class.
- **Suggested fix** — Add exponential height fog with a scattering colour keyed to the sun direction (warmer toward the sun, cooler away) and an in-scattering term, and a separate additive atmosphere shell mesh at ~1.02× planet radius using a cheap analytic Rayleigh approximation with a Mie forward-scatter lobe so the limb glows and the terminator gains a blue-to-orange band.

### 10. Starmap screen contains no starmap
**[SEVERITY: MINOR]**
- **What** — A screen titled STARMAP / GALACTIC CARTOGRAPHY shows no cartography — the planet surface is still the backdrop, the "KNOWN SYSTEMS" list is empty with a count of 00, and the "SYSTEM DOSSIER" panel is an empty box.
- **Where** — `11-starmap.png`, entire frame; the empty list occupies (68–412, 110–770) and the empty dossier (1200–1530, 110–175).
- **Why it breaks the illusion** — Two large empty containers on a screen whose whole purpose is content presentation. Even if this is honest early-game state, a shipped title fills the frame with the galaxy volume and shows an explicit "no systems charted" empty state rather than a blank rectangle.
- **Suggested fix** — Render the actual galaxy point cloud behind the panels so the screen has subject matter regardless of survey progress, and give both empty containers a designed empty state (centred glyph plus one line of copy) instead of leaving the box blank.

## WHAT IS ALREADY AT THE BAR

Almost nothing, but three things are close enough to name honestly:

- **The typographic system in `12-codex.png` and `13-pause.png`.** The wide-tracked all-caps labels against sentence-case body copy, the thin cyan hairlines, the corner-bracket panel motif and the restraint in colour count are genuinely at shipped-game quality — this specific layout, with the classification and archive-index sub-panels bottom-right, would not look out of place in Elite Dangerous: Odyssey. It is let down by execution elsewhere, not by taste.
- **The cloud layer silhouettes in `14-orbit-day.png` and `16-orbit-crescent.png`.** The banding into latitudinal cyclonic streaks with correct hemispheric curl is plausible planetary meteorology and reads correctly at that distance. It fails on shading (no self-shadow, no shadow onto the surface) and on clipping to pure white, but the shapes themselves are right.
- **The AETHERIUM wordmark and main menu layout in `02-title.png`.** Confident letterspacing, a good subtitle rule, numbered menu entries with a restrained selection treatment, and the discipline to leave two-thirds of the frame to the background. This is the one frame in the round that I would accept as a shipped title screen if the background were replaced with something at reference fidelity.

Everything else — geometry, materials, terrain, lighting, shadows, atmosphere, character — is below the bar by a wide margin.

## CHEAPEST PATH TO THE BIGGEST GAIN

1. **Turn on shadows and add screen-space AO.** One `DirectionalLight` with `castShadow`, a tight fitted ortho frustum, PCF-soft at 2048², plus an SSAO pass in the composite. This is a few hours of work and it fixes the single most damaging failure in the round — every object in `05-surface-wide.png` and `08-anchor.png` currently floats, and shadows alone will ground the entire game. Nothing else on this list buys as much perceived fidelity per hour.

2. **Fix the three visible rendering bugs: motion blur ghosting, ordered dither, and UI text collision.** Disable per-object motion blur outright until it can be redone with a velocity buffer (`06-surface-vista.png`), swap the Bayer dither for temporally-offset blue noise (`02-title.png` and every other frame), and make screen state exclusive so the HUD and the menu/scan/starmap layers cannot co-render (`10-scan.png`, `11-starmap.png`). These are bug fixes rather than art, so they are cheap, and each one is currently a hard disqualifier on its own. Until they are gone no round can pass, regardless of how good the art gets.

3. **Add an atmosphere shell and height fog.** An additive shell mesh at 1.02× radius with an analytic Rayleigh/Mie approximation, plus sun-coloured exponential height fog on the surface. This is one shader each and it simultaneously fixes the dead terminator in `14-orbit-day.png`, the missing limb glow in all four orbital shots, and the total absence of aerial perspective in `07-first-person.png`. It is the highest-leverage *art* change available because atmosphere is the visual signature of this entire reference class, and its absence is why the orbital shots — the strongest work in the round — still read as tech demo rather than game.
