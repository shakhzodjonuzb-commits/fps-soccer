import * as THREE from 'three';

export const FIELD = { length: 105, width: 68, halfLength: 52.5, halfWidth: 34, goalWidth: 7.32, goalHeight: 2.44 } as const;

function line(points: THREE.Vector3[], material: THREE.Material): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}

export function buildStadium(scene: THREE.Scene, quality: 'low' | 'medium' | 'high'): void {
  scene.background = new THREE.Color('#9fc8e4');
  scene.fog = new THREE.Fog('#9fc8e4', 115, 230);
  scene.add(new THREE.HemisphereLight('#e9f6ff', '#3f6946', 1.25));
  const sun = new THREE.DirectionalLight('#fff5dd', quality === 'low' ? 1.5 : 2.2);
  sun.position.set(-38, 75, 25);
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  sun.shadow.camera.left = -75; sun.shadow.camera.right = 75; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  scene.add(sun);

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(190, 130), new THREE.MeshStandardMaterial({ color: '#235d38', roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.12; grass.receiveShadow = true; scene.add(grass);

  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.length, FIELD.width), new THREE.MeshStandardMaterial({ color: '#277647', roughness: 0.94, metalness: 0 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = -0.035; pitch.receiveShadow = true; scene.add(pitch);

  const stripeMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.045 });
  for (let i = 0; i < 10; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.length / 10, FIELD.width), stripeMaterial);
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(-FIELD.halfLength + FIELD.length / 20 + i * FIELD.length / 10, 0.003, 0);
    if (i % 2 === 0) scene.add(stripe);
  }
  const white = new THREE.LineBasicMaterial({ color: '#eaf5ee', transparent: true, opacity: 0.9 });
  const y = 0.035;
  const corners = [
    new THREE.Vector3(-FIELD.halfLength, y, -FIELD.halfWidth), new THREE.Vector3(FIELD.halfLength, y, -FIELD.halfWidth),
    new THREE.Vector3(FIELD.halfLength, y, FIELD.halfWidth), new THREE.Vector3(-FIELD.halfLength, y, FIELD.halfWidth),
  ];
  corners.push(corners[0]!);
  scene.add(line(corners, white));
  scene.add(line([new THREE.Vector3(0, y, -FIELD.halfWidth), new THREE.Vector3(0, y, FIELD.halfWidth)], white));
  const circle = Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2) * 9.15, y, Math.sin(i / 64 * Math.PI * 2) * 9.15));
  scene.add(line(circle, white));
  const spotMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const centerSpot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), spotMaterial);
  centerSpot.rotation.x = -Math.PI / 2; centerSpot.position.y = y; scene.add(centerSpot);
  for (const sign of [-1, 1]) {
    const x = sign * FIELD.halfLength;
    const goalAreaX = sign * (FIELD.halfLength - 5.5);
    const penaltyX = sign * (FIELD.halfLength - 16.5);
    for (const depth of [5.5, 16.5]) {
      const px = sign * (FIELD.halfLength - depth);
      const halfW = depth === 5.5 ? 9.16 : 20.16;
      scene.add(line([
        new THREE.Vector3(px, y, -halfW), new THREE.Vector3(x, y, -halfW), new THREE.Vector3(x, y, halfW), new THREE.Vector3(px, y, halfW),
      ], white));
    }
    void goalAreaX; void penaltyX;
    const penaltySpot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), spotMaterial);
    penaltySpot.rotation.x = -Math.PI / 2; penaltySpot.position.set(sign * (FIELD.halfLength - 11), y, 0); scene.add(penaltySpot);
    const arcPoints = Array.from({ length: 33 }, (_, i) => {
      const angle = Math.PI * (0.16 + i / 32 * 0.68);
      return new THREE.Vector3(sign * (FIELD.halfLength - 16.5) + Math.cos(angle) * 9.15, y, Math.sin(angle) * 9.15);
    });
    scene.add(line(arcPoints, white));
    buildGoal(scene, sign);
  }

  const standMat = new THREE.MeshStandardMaterial({ color: '#172d40', roughness: 0.86 });
  const upperMat = new THREE.MeshStandardMaterial({ color: '#25445a', roughness: 0.82 });
  for (const side of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(118, 8, 13), standMat);
    stand.position.set(0, 4, side * 43); stand.receiveShadow = true; scene.add(stand);
    for (let row = 0; row < 4; row++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(116 - row * 2, 1.4, 3), upperMat);
      tier.position.set(0, 8 + row * 1.55, side * (38 + row * 3.2)); scene.add(tier);
    }
  }
  for (const end of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 82), standMat);
    stand.position.set(end * 61, 4, 0); scene.add(stand);
  }
  buildCrowd(scene, quality);
  buildFloodlights(scene);
  buildAdvertisingBoards(scene);
}

