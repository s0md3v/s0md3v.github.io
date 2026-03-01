import { Cortex } from './Cortex.js';
import { Amygdala } from './Amygdala.js';
import { LimbicSystem } from './LimbicSystem.js';
import { ActionExecutor } from '../ActionExecutor.js';

export class Brain {
    constructor(agent) {
        this.agent = agent;
        this.agent.brain = this; // SET REFERENCE EARLY for sub-module constructors
        
        // The Triune Brain Model (extended)
        this.cortex = new Cortex(agent);        // Rational, Tactical, Planning (The General)
        this.amygdala = new Amygdala(agent);    // Emotional, Survival, Reflexes (The Animal)
        this.limbic = new LimbicSystem(agent);  // Social, Bonding, Herd Mentality (The Tribe)
        
        this.currentFocus = 'IDLE'; // What is the brain currently prioritizing?
        this.decisionInterval = 100; // ms
        this.nextDecisionTime = Date.now() + Math.random() * 100;
    }

    update(dt, world) {
        // Update Internal State (Emotions, Stress, Plans)
        this.amygdala.update(dt, world);
        this.limbic.update(dt, world);
        // this.cortex.update(dt, world); // Cortex plans, doesn't really have "state" to update per frame yet
    }

    get currentThought() {
        // Map new 'currentFocus' to old 'THOUGHT_X' constants if needed, or just return the string.
        // Old constants were strings like 'COMBAT', 'SURVIVAL'.
        // My new focus strings align: 'SURVIVAL', 'SOCIAL', 'COMBAT' (implied by Cortex winning).
        return this.currentFocus;
    }

    set currentThought(val) {
        this.currentFocus = val;
    }

    isSafe(world) {
        return this.cortex.isSafe(world);
    }

    /**
     * Main decision loop.
     * Unlike the old 'Decision.js' which was a state machine, this is an ARBITRATOR.
     * It asks all 3 brain parts for a "Bid" (Action Proposal + Priority Score).
     * It then picks the winner.
     */
    decide(world, forceUpdate = false) {
        const now = Date.now();
        if (!forceUpdate && now < this.nextDecisionTime) return this.agent.currentAction;

        // 1. GATHER BIDS
        // Each system analyzes the world state independently and proposes what IT wants to do.
        
        // Amygdala: "I'm hearing shots! Duck!" (High Priority if threatened)
        const survivalBid = this.amygdala.evaluate(world);
        
        // Limbic: "My friend is down! Check on him!" (Medium Priority, context dependent)
        const socialBid = this.limbic.evaluate(world);
        
        // Cortex: "Flank right to eliminate target." (Variable Priority, Goal Oriented)
        // The Cortex is unique: It can suppress the Limbic system but struggle against Amygdala.
        const tacticalBid = this.cortex.evaluate(world, survivalBid.priority); 

        // 2. ARBITRATE
        // Who wins? 
        // Rule 1: High Stress reduces Cortex effectiveness (The "Fog of War" / Panic)
        // Rule 2: High Adrenaline might boost Amygdala priority (Fight or Flight)
        
        let winningBid = tacticalBid; // Default to rational behavior
        this.currentFocus = winningBid.type || 'IDLE'; // Capture Cortex intent (e.g. COMBAT)

        // AMYGDALA OVERRIDE (Panic/Reflex)
        // If survival threat is high enough, it overrides tactical planning.
        if (survivalBid.priority > tacticalBid.priority) {
            winningBid = survivalBid;
            this.currentFocus = 'SURVIVAL';
        }

        // SOCIAL OVERRIDE (Protecting the Tribe)
        // If social urgency is high (e.g., active rescue needed) AND we aren't about to die
        if (socialBid.priority > winningBid.priority && survivalBid.priority < 90) {
            winningBid = socialBid;
            this.currentFocus = 'SOCIAL';
        }

        // 3. COMMIT & EXECUTE
        // Apply hysteresis: Don't switch tasks if the new bid is only marginally better
        // unless it's a critical reflex (Amygdala).
        
        this.scheduleNextDecision();
        return winningBid.action;
    }

    scheduleNextDecision() {
        // OODA Loop Speed
        // Tired/Stressed agents think slower
        let delay = 100;
        if (this.agent.state.fatigue > 50) delay += 100;
        if (this.agent.state.suppression > 50) delay += 200; // Pinning confusion
        this.nextDecisionTime = Date.now() + delay;
    }
}
