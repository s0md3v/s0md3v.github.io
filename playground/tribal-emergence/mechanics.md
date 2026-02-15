# Tribal Emergence: Mechanics & Systems Analysis

This document outlines the core mechanics, systems, and their interactions within the **Tribal Emergence** simulation. It serves as a reference for understanding the emergent behaviors of the agents.

## 1. The Agent Entity
The Agent is the primary actor, composed of four distinct modules that drive its behavior:

| Module | Description | Key Components |
| :--- | :--- | :--- |
| **Traits** | Static personality profile based on the Big 5 model. | `Openness` (Pathfinding/Flanking), `Conscientiousness` (Stickiness to plans), `Extraversion` (Social/Communication), `Agreeableness` (Aggression modifier), `Neuroticism` (Stress susceptibility). |
| **State** | Dynamic physiological and psychological status. | `HP`, `Stamina` (0-100), `Stress` (0-100), `Morale`, `SocialBattery`, `Inventory`, `Suppression` (0-100), `isPinned`, `Role`, `Buffs`. |
| **Memory** | Knowledge base of the world. | `KnownHostiles` (Last seen pos), `DangerZones` (Sound events), `Heatmap` (Danger density), `SocialCredit` (Trust), `LeaderApproval` (0-100), `DreadZones` (Death locations), `DistressSignals`. |
| **Brain** | The decision-making engine. | Graph-based Finite State Machine + Role-specific heuristics. |

---

## 2. Core Systems

### 2.0. Leadership & Social Hierarchy
Units naturally organize into a hierarchy driven by performance and survival instinct.
*   **Leader Election**:
    *   *Mechanism*: Teams elect a "Captain" (Rank 1) based on `LeadershipPotential` (70%) and `Survivor Trust` (30%).
*   **Command Aura**:
    *   *Buff*: Nearby allies receive passive Stress reduction and Morale regeneration.
*   **Approval & Mutiny (Competence Model)**:
    *   *Dynamic Approval*: Approval (0-100) is volatile. It rises with enemy kills (+10) and falls with ally deaths (-25) or leader cowardice (retreating while squad fights).
    *   *Insubordination*: Agents evaluate "Suicide Orders." If a leader moves into a high-heat zone, agents may refuse based on their `Agreeableness` and `Approval`. Low-agreeable agents yell "NO WAY!" and hold position.
    *   *Crisis Mutiny*: Unlike the old social-based mutiny, mutiny now occurs during **Combat/Survival**. If a leader's Stress is high and Approval is low, a more competent (High Potential, Low Stress) subordinate will seize command to save the squad.
*   **Decapitation Strike**:
    *   *Trigger*: Captain death causes global Stress spikes and Morale collapse. 
    *   *Command Chaos*: Synchronization is disabled for 10 seconds (Coordination Vacuum). Bounding Overwatch and shared intent-reading are impossible.

### 2.1. Perception System (Sensory.js)
Agents perceive the world through a multi-modal, threshold-based system.
*   **Realistic Vision (Detection Meter)**:
    *   *Mechanism*: Seeing is not binary. Agents accumulate "Detection Progress" (0-100%) before a target is spotted.
    *   *Length Fall-off*: Detection speed decays with distance. Close targets are spotted nearly instantly; distant targets take seconds.
    *   *Angular (Horizontal) Fall-off*: High-fidelity detection in the **Fovea (Center 23°)**; low-fidelity "movement-only" detection in the periphery.
    *   *Movement Multiplier*: Moving targets are **3x easier** to detect, especially in the periphery.
    *   *Tunnel Vision*: High Stress (>70) disables peripheral awareness entirely, forcing agents to focus only on what's in front.
*   **Peripheral Awareness**:
    *   Agents have a **360° close-range awareness (150px)** representing hearing and non-visual cues.
*   **Hearing & Startle**:
    *   *Occlusion*: Sound intensity halves for every wall passed through.
    *   *Startle Response*: Loud noises (Explosions/Gunshots) near an agent apply **Suppression/Shock** even without line-of-sight.
    *   *Rustle*: Moving through bushes is loud (300px radius), exposing "hidden" agents to acoustic detection.
