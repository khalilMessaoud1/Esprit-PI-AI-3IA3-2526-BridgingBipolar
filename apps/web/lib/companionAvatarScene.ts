/**
 * Companion 3D avatar — loads VRM via GLTFLoader + @pixiv/three-vrm, falls back to procedural mesh.
 * Place `.vrm` files next to where GLBs lived (e.g. graphrag/static → `/graphrag-static/models/*.vrm`).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRM,
  VRMUtils,
  VRMExpressionPresetName,
  VRMHumanBoneName,
  type VRMExpressionManager,
  type VRMHumanoid
} from "@pixiv/three-vrm";

import { getCompanionTtsVolume } from "./companionAvatarAudioBridge";

export type CompanionAvatarMode = "idle" | "listen" | "speak";

export type CompanionAvatarApi = {
  setMode: (m: CompanionAvatarMode) => void;
  setMouth: (t: number) => void;
  dispose: () => void;
  /** Populated after a successful `.vrm` load; `null` for placeholder */
  readonly vrm: VRM | null;
  /** Same as `vrm?.expressionManager` — reserved for blink / viseme wiring */
  readonly expressionManager: VRMExpressionManager | null;
  /** Same as `vrm?.humanoid` — reserved for bone-driven animation */
  readonly humanoid: VRMHumanoid | null;
};

type PlaceholderParts = {
  skin: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  body: THREE.Mesh;
  head: THREE.Group;
  skull: THREE.Mesh;
  jaw: THREE.Mesh;
};

/**
 * Raw humanoid arm bind pose + nodes. `VRMLoaderPlugin` loads with `autoUpdateHumanBones: false` so
 * `humanoid.update()` does not overwrite raw bones from the normalized rig (which stays T-pose on arms).
 */
const COMPANION_ARM_ROT_ORDER: THREE.EulerOrder = "YXZ";

/** Per-finger bone + bind Euler for a single joint. */
type FingerJoint = { bone: THREE.Object3D; bindX: number };

type VrmArmPoseRuntime = {
  hasRawBind: boolean;
  rawShoulderL: THREE.Object3D | null;
  rawShoulderR: THREE.Object3D | null;
  rawUpperL: THREE.Object3D | null;
  rawUpperR: THREE.Object3D | null;
  rawLowerL: THREE.Object3D | null;
  rawLowerR: THREE.Object3D | null;
  rawHandL: THREE.Object3D | null;
  rawHandR: THREE.Object3D | null;
  bindQShoulderL: THREE.Quaternion;
  bindQShoulderR: THREE.Quaternion;
  bindQUpperL: THREE.Quaternion;
  bindQUpperR: THREE.Quaternion;
  bindQLowerL: THREE.Quaternion;
  bindQLowerR: THREE.Quaternion;
  bindQHandL: THREE.Quaternion;
  bindQHandR: THREE.Quaternion;
  /** Bind rotations as Euler (VRoid / VRM0 rigs match local `rotation` better than quat multiply for arm drop). */
  bindEUpperL: THREE.Euler;
  bindEUpperR: THREE.Euler;
  bindELowerL: THREE.Euler;
  bindELowerR: THREE.Euler;
  bindEHandL: THREE.Euler;
  bindEHandR: THREE.Euler;
  /** Finger joints for natural rest-pose curling. */
  fingerJoints: FingerJoint[];
};

type RuntimeState = {
  placeholderParts: PlaceholderParts | null;
  vrm: VRM | null;
  /** Idle sway — **raw** head bone (required when `autoUpdateHumanBones` is off at load). */
  headBone: THREE.Object3D | null;
  jawBone: THREE.Object3D | null;
  /** Procedural relaxed pose + speech gestures */
  vrmArmPose: VrmArmPoseRuntime | null;
};

function createVrmAwareLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  // Register VRM extension handler so `gltf.userData.vrm` is populated for `.vrm` assets.
  // `autoUpdateHumanBones: false` — otherwise every `vrm.update()` copies normalized-rig T-pose onto raw skin bones and wipes our arm pose.
  loader.register(
    (parser) =>
      new VRMLoaderPlugin(parser, {
        autoUpdateHumanBones: process.env.NEXT_PUBLIC_VRM_AUTO_UPDATE_HUMAN_BONES === "1"
      })
  );
  return loader;
}

/**
 * After you replace `avatar-under16.vrm` / `avatar-over16.vrm` on disk, the **same URL** can still be served
 * from the **browser HTTP cache** or **THREE.Cache**. Set `NEXT_PUBLIC_VRM_CACHE_BUST` in `.env` and restart
 * Next (or hard-refresh) so requests use a new query string.
 */
