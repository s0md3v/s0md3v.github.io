export const Config = {
    // World Settings
    WORLD: {
        GRID_SIZE: 4, // Higher accuracy (4x4px sub-tiles)
        VISUAL_GRID_SIZE: 16, // Visual asset scale
        SPATIAL_GRID_SIZE: 100, 
        WIDTH: 0, // Set at runtime
        HEIGHT: 0, // Set at runtime
        COMMAND_CHAOS_DURATION: 10000, // 10 seconds of chaos after leader death
        INTEL_GRID_SIZE: 75 // Constant physical resolution for 'vague' intelligence (pixels)
    },
    
    // Agent Settings
    AGENT: {
        RADIUS: 10,
        VISION_RADIUS: 400,
        FOV: Math.PI * 2 / 3, // 120 degrees
        TURN_SPEED: 0.15,
        MAX_TURN_SPEED: 0.05, // rad per frame? Let's use rad per frame for simplicity with lerp
        MOVE_SPEED: 45, // ~2.25 m/s (Tactical Jog)
        RUN_SPEED_MULTIPLIER: 1.5,
        
        // Reflexive/Erratic
        REFLEX_SPEED_MULT: 3.0,
        JITTER_THRESHOLD: 70, // Stress level to start jittering
        PANIC_SNAP_PROB: 0.02, // Probability per frame to snap look when stressed
        
        // Stamina
        STAMINA_DRAIN_MOVE: 0.002, // Legacy fallback
        STAMINA_DRAIN_RUN: 0.01,   // Legacy fallback
        
        MODES: {
            BOUNDING: { SPEED_MULT: 2.5, DRAIN: 0.015, TURN_MULT: 0.6 }, // ~5.6 m/s (Sprint)
            TACTICAL: { SPEED_MULT: 1.0, DRAIN: 0.002, TURN_MULT: 1.0 }, // ~2.2 m/s (Jog)
            SNEAKING: { SPEED_MULT: 0.5, DRAIN: 0.001, TURN_MULT: 1.2 }, // ~1.1 m/s (Walk)
            COVERING: { SPEED_MULT: 0.3, DRAIN: 0.004, TURN_MULT: 1.5 }  // ~0.7 m/s (Crawl/Creep)
        },

        STAMINA_RECOVERY_IDLE: 0.005,
        STAMINA_RECOVERY_WALK: 0.001,

        // Base Stats
        MAX_HP: 5,
        MAX_STAMINA: 100,
        MAX_STRESS: 100,
        MAX_SOCIAL: 100,
        BASELINE_MORALE: 50,
        
        // Stress & Cohesion (Real War: "Brotherhood" & "Safety in Numbers")
        COHESION_RADIUS: 150,
        COHESION_STRESS_RESISTANCE: 0.5, // 50% less stress gain when in squad
        UNCERTAINTY_STRESS_RATE: 0.001, 
        MORALE_STRESS_RESISTANCE: 0.4, 
        STRESS_SPIKE_SIGHT: 10, // Instant jump when seeing NEW enemy
        STRESS_DECAY_COHESIVE: 0.015, // Fast decay when with squad
        STRESS_DECAY_ISOLATED: 0.002, // Slow decay when alone
        
        LEADERSHIP_RANGE: 400,
        LEADER_BUFF_MORALE: 10, // per sec
        LEADER_BUFF_STRESS: -10, // per sec
        LEADER_DEATH_PENALTY: 50, // stress spike
        APPROVAL_LOSS_DEATH: 25,
        APPROVAL_GAIN_KILL: 10,
        APPROVAL_COWARDICE_PENALTY: 15, // per second if leader retreats while squad fights
        APPROVAL_MIN_MUTINY: 25,
        SUICIDE_ORDER_THRESHOLD: 5, // Heat level above which orders are questioned
        FATIGUE_EXERTION_RATE: 0.002, // Fatigue gain per second while sprinting
        STRESS_RELOAD_MULT: 1.8, // Reload takes 80% longer at max stress
        STRESS_ACCURACY_MULT: 0.3, // Accuracy decreases by 30% at max stress
        FROZEN_STRESS_THRESHOLD: 85, // Stress level where freezing can occur
        FROZEN_PROB_PER_HIT: 0.15, // Chance to freeze when suppressed/damaged
        FRIENDLY_FIRE_NEGLIGENCE_THRESHOLD: 75, // Stress level where FF checks are ignored
        CROSSFIRE_ANGLE_THRESHOLD: Math.PI / 2, // 90 degrees separation for crossfire bonus
        CROSSFIRE_STRESS_MULTIPLIER: 2.5, // 2.5x stress from crossfire
    },

    SENSORY: {
        DETECTION_RATE_BASE: 2.0, // Progress per second at ideal range/angle
        DETECTION_THRESHOLD: 1.0, // Meter value to "spot" target
        DETECTION_DECAY: 0.5, // Progress lost per second when out of sight
        FOVEA_ANGLE: 0.4, // Radians (approx 23 deg) - fast detection zone
        PERIPHERAL_DIST: 150, // Distance for 360-degree close-range awareness
        MOVEMENT_DETECTION_MULT: 3.0, // Multiplier for moving targets in periphery
        HEARING_STARTLE_SUPPRESSION: 15, // Suppression from loud nearby explosions/shots
    },

    // Role Loadouts
    ROLES: {
        RIFLEMAN: {
            hp: 5,
            speedMod: 1.0,
            weapon: { type: 'Rifle', range: 450, damage: 1, fireRate: 150, ammo: 30, maxAmmo: 30, initialCarriedAmmo: 120, projectileSpeed: 600 },
            utility: [{ type: 'FragGrenade', count: 1 }]
        },
        BREACHER: {
            hp: 8,
            speedMod: 1.1,
            weapon: { type: 'Shotgun', range: 180, damage: 3, fireRate: 800, ammo: 8, maxAmmo: 8, initialCarriedAmmo: 32, projectileSpeed: 500 },
            utility: [{ type: 'Flashbang', count: 2 }, { type: 'FragGrenade', count: 1 }]
        },
        MARKSMAN: {
            hp: 4,
            speedMod: 1.0,
            weapon: { type: 'Sniper', range: 900, damage: 5, fireRate: 1500, ammo: 5, maxAmmo: 5, initialCarriedAmmo: 25, projectileSpeed: 1000 },
            utility: [{ type: 'SmokeGrenade', count: 1 }]
        },
        GUNNER: {
            hp: 6,
            speedMod: 0.85,
            weapon: { type: 'LMG', range: 600, damage: 1, fireRate: 100, ammo: 100, maxAmmo: 100, initialCarriedAmmo: 300, spread: 0.12, projectileSpeed: 550 },
            utility: []
        },
        MEDIC: {
            hp: 5,
            speedMod: 1.05,
            weapon: { type: 'SMG', range: 300, damage: 1, fireRate: 100, ammo: 30, maxAmmo: 30, initialCarriedAmmo: 150, projectileSpeed: 450 },
            utility: [{ type: 'Medkit', count: 3 }, { type: 'SmokeGrenade', count: 2 }]
        }
    },

    // Physics/Combat
    PHYSICS: {
        COLLISION_SAMPLES: 4, 
        SOUND_RADIUS_GUNSHOT: 1200,
        SOUND_RADIUS_SHOUT: 800,
        SOUND_RADIUS_EXPLOSION: 1500,
        HEARING_THRESHOLD: 0.5, // Minimum intensity to react to a sound
        
        // Suppression
        SUPPRESSION_RADIUS: 40, // Distance from bullet for near-miss
        SUPPRESSION_STRESS: 2, // Stress per near-miss (Reduced)
        PINNED_THRESHOLD: 80, // Stress/Suppression level to be pinned
        
        // Utility
        GRENADE_RANGE: 250,
        SMOKE_DURATION: 10000,
        SMOKE_RADIUS: 60,
        FRAG_RADIUS: 80,
        FRAG_DAMAGE: 4,
        RELOAD_TIME: 2000,
        
        // Environment
        COVER_HP_WOOD: 20,
        COVER_HP_STONE: 100
    },

    // Weighing Factors for AI
    AI: {
        MEMORY_DECAY: 0.99, // Per second?
        STRESS_DECAY: 0.001,
        SOCIAL_DECAY_RATE: 0.01,
        SOCIAL_REFILL_RATE: 0.02,
        
        // Decision Weights
        WEIGHTS: {
            BASE_INERTIA: 0.5,
            SIGHT_ENEMY: 2.5,
            SUSPECTED_ENEMY: 1.5, // Heatmap/Sound
            PANIC_THRESHOLD: 95,
            PANIC_WEIGHT: 1.2,
            LOW_AMMO_WEIGHT: 2.5, // Desperation
            MEDKIT_PRIORITY: 3.0
        }
    }
};
