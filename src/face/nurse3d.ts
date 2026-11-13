/**
 * The 3D face (three.js, WebGL): a friendly nurse. A soft, warm-skinned head with chestnut hair
 * in a bun, a white nurse's cap with a green band and the Empathika logo as a badge, small earrings,
 * and the collar of a green uniform. Empathika's eyes, lashes, brows, lips and blush are drawn exactly as on the
 * classic face (same expressions, blinks, gaze and lip-sync), in natural colours, onto a sheet that
 * hugs the front of the head; and the head moves in 3D: it turns to look around, tilts, and droops
 * when she sleeps. Her mood colour shows in her earrings and her collar pin.
 *
 * Built on Max's 3D face engine. This is browser code inserted into the face page's script (same
 * scope: g, W, H, cx, cy, R, info, params, demo, roundRect...). It's in the page's template string,
 * so: no backticks, no dollar-brace and no backslashes in it. If WebGL or the library isn't
 * available, or the box can't draw it smoothly, the page falls back to the classic face on its own.
 */
export const NURSE3D_JS = String.raw`
  // ---------- 3D nurse face ----------
  const R3 = { on: false, wanted: false, frames: 0, time: 0, lowered: false, gen: 0 };
  const VW = 768, VH = 675, VS = 1.5, VC = 20; // face texture size, pixels per design unit, design y of its centre
  const faceCv = document.createElement('canvas'); faceCv.width = VW; faceCv.height = VH;
  const vg = faceCv.getContext('2d');
  /** Half the screen height in 3D units: the head (radius 1) fills about half the screen, leaving room above and below for the clock and glance. */
  const VIEW_HALF = 2.3;

  /** Which face: 'classic' (flat) or the 3D nurse. */
  const CHARACTERS = ['nurse'];
  function faceChoice() {
    const p = params.get('face') || info.faceStyle || 'nurse';
    return p === 'classic' || CHARACTERS.indexOf(p) >= 0 ? p : 'nurse';
  }
  function wantRobot() {
    return faceChoice() !== 'classic';
  }

  async function startRobot() {
    R3.wanted = true;
    R3.style = faceChoice();
    const gen = ++R3.gen; // a newer start or a stop makes this one give up
    let THREE, RoomEnvironment;
    try {
      THREE = await import('/vendor/three.module.min.js');
      RoomEnvironment = (await import('/vendor/RoomEnvironment.js')).RoomEnvironment;
    } catch (e) { console.warn('3D face: library not available, using the classic face', e); return; }
    if (gen !== R3.gen) return;
    const c3 = document.createElement('canvas');
    c3.id = 'c3';
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: c3, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch (e) { console.warn('3D face: no WebGL, using the classic face', e); return; }
    document.body.insertBefore(c3, cv);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0, VIEW_HALF / Math.tan((14 * Math.PI) / 180));
    // Warm, soft lighting: a key light from the upper left, a gentle fill from below, a lilac rim behind.
    const key = new THREE.DirectionalLight(0xfff3e8, 1.6); key.position.set(-3.2, 3.2, 3.4); scene.add(key);
    scene.add(new THREE.HemisphereLight(0xfff1e6, 0x4a3a52, 0.7));
    const rim = new THREE.DirectionalLight(0xc8b4ff, 1.1); rim.position.set(2.6, 1.4, -3); scene.add(rim);

    const head = new THREE.Group();
    scene.add(head);
    const body = new THREE.Group();
    scene.add(body);
    const mat = (color, roughness, metalness, env) => new THREE.MeshStandardMaterial({ color: color, roughness: roughness, metalness: metalness || 0, envMapIntensity: env === undefined ? 0.6 : env });
    const deg = Math.PI / 180;
    const skin = mat(0xf2c4a2, 0.62, 0, 0.45);
    const hair = mat(0x6a3a24, 0.5, 0, 0.7);
    const white = mat(0xfbfaf8, 0.5, 0, 0.55);
    const teal = mat(0x3f7a44, 0.6, 0, 0.45); // the logo's green: her uniform, cap stripe and hair band
    // Her mood colour: her earrings and her collar pin.
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc8a5ff, emissiveIntensity: 1.6 });
    const add = (parent, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };

    // ----- the head -----
    const skull = add(head, new THREE.SphereGeometry(1, 64, 48), skin, 0, 0, 0);
    skull.scale.set(0.96, 1, 0.92);
    // a small nose
    const nose = add(head, new THREE.SphereGeometry(0.075, 24, 16), skin, 0, -0.06, 0.93);
    nose.scale.set(1, 0.9, 0.8);
    // ears, with little glowing earrings
    for (const sd of [-1, 1]) {
      const ear = add(head, new THREE.SphereGeometry(0.16, 24, 16), skin, sd * 0.94, -0.02, -0.02);
      ear.scale.set(0.45, 1, 0.7);
      add(head, new THREE.SphereGeometry(0.04, 16, 12), glow, sd * 0.97, -0.2, 0.02);
    }

    // The features: a transparent sheet hugging the front of the head, painted with the eyes, brows, mouth and blush.
    const fgeo = new THREE.PlaneGeometry(1.6, 1.4, 48, 42);
    const pos = fgeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const q = 1 - (x * x) / (0.96 * 0.96) - y * y;
      pos.setZ(i, 0.92 * Math.sqrt(Math.max(0, q)) + 0.012);
    }
    fgeo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(faceCv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.32,
      transparent: true, alphaTest: 0.02, roughness: 0.55, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    faceMat.envMapIntensity = 0.2;
    const featureSheet = new THREE.Mesh(fgeo, faceMat);
    featureSheet.renderOrder = 2;
    head.add(featureSheet);

    // ----- her hair: a cap of hair swept back from the forehead, the back down to the nape, a bun, and a side fringe -----
    const shellOf = (r, phiStart, phiLen, thetaStart, thetaLen) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 40, phiStart, phiLen, thetaStart, thetaLen), hair);
      m.scale.set(0.96, 1, 0.92);
      head.add(m);
      return m;
    };
    const top = shellOf(1.04, 0, Math.PI * 2, 0, Math.PI * 0.34);
    top.rotation.x = -18 * deg; // tilted back, so the forehead shows
    shellOf(1.035, Math.PI * 0.82, Math.PI * 1.36, Math.PI * 0.12, Math.PI * 0.6); // the back and sides, down to the nape
    // a soft side-swept fringe
    const fringe = add(head, new THREE.SphereGeometry(0.5, 40, 24), hair, -0.16, 0.7, 0.42);
    fringe.scale.set(1.15, 0.3, 0.75); fringe.rotation.z = 0.2; fringe.rotation.x = -0.55;
    // hair framing the face at the temples
    for (const sd of [-1, 1]) {
      const lock = add(head, new THREE.SphereGeometry(0.3, 24, 18), hair, sd * 0.82, 0.32, 0.3);
      lock.scale.set(0.55, 1.15, 0.7); lock.rotation.z = sd * 0.25;
    }
    // the bun, with a green band
    add(head, new THREE.SphereGeometry(0.34, 32, 24), hair, 0, 0.5, -0.86);
    const band = add(head, new THREE.TorusGeometry(0.22, 0.045, 12, 40), teal, 0, 0.42, -0.7);
    band.rotation.x = 0.9;

    // ----- the nurse's cap: a folded white band with a green stripe and the logo badge -----
    const cap = new THREE.Group();
    // A tall cap in the traditional shape, so the logo on its front is large enough to recognise.
    const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.5, 48, 1, true, -0.62 * Math.PI, 1.24 * Math.PI), white);
    capBand.material.side = THREE.DoubleSide;
    cap.add(capBand);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 48, 1, false, -0.62 * Math.PI, 1.24 * Math.PI), white);
    capTop.position.y = 0.25; cap.add(capTop);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.722, 0.742, 0.06, 48, 1, true, -0.6 * Math.PI, 1.2 * Math.PI), teal);
    stripe.material = teal.clone(); stripe.material.side = THREE.DoubleSide;
    stripe.position.y = -0.19; cap.add(stripe);
    // The Empathika logo on the front, in its own colours (not tinted by the lighting), leaning back with the cap.
    const emblem = new THREE.Group();
    const logoTex = new THREE.TextureLoader().load('/brand-logo.png');
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false }));
    logo.renderOrder = 3;
    emblem.add(logo);
    emblem.position.set(0, 0.05, 0.692);
    emblem.rotation.x = -0.235;
    cap.add(emblem);
    cap.position.set(0, 0.96, 0.02);
    cap.rotation.x = -22 * deg;
    head.add(cap);

    // ----- neck and the collar of her uniform (they don't turn with her head) -----
    add(body, new THREE.CylinderGeometry(0.3, 0.34, 0.7, 32), skin, 0, -1.05, -0.08);
    const shoulders = add(body, new THREE.CylinderGeometry(0.5, 1.25, 0.62, 48), teal, 0, -1.55, -0.1);
    shoulders.scale.z = 0.6;
    // the V of the neckline, and white piping along it
    for (const sd of [-1, 1]) {
      const lapel = add(body, new THREE.BoxGeometry(0.06, 0.5, 0.05), white, sd * 0.17, -1.36, 0.27);
      lapel.rotation.z = sd * 0.42; lapel.rotation.x = -0.5;
    }
    const vee = add(body, new THREE.ConeGeometry(0.2, 0.4, 3), skin, 0, -1.33, 0.24);
    vee.rotation.z = Math.PI; vee.rotation.x = -0.5; vee.scale.z = 0.25;
    // a collar pin (in her mood colour)
    add(body, new THREE.SphereGeometry(0.045, 16, 12), glow, 0.42, -1.48, 0.32);

    function resize3() {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize3); resize3();
    R3.resize = resize3;

    R3.c3 = c3; R3.renderer = renderer; R3.scene = scene; R3.camera = camera; R3.head = head; R3.body = body;
    R3.tex = tex; R3.faceMat = faceMat; R3.glow = glow; R3.key = key; R3.THREE = THREE;
    R3.on = true;
  }

  /** Paints the features (eyes, lashes, brows, mouth, blush) in natural colours, using the classic face's drawing. */
  function paintVisor(drawFeatures) {
    vg.setTransform(1, 0, 0, 1, 0, 0);
    vg.clearRect(0, 0, VW, VH);
    vg.translate(VW / 2, VH / 2 - VC * VS);
    vg.scale(VS, VS);
    const keep = g;
    g = vg;
    SKIN = true;
    try { drawFeatures(); } finally { SKIN = false; g = keep; }
  }

  /** Moves the head and draws the 3D scene for this frame. */
  function renderRobot(P, now, cmp, state, rgbCol) {
    const T = R3.THREE, h = R3.head, b = R3.body;
    const breathe = Math.sin(now / 1300);
    h.rotation.y = P.lx * 0.3 + Math.sin(now / 3900) * 0.025;
    h.rotation.x = P.ly * 0.2 + P.mo * 0.05 + (state === 'sleeping' ? 0.22 : 0);
    h.rotation.z = (-P.tilt * Math.PI) / 180;
    // While a card shows, the head moves up and shrinks (like the classic face); her shoulders go with it.
    const sc = (1 - cmp * 0.68) * (1 + breathe * 0.006);
    h.scale.set(sc, sc, sc);
    h.position.y = -0.06 * (1 - cmp) + breathe * 0.012 + cmp * VIEW_HALF * 0.64;
    b.scale.set(sc, sc, sc);
    b.position.y = h.position.y - breathe * 0.006;
    b.visible = cmp < 0.6;
    const c = new T.Color().setRGB(rgbCol[0] / 255, rgbCol[1] / 255, rgbCol[2] / 255, T.SRGBColorSpace);
    R3.glow.emissive.copy(c);
    R3.glow.emissiveIntensity = 1.1 + Math.max(0, P.ring) * 2.4;
    R3.faceMat.emissiveIntensity = 0.32 * P.bright;
    R3.key.intensity = 0.6 + 1.0 * P.bright;
    if (R3.paint) R3.tex.needsUpdate = true;
    R3.renderer.render(R3.scene, R3.camera);
    // The box can't keep up: lower the detail, then fall back to the classic face.
    if (params.get('perf') === 'off') return;
    R3.frames++;
    if (!R3.started) R3.started = now;
    const spent = now - R3.started;
    if (spent > 4000) {
      const fps = (R3.frames * 1000) / spent;
      R3.frames = 0; R3.started = now;
      if (fps < 20 && !R3.lowered) { R3.lowered = true; R3.renderer.setPixelRatio(0.6); console.warn('3D face: lowered detail (' + fps.toFixed(1) + ' fps)'); }
      else if (fps < 13 && R3.lowered) { stopRobot('too slow (' + fps.toFixed(1) + ' fps)'); }
    }
  }

  function stopRobot(why) {
    console.warn('3D face off: ' + why);
    R3.gen++;
    R3.on = false;
    if (R3.resize) removeEventListener('resize', R3.resize);
    if (R3.c3) R3.c3.remove();
    if (R3.renderer) R3.renderer.dispose();
    R3.c3 = undefined; R3.renderer = undefined; R3.resize = undefined;
    R3.frames = 0; R3.started = 0; R3.lowered = false;
  }

  /** Shows the chosen face: swaps between the 3D nurse and the classic face in place, no reload. */
  function applyFace() {
    const want = wantRobot() ? faceChoice() : 'classic';
    const have = R3.wanted ? R3.style : 'classic';
    if (want === have) return;
    if (R3.wanted) { stopRobot('switching to ' + want); R3.wanted = false; }
    if (want !== 'classic') startRobot();
  }
`;
