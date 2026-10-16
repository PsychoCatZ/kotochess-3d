import * as THREE from 'three';

// Процедурные коты-фигуры. Каждый тип — отдельный персонаж с экипировкой.
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

interface Palette {
  fur: number;
  furDark: number;
  eye: number;
  accent: number;
}

const PALETTES: Record<PieceColor, Palette> = {
  w: { fur: 0xe8e4da, furDark: 0xb8b2a4, eye: 0x3f7fd4, accent: 0xd9c27a },
  b: { fur: 0x2b2b33, furDark: 0x17171d, eye: 0xffb020, accent: 0x8a5a20 },
};

function mat(color: number, rough = 0.85, metal = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function addEars(head: THREE.Group, s: number, fur: THREE.Material) {
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.18 * s, 4), fur);
    ear.position.set(0.13 * s * side, 0.24 * s, 0);
    ear.rotation.z = -0.35 * side;
    head.add(ear);
  }
}

function addFace(head: THREE.Group, s: number, eyeColor: number, furDarkMat: THREE.Material) {
  const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.25, metalness: 0.1, emissive: eyeColor, emissiveIntensity: 0.55 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 12, 12), eyeMat);
    eye.position.set(0.09 * s * side, 0.04 * s, 0.14 * s);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 8, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    pupil.position.set(0.09 * s * side, 0.04 * s, 0.19 * s);
    head.add(pupil);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.03 * s, 3), furDarkMat);
  nose.position.set(0, -0.035 * s, 0.16 * s);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);
}

function addTail(root: THREE.Group, s: number, fur: THREE.Material, h: number, side = 1) {
  const tail = new THREE.Group();
  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.045 * s, 0.28 * s, 8), fur);
  seg1.position.y = 0.14 * s;
  tail.add(seg1);
  const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * s, 0.035 * s, 0.22 * s, 8), fur);
  seg2.position.set(0, 0.36 * s, 0.06 * s);
  seg2.rotation.x = -0.5;
  tail.add(seg2);
  tail.position.set(-0.16 * s * side, h, -0.08 * s);
  tail.rotation.z = -0.5 * side;
  root.add(tail);
  return tail;
}

function addLegs(root: THREE.Group, s: number, fur: THREE.Material, h: number, wide = 0.14) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.055 * s, h, 8), fur);
    leg.position.set(sx * wide * s, h / 2, sz * 0.09 * s);
    root.add(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 8), fur);
    paw.position.set(sx * wide * s, 0.03 * s, sz * 0.09 * s + 0.02 * s);
    root.add(paw);
  }
}

function baseBody(root: THREE.Group, s: number, fur: THREE.Material, furDark: THREE.Material, len = 0.3, rad = 0.2, h = 0.26) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(rad * s, len * s, 6, 12), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = h + rad * s * 0.9;
  root.add(body);
  // грудка
  const chest = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.75 * s, 12, 12), furDark);
  chest.position.set(0, h + rad * s * 0.8, 0.18 * s);
  chest.scale.set(0.9, 0.9, 0.6);
  root.add(chest);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 16, 16), fur);
  head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.085 * s, 12, 12), furDark);
  muzzle.position.set(0, -0.04 * s, 0.13 * s);
  muzzle.scale.set(1.15, 0.75, 0.9);
  head.add(muzzle);
  head.position.set(0, h + 0.32 * s, 0.26 * s);
  addEars(head, s, fur);
  addFace(head, s, 0, furDark); // глаза докрасим отдельно
  root.add(head);
  return { head };
}

