import { Utils } from './Utils.js?v=field-console-14';

export class Traits {
    constructor() {
        this.openness = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.conscientiousness = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.extraversion = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.agreeableness = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1);
        this.neuroticism = Utils.clamp(Utils.randomGaussian(0.5, 0.15), 0, 1); 
        
        this.leadershipPotential = (this.extraversion * 0.4) + (this.conscientiousness * 0.4) - (this.neuroticism * 0.3);

        this.visionRadius = 300 + (this.openness * 100);
        this.reflexSpeed = 200 - (this.conscientiousness * 50);
        
        this.reflexSpeed = Utils.clamp(Utils.randomGaussian(200, 30), 100, 300);
        this.accuracyBase = Utils.clamp(Utils.randomGaussian(0.7, 0.1), 0.4, 0.95);
    }
}
