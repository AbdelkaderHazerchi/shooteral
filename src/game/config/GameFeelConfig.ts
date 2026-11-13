/**
 * Centralized Game Feel Configuration (CS2-Inspired Competitive Tuning)
 * Adjust any parameter here to fine-tune movement responsiveness, camera dynamics,
 * learnable recoil patterns, viewmodel animations, audio/VFX polish, and reduced motion.
 */

export const GAME_FEEL_CONFIG = {
  // ------------------------------------------------------------------
  // 1. PLAYER MOVEMENT & PHYSICS
  // ------------------------------------------------------------------
  movement: {
    walkSpeed: 4.8,
    sprintSpeed: 7.8,
    crouchSpeed: 3.1,
    adsMaxSpeed: 3.6,
    scopedSpeed: 2.6,
    plantDefuseSpeed: 0.5,

    // Ground accel/decel: crisp start + fast counter-strafe stop with minimal slide
    groundAccel: 16.8,
    groundDecel: 22.0,
    // Controlled limited air-strafe responsiveness
    airAccel: 4.4,
    airDecel: 0.65,

    // Weighty jump: snappy ascent + heavier descent
    jumpVelocity: 5.45,
    gravityRise: 15.8,
    gravityFall: 22.0,

    // Smooth stance & eye height transitions
    eyeHeightStand: 1.7,
    eyeHeightCrouch: 1.06,
    crouchTransitionDamp: 13.5,

    // Collision & wall/corner sliding
    playerRadius: 0.44,
    stepUpLimit: 0.55,

    // Stop-to-shoot accuracy thresholds
    stopAccuracySpeed: 0.85,
    maxMoveInaccuracyMult: 2.25,
    airInaccuracyMult: 2.85,
    crouchInaccuracyMult: 0.68,
    adsInaccuracyMult: 0.28
  },

  // ------------------------------------------------------------------
  // 2. CAMERA DYNAMICS & MOTION COMFORT
  // ------------------------------------------------------------------
  camera: {
    // Subtle step-synced head-bob (almost vanishes on full sprint & ADS)
    headBobAmpY: 0.028,
    headBobAmpX: 0.016,
    headBobRoll: 0.0045,
    headBobWalkScale: 0.85,
    headBobSprintFade: 0.14, // fades out nearly completely at full sprint
    headBobAdsFade: 0.12, // fades out nearly completely in ADS
    headBobCrouchScale: 0.45,

    // Lateral strafe camera roll (subtle, smooth)
    strafeRollMax: 0.014,
    strafeRollDamp: 11.0,

    // Fall-height proportional landing shock dip
    landingDipScale: 0.0155,
    landingDipMax: 0.125,
    landingDipDamp: 15.0,
    landingDipPitchRatio: 0.24,

    // Smooth FOV transitions (relative to user baseFov)
    sprintFovBoost: 5.0,
    adsFov: 56,
    scopedFov: 20,
    fovDamp: 13.5,

    // Reduced Motion multipliers (when user enables Motion Sickness / Comfort mode)
    reducedMotion: {
      headBobMult: 0,
      strafeRollMult: 0,
      landingDipMult: 0.2,
      cameraShakeMult: 0.22,
      explosionShakeMult: 0.25,
      sprintFovBoostMult: 0,
      viewmodelBobMult: 0.18,
      viewmodelSwayMult: 0.35
    }
  },

  // ------------------------------------------------------------------
  // 3. LEARNABLE WEAPON RECOIL PATTERNS (CS2-style deterministic curves)
  // Each tuple is [yawOffset, pitchScale] per consecutive shot index.
  // ------------------------------------------------------------------
  recoil: {
    springReturnDamp: 13.5,
    rollReturnDamp: 15.0,
    bloomReturnDamp: 9.5,
    microJitterRatio: 0.12, // small organic variation around learnable curve
    patterns: {
      ak47: [
        [0.0, 0.85],
        [0.02, 0.95],
        [0.05, 1.05],
        [0.12, 1.1],
        [0.24, 1.0],
        [0.36, 0.88],
        [0.28, 0.72],
        [-0.08, 0.65],
        [-0.38, 0.58],
        [-0.52, 0.52],
        [-0.34, 0.48],
        [0.14, 0.46],
        [0.44, 0.44],
        [0.26, 0.42],
        [-0.22, 0.4]
      ],
      m4a1: [
        [0.0, 0.78],
        [-0.02, 0.86],
        [0.04, 0.92],
        [0.1, 0.95],
        [0.18, 0.88],
        [0.24, 0.76],
        [0.14, 0.64],
        [-0.12, 0.56],
        [-0.28, 0.5],
        [-0.24, 0.46],
        [-0.06, 0.44],
        [0.18, 0.42],
        [0.26, 0.4],
        [0.1, 0.38],
        [-0.16, 0.36]
      ],
      mp5: [
        [0.0, 0.65],
        [0.04, 0.72],
        [-0.05, 0.78],
        [-0.12, 0.75],
        [-0.18, 0.68],
        [0.06, 0.6],
        [0.2, 0.55],
        [0.16, 0.48],
        [-0.1, 0.44],
        [-0.22, 0.42]
      ],
      pistol: [
        [0.0, 1.0],
        [0.05, 0.95],
        [-0.06, 0.92],
        [0.08, 0.88],
        [-0.05, 0.85]
      ]
    } as Record<string, Array<[number, number]>>
  },

  // ------------------------------------------------------------------
  // 4. FIRST-PERSON WEAPON & HANDS ANIMATION
  // ------------------------------------------------------------------
  viewmodel: {
    equipDuration: 0.32,
    inspectDuration: 2.35,
    swaySensitivity: 0.44,
    swayMaxX: 0.026,
    swayMaxY: 0.024,
    swayDamp: 13.0,
    adsBlendDamp: 18.5,
    sprintBlendDamp: 12.0,
    inspectBlendDamp: 10.0,
    kickReturnDampZ: 21.0,
    kickReturnDampRot: 18.0,
    slideReturnDamp: 28.0
  },

  // ------------------------------------------------------------------
  // 5. VISUAL EFFECTS & PERFORMANCE BUDGETING
  // ------------------------------------------------------------------
  vfx: {
    muzzleFlashDuration: 0.032, // ultra-brief so sightline never gets blocked
    shellLifetime: 0.58,
    damageScreenFlashMs: 320,
    perfTargetFps: 45,
    minQualityScale: 0.35
  }
};
