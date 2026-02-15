import { Utils } from './Utils.js';

export class Traits {
    constructor() {
        // Big 5 (0.0 - 1.0)
        this.openness = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.conscientiousness = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.extraversion = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.agreeableness = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.neuroticism = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1); 
        
        // Leadership Potential (Derived)
        // Leaders need to be Extroverted (Communication) and Conscientious (Planning)
        // High Neuroticism makes a bad leader (Panics)
        this.leadershipPotential = (this.extraversion * 0.4) + (this.conscientiousness * 0.4) - (this.neuroticism * 0.3);

        // Physical Attributes
        this.visionRadius = 300 + (this.openness * 100); // Increased vision range
        this.reflexSpeed = 200 - (this.conscientiousness * 50); // Lower is faster. Conscientious = careful but maybe slower? Or faster? Let's say careful = slower. Wait, prompts say Conscientiousness affects orders. Let's make reflex based on something else or random.
        // Let's stick to prompt: Openness -> Pathfinding.
        // Neuroticism -> Stress.
        // Extraversion -> Communication.
        // Agreeableness -> Sharing.
        
        // Let's randomize physicals a bit or base them on traits where logical
        this.reflexSpeed = Utils.clamp(Utils.randomGaussian(200, 30), 100, 300); // ms
        this.accuracyBase = Utils.clamp(Utils.randomGaussian(0.7, 0.1), 0.4, 0.95);
    }
}
