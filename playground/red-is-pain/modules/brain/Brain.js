import { Cortex } from './Cortex.js?v=field-console-14';
import { Amygdala } from './Amygdala.js?v=field-console-14';
import { LimbicSystem } from './LimbicSystem.js?v=field-console-14';
import { ActionExecutor } from '../ActionExecutor.js?v=field-console-14';

export class Brain {
    constructor(agent) {
        this.agent = agent;
        this.agent.brain = this; // must be set before the sub-modules are constructed
        
        this.cortex = new Cortex(agent);
        this.amygdala = new Amygdala(agent);
        this.limbic = new LimbicSystem(agent);
        
        this.currentFocus = 'IDLE';
        this.decisionInterval = 100;
        this.nextDecisionTime = Date.now() + Math.random() * 100;
    }

    update(dt, world) {
        this.amygdala.update(dt, world);
        this.limbic.update(dt, world);
    }

    get currentThought() {
        return this.currentFocus;
    }

    set currentThought(val) {
        this.currentFocus = val;
    }

    isSafe(world) {
        return this.cortex.isSafe(world);
    }

    decide(world, forceUpdate = false) {
        const now = Date.now();
        if (!forceUpdate && now < this.nextDecisionTime) return this.agent.currentAction;

        const survivalBid = this.amygdala.evaluate(world);
        
        const socialBid = this.limbic.evaluate(world);
        
        const tacticalBid = this.cortex.evaluate(world, survivalBid.priority); 

        let winningBid = tacticalBid;
        this.currentFocus = winningBid.type || 'IDLE';

        if (survivalBid.priority > tacticalBid.priority) {
            winningBid = survivalBid;
            this.currentFocus = 'SURVIVAL';
        }

        if (socialBid.priority > winningBid.priority && survivalBid.priority < 90) {
            winningBid = socialBid;
            this.currentFocus = 'SOCIAL';
        }

        this.scheduleNextDecision();
        return winningBid.action;
    }

    scheduleNextDecision() {
        let delay = 100;
        if (this.agent.state.fatigue > 50) delay += 100;
        if (this.agent.state.suppression > 50) delay += 200;
        this.nextDecisionTime = Date.now() + delay;
    }
}