function buildCat(type: PieceType, color: PieceColor): THREE.Group {
  const p = PALETTES[color];
  const fur = mat(p.fur);
  const furDark = mat(p.furDark);
  const gold = mat(p.accent, 0.35, 0.7);
  const dark = mat(0x3a3a44, 0.6, 0.3);
  const root = new THREE.Group();
  root.userData.type = type;
  root.userData.color = color;

  // шкала размеров по типу фигуры
  const scale: Record<PieceType, number> = { p: 0.78, n: 0.95, b: 1.0, r: 1.08, q: 1.18, k: 1.24 };
  const s = scale[type];

  // пьедестал-основание: визуально «приземляет» фигуру на клетку
  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.38 * s, 0.07, 20), mat(p.furDark, 0.6, 0.15));
  baseDisc.position.y = 0.035;
  root.add(baseDisc);
  const baseRim = new THREE.Mesh(new THREE.TorusGeometry(0.35 * s, 0.025, 8, 24), gold);
  baseRim.rotation.x = Math.PI / 2;
  baseRim.position.y = 0.07;
  root.add(baseRim);

  switch (type) {
    case 'p': {
      // кот-боец: маленький, простой, с повязкой
      const { head } = baseBody(root, s, fur, furDark, 0.22, 0.16, 0.16);
      addLegs(root, s, fur, 0.16);
      addTail(root, s, fur, 0.22);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.155 * s, 0.028 * s, 8, 20), mat(color === 'w' ? 0xc33c2e : 0x8a1f1f, 0.7));
      band.rotation.x = Math.PI / 2 - 0.35;
      band.position.copy(head.position).add(new THREE.Vector3(0, 0.03 * s, 0.02 * s));
      root.add(band);
      break;
    }
    case 'r': {
      // бронированный кот: шлем, наплечники, массивный
      const { head } = baseBody(root, s, fur, furDark, 0.34, 0.23, 0.28);
      addLegs(root, s, fur, 0.28, 0.17);
      addTail(root, s, fur, 0.34);
      const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * s, 0.2 * s, 0.14 * s, 12), dark);
      helmet.position.copy(head.position).add(new THREE.Vector3(0, 0.1 * s, 0));
      root.add(helmet);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.06 * s, 0.05 * s), gold);
      visor.position.copy(head.position).add(new THREE.Vector3(0, 0.06 * s, 0.17 * s));
      root.add(visor);
      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark);
        pauldron.position.set(side * 0.24 * s, 0.56 * s, 0.02 * s);
        root.add(pauldron);
      }
      break;
    }
    case 'n': {
      // кот-всадник: шлем в форме конской головы — сразу читается как «конь»
      const { head } = baseBody(root, s, fur, furDark, 0.3, 0.19, 0.24);
      addLegs(root, s, fur, 0.24);
      addTail(root, s, fur, 0.3);
      const helm = new THREE.Group();
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.1 * s, 0.24 * s), fur);
      snout.position.set(0, -0.02 * s, 0.2 * s);
      helm.add(snout);
      const mane = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.3 * s, 0.3 * s), mat(color === 'w' ? 0x9c6b3c : 0x5a3a1e));
      mane.position.set(0, 0.05 * s, -0.02 * s);
      helm.add(mane);
      for (const side of [-1, 1]) {
        const he = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.12 * s, 4), fur);
        he.position.set(0.09 * s * side, 0.12 * s, 0.22 * s);
        helm.add(he);
      }
      helm.position.copy(head.position);
      root.add(helm);
      const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.5 * s, 6), mat(0x8a6a3a, 0.7));
      lance.position.set(0.22 * s, 0.45 * s, 0.1 * s);
      lance.rotation.z = -0.3;
      root.add(lance);
      break;
    }
    case 'b': {
      // кот-мудрец: высокий колпак мага и посох со сферой
      const { head } = baseBody(root, s, fur, furDark, 0.3, 0.18, 0.26);
      addLegs(root, s, fur, 0.26, 0.12);
      addTail(root, s, fur, 0.32);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.42 * s, 12), mat(color === 'w' ? 0x4a3f78 : 0x2c2547, 0.8));
      hat.position.copy(head.position).add(new THREE.Vector3(0, 0.3 * s, -0.02 * s));
      hat.rotation.x = 0.12;
      root.add(hat);
      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.15 * s, 0.025 * s, 8, 20), mat(color === 'w' ? 0x4a3f78 : 0x2c2547, 0.8));
      brim.rotation.x = Math.PI / 2;
      brim.position.copy(head.position).add(new THREE.Vector3(0, 0.11 * s, -0.01 * s));
      root.add(brim);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.62 * s, 6), mat(0x6a4a2a, 0.7));
      staff.position.set(0.22 * s, 0.34 * s, 0.14 * s);
      root.add(staff);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 10, 10), new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x2a8ac0, emissiveIntensity: 0.8 }));
      orb.position.set(0.22 * s, 0.68 * s, 0.14 * s);
      root.add(orb);
      break;
    }
    case 'q': {
      // кошка-командир: корона, накидка
      const { head } = baseBody(root, s, fur, furDark, 0.34, 0.2, 0.3);
      addLegs(root, s, fur, 0.3, 0.13);
      addTail(root, s, fur, 0.36);
      const cape = new THREE.Mesh(new THREE.ConeGeometry(0.3 * s, 0.55 * s, 12, 1, true), mat(color === 'w' ? 0x8c2f4a : 0x5a1c2e, 0.85));
      cape.position.set(0, 0.32 * s, -0.05 * s);
      root.add(cape);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.14 * s, 0.09 * s, 8, 1, true), gold);
      crown.position.copy(head.position).add(new THREE.Vector3(0, 0.2 * s, 0));
      root.add(crown);
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.08 * s, 4), gold);
        const a = (i / 5) * Math.PI * 2;
        spike.position.copy(head.position).add(new THREE.Vector3(Math.cos(a) * 0.125 * s, 0.28 * s, Math.sin(a) * 0.125 * s));
        root.add(spike);
      }
      break;
    }
    case 'k': {
      // главный кот с короной и скипетром
      const { head } = baseBody(root, s, fur, furDark, 0.36, 0.22, 0.32);
      addLegs(root, s, fur, 0.32, 0.15);
      addTail(root, s, fur, 0.4);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.16 * s, 0.11 * s, 8, 1, true), gold);
      crown.position.copy(head.position).add(new THREE.Vector3(0, 0.21 * s, 0));
      root.add(crown);
      for (let i = 0; i < 8; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.1 * s, 4), gold);
        const a = (i / 8) * Math.PI * 2;
        spike.position.copy(head.position).add(new THREE.Vector3(Math.cos(a) * 0.145 * s, 0.3 * s, Math.sin(a) * 0.145 * s));
        root.add(spike);
      }
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 10, 10), new THREE.MeshStandardMaterial({ color: 0xd43a5a, emissive: 0x8a1030, emissiveIntensity: 0.7 }));
      jewel.position.copy(head.position).add(new THREE.Vector3(0, 0.21 * s, 0.16 * s));
      root.add(jewel);
      const scepter = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * s, 0.022 * s, 0.5 * s, 6), gold);
      scepter.position.set(0.24 * s, 0.4 * s, 0.12 * s);
      scepter.rotation.z = -0.15;
      root.add(scepter);
      break;
    }
  }

  // глаза правильного цвета (в baseFace использовали заглушку)
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material.emissiveIntensity > 0.5 && o.material.color.getHex() === 0) {
      o.material = new THREE.MeshStandardMaterial({ color: p.eye, emissive: p.eye, emissiveIntensity: 0.55, roughness: 0.25 });
    }
  });

  return root;
}

export { buildCat };
