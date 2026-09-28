import * as THREE from 'three';

export function initSlushRibbon() {
  const canvas = document.getElementById('ribbonCanvas');
  if (!canvas) return;

  const scene = new THREE.Scene();
  let w = window.innerWidth;
  let h = window.innerHeight;

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(0, 0, 10.5);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // --- 1. SIGNATURE ELECTRIC BLUE INFLATABLE RIBBON ---
  // Large, thick, tubular 3D form wrapping across the center-hero
  const ribbonGeo = new THREE.TorusKnotGeometry(3.2, 0.95, 160, 36, 2, 3);
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0x4da2ff,
    roughness: 0.22,
    metalness: 0.15,
  });
  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.position.set(1.5, 0.2, -1.0);
  ribbonMesh.rotation.set(0.3, 0.5, 0.2);
  scene.add(ribbonMesh);

  // --- 2. EMBER HOT ACCENT CAPSULE / PILL (Ember #fb4903) ---
  const pillGeo = new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.55, 1.2, 16, 32) : new THREE.CylinderGeometry(0.55, 0.55, 1.4, 32);
  const pillMat = new THREE.MeshStandardMaterial({
    color: 0xfb4903,
    roughness: 0.25,
    metalness: 0.1,
  });
  const pillMesh = new THREE.Mesh(pillGeo, pillMat);
  pillMesh.position.set(4.8, 2.2, -1.2);
  pillMesh.rotation.set(0.6, 0.3, -0.7);
  scene.add(pillMesh);

  // --- 3. MINT POP INFLATABLE SPHERE (Mint Pop #55db9c) ---
  const sphereGeo = new THREE.SphereGeometry(1.05, 36, 36);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x55db9c,
    roughness: 0.25,
    metalness: 0.1,
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.position.set(-4.6, -1.8, -0.8);
  scene.add(sphereMesh);

  // --- 4. SUNBURST ROTATING RING (Sunburst #ffd731) ---
  const torusGeo = new THREE.TorusGeometry(1.15, 0.42, 28, 54);
  const torusMat = new THREE.MeshStandardMaterial({
    color: 0xffd731,
    roughness: 0.25,
    metalness: 0.1,
  });
  const torusMesh = new THREE.Mesh(torusGeo, torusMat);
  torusMesh.position.set(-3.8, 2.7, -1.5);
  torusMesh.rotation.set(0.9, 0.4, 0.3);
  scene.add(torusMesh);

  // --- 5. VOLTAGE VIOLET INFLATABLE DONUT (Voltage Violet #5c4ade) ---
  const violetGeo = new THREE.TorusGeometry(0.85, 0.35, 24, 48);
  const violetMat = new THREE.MeshStandardMaterial({
    color: 0x5c4ade,
    roughness: 0.28,
    metalness: 0.1,
  });
  const violetMesh = new THREE.Mesh(violetGeo, violetMat);
  violetMesh.position.set(4.2, -2.6, -1.4);
  violetMesh.rotation.set(0.4, 0.8, -0.5);
  scene.add(violetMesh);

  // --- STUDIO LIGHTING SYSTEM (Bright, saturated, high contrast) ---
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
  scene.add(ambientLight);

  const mainDirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  mainDirLight.position.set(6, 9, 8);
  scene.add(mainDirLight);

  const rimLight1 = new THREE.DirectionalLight(0xdceeff, 1.2);
  rimLight1.position.set(-8, -4, 4);
  scene.add(rimLight1);

  const rimLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
  rimLight2.position.set(0, -8, -4);
  scene.add(rimLight2);

  // --- INTERACTION & ANIMATION LOOP ---
  let targetRotX = 0;
  let targetRotY = 0;
  let scrollProgress = 0;

  function onScroll() {
    const scrollMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollProgress = window.scrollY / scrollMax;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  window.addEventListener('mousemove', (e) => {
    targetRotX = (e.clientY / window.innerHeight - 0.5) * 0.45;
    targetRotY = (e.clientX / window.innerWidth - 0.5) * 0.65;
  }, { passive: true });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Responsive, continuous rotation and floating
    ribbonMesh.rotation.x += (targetRotX + 0.3 + scrollProgress * 2.4 - ribbonMesh.rotation.x) * (dt * 2.6);
    ribbonMesh.rotation.y += (targetRotY + elapsed * 0.22 + scrollProgress * 3.0 - ribbonMesh.rotation.y) * (dt * 2.2);
    ribbonMesh.rotation.z += 0.08 * dt;

    // Breathing scale pulsation for inflatable vinyl effect
    const breath = 1 + Math.sin(elapsed * 1.5) * 0.035;
    ribbonMesh.scale.set(breath, breath, breath);

    // Floating animation of satellite 3D objects
    sphereMesh.position.y = -1.8 + Math.sin(elapsed * 1.4) * 0.5;
    sphereMesh.position.x = -4.6 + Math.cos(elapsed * 0.9) * 0.3;
    sphereMesh.rotation.y += dt * 0.5;

    torusMesh.position.y = 2.7 + Math.cos(elapsed * 1.3) * 0.4;
    torusMesh.rotation.x += dt * 0.6;
    torusMesh.rotation.y += dt * 0.7;

    pillMesh.position.y = 2.2 + Math.sin(elapsed * 1.6 + 1.2) * 0.45;
    pillMesh.rotation.z += dt * 0.8;
    pillMesh.rotation.x += dt * 0.5;

    violetMesh.position.y = -2.6 + Math.sin(elapsed * 1.2 + 2.0) * 0.4;
    violetMesh.rotation.x += dt * 0.4;
    violetMesh.rotation.y += dt * 0.6;

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    w = window.innerWidth;
    h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}