function companionVrmRequestUrl(path: string): string {
  const bust =
    typeof process.env.NEXT_PUBLIC_VRM_CACHE_BUST === "string" ? process.env.NEXT_PUBLIC_VRM_CACHE_BUST.trim() : "";
  if (!bust) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}bbVrm=${encodeURIComponent(bust)}`;
}

/** Normalize height / grounding similar to previous GLB path */
function applyModelScaleAndPose(model: THREE.Object3D) {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const h = Math.max(0.001, size.y);
  const targetH = 1.7;
  const scale = targetH / h;
  model.scale.setScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  model.position.y += 0.95;
}

export function createCompanionAvatar(
  canvas: HTMLCanvasElement,
  options: { modelCandidates?: string[] } = {}
): CompanionAvatarApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  // MToon / VRM materials expect sRGB output + sensible tone mapping
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 1.35, 2.75);
  camera.lookAt(0, 1.08, 0);

  scene.add(new THREE.HemisphereLight(0xb8c8e8, 0x1a1a22, 0.92));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(2.2, 4.5, 3.0);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-2.5, 2.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x6eb8ff, 0.4);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);

  const runtime: RuntimeState = {
    placeholderParts: null,
    vrm: null,
    jawBone: null,
    headBone: null,
    vrmArmPose: null
  };

  const clock = new THREE.Clock();

  function clearLoadedAvatar() {
    if (runtime.vrm) {
      root.remove(runtime.vrm.scene);
      VRMUtils.deepDispose(runtime.vrm.scene);
      runtime.vrm = null;
    }
    runtime.jawBone = null;
    runtime.headBone = null;
    runtime.vrmArmPose = null;
  }

  function createEmptyVrmArmPose(): VrmArmPoseRuntime {
    const q = () => new THREE.Quaternion();
    const e = () => new THREE.Euler(0, 0, 0, COMPANION_ARM_ROT_ORDER);
    return {
      hasRawBind: false,
      rawShoulderL: null,
      rawShoulderR: null,
      rawUpperL: null,
      rawUpperR: null,
      rawLowerL: null,
      rawLowerR: null,
      rawHandL: null,
      rawHandR: null,
      bindQShoulderL: q(),
      bindQShoulderR: q(),
      bindQUpperL: q(),
      bindQUpperR: q(),
      bindQLowerL: q(),
      bindQLowerR: q(),
      bindQHandL: q(),
      bindQHandR: q(),
      bindEUpperL: e(),
      bindEUpperR: e(),
      bindELowerL: e(),
      bindELowerR: e(),
      bindEHandL: e(),
      bindEHandR: e(),
      fingerJoints: []
    };
  }

  function cloneBoneQuaternion(node: THREE.Object3D | null): THREE.Quaternion {
    return node ? node.quaternion.clone() : new THREE.Quaternion();
  }

  /** Spring joints fight procedural arm pose by snapping raw bones to bind T-pose each frame. */
  function stripCompanionSpringJoints(vrm: VRM): void {
    if (process.env.NEXT_PUBLIC_VRM_KEEP_SPRING_BONES === "1") return;
    const mgr = vrm.springBoneManager;
    if (!mgr) return;
    for (const joint of [...mgr.joints]) {
      mgr.deleteJoint(joint);
    }
  }

  /**
   * VRMSpringBone sets `bone.matrixAutoUpdate = false` on driven bones; removing joints does not undo that,
   * so local quaternion edits never reach the skinned mesh (arms stay in T-pose).
   */
  function reenableSkeletonBoneMatrixAutoUpdate(scene: THREE.Object3D): void {
    scene.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh && o.skeleton?.bones) {
        for (const b of o.skeleton.bones) {
          b.matrixAutoUpdate = true;
        }
      }
    });
  }

  function ensureAncestorsMatrixAutoUpdate(bone: THREE.Object3D): void {
    let o: THREE.Object3D | null = bone;
    while (o) {
      o.matrixAutoUpdate = true;
      o = o.parent;
    }
  }

  /** VRMC / VRoid node constraints can pin arm bones to rest each frame inside `vrm.update()`. */
  function stripCompanionConstraintsOnArms(vrm: VRM, pose: VrmArmPoseRuntime): void {
    const mgr = vrm.nodeConstraintManager;
    if (!mgr) return;
    const watched = new Set<THREE.Object3D>();
    for (const n of [
      pose.rawUpperL,
      pose.rawUpperR,
      pose.rawLowerL,
      pose.rawLowerR,
      pose.rawHandL,
      pose.rawHandR,
      pose.rawShoulderL,
      pose.rawShoulderR
    ]) {
      if (!n) continue;
      watched.add(n);
    }
    const nameLooksLikeArmDest = (name: string) =>
      /^J_Bip_[LR]_(UpperArm|LowerArm|Hand|Shoulder)(_end)?$/i.test(name) ||
      /^(left|right)(Upper|Lower)Arm$/i.test(name) ||
      /^(left|right)Hand$/i.test(name);
    for (const c of [...mgr.constraints]) {
      const dest = c.destination;
      if (!dest) continue;
      if (watched.has(dest) || nameLooksLikeArmDest(dest.name ?? "")) {
        mgr.deleteConstraint(c);
      }
    }
  }

  /** When humanoid mapping is missing, match common VRM / Mixamo skeleton bone names on skinned meshes. */
  function findUpperArmSkinBone(root: THREE.Object3D, side: "left" | "right"): THREE.Bone | null {
    const patterns =
      side === "left"
        ? [
            /j_bip_l_upperarm/i,
            /leftupperarm/i,
            /\bleft_arm\b/i,
            /mixamorig:leftarm\b/i,
            /\bupperarm_l\b/i,
            /\barm_stretch_l\b/i,
            /\bupper_arm_l\b/i
          ]
        : [
            /j_bip_r_upperarm/i,
            /rightupperarm/i,
            /\bright_arm\b/i,
            /mixamorig:rightarm\b/i,
            /\bupperarm_r\b/i,
            /\barm_stretch_r\b/i,
            /\bupper_arm_r\b/i
          ];
    let hit: THREE.Bone | null = null;
    root.traverse((o) => {
      if (hit) return;
      if (!(o instanceof THREE.SkinnedMesh) || !o.skeleton?.bones) return;
      for (const b of o.skeleton.bones) {
        const n = b.name || "";
        for (const re of patterns) {
          if (re.test(n)) {
            hit = b;
            return;
          }
        }
      }
    });
    return hit;
  }

  /**
   * Capture raw-skinned bind rotations (T-pose from file), then strip springs so we can drive arms reliably.
   */
  function setupVrmRelaxedPoseAndArmState(vrm: VRM) {
    stripCompanionSpringJoints(vrm);
    reenableSkeletonBoneMatrixAutoUpdate(vrm.scene);
    const h = vrm.humanoid;
    const pose = createEmptyVrmArmPose();
    runtime.vrmArmPose = pose;

    pose.rawShoulderL = h.getRawBoneNode(VRMHumanBoneName.LeftShoulder);
    pose.rawShoulderR = h.getRawBoneNode(VRMHumanBoneName.RightShoulder);
    pose.rawUpperL = h.getRawBoneNode(VRMHumanBoneName.LeftUpperArm) ?? findUpperArmSkinBone(vrm.scene, "left");
    pose.rawUpperR = h.getRawBoneNode(VRMHumanBoneName.RightUpperArm) ?? findUpperArmSkinBone(vrm.scene, "right");
    pose.rawLowerL = h.getRawBoneNode(VRMHumanBoneName.LeftLowerArm);
    pose.rawLowerR = h.getRawBoneNode(VRMHumanBoneName.RightLowerArm);
    pose.rawHandL = h.getRawBoneNode(VRMHumanBoneName.LeftHand);
    pose.rawHandR = h.getRawBoneNode(VRMHumanBoneName.RightHand);

    pose.bindQShoulderL.copy(cloneBoneQuaternion(pose.rawShoulderL));
    pose.bindQShoulderR.copy(cloneBoneQuaternion(pose.rawShoulderR));
    pose.bindQUpperL.copy(cloneBoneQuaternion(pose.rawUpperL));
    pose.bindQUpperR.copy(cloneBoneQuaternion(pose.rawUpperR));
    pose.bindQLowerL.copy(cloneBoneQuaternion(pose.rawLowerL));
    pose.bindQLowerR.copy(cloneBoneQuaternion(pose.rawLowerR));
    pose.bindQHandL.copy(cloneBoneQuaternion(pose.rawHandL));
    pose.bindQHandR.copy(cloneBoneQuaternion(pose.rawHandR));

    const ro = COMPANION_ARM_ROT_ORDER;
    const captureE = (node: THREE.Object3D | null, e: THREE.Euler) => {
      if (!node) {
        e.set(0, 0, 0, ro);
        return;
      }
      e.setFromQuaternion(node.quaternion, ro);
    };
    captureE(pose.rawUpperL, pose.bindEUpperL);
    captureE(pose.rawUpperR, pose.bindEUpperR);
    captureE(pose.rawLowerL, pose.bindELowerL);
    captureE(pose.rawLowerR, pose.bindELowerR);
    captureE(pose.rawHandL, pose.bindEHandL);
    captureE(pose.rawHandR, pose.bindEHandR);

    pose.hasRawBind = !!(pose.rawUpperL && pose.rawUpperR);

    // ── Collect finger joints for rest-pose curling ──────────────────────────
    // VRM 1.0: thumbs use Metacarpal instead of Intermediate; other fingers have Proximal/Intermediate/Distal
    const FINGER_BONE_NAMES: VRMHumanBoneName[] = [
      VRMHumanBoneName.LeftThumbMetacarpal, VRMHumanBoneName.LeftThumbProximal, VRMHumanBoneName.LeftThumbDistal,
      VRMHumanBoneName.LeftIndexProximal, VRMHumanBoneName.LeftIndexIntermediate, VRMHumanBoneName.LeftIndexDistal,
      VRMHumanBoneName.LeftMiddleProximal, VRMHumanBoneName.LeftMiddleIntermediate, VRMHumanBoneName.LeftMiddleDistal,
      VRMHumanBoneName.LeftRingProximal, VRMHumanBoneName.LeftRingIntermediate, VRMHumanBoneName.LeftRingDistal,
      VRMHumanBoneName.LeftLittleProximal, VRMHumanBoneName.LeftLittleIntermediate, VRMHumanBoneName.LeftLittleDistal,
      VRMHumanBoneName.RightThumbMetacarpal, VRMHumanBoneName.RightThumbProximal, VRMHumanBoneName.RightThumbDistal,
      VRMHumanBoneName.RightIndexProximal, VRMHumanBoneName.RightIndexIntermediate, VRMHumanBoneName.RightIndexDistal,
      VRMHumanBoneName.RightMiddleProximal, VRMHumanBoneName.RightMiddleIntermediate, VRMHumanBoneName.RightMiddleDistal,
      VRMHumanBoneName.RightRingProximal, VRMHumanBoneName.RightRingIntermediate, VRMHumanBoneName.RightRingDistal,
      VRMHumanBoneName.RightLittleProximal, VRMHumanBoneName.RightLittleIntermediate, VRMHumanBoneName.RightLittleDistal,
    ];
    // Proximal = 20°, Intermediate = 35°, Distal = 20° — gives naturally curled relaxed hand
    const CURL_BY_JOINT: Partial<Record<VRMHumanBoneName, number>> = {};
    for (const n of FINGER_BONE_NAMES) {
      const deg = n.toLowerCase().includes("proximal") ? 20 : n.toLowerCase().includes("intermediate") ? 35 : 20;
      CURL_BY_JOINT[n] = THREE.MathUtils.degToRad(deg);
    }
    pose.fingerJoints = [];
    for (const boneName of FINGER_BONE_NAMES) {
      const bone = h.getRawBoneNode(boneName);
      if (!bone) continue;
      ensureAncestorsMatrixAutoUpdate(bone);
      bone.matrixAutoUpdate = true;
      const curl = CURL_BY_JOINT[boneName] ?? THREE.MathUtils.degToRad(20);
      pose.fingerJoints.push({ bone, bindX: bone.rotation.x });
      // Apply initial curl immediately so VRM loads with relaxed hands
      bone.rotation.x = bone.rotation.x + curl;
      bone.updateMatrix();
    }

    if (process.env.NEXT_PUBLIC_VRM_AUTO_UPDATE_HUMAN_BONES !== "1") {
      vrm.humanoid.autoUpdateHumanBones = false;
    }

    stripCompanionConstraintsOnArms(vrm, pose);

    if (process.env.NODE_ENV === "development" && !pose.hasRawBind) {
      // eslint-disable-next-line no-console -- dev aid
      console.warn("[CompanionAvatar] Raw upper-arm bones missing; arms may stay in T-pose.");
    }
  }

  function applyArmEulerRelaxed(
    bone: THREE.Object3D | null,
    bindEuler: THREE.Euler,
    dx: number,
    dy: number,
    dz: number
  ): void {
    if (!bone) return;
    ensureAncestorsMatrixAutoUpdate(bone);
    bone.matrixAutoUpdate = true;
    bone.rotation.order = COMPANION_ARM_ROT_ORDER;
    bone.rotation.set(bindEuler.x + dx, bindEuler.y + dy, bindEuler.z + dz);
    bone.updateMatrix();
  }

  function refreshVrmSkinnedSkeletons(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh && o.skeleton) {
        o.skeleton.update();
      }
    });
  }

  /** Relaxed stand + speech wobble on **raw** arm bones after `vrm.update()` (requires loader `autoUpdateHumanBones: false`). */
  function applyCompanionArmPose(_dt: number) {
    const p = runtime.vrmArmPose;
    const vrm = runtime.vrm;
    if (!p?.hasRawBind || !vrm) return;

    const upperL = p.rawUpperL;
    const upperR = p.rawUpperR;
    const lowerL = p.rawLowerL;
    const lowerR = p.rawLowerR;
    const handL = p.rawHandL;
    const handR = p.rawHandR;
    const bUpperL = p.bindEUpperL;
    const bUpperR = p.bindEUpperR;
    const bLowerL = p.bindELowerL;
    const bLowerR = p.bindELowerR;
    const bHandL = p.bindEHandL;
    const bHandR = p.bindEHandR;

    /**
     * `NEXT_PUBLIC_VRM_ARM_DROP_AXIS=x|z|xz` — default **x** (safer). Large **z** + shoulder twists was pulling arms behind the back.
     * `RELAX_ARM_PITCH_DEG` = upper-arm pitch magnitude (deg). `PITCH_SIGN` flips direction if arms go wrong way.
     */
    // Default axis: "z" — for standard VRoid/VRM models, Z-axis rotation drops the arm to the side.
    // Override with NEXT_PUBLIC_VRM_ARM_DROP_AXIS if your model needs a different axis.
    const axisRaw = (process.env.NEXT_PUBLIC_VRM_ARM_DROP_AXIS ?? "z").trim().toLowerCase();
    // Default 82° brings T-pose arms (90° from body) close to vertical rest (parallel with body).
    const dropDeg =
      process.env.NEXT_PUBLIC_VRM_RELAX_ARM_PITCH_DEG != null && process.env.NEXT_PUBLIC_VRM_RELAX_ARM_PITCH_DEG !== ""
        ? Number.parseFloat(process.env.NEXT_PUBLIC_VRM_RELAX_ARM_PITCH_DEG)
        : 82;
    const drop = Number.isFinite(dropDeg) ? THREE.MathUtils.degToRad(dropDeg) : THREE.MathUtils.degToRad(82);
    const rawPitchSign =
      process.env.NEXT_PUBLIC_VRM_RELAX_ARM_PITCH_SIGN != null && process.env.NEXT_PUBLIC_VRM_RELAX_ARM_PITCH_SIGN !== ""
        ? Number.parseFloat(process.env.NEXT_PUBLIC_VRM_RELAX_ARM_PITCH_SIGN)
        : -1;
    const pitchSign = Number.isFinite(rawPitchSign) && rawPitchSign !== 0 ? Math.sign(rawPitchSign) : -1;

    const rawZSign =
      process.env.NEXT_PUBLIC_VRM_RELAX_ARM_Z_SIGN != null && process.env.NEXT_PUBLIC_VRM_RELAX_ARM_Z_SIGN !== ""
        ? Number.parseFloat(process.env.NEXT_PUBLIC_VRM_RELAX_ARM_Z_SIGN)
        : 1;
    const zSign = Number.isFinite(rawZSign) && rawZSign !== 0 ? Math.sign(rawZSign) : 1;

    const rollDeg =
      process.env.NEXT_PUBLIC_VRM_RELAX_ARM_ROLL_DEG != null && process.env.NEXT_PUBLIC_VRM_RELAX_ARM_ROLL_DEG !== ""
        ? Number.parseFloat(process.env.NEXT_PUBLIC_VRM_RELAX_ARM_ROLL_DEG)
        : 8;
    const roll = Number.isFinite(rollDeg) ? THREE.MathUtils.degToRad(rollDeg) : THREE.MathUtils.degToRad(8);

    let dlx = 0;
    let dly = 0;
    let dlz = 0;
    let drx = 0;
    let dry = 0;
    let drz = 0;
    if (axisRaw === "x") {
      dlx = drop * pitchSign;
      drx = drop * pitchSign;
      dlz = -roll * zSign;
      drz = roll * zSign;
    } else if (axisRaw === "xz") {
      dlx = drop * 0.5 * pitchSign;
      drx = drop * 0.5 * pitchSign;
      dlz = -drop * 0.35 * zSign;
      drz = drop * 0.35 * zSign;
    } else {
      /* z-primary — standard VRoid/VRM: Z rotation on upper arm drops it to the side.
         Positive Z on left arm, negative Z on right arm brings both down toward the body. */
      dlz = drop * zSign;
      drz = -drop * zSign;
    }

    /* Leave shoulders at bind — extra euler here skewed the whole chain backward */

    applyArmEulerRelaxed(upperL, bUpperL, dlx, dly, dlz);
    applyArmEulerRelaxed(upperR, bUpperR, drx, dry, drz);

    // For z-axis drop: small forward tuck so arms hang naturally near the hips
    if (axisRaw === "z" || axisRaw === "xz") {
      const tuck = THREE.MathUtils.degToRad(6) * pitchSign; // reduced from 12° — more vertical hang
      if (p.rawUpperL) { p.rawUpperL.rotation.x += tuck; p.rawUpperL.updateMatrix(); }
      if (p.rawUpperR) { p.rawUpperR.rotation.x += tuck; p.rawUpperR.updateMatrix(); }
    }

    // Forearm at rest: small bend (8°) so elbows aren't locked straight
    const fore = THREE.MathUtils.degToRad(8);
    applyArmEulerRelaxed(lowerL, bLowerL, fore, 0, 0);
    applyArmEulerRelaxed(lowerR, bLowerR, fore, 0, 0);
    // Hands: neutral, palms facing the thighs
    applyArmEulerRelaxed(handL, bHandL, THREE.MathUtils.degToRad(-2), 0, 0);
    applyArmEulerRelaxed(handR, bHandR, THREE.MathUtils.degToRad(-2), 0, 0);

    // ── Natural finger curl — re-apply every frame to override any VRM reset ──
    const CURL_MAP_PROXIMAL = THREE.MathUtils.degToRad(22);
    const CURL_MAP_INTER    = THREE.MathUtils.degToRad(38);
    const CURL_MAP_DISTAL   = THREE.MathUtils.degToRad(22);
    for (const fj of p.fingerJoints) {
      const name = fj.bone.name.toLowerCase();
      const curlDelta = name.includes("intermediate") ? CURL_MAP_INTER : name.includes("distal") ? CURL_MAP_DISTAL : CURL_MAP_PROXIMAL;
      fj.bone.rotation.x = fj.bindX + curlDelta;
      fj.bone.matrixAutoUpdate = true;
      fj.bone.updateMatrix();
    }

    // ── Explaining gestures during speech / TTS ──────────────────────────────
    const tts = getCompanionTtsVolume();
    const w = THREE.MathUtils.clamp(lipAaSmoothed * 0.9 + tts * 0.4, 0, 1);

    if (w > 0.02) {
      // Slow, deliberate alternating explain cycle (~14 s period — one arm then the other)
      const gPhase = Math.sin(t * 0.44); // −1 → +1 slowly
      const rGain = Math.max(0, gPhase) * w;   // right arm active
      const lGain = Math.max(0, -gPhase) * w;  // left arm active

      // Organic micro-tremor layered on top
      const tremR = Math.sin(t * 3.9 + 0.4) * 0.022 * w;
      const tremL = Math.sin(t * 3.3 + 1.2) * 0.022 * w;

      // Angle constants
      const LIFT = THREE.MathUtils.degToRad(46);  // upper arm rises from side
      const ELBOW = THREE.MathUtils.degToRad(44); // elbow bends / forearm extends forward
      const FWD   = THREE.MathUtils.degToRad(16); // arm swings slightly forward during gesture
      const HAND_EXT = THREE.MathUtils.degToRad(13); // wrist extends (hand opens slightly)

      const bump = (bone: THREE.Object3D | null, rx: number, ry: number, rz: number) => {
        if (!bone) return;
        bone.rotation.x += rx;
        bone.rotation.y += ry;
        bone.rotation.z += rz;
        bone.updateMatrix();
      };

      if (rGain > 0.01) {
        // ── RIGHT arm explains ───────────────────────────────────────────────
        // Upper arm: lift from side (add +zSign * LIFT to reduce the -82° rest toward -36°)
        bump(upperR, FWD * rGain + tremR, 0, LIFT * rGain * zSign);
        // Forearm: elbow bends upward as the arm rises (flex forward)
        bump(lowerR, ELBOW * rGain, 0, -0.06 * rGain * zSign);
        // Hand: slight wrist extension so palm faces the listener
        bump(handR, -HAND_EXT * rGain, -0.12 * rGain, 0);
        // Left arm: tiny sympathetic movement — stays mostly at rest
        bump(lowerL, 0.06 * rGain, 0, 0);
        bump(handL, -0.04 * rGain, 0, 0);
      }

      if (lGain > 0.01) {
        // ── LEFT arm explains ────────────────────────────────────────────────
        // Upper arm: lift from side (subtract zSign * LIFT to reduce +82° rest toward +36°)
        bump(upperL, FWD * lGain + tremL, 0, -LIFT * lGain * zSign);
        // Forearm: elbow bends upward
        bump(lowerL, ELBOW * lGain, 0, 0.06 * lGain * zSign);
        // Hand: slight wrist extension
        bump(handL, -HAND_EXT * lGain, 0.12 * lGain, 0);
        // Right arm: tiny sympathetic movement
        bump(lowerR, 0.06 * lGain, 0, 0);
        bump(handR, -0.04 * lGain, 0, 0);
      }
    }

    refreshVrmSkinnedSkeletons(vrm.scene);
  }

  function buildPlaceholder() {
    clearLoadedAvatar();
    const skin = new THREE.MeshStandardMaterial({
      color: 0xd8c4b4,
      roughness: 0.55,
      metalness: 0.05
    });
    const shirt = new THREE.MeshStandardMaterial({
      color: 0x3a6fa8,
      roughness: 0.65,
      metalness: 0.02
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.75, 8, 16), shirt);
    body.position.y = 0.95;
    root.add(body);

    const head = new THREE.Group();
    head.position.set(0, 1.62, 0);
    root.add(head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 24), skin);
    head.add(skull);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.22), skin);
    jaw.position.set(0, -0.16, 0.06);
    jaw.rotation.set(0, 0, 0);
    jaw.geometry.translate(0, -0.05, 0.04);
    head.add(jaw);

    runtime.placeholderParts = { skin, shirt, body, head, skull, jaw };
  }

  async function tryLoadVrmAvatar() {
    const loader = createVrmAwareLoader();
    const candidates = [
      ...(Array.isArray(options.modelCandidates) ? options.modelCandidates : []),
      "/avatars/companion.vrm",
      "/graphrag-static/companion.vrm",
      "/graphrag-static/models/companion.vrm"
    ];

    let lastError: unknown;
    const tried: string[] = [];
    for (const url of candidates) {
      if (!url.toLowerCase().endsWith(".vrm")) continue;
      const requestUrl = companionVrmRequestUrl(url);
      tried.push(requestUrl);
      try {
        THREE.Cache.remove(requestUrl);
        const gltf = await loader.loadAsync(requestUrl);
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm?.scene) {
          lastError = new Error(`Loaded ${requestUrl} but gltf.userData.vrm is missing (not a VRM 1.0 / supported file?)`);
          continue;
        }

        clearLoadedAvatar();
        if (runtime.placeholderParts) {
          const { skull, jaw, body, skin, shirt } = runtime.placeholderParts;
          skull.geometry.dispose();
          jaw.geometry.dispose();
          body.geometry.dispose();
          skin.dispose();
          shirt.dispose();
          runtime.placeholderParts = null;
        }

        runtime.vrm = vrm;
        // Camera sits at +Z looking at origin; many VRMs import with forward ≈ −Z, so default **π** turns them toward the user.
        // Set `NEXT_PUBLIC_VRM_YAW=0` (or any radians) if your file already faces the camera.
        const yawRaw = process.env.NEXT_PUBLIC_VRM_YAW;
        let yaw = Math.PI;
        if (yawRaw != null && String(yawRaw).trim() !== "") {
          const parsed = Number.parseFloat(String(yawRaw).trim());
          if (Number.isFinite(parsed)) yaw = parsed;
        }
        vrm.scene.rotation.y = yaw;
        applyModelScaleAndPose(vrm.scene);
        vrmIdleBaseScale = vrm.scene.scale.x;
        root.add(vrm.scene);

        runtime.headBone =
          vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head) ??
          vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head) ??
          null;
        runtime.jawBone =
          vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Jaw) ??
          vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Jaw) ??
          null;
        setupVrmRelaxedPoseAndArmState(vrm);

        return;
      } catch (err) {
        lastError = err;
      }
    }

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- intentional dev aid when only placeholder shows
      console.warn(
        "[CompanionAvatar] No .vrm could be loaded — showing the purple placeholder. " +
          "Put files in apps/web/public/avatars/ and/or run RAG on RAG_SERVICE_URL with graphrag/static. " +
          "Tried:\n",
        tried,
        "\nLast error:",
        lastError
      );
    }
    buildPlaceholder();
  }

  let mode: CompanionAvatarMode = "idle";
  let mouthOpen = 0;
  let t = 0;
  let disposed = false;
  let raf = 0;
  /** Uniform scale after `applyModelScaleAndPose` — used for subtle breathing on VRM root */
  let vrmIdleBaseScale = 1;
  let lipAaSmoothed = 0;

  type BlinkPhase = "wait" | "closing" | "opening";
  const blinkState: {
    phase: BlinkPhase;
    waitElapsed: number;
    nextWaitSec: number;
    weight: number;
  } = {
    phase: "wait",
    waitElapsed: 0,
    nextWaitSec: 2 + Math.random() * 3,
    weight: 0
  };

  function updateBlink(dt: number) {
    const em = runtime.vrm?.expressionManager;
    if (!em) return;
    const k = 14;
    if (blinkState.phase === "wait") {
      blinkState.waitElapsed += dt;
      blinkState.weight = THREE.MathUtils.lerp(blinkState.weight, 0, Math.min(1, dt * k));
      if (blinkState.waitElapsed >= blinkState.nextWaitSec) {
        blinkState.phase = "closing";
      }
    } else if (blinkState.phase === "closing") {
      blinkState.weight = THREE.MathUtils.lerp(blinkState.weight, 1, Math.min(1, dt * k * 1.65));
      if (blinkState.weight > 0.92) blinkState.phase = "opening";
    } else {
      blinkState.weight = THREE.MathUtils.lerp(blinkState.weight, 0, Math.min(1, dt * k * 1.25));
      if (blinkState.weight < 0.05) {
        blinkState.phase = "wait";
        blinkState.waitElapsed = 0;
        blinkState.nextWaitSec = 2 + Math.random() * 3;
      }
    }
    em.setValue(VRMExpressionPresetName.Blink, blinkState.weight);
  }

  function updateLipSync(dt: number) {
    const em = runtime.vrm?.expressionManager;
    if (!em) return;
    const tts = getCompanionTtsVolume();
    const manual = mode === "speak" ? mouthOpen : 0;
    const targetAa = Math.min(1, Math.max(tts * 0.96, manual));
    lipAaSmoothed = THREE.MathUtils.lerp(lipAaSmoothed, targetAa, Math.min(1, dt * 18));
    em.setValue(VRMExpressionPresetName.Aa, lipAaSmoothed);
  }

  function updateIdle(_dt: number) {
    if (!runtime.vrm) return;
    const breath = Math.sin(t * 2.1) * 0.005;
    runtime.vrm.scene.scale.setScalar(vrmIdleBaseScale * (1 + breath));
    if (runtime.headBone) {
      runtime.headBone.rotation.y = Math.sin(t * 0.9) * 0.05;
      runtime.headBone.rotation.x = Math.sin(t * 0.55) * 0.02;
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas.parentElement || canvas);

  function tick() {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    t += dt;

    const breath = Math.sin(t * 2.1) * 0.012;
    if (runtime.placeholderParts) {
      const { body, head } = runtime.placeholderParts;
      body.scale.set(1, 1 + breath * 6, 1);
      head.rotation.y = Math.sin(t * 0.9) * 0.06;
      head.rotation.x = Math.sin(t * 0.55) * 0.02;
    } else if (runtime.vrm) {
      updateBlink(dt);
      updateLipSync(dt);
      updateIdle(dt);
      runtime.vrm.update(dt);
      applyCompanionArmPose(dt);
    } else if (runtime.headBone) {
      runtime.headBone.rotation.y = Math.sin(t * 0.9) * 0.06;
      runtime.headBone.rotation.x = Math.sin(t * 0.55) * 0.02;
    }

    if (mode === "listen") {
      root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, 0.08, 0.08);
    } else {
      root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, 0, 0.08);
    }

    const targetMouth = mode === "speak" ? mouthOpen : 0;
    if (runtime.placeholderParts) {
      const { jaw } = runtime.placeholderParts;
      jaw.rotation.x = THREE.MathUtils.lerp(jaw.rotation.x, 0.15 + targetMouth * 0.55, 0.22);
    } else if (runtime.jawBone && !runtime.vrm?.expressionManager) {
      runtime.jawBone.rotation.x = THREE.MathUtils.lerp(runtime.jawBone.rotation.x, targetMouth * 0.55, 0.3);
    }

    renderer.render(scene, camera);
  }

  void tryLoadVrmAvatar().finally(() => {
    tick();
  });

  const api: CompanionAvatarApi = {
    setMode(m: CompanionAvatarMode) {
      if (m === "idle" || m === "listen" || m === "speak") mode = m;
    },
    setMouth(v: number) {
      mouthOpen = Math.max(0, Math.min(1, v));
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      clearLoadedAvatar();
      renderer.dispose();
      if (runtime.placeholderParts) {
        const { skull, jaw, body, skin, shirt } = runtime.placeholderParts;
        skull.geometry.dispose();
        jaw.geometry.dispose();
        body.geometry.dispose();
        skin.dispose();
        shirt.dispose();
        runtime.placeholderParts = null;
      }
    },
    get vrm() {
      return runtime.vrm;
    },
    get expressionManager() {
      return runtime.vrm?.expressionManager ?? null;
    },
    get humanoid() {
      return runtime.vrm?.humanoid ?? null;
    }
  };

  return api;
}
