export const Config = {
    WORLD: {
        GRID_SIZE: 2,
        VISUAL_GRID_SIZE: 16,
        TILE_SIZE: 16,
        PATHFINDING_GRID_SIZE: 4,
        SPATIAL_GRID_SIZE: 100, 
        WIDTH: 0,
        HEIGHT: 0,
        COMMAND_CHAOS_DURATION: 1500, // ms
        INTEL_GRID_SIZE: 16
    },
    
    AGENT: {
        RADIUS: 6,
        PLAYER_COLLISION_RADIUS: 4,
        PLAYER_COVER_COLLISION_RADIUS: 2,
        VISION_RADIUS: 250,
        FOV: Math.PI * 2 / 3,
        TURN_SPEED: 2.8,
        MAX_TURN_SPEED: 3.5, 
        MOVE_SPEED: 22, // px/s, ~3 m/s
        RUN_SPEED_MULTIPLIER: 1.9,
        
        REFLEX_SPEED_MULT: 3.0,
        JITTER_THRESHOLD: 70,
        PANIC_SNAP_PROB: 0.02,
        
        STAMINA_DRAIN_MOVE: 0.001,
        STAMINA_DRAIN_RUN: 0.008,
        
        MODES: {
            BOUNDING: { SPEED_MULT: 1.9, DRAIN: 0.008, TURN_MULT: 0.4 }, // ~6 m/s, empties in ~12.5s
            TACTICAL: { SPEED_MULT: 1.0, DRAIN: 0.001, TURN_MULT: 1.0 },
            SNEAKING: { SPEED_MULT: 0.45, DRAIN: 0.000, TURN_MULT: 1.2 },
            COVERING: { SPEED_MULT: 0.30, DRAIN: 0.0002, TURN_MULT: 1.5 }
        },

        STAMINA_RECOVERY_IDLE: 0.004, // ~25s from empty
        STAMINA_RECOVERY_WALK: 0.0005, // ~3.3 min from empty

        MAX_HP: 5,
        MAX_STAMINA: 100,
        MAX_STRESS: 100,
        MAX_SOCIAL: 100,
        BASELINE_MORALE: 50,
        
        COHESION_RADIUS: 150,
        COHESION_STRESS_RESISTANCE: 0.3,
        BATTLE_BUDDY_RADIUS: 80,
        BATTLE_BUDDY_STRESS_RESISTANCE: 0.4,
        
        UNCERTAINTY_STRESS_RATE: 0.001, 
        MORALE_STRESS_RESISTANCE: 0.5,
        
        MORALE_GAIN_KILL: 15,
        MORALE_GAIN_WITNESS_KILL: 5,
        MORALE_LOSS_ALLY_DEATH: 15,
        MORALE_LOSS_FRIEND_DEATH: 30,
        
        MORALE_HEROIC_THRESHOLD: 85,
        MORALE_BROKEN_THRESHOLD: 15,
        HEROIC_BUFFS: {
            FIRE_RATE_MULT: 1.25,
            SPEED_MULT: 1.15,
            RELOAD_SPEED_MULT: 1.5,
            ACCURACY_BONUS: 0.1
        },
        BROKEN_DEBUFFS: {
            ACCURACY_MULT: 0.5,
            RELOAD_SPEED_MULT: 0.5
        },

        STRESS_SPIKE_SIGHT: 10,
        STRESS_SPIKE_ALLY_DEATH: 10,
        STRESS_SPIKE_FRIEND_DEATH: 30,
        
        STRESS_DECAY_COHESIVE: 0.05,
        STRESS_DECAY_ISOLATED: 0.01,
        
        LEADERSHIP_RANGE: 400,
        LEADER_BUFF_MORALE: 5,
        LEADER_BUFF_STRESS: -5,
        LEADER_DEATH_PENALTY: 40, 
        APPROVAL_LOSS_DEATH: 25,
        APPROVAL_GAIN_KILL: 10,
        APPROVAL_COWARDICE_PENALTY: 15, 
        APPROVAL_MIN_MUTINY: 25,
        SUICIDE_ORDER_THRESHOLD: 5, 
        FATIGUE_EXERTION_RATE: 0.002, 
        STRESS_RELOAD_MULT: 1.8, 
        STRESS_ACCURACY_MULT: 0.4,
        FROZEN_STRESS_THRESHOLD: 90, 
        FROZEN_PROB_PER_HIT: 0.15, 
        FRIENDLY_FIRE_NEGLIGENCE_THRESHOLD: 80, 
        CROSSFIRE_ANGLE_THRESHOLD: Math.PI / 2, 
        CROSSFIRE_STRESS_MULTIPLIER: 2.5,
    },

    SENSORY: {
        DETECTION_RATE_BASE: 2.0, // per second
        DETECTION_THRESHOLD: 1.0,
        DETECTION_DECAY: 0.5, // per second
        FOVEA_ANGLE: 0.4, // rad
        PERIPHERAL_DIST: 50,
        MOVEMENT_DETECTION_MULT: 3.0,
        HEARING_STARTLE_SUPPRESSION: 15,
        
        RADIO: {
            RANGE: 5000,
            NOISE: 120, // px, std dev
            DELAY: 1500, // ms
            COOLDOWN: 10000, // ms
            INTEL_INTENSITY: 0.5
        }
    },

    WEAPONS: {
        M4A1: { 
            name: "M4A1", type: 'Rifle', visualType: 'rifle', 
            range: 400, optimalRange: 200, 
            damage: 2, fireRate: 100,
            capacity: 30, reloadTime: 2500,
            spread: 0.03, handling: 0.8
        },
        M16A4: { 
            name: "M16A4", type: 'Rifle', visualType: 'rifle', 
            range: 500, optimalRange: 300, 
            damage: 2, fireRate: 200,
            capacity: 30, reloadTime: 2800,
            spread: 0.015, handling: 0.6
        },
        M249: { 
            name: "M249 SAW", type: 'LMG', visualType: 'lmg', 
            range: 450, optimalRange: 200, 
            damage: 2, fireRate: 80,
            capacity: 100, reloadTime: 6000,
            spread: 0.08, handling: 0.3
        },
        M1014: { 
            name: "M1014", type: 'Shotgun', visualType: 'rifle', 
            range: 150, optimalRange: 40, 
            damage: 8, fireRate: 800, 
            capacity: 7, reloadTime: 800,
            spread: 0.15, handling: 0.9
        },
        M110: { 
            name: "M110 SASS", type: 'Sniper', visualType: 'rifle', 
            range: 600, optimalRange: 400, 
            damage: 5, fireRate: 600, 
            capacity: 10, reloadTime: 3000,
            spread: 0.005, handling: 0.4
        },
        M9: { 
            name: "M9 Beretta", type: 'Pistol', visualType: 'pistol', 
            range: 150, optimalRange: 30, 
            damage: 1, fireRate: 200, 
            capacity: 15, reloadTime: 1500,
            spread: 0.06, handling: 1.0
        }
    },

    ROLES: {
        RIFLEMAN: {
            hp: 5,
            speedMod: 1.0,
            primary: 'M4A1',
            secondary: 'M9',
            ammo: { 'M4A1': 120, 'M9': 30 },
            utility: [{ type: 'FragGrenade', count: 2 }, { type: 'SmokeGrenade', count: 1 }]
        },
        BREACHER: {
            hp: 8,
            speedMod: 1.1,
            primary: 'M1014',
            secondary: 'M9',
            ammo: { 'M1014': 30, 'M9': 30 },
            utility: [{ type: 'Flashbang', count: 3 }, { type: 'FragGrenade', count: 1 }]
        },
        MARKSMAN: {
            hp: 4,
            speedMod: 1.0,
            primary: 'M110',
            secondary: 'M9',
            ammo: { 'M110': 40, 'M9': 30 },
            utility: [{ type: 'SmokeGrenade', count: 2 }]
        },
        GUNNER: {
            hp: 6,
            speedMod: 0.85,
            primary: 'M249',
            secondary: 'M9',
            ammo: { 'M249': 400, 'M9': 30 },
            utility: []
        },
        MEDIC: {
            hp: 5,
            speedMod: 1.05,
            primary: 'M4A1',
            secondary: 'M9',
            ammo: { 'M4A1': 90, 'M9': 30 },
            utility: [{ type: 'Medkit', count: 8 }, { type: 'SmokeGrenade', count: 4 }]
        }
    },

    PHYSICS: {
        COLLISION_SAMPLES: 4, 
        SOUND_RADIUS_GUNSHOT: 2400,
        SOUND_RADIUS_SHOUT: 400,
        SOUND_RADIUS_EXPLOSION: 3000,
        HEARING_THRESHOLD: 0.1,
        
        SUPPRESSION_RADIUS: 20,
        SUPPRESSION_STRESS: 2,
        PINNED_THRESHOLD: 80,
        
        GRENADE_RANGE: 250,
        SMOKE_DURATION: 15000,
        SMOKE_RADIUS: 40,
        FRAG_RADIUS: 32,
        FRAG_DAMAGE: 5,
        RELOAD_TIME: 2000,
        GRENADE_FUSE: 3000, // ms
        GRENADE_ARM_TIME: 800, // ms
        
        COVER_HP_WOOD: 20,
        COVER_HP_STONE: 100
    },

    AI: {
        HEATMAP: {
            DIFFUSION_RATE: 0.04, // per tick
            LOSS_RATE: 0.002 // per tick
        },
        MEMORY_DECAY: 0.99, 
        STRESS_DECAY: 0.001,
        SOCIAL_DECAY_RATE: 0.01,
        SOCIAL_REFILL_RATE: 0.02,
        
        WEIGHTS: {
            BASE_INERTIA: 0.5,
            SIGHT_ENEMY: 2.5,
            SUSPECTED_ENEMY: 1.5,
            PANIC_THRESHOLD: 95,
            PANIC_WEIGHT: 1.2,
            LOW_AMMO_WEIGHT: 2.5,
            MEDKIT_PRIORITY: 3.0
        }
    }
};