*   **Shared Knowledge**:
    *   **Communication**: "Shouting" shares `KnownHostiles` and `Heatmap` data.
    *   *Reliability*: Neurotic agents may misreport positions under stress.

### 2.2. Psychological System (State.js & Agent.js)
*   **Event-Driven Stress**:
    *   *Sources*: Sight of enemy, Suppression, Damage, Uncertainty (Heatmap), Ally Death.
    *   *Mitigation*: Squad Cohesion (Brotherhood), High Morale.
*   **Performance Penalties (Motor Skill Loss)**:
    *   *Reloading*: At high stress, fine motor skills fail. Reload time can take up to **1.8x longer**.
    *   *Accuracy*: Panicked agents suffer an additional **30% accuracy penalty** and increased physical jitter.
*   **The "Frozen" State (Shock/Panic)**:
    *   *Mechanism*: Sudden massive damage or sustained extreme suppression can cause an agent to "Freeze" (the 🥶 state). 
    *   *Effect*: For 1-2 seconds, the agent is incapacitated—unable to move, shoot, or recover. This represents the total collapse of the OODA loop.
*   **Exertion-Based Fatigue**:
    *   *Accumulation*: Fatigue is no longer just stress-based. Sustained sprinting (`BOUNDING` mode) now physically wears agents down.
    *   *Effect*: High fatigue permanently reduces stamina recovery and increases the stress floor.
*   **Ghosts of War (Trauma)**:
    *   *Dread Zones*: Areas where allies have died become "Cursed Ground."
    *   *Shellshock*: High trauma (`traumaLevel > 50`) creates a permanent stress floor, making agents panic earlier and recover slower.
*   **Berserk State**: Max Stress + Low Morale = Suicide Charge.
*   **Social Battery**:
    *   *Spaced Out*: Agents slowly lose battery when crowded, causing them to seek solitude or bond during lulls. 100% battery improves morale.

### 2.3. Decision System (Decision.js)
The "Brain" uses a Weighted Directed Graph to switch states, now suffering from realistic cognitive degradation.
*   **OODA Loop Latency**:
    *   *Variable Thinking*: Agents do not think every frame. Fresh agents re-evaluate decisions every 100ms.
    *   *Stress Lag*: High stress adds up to **+500ms** to reaction time.
    *   *Fatigue Lag*: Exhaustion adds up to **+1000ms**, making tired agents incredibly sluggish to react to flanks or grenades.
*   **Accuracy-Driven Tactics**:
    *   *Panic Spray*: Agents aware of their own poor aim (due to stress) will prioritize `SUPPRESS` (volume fire) over `ATTACK` (precision).
    *   *Shaky Hands*: If accuracy is < 40%, the desire to take aimed shots is halved.
*   **Command Influence (Hive Mind)**:
    *   *Aggression*: If the Leader is in `COMBAT`, subordinates gain +1.5 weight to join the fight.
    *   *Fear*: If the Leader is in `SURVIVAL` (Retreat/Panic), subordinates gain +1.5 weight to flee, creating natural routs.
*   **Fatigue Inertia**:
    *   *Stubbornness*: Exhausted agents have high "Stay Weight," meaning they are likely to stick to their current action even if it's no longer optimal (e.g., staying in cover too long).
*   **Tactical Pathfinding**:
    *   *Heat-Aware*: Avoids known danger zones.
    *   *Dread-Aware*: Avoids areas where allies died.
*   **Ambush Tactics**:
    *   *Lurk*: Agents (esp. Marksmen/Breachers) will actively seek out nearby bushes (`scoreLurk`) when they suspect enemies but have no visual contact.
    *   *Trigger Discipline*: Agents in bushes will **Hold Fire** until enemies are within "Kill Range" (<150px) or they are compromised.

### 2.4. Combat System
*   **Shooting**: Requires LOS and Ammo. Ballistics are simulated with projectiles.
*   **Friendly Fire & Negligence**: 
    *   *Safety Check*: Calm agents check their line of fire for teammates before shooting.
    *   *Negligence*: Highly stressed agents (>75) suffer form Tunnel Vision and have a 50% chance to **ignore safety checks**, shooting through allies to hit threats.
*   **Suppression & Crossfire**: 
    *   *Pinning*: Bullets hitting near an agent apply stress and can Pin them.
    *   *Crossfire Panic*: Being suppressed from two angles (>90° separation) multiplies stress impact by **2.5x**, breaking morale instantly.