function buildGoal(scene: THREE.Scene, sign: number): void {
  const metal = new THREE.MeshStandardMaterial({ color: '#f5f7f7', metalness: 0.42, roughness: 0.36 });
  const net = new THREE.MeshBasicMaterial({ color: '#dcebf1', wireframe: true, transparent: true, opacity: 0.32 });
  const x = sign * FIELD.halfLength;
  const z1 = -FIELD.goalWidth / 2, z2 = FIELD.goalWidth / 2;
  for (const z of [z1, z2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, FIELD.goalHeight, 10), metal);
    post.position.set(x, FIELD.goalHeight / 2, z); post.castShadow = true; scene.add(post);
  }
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, FIELD.goalWidth, 10), metal);
  cross.rotation.x = Math.PI / 2; cross.position.set(x, FIELD.goalHeight, 0); cross.castShadow = true; scene.add(cross);
  const netMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, FIELD.goalHeight, FIELD.goalWidth), net);
  netMesh.position.set(x + sign * 1.05, FIELD.goalHeight / 2, 0); scene.add(netMesh);
}

function buildCrowd(scene: THREE.Scene, quality: 'low' | 'medium' | 'high'): void {
  const count = quality === 'low' ? 320 : quality === 'medium' ? 720 : 1280;
  const geometry = new THREE.SphereGeometry(0.22, 5, 4);
  const palette = ['#e6e8eb', '#e0ae58', '#d66d5d', '#66a7d7', '#8a9d72', '#b7b6cb'];
  const material = palette.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  const groups = material.map((entry) => new THREE.InstancedMesh(geometry, entry, count));
  const dummy = new THREE.Object3D();
  const capacities = new Array(material.length).fill(0) as number[];
  for (let i = 0; i < count; i++) {
    const side = i % 4;
    const x = side < 2 ? (Math.random() - 0.5) * 112 : (side === 2 ? -1 : 1) * (57 + Math.random() * 7);
    const z = side < 2 ? (side === 0 ? -1 : 1) * (37 + Math.random() * 13) : (Math.random() - 0.5) * 78;
    const row = Math.floor(Math.random() * 4);
    const y = 9 + row * 1.5 + Math.random() * 0.8;
    const index = Math.floor(Math.random() * groups.length);
    dummy.position.set(x, y, z); dummy.scale.set(0.8, 1.2, 0.8); dummy.updateMatrix();
    const mesh = groups[index]!;
    mesh.setMatrixAt(capacities[index]!, dummy.matrix); capacities[index]++;
  }
  groups.forEach((mesh, i) => { mesh.count = capacities[i]!; mesh.instanceMatrix.needsUpdate = true; scene.add(mesh); });
}

function buildFloodlights(scene: THREE.Scene): void {
  const poleMaterial = new THREE.MeshStandardMaterial({ color: '#526473', metalness: 0.55, roughness: 0.4 });
  const lampMaterial = new THREE.MeshBasicMaterial({ color: '#fff8dd' });
  for (const x of [-48, 48]) for (const z of [-48, 48]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.42, 29, 8), poleMaterial);
    pole.position.set(x, 14.5, z); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 1.2), lampMaterial);
    lamp.position.set(x, 29, z); scene.add(lamp);
  }
}

function buildAdvertisingBoards(scene: THREE.Scene): void {
  const colors = ['#0a2740', '#0d5663', '#173f87', '#714c26'];
  for (let i = 0; i < 12; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.1, 0.22), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], emissive: colors[i % colors.length], emissiveIntensity: 0.12 }));
    board.position.set(-44 + i * 8, 0.62, -FIELD.halfWidth - 0.35); scene.add(board);
    const back = board.clone(); back.position.z = FIELD.halfWidth + 0.35; scene.add(back);
  }
}
