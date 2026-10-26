/**
 * turngl — WebGL 3D PDF Flipbook
 * https://github.com/ogi/turngl
 * MIT License
 */

import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const eio   = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/* ══════════════════════════════════════════════════════════════
   Book3D — Three.js WebGL renderer
   Handles geometry, curl deformation, lighting, render loop
══════════════════════════════════════════════════════════════ */
export class Book3D {
  constructor(canvas, options = {}) {
    this.PW   = options.pageWidth  ?? 1.65;
    this.PH   = options.pageHeight ?? 2.33;
    this.SEGS = options.segments   ?? 32;
    this._dark = options.theme !== 'light';
    this._camT = { x: 0, y: 0 };
    this._camC = { x: 0, y: 0 };
    this._camZ = 6.0;

    this._initRenderer(canvas);
    this._initScene();
    this._initFlipGeom();
    this._loop();
  }

  /* ── Renderer ──────────────────────────────────────────── */
  _initRenderer(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true
    });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0, 0);
    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    this.camera.position.set(0, 0, this._camZ);
  }

  /* ── Scene objects ─────────────────────────────────────── */
  _initScene() {
    const sc = this.scene;
    const { PW, PH } = this;

    this._amb = new THREE.AmbientLight(0xffffff, 0.5);
    sc.add(this._amb);

    const key = this._key = new THREE.DirectionalLight(0xfff8f0, 0.75);
    key.position.set(1.5, 3.5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top  =  5; key.shadow.camera.bottom = -5;
    key.shadow.radius = 4;
    sc.add(key);

    const fill = new THREE.PointLight(0xe8f0ff, 0.25);
    fill.position.set(-3, 0, 4);
    sc.add(fill);

    // Static pages
    this.meshL = this._pageMesh();
    this.meshL.position.x = -PW / 2;
    sc.add(this.meshL);

    this.meshR = this._pageMesh();
    this.meshR.position.x = PW / 2;
    sc.add(this.meshR);

    // Spine
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, PH + 0.02, 0.015),
      new THREE.MeshLambertMaterial({ color: 0x030202 })
    );
    spine.position.set(0, 0, 0.005);
    sc.add(spine);

    // Shadow floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    );
    floor.receiveShadow = true;
    floor.position.z = -0.06;
    sc.add(floor);
  }

  /* ── Flip geometry (subdivided for curl) ───────────────── */
  _initFlipGeom() {
    const { PW, PH, SEGS } = this;
    const g = this.flipGeom = new THREE.PlaneGeometry(PW, PH, SEGS, 1);
    const pos = g.attributes.position;
    this._nx = new Float32Array(pos.count);
    this._oy = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      this._nx[i] = pos.getX(i) / PW;
      this._oy[i] = pos.getY(i);
    }
    this._mFF = this._mat(this._blankCanvas());
    this.flipF = new THREE.Mesh(g, this._mFF);
    this.flipF.castShadow = true;
    this.flipF.visible = false;
    this.scene.add(this.flipF);

    this._mFB = this._mat(this._blankCanvas(), true);
    this.flipB = new THREE.Mesh(g, this._mFB);
    this.flipB.visible = false;
    this.scene.add(this.flipB);
  }

  /* ── Helpers ───────────────────────────────────────────── */
  _pageMesh() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(this.PW, this.PH),
      this._mat(this._blankCanvas())
    );
    m.receiveShadow = true;
    return m;
  }

  _mat(canvas, backSide = false) {
    const tex = new THREE.CanvasTexture(canvas);
    if (backSide) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = -1;
      tex.offset.x  = 1;
    }
    return new THREE.MeshLambertMaterial({
      map: tex,
      side: backSide ? THREE.BackSide : THREE.FrontSide
    });
  }

  _setTex(mat, canvas) {
    if (mat.map) mat.map.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    if (mat.side === THREE.BackSide) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = -1;
      tex.offset.x  = 1;
    }
    mat.map = tex;
    mat.needsUpdate = true;
  }

  _blankCanvas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 4;
    cv.getContext('2d').fillStyle = this._dark ? '#0d0b08' : '#d6d3cc';
    cv.getContext('2d').fillRect(0, 0, 4, 4);
    return cv;
  }

  /* ── Public API ────────────────────────────────────────── */

  /** Render two page canvases as the open spread */
  showSpread(leftCanvas, rightCanvas) {
    this._setTex(this.meshL.material, leftCanvas ?? this._blankCanvas());
    this._setTex(this.meshR.material, rightCanvas ?? this._blankCanvas());
    this.meshL.visible = true;
    this.meshR.visible = true;
  }

  /** Prepare a flip: front/back canvas textures + direction */
  prepFlip(dir, frontCanvas, backCanvas) {
    this._setTex(this._mFF, frontCanvas ?? this._blankCanvas());
    this._setTex(this._mFB, backCanvas  ?? this._blankCanvas());
    this.curl(0, dir);
    this.flipF.visible = true;
    this.flipB.visible = true;
    if (dir === 'fwd') this.meshR.visible = false;
    else               this.meshL.visible = false;
  }

  /** Hide flip mesh, restore static pages */
  endFlip() {
    this.flipF.visible = false;
    this.flipB.visible = false;
    this.meshL.visible = true;
    this.meshR.visible = true;
  }

  /**
   * Deform flip geometry to simulate page curl
   * @param {number} progress 0–1
   * @param {'fwd'|'bwd'} dir
   */
  curl(progress, dir) {
    const { PW, flipGeom, _nx, _oy } = this;
    const pos = flipGeom.attributes.position;
    const LEAD = 0.25;
    for (let i = 0; i < pos.count; i++) {
      const nx = _nx[i];
      const t  = dir === 'fwd' ? nx + 0.5 : 0.5 - nx;
      const d  = t * PW;
      const adjProg = progress * (1 + LEAD) - LEAD * 0.5;
      const vp = clamp(adjProg + (t - 0.5) * LEAD, 0, 1);
      const a  = vp * Math.PI;
      pos.setX(i, dir === 'fwd' ?  d * Math.cos(a) : -d * Math.cos(a));
      pos.setZ(i, d * Math.sin(a));
      pos.setY(i, _oy[i]);
    }
    pos.needsUpdate = true;
    flipGeom.computeVertexNormals();
  }

  /**
   * Animate a value with easeInOut
   * @param {number} from
   * @param {number} to
   * @param {number} duration ms
   * @param {Function} onTick
   * @param {Function} onDone
   */
  animate(from, to, duration, onTick, onDone) {
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      onTick(from + (to - from) * eio(t));
      if (t < 1) requestAnimationFrame(tick);
      else onDone();
    };
    requestAnimationFrame(tick);
  }

  /** Subtle camera tilt on mouse move (pass normalized -0.5…0.5 coords) */
  mouseLook(nx, ny) {
    this._camT.x =  ny * 0.14;
    this._camT.y = -nx * 0.16;
  }

  /** Zoom: adjusts camera Z distance */
  setZoom(factor) {
    this._camZ = clamp(6.0 / factor, 3, 10);
  }

  setTheme(dark) {
    this._dark = dark;
    this._amb.intensity = dark ? 0.50 : 0.72;
    this._key.intensity = dark ? 0.75 : 0.55;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    this.renderer.dispose();
  }

  /* ── Render loop ───────────────────────────────────────── */
  _loop() {
    this._rafId = requestAnimationFrame(() => this._loop());
    const { _camC, _camT } = this;
    _camC.x += (_camT.x - _camC.x) * 0.055;
    _camC.y += (_camT.y - _camC.y) * 0.055;
    this.camera.position.set(
      _camC.y * this._camZ * 0.12,
      _camC.x * this._camZ * 0.12,
      this._camZ
    );
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
}

/* ══════════════════════════════════════════════════════════════
   TurnGL Web Component — <turn-gl src="doc.pdf" theme="dark">
══════════════════════════════════════════════════════════════ */