*   **Tactical Logistics**: Agents share ammo with trusted allies when low.
*   **Rescue Instinct**: Non-medic agents with high Agreeableness will attempt to rescue/cover downed allies (`scoreRescue`).

### 2.5. Technical Architecture (Performance & Realism)
To simulate human limitations and optimize CPU usage, critical systems run on decoupled timelines:
*   **Perception Clock (10Hz)**: Vision scans run every 100ms. This enforces a hard "Perception Latency"—an agent cannot physically see and process a threat faster than 0.1s.
*   **Cohesion Clock (2Hz)**: Squad proximity checks run every 500ms. Morale and stress relief are slow, "soaking" effects rather than instant responses.
*   **Decision Clock (Variable)**: The brain re-evaluates high-level goals every 100ms–1000ms, depending on Stress and Fatigue.

---

## 3. Interactions Matrix

| Source Component | Target Component | Interaction Description |
| :--- | :--- | :--- |
| **Action (Move)** | **Sound (Step)** | Movement generates noise based on speed and surface (Bush = Loud). |
| **Sound (Step)** | **Memory (Heat)** | Hearing footsteps adds "Suspicion" heat, prompting investigation. |
| **Sound (Blast)** | **State (Suppress)** | Nearby loud sounds apply "Startle Suppression" even without LOS. |
| **Event (Death)** | **Memory (Approval)** | Teammate death penalizes leader approval; Enemy death rewards it. |
| **State (Stress)** | **Sensory (FOV)** | High stress (>70) causes Tunnel Vision, disabling peripheral awareness. |
| **Action (Retreat)** | **Memory (Approval)** | Leader retreating while squad fights causes rapid approval decay (Cowardice). |
| **Memory (Meter)** | **Decision (Combat)** | Enemies must reach 100% detection progress before being engaged. |
| **Env (Bush)** | **Sensory (Vision)** | Bushes apply a 70% detection speed penalty (Concealment). |

---

## 4. Emergent Behaviors

1.  **The "Incompetent Captain"**:
    *   A leader orders a charge but then panics and retreats. The squad stays in combat, but their `LeaderApproval` craters. A calm, ambitious subordinate sees the leader's high stress, initiates a **Mutiny**, and takes over command while still in the firefight.

2.  **The "Tunnel Vision" Casualty**:
    *   An agent is suppressed and highly stressed. Because of `Tunnel Vision`, they fail to notice an enemy flanking them from the side (peripheral awareness disabled). They are killed because they were too focused on the threat directly in front of them.

3.  **The "Slow Spot" Ambush**:
    *   A squad moves past a bush. Because the agent inside is stationary and concealed, the squad's `Detection Meter` fills very slowly. The hidden agent waits until they are at point-blank range (fastest detection) to open fire, catching the squad off-guard.

4.  **The "Sound-Suppressed" Breach**:
    *   An explosion goes off behind a wall. Even though the agents on the other side can't see the blast, the **Startle Response** applies suppression, pinning them momentarily and allowing an enemy team to rush the room while they are dazed.

6.  **The "Exhausted Stand"**:
    *   A team has been sprinting (`BOUNDING`) for 20 seconds. Their `Fatigue` is high. When ambushed, their `OODA Loop` is so slow (+1000ms lag) that they fail to react to a flank in time and are wiped out before they can even decide to retreat.

7.  **The "Chain Rout"**:
    *   The Leader takes heavy fire and enters `SURVIVAL` (Panic). Because of **Command Influence**, this panic propagates instantly to the subordinates, causing the entire squad to break and run even though they were winning the firefight.

9.  **The "Friendly Fire" Tragedy**:
    *   An agent is pinned and panicking (Stress > 90). They see an enemy rushing them but a teammate is in the way. Due to **Negligence**, they open fire anyway ("OUT OF MY WAY!"), killing their own ally to save themselves.

10. **The "Hammer and Anvil"**:
    *   Team A pins Team B with a machine gunner. Team A's Breacher flanks to the side. As soon as the Breacher opens fire, the **Crossfire Panic** (2.5x Stress) causes Team B to instantly break, with agents freezing in shock or routing into the open.
