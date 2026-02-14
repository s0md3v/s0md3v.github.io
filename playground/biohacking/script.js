const assessmentModel = [
    // --- SLEEP ---
    {
        id: 'sleep_hours',
        category: 'Sleep',
        prompt: 'How much sleep do you get on a typical night?',
        inputType: 'slider',
        min: 3, max: 10, step: 0.5,
        unit: 'hours',
        defaultValue: 7,
        evaluate: (val) => {
            if (val < 6) return {
                id: 'sleep_restoration',
                type: 'foundation',
                priority: 'critical',
                title: "Sleep Restoration",
                reasoning: "You're running on empty. Sleeping less than 6 hours creates a 'cognitive debt' that caffeine can't fix. It kills your focus and mood.",
                timeline_results: [
                    { time: '1 Week', effect: 'Your anxiety levels will drop significantly. You will notice you are less irritable and sugar cravings will start to fade as your hunger hormones (ghrelin/leptin) re-balance.' },
                    { time: '30 Days', effect: 'Your skin will look visibly clearer and less puffy. You will have stable energy throughout the entire day without the afternoon crash.' },
                    { time: 'Long Term', effect: 'You are drastically reducing your risk of Alzheimer’s and heart disease. Your brain cleans itself of toxic plaques only during deep sleep.' }
                ],
                protocol: [
                    "**Reverse Alarm**: Set an alarm 1 hour *before* bed to stop looking at screens.",
                    "**Cool Down**: A cold room (65-68°F) helps you stay asleep.",
                    "**Magnesium**: 400mg of Magnesium Glycinate before bed can help you relax."
                ],
                sources: [1, 5],
                risks: "Chronic sleep deprivation is linked to a 30% higher risk of dementia and significant hormonal imbalances (low testosterone/high cortisol)."
            };
            if (val < 7) return {
                id: 'sleep_optimization',
                type: 'foundation',
                priority: 'medium',
                title: "Sleep Extension",
                reasoning: "You are close, but that last hour of sleep is where the magic happens for your brain and memory.",
                timeline_results: [
                    { time: '1 Week', effect: 'Waking up will feel natural, often without an alarm. You will feel "sharper" and find it easier to learn new things.' },
                    { time: '1 Month', effect: 'Your emotional resilience will skyrocket. Things that used to annoy you will roll off your back.' },
                    { time: '1 Year', effect: 'Your immune system will be robust; you will get sick far less often than your peers.' }
                ],
                protocol: [
                    "**15-Minute Rule**: Go to bed 15 minutes earlier every few days.",
                    "**No Coffee After 2PM**: Caffeine stays in your system longer than you think.",
                    "**Blackout**: Make your room pitch black."
                ],
                sources: [1],
                risks: "You are consistently leaving cognitive performance on the table. Over years, this micro-deprivation accelerates brain aging."
            };
            return null;
        }
    },
    {
        id: 'sleep_consistency',
        category: 'Sleep',
        prompt: 'Do you wake up at the same time every day?',
        subtext: '(including weekends)',
        inputType: 'select',
        options: [
            { value: 'consistent', label: 'Yes, pretty much' },
            { value: 'varied', label: 'No, I sleep in on weekends' },
            { value: 'irregular', label: 'My schedule is all over the place' }
        ],
        defaultValue: 'consistent',
        evaluate: (val) => {
            if (val === 'irregular' || val === 'varied') return {
                id: 'circadian_anchor',
                type: 'foundation',
                priority: 'high',
                title: "Fix Social Jetlag",
                reasoning: "Waking up at different times confuses your biological clock. It's like flying across time zones every weekend ('Social Jetlag').",
                timeline_results: [
                    { time: '3 Days', effect: 'Waking up will stop feeling like a chore. You will feel alert within minutes of opening your eyes.' },
                    { time: '2 Weeks', effect: 'You will fall asleep faster at night because your body knows exactly when "bedtime" is.' },
                    { time: 'Long Term', effect: 'Your metabolic health will improve, reducing the risk of diabetes and obesity typically associated with irregular rhythms.' }
                ],
                protocol: [
                    "**Anchor the Wake**: Wake up at the same time every day, even if you're tired.",
                    "**Morning Sunlight**: Get outside for 10 minutes right after waking up.",
                    "**Don't Snooze**: Put your phone across the room."
                ],
                sources: [1],
                risks: "Your body never knows when to release hormones. This confuses your metabolism, leading to insulin resistance and weight gain."
            };
            return null;
        }
    },
    {
        id: 'screens_before_bed',
        category: 'Sleep',
        prompt: 'Do you look at your phone in bed before falling asleep?',
        inputType: 'select',
        options: [
            { value: 'always', label: 'Every night' },
            { value: 'sometimes', label: 'Sometimes' },
            { value: 'no', label: 'Never' }
        ],
        defaultValue: 'always',
        evaluate: (val) => {
            if (val === 'always') return {
                id: 'blue_light_detox',
                type: 'foundation',
                priority: 'high',
                title: "Protect Your Melatonin",
                reasoning: "Looking at your phone in bed tricks your brain into thinking it's daytime. This stops your body from producing melatonin, the sleep hormone.",
                timeline_results: [
                    { time: 'Tonight', effect: 'You will likely fall asleep 15-20 minutes faster than usual.' },
                    { time: '1 Week', effect: 'You will experience more vivid dreams, a sign that you are getting more REM sleep.' },
                    { time: '1 Month', effect: 'You will feel more rested upon waking because your sleep cycles were not disrupted by blue light suppression.' }
                ],
                protocol: [
                    "**Phone Foyer**: Charger your phone in the kitchen or hallway, not the bedroom.",
                    "**Night Shift**: Turn on the 'warm' color mode on your phone after sunset.",
                    "**Read a Book**: Physical books don't emit blue light."
                ],
                sources: [4],
                risks: "You are essentially giving yourself mini-jetlag every night. Your sleep quality (REM/Deep) will remain permanently suboptimal."
            };
            return null;
        }
    },

    // --- NUTRITION ---
    {
        id: 'processed_food',
        category: 'Nutrition',
        prompt: 'How much of your food comes from a box or wrapper?',
        subtext: '(Like chips, fast food, frozen meals, bars)',
        inputType: 'slider',
        min: 0, max: 100, step: 10,
        unit: '%',
        defaultValue: 30,
        evaluate: (val) => {
            if (val > 40) return {
                id: 'whole_foods_transition',
                type: 'foundation',
                priority: 'critical',
                title: "Eat Real Food",
                reasoning: "Ultra-processed foods are designed to make you overeat. They drive inflammation and drain your energy.",
                timeline_results: [
                    { time: '3 Days', effect: 'Less bloating and water retention. You might feel "lighter".' },
                    { time: '2 Weeks', effect: 'Your taste buds will change. Fruit will taste sweeter, and you will stop craving hyper-processed sugar.' },
                    { time: '3 Months', effect: 'You will likely see significant improvements in body composition and skin clarity as systemic inflammation drops.' }
                ],
                protocol: [
                    "**The Perimeter Rule**: Shop the outside edges of the grocery store (produce, meat, dairy).",
                    "**3-Ingredient Rule**: If a package has more than 3 ingredients, don't buy it.",
                    "**Cook Once**: Cook a big batch of meat/veggies on Sunday."
                ],
                sources: [109, 112],
                risks: "A diet high in processed foods is the single biggest driver of modern chronic disease, including obesity, diabetes, and depression."
            };
            return null;
        }
    },
    {
        id: 'eating_window',
        category: 'Nutrition',
        prompt: 'How close to bedtime do you usually eat your last meal?',
        inputType: 'select',
        options: [
            { value: 'early', label: '3+ hours before bed' },
            { value: 'late', label: 'Right before bed' },
            { value: 'snack', label: 'I snack in bed' }
        ],
        defaultValue: 'late',
        evaluate: (val) => {
            if (val === 'late' || val === 'snack') return {
                id: 'early_dinner',
                type: 'foundation',
                priority: 'high',
                title: "Stop Late Night Eating",
                reasoning: "Digesting food takes a lot of energy. If you eat right before bed, your body is working instead of resting.",
                timeline_results: [
                    { time: 'Tonight', effect: 'Your sleep heart rate will be lower, and your recovery (HRV) will be higher.' },
                    { time: '1 Week', effect: 'Acid reflux or heartburn will likely disappear.' },
                    { time: 'Long Term', effect: 'Your body becomes better at burning fat for fuel while you sleep.' }
                ],
                protocol: [
                    "**Kitchen Closed**: Set a strict time to close the kitchen (e.g., 8 PM).",
                    "**Herbal Tea**: Drink Chamomile or Peppermint tea if you feel hungry.",
                    "**Brush Teeth**: Brush immediately after dinner to signal you are done."
                ],
                sources: [14],
                risks: "Eating late prevents your body from releasing Human Growth Hormone (HGH) during sleep, slowing down repair and recovery."
            };
            return null;
        }
    },

    // --- MOVEMENT (BRANCHED) ---
    {
        id: 'exercise_habit',
        category: 'Movement',
        prompt: 'Do you exercise regularly?',
        subtext: '(Gym, running, sports, etc.)',
        inputType: 'select',
        options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
        ],
        defaultValue: 'no',
        evaluate: (val) => {
            if (val === 'no') return {
                id: 'movement_start',
                type: 'foundation',
                priority: 'critical',
                title: "Start Moving",
                reasoning: "Your body was built to move. Sedentary living is one of the biggest risks to your long-term health.",
                timeline_results: [
                    { time: 'Immediately', effect: 'Moving releases endorphins. You will feel better just 5 minutes into a walk.' },
                    { time: '2 Weeks', effect: 'Walking up stairs won\'t leave you winded. You will have more daily stamina.' },
                    { time: '1 Year', effect: 'You are cutting your risk of all-cause mortality significantly. You are literally adding years to your life.' }
                ],
                protocol: [
                    "**The Daily Walk**: Just walk for 20 minutes a day. That's it.",
                    "**Stairs**: Take the stairs instead of the elevator.",
                    "**Stand Up**: Stand up every hour, even just for a minute."
                ],
                sources: [139],
                risks: "Sedentary behavior is an independent risk factor for mortality. It literally speeds up the shortening of your telomeres (aging)."
            };
            return null;
        }
    },
    {
        id: 'sedentary_bouts',
        category: 'Movement',
        prompt: 'How long do you usually sit at a time without getting up?',
        subtext: '(at work, watching TV, gaming)',
        inputType: 'select',
        options: [
            { value: 'short', label: '< 30 minutes' },
            { value: 'medium', label: '1-2 hours' },
            { value: 'long', label: '3+ hours' }
        ],
        defaultValue: 'medium',
        evaluate: (val) => {
            if (val === 'long' || val === 'medium') return {
                id: 'sedentary_interrupt',
                type: 'foundation',
                priority: 'high',
                title: "Break Up Sitting Time",
                reasoning: "Sitting for long periods shuts down an enzyme called LPL that burns fat. Even if you workout, long sitting bouts negate many benefits.",
                timeline_results: [
                    { time: 'Immediately', effect: 'Standing up reactivates fat-burning enzymes and improves blood sugar regulation.' },
                    { time: '1 Month', effect: 'Chronic hip tightness and lower back pain will begin to resolve.' },
                    { time: 'Long Term', effect: 'You protect your blood vessels from damage associated with blood pooling and stagnation.' }
                ],
                protocol: [
                    "**The 30-Minute Rule**: Stand up every 30 minutes, even if just for 30 seconds.",
                    "**Drink More Water**: It forces you to get up to use the bathroom.",
                    "**Standing Desk**: If possible, alternate between sitting and standing."
                ],
                sources: [139],
                risks: "Prolonged sitting causes blood to pool in legs and glucose levels to spike. It is a direct cause of metabolic dysfunction."
            };
            return null;
        }
    },
    {
        id: 'daily_steps',
        category: 'Movement',
        prompt: 'How many steps do you walk in a day?',
        inputType: 'slider',
        min: 0, max: 20000, step: 1000,
        unit: 'steps',
        defaultValue: 3000,
        evaluate: (val, answers) => {
            if (val < 5000) return {
                id: 'step_baseline',
                type: 'foundation',
                priority: 'high',
                title: "Get Your Steps Up",
                reasoning: "Walking is the easiest superfood. Getting to 7,000 steps drops your risk of dying early by nearly 50%.",
                timeline_results: [
                    { time: '1 Week', effect: 'Improved digestion after meals and better mood management.' },
                    { time: '1 Month', effect: 'Your resting blood pressure will likely decrease.' },
                    { time: 'Lifetime', effect: 'Mobility is independence. Walking now ensures you can still walk easily when you are 80.' }
                ],
                protocol: [
                    "**Walking Meetings**: Take phone calls while walking.",
                    "**Park Far Away**: Don't look for the closest spot.",
                    "**After Dinner**: A 10-minute walk after eating helps manage blood sugar."
                ],
                sources: [139, 140],
                risks: "Low daily activity is linked to hippocampal atrophy (brain shrinkage) and significantly higher risk of cardiovascular events."
            };
            return null;
        }
    },
    // --- SOCIAL & MENTAL ---
    {
        id: 'social_connection',
        category: 'Mental',
        prompt: 'How often do you hang out with friends or family in real life?',
        inputType: 'select',
        options: [
            { value: 'weekly', label: 'Once a week or more' },
            { value: 'monthly', label: 'Once a month' },
            { value: 'rarely', label: 'Rarely / Never' }
        ],
        defaultValue: 'monthly',
        evaluate: (val) => {
            if (val === 'rarely') return {
                id: 'social_rx',
                type: 'foundation',
                priority: 'high',
                title: "Prioritize Connection",
                reasoning: "Loneliness is dangerous. Risks are dangerous comparable to smoking. Humans are built to be around other humans.",
                timeline_results: [
                    { time: 'Immediately', effect: 'Social interaction releases oxytocin and dopamine, instantly improving your mood and reducing background anxiety.' },
                    { time: '1 Month', effect: 'Your body\'s stress response system will calm down, lowering your baseline cortisol levels.' },
                    { time: 'Long Term', effect: 'Strong social ties are the strongest predictor of happiness and cognitive health in old age.' }
                ],
                protocol: [
                    "**Schedule It**: Put a coffee date or call on the calendar.",
                    "**Call a Friend**: Just call for 10 minutes.",
                    "**Join a Group**: Find a club or group with shared interests."
                ],
                sources: [130, 31],
                risks: "Chronic loneliness triggers a cellular stress response that lowers immunity and increases inflammation."
            };
            return null;
        }
    },
    {
        id: 'stress_level',
        category: 'Mental',
        prompt: 'How would you describe your average daily stress?',
        inputType: 'select',
        options: [
            { value: 'low', label: 'Low - Usually calm and resilient' },
            { value: 'moderate', label: 'Moderate - Manageable daily pressures' },
            { value: 'high', label: 'High - Frequently stressed or anxious' },
            { value: 'extreme', label: 'Extreme - Constantly overwhelmed or at a breaking point' }
        ],
        defaultValue: 'moderate',
        evaluate: (val) => {
            if (val === 'high' || val === 'extreme') return {
                id: 'stress_protocol',
                type: 'foundation',
                priority: 'critical',
                title: "Stress Override",
                reasoning: "Chronic stress keeps cortisol high, which shreds your sleep, destroys muscle, and promotes visceral fat. It is biologically impossible to thrive in a high-stress state.",
                timeline_results: [
                    { time: 'Immediate', effect: 'The Physiological Sigh methods drops arousal in seconds.' },
                    { time: '1 Week', effect: 'Resting heart rate (RHR) will drop and Heart Rate Variability (HRV) will rise - key markers of recovery.' },
                    { time: 'Long Term', effect: 'You minimize the risk of burnout and stress-induced cognitive decline.' }
                ],
                protocol: [
                    "**Physiological Sigh**: Double inhale through nose, long exhale through mouth. Do this 3 times whenever stressed. It mechanically offloads CO2.",
                    "**Box Breathing**: Inhale 4s, Hold 4s, Exhale 4s, Hold 4s. Resets the nervous system.",
                    "**NSDR**: 10 minutes of 'Non-Sleep Deep Rest' (Yoga Nidra) is more restorative than a nap."
                ],
                sources: [154],
                risks: "Unmanaged stress destroys the hippocampus (memory center) and promotes the accumulation of visceral belly fat."
            };
            return null;
        }
    },
    // --- HYGIENE ---
    {
        id: 'oral_health_status',
        category: 'Hygiene',
        prompt: 'Do your gums ever bleed when brushing or flossing?',
        inputType: 'select',
        options: [
            { value: 'healthy', label: 'Healthy (No bleeding)' },
            { value: 'sensitive', label: 'Sensitive teeth/gums' },
            { value: 'bleeding', label: 'Bleeds when flossing' }
        ],
        defaultValue: 'healthy',
        evaluate: (val) => {
            if (val === 'bleeding' || val === 'sensitive') return {
                id: 'oral_systemic_defense',
                type: 'foundation',
                priority: 'high',
                title: "Heal Your Gums",
                reasoning: "Bleeding gums are an open door for bacteria to enter your bloodstream and reach your heart/brain. It is a sign of systemic inflammation.",
                timeline_results: [
                    { time: '1 Week', effect: 'Bleeding will stop as your gums heal and tighten around the teeth.' },
                    { time: '1 Month', effect: 'Your systemic inflammation (hs-CRP) will drop, taking stress off your entire immune system.' },
                    { time: 'Long Term', effect: 'You significantly lower your risk of cardiovascular disease and maybe even Alzheimer\'s.' }
                ],
                protocol: [
                    "**Salt Water Rinse**: Rinse with warm salt water daily to kill bacteria.",
                    "**Soft Floss**: Use expanding floss that is gentle on gums.",
                    "**Vitamin C**: Ensure you are getting enough Vitamin C for collagen repair."
                ],
                sources: [56, 112],
                risks: "Gum disease allows oral bacteria to enter the bloodstream, contributing to arterial plaque and heart disease."
            };
            return null;
        }
    },
    // --- NUTRIENT & COGNITION ---
    {
        id: 'sunlight_exposure',
        category: 'Nutrients',
        prompt: 'How much direct sunlight do you get on your skin daily?',
        subtext: '(Without sunscreen/sunglasses, mostly)',
        inputType: 'select',
        options: [
            { value: 'high', label: '30+ mins outdoors' },
            { value: 'supplement', label: 'I take Vitamin D3' },
            { value: 'low', label: 'Mostly indoors / < 15 mins' }
        ],
        defaultValue: 'low',
        evaluate: (val) => {
            if (val === 'low') return {
                id: 'vitamin_d_sun',
                type: 'foundation',
                priority: 'high',
                title: "Solar Nutrition",
                reasoning: "Vitamin D is actually a hormone that regulates over 1,000 genes. Deficiency is linked to depression, weak immunity, and poor sleep.",
                timeline_results: [
                    { time: '1 Week', effect: 'Your circadian rhythm will anchor, helping you fall asleep faster at night.' },
                    { time: '3 Months', effect: 'Optimized testosterone/estrogen levels and stronger bone density.' },
                    { time: 'Long Term', effect: 'Significant reduction in all-cause mortality and autoimmune risks.' }
                ],
                protocol: [
                    "**Morning Sun**: Get 10-20 minutes of sun on as much skin as possible before 10 AM.",
                    "**Supplement Smart**: If winter, consider 5,000 IU Vitamin D3 + K2 (talk to doc).",
                    "**Eat Fish**: Fatty fish like salmon are decent natural sources."
                ],
                sources: [160],
                risks: "Vitamin D deficiency correlates with higher rates of cancer, severe depression, and autoimmune diseases."
            };
            return null;
        }
    },

    
    // --- OPTIMIZATIONS (NITPICKS) ---
    {
        id: 'cardio_intensity',
        category: 'Movement',
        isNitpick: true,
        condition: (answers) => answers.exercise_habit === 'yes',
        prompt: 'Do you ever push yourself until you get out of breath?',
        inputType: 'select',
        options: [
            { value: 'weekly', label: 'Yes, at least once a week' },
            { value: 'rarely', label: 'Rarely / Never' }
        ],
        defaultValue: 'rarely',
        evaluate: (val) => {
            if (val === 'rarely') return {
                id: 'vo2_max_training', 
                type: 'optimizer',
                priority: 'high',
                title: "Push Your Heart",
                reasoning: "High intensity exercise improves your 'VO2 Max' - basically how well your body uses oxygen. It is the #1 predictor of a long life.",
                timeline_results: [
                    { time: 'During Workout', effect: 'It will feel uncomfortable. That is the signal to your heart to grow stronger.' },
                    { time: '1 Month', effect: 'Daily tasks like carrying groceries or climbing stairs will feel effortless.' },
                    { time: '1 Year', effect: 'You physically reverse the age of your heart, adding functional years to your life.' }
                ],
                protocol: [
                    "**The 4x4**: Warm up, then go HARD for 4 minutes, recover for 4 minutes. Repeat 4 times.",
                    "**Hill Sprints**: Run up a hill for 30 seconds, walk down. Repeat.",
                    "**Sports**: Play a high-intensity sport like soccer or basketball."
                ],
                sources: [17],
                risks: "Low VO2 max is a stronger predictor of death than smoking or diabetes. You physically age faster without intensity."
            };
            return null;
        }
    },
    {
        id: 'strength_habit',
        category: 'Movement',
        isNitpick: true,
        condition: (answers) => answers.exercise_habit === 'yes',
        prompt: 'Do you lift weights or do strength exercises?',
        inputType: 'select',
        options: [
            { value: 'yes', label: 'Yes, regularly' },
            { value: 'no', label: 'No, mostly cardio' }
        ],
        defaultValue: 'no',
        evaluate: (val) => {
            if (val === 'no') return {
                id: 'strength_foundation',
                type: 'foundation',
                priority: 'medium',
                title: "Build Muscle Armor",
                reasoning: "Muscle is your body's armor. If you don't use it, you lose it. Strong muscles protect your bones and metabolism.",
                timeline_results: [
                    { time: '2 Weeks', effect: 'You\'ll feel stronger due to neural adaptations (your brain learning to use your muscles).' },
                    { time: '3 Months', effect: 'Visible changes in muscle tone and posture. You will stand taller and feel more robust.' },
                    { time: 'Long Term', effect: 'Muscle acts as a glucose sink, protecting you from diabetes and keeping your metabolism high.' }
                ],
                protocol: [
                    "**Basic Lifts**: Learn to Squat, Hinge (Deadlift), Push, and Pull.",
                    "**2 Days a Week**: You only need 2 sessions to see benefits.",
                    "**Bodyweight**: Pushups and lunges are a great start."
                ],
                sources: [20],
                risks: "Sarcopenia (muscle loss) is the primary cause of frailty in old age. Weak muscles mean weak bones and metabolism."
            };
            return null;
        }
    },
    {
        id: 'phone_habits',
        category: 'Mental',
        isNitpick: true,
        prompt: 'Do you often lose track of time scrolling on your phone?',
        inputType: 'select',
        options: [
            { value: 'yes', label: 'Yes, I can\'t stop' },
            { value: 'no', label: 'No, I have control' }
        ],
        defaultValue: 'yes',
        evaluate: (val) => {
            if (val === 'yes') return {
                id: 'dopamine_reset',
                type: 'foundation',
                priority: 'medium',
                title: "Break the Scroll",
                reasoning: "Constant scrolling messes with your brain's reward system (dopamine). It makes real life feel boring and raises anxiety.",
                timeline_results: [
                    { time: '2 Days', effect: 'You might feel bored. This is good. Boredom is the precursor to creativity and calm.' },
                    { time: '2 Weeks', effect: 'Your attention span will recover. You will be able to watch a movie or read a book without needing to check your phone.' },
                    { time: '1 Year', effect: 'You will reclaim hundreds of hours of your life that would used to vanish into the screen.' }
                ],
                protocol: [
                    "**Grayscale**: Make your screen black and white (in Accessibility settings). It makes the phone boring.",
                    "**Notifications Off**: Turn off everything except texts/calls.",
                    "**Distance**: Don't keep the phone in your pocket at home."
                ],
                sources: [153],
                risks: "Your baseline dopamine levels drop, leading to anhedonia (inability to feel pleasure) and fragmented attention."
            };
            return null;
        }
    },
];

const bibliography = {
    1: { title: "Sleep and Health Targets (AHA)", url: "https://newsroom.heart.org/news/a-good-nights-sleep-may-make-it-easier-to-stick-to-exercise-and-diet-goals-study-found" },
    4: { title: "Blue Light & Sleep (Harvard)", url: "https://www.health.harvard.edu/staying-healthy/blue-light-has-a-dark-side" },
    14: { title: "Blue Zone Habits", url: "https://www.bluezones.com/2016/11/power-9/" },
    17: { title: "Zone 2 Training (Peter Attia)", url: "https://peterattiamd.com/category/exercise/physiology/" },
    20: { title: "Strength Training for Longevity", url: "https://bjsm.bmj.com/content/56/13/755" },
    31: { title: "Social Life vs Smoking", url: "https://matthiasmiller.com/p/your-social-life-kills-you-faster-than-smoking-a425" },
    56: { title: "Oral Hygiene (Cleveland Clinic)", url: "https://my.clevelandclinic.org/health/treatments/16914-oral-hygiene" },
    109: { title: "Ultra-Processed Foods (BMJ)", url: "https://www.bmj.com/content/365/bmj.l1949" },
    112: { title: "Inflammation to Disease", url: "https://www.health.harvard.edu/staying-healthy/understanding-inflammation" },
    130: { title: "Loneliness Danger", url: "https://health.fishersin.gov/loneliness-is-more-dangerous-than-smoking-15-cigarettes-a-day/" },
    139: { title: "Steps and Mortality (Lancet)", url: "https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(21)00302-9/fulltext" },
    140: { title: "Walking Benefits", url: "https://pubmed.ncbi.nlm.nih.gov/35247392/" },
    153: { title: "Digital Dopamine Detox", url: "https://www.trykondo.com/blog/grayscale-phone-addiction" },
    154: { title: "Tools for Stress (Huberman)", url: "https://hubermanlab.com/tools-for-managing-stress-and-anxiety/" },
    155: { title: "Cold Exposure Benefits", url: "https://www.hubermanlab.com/newsletter/the-science-and-use-of-cold-exposure-for-health-and-performance" },
    160: { title: "Vitamin D & Health (FoundMyFitness)", url: "https://www.foundmyfitness.com/topics/vitamin-d" },
    161: { title: "Neuroplasticity Protocols (Huberman)", url: "https://hubermanlab.com/teach-and-learn-better-with-a-neuroplasticity-super-protocol/" }
};

// --- APPLICATION LOGIC ---

let currentStep = 0;
let userAnswers = {};
let generatedProtocol = [];

const views = {
    landing: document.getElementById('landing-view'),
    assessment: document.getElementById('assessment-view'),
    results: document.getElementById('results-view')
};

const progressBar = document.getElementById('progress-bar');
const inputArea = document.getElementById('input-area');

// Buttons
const nextBtn = document.getElementById('next-btn');
const backBtn = document.getElementById('back-btn');
const mobileNextBtn = document.getElementById('mobile-next-btn');
const mobileBackBtn = document.getElementById('mobile-back-btn');

document.addEventListener('DOMContentLoaded', init);

function init() {
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('start-btn').addEventListener('click', startAssessment);
    
    // Navigation
    nextBtn.addEventListener('click', nextQuestion);
    backBtn.addEventListener('click', prevQuestion);
    if(mobileNextBtn) mobileNextBtn.addEventListener('click', nextQuestion);
    if(mobileBackBtn) mobileBackBtn.addEventListener('click', prevQuestion);
    
    document.getElementById('restart-btn').addEventListener('click', () => location.reload()); // Simple reload for now
}

function switchView(viewName) {
    Object.values(views).forEach(el => {
        el.classList.remove('active');
        setTimeout(() => {
            if(!el.classList.contains('active')) el.classList.add('hidden');
        }, 500);
    });
    
    const target = views[viewName];
    target.classList.remove('hidden');
    setTimeout(() => target.classList.add('active'), 10);
}

function startAssessment() {
    switchView('assessment');
    renderQuestion();
}

function renderQuestion() {
    const data = assessmentModel[currentStep];
    
    // Update Header
    document.getElementById('category-tag').textContent = data.category;
    document.getElementById('category-tag').style.display = 'inline-block';
    document.getElementById('question-text').textContent = data.prompt;
    document.getElementById('question-subtext').textContent = data.subtext || '';

    // Update Progress
    const progress = ((currentStep) / assessmentModel.length) * 100;
    progressBar.style.width = `${progress}%`;

    // Render Input
    inputArea.innerHTML = '';
    const currentVal = userAnswers[data.id] !== undefined ? userAnswers[data.id] : data.defaultValue;

    if (data.inputType === 'slider') {
        renderSlider(data, currentVal);
    } else if (data.inputType === 'select') {
        renderSelect(data, currentVal);
    } else if (data.inputType === 'number') {
        renderNumberInput(data, currentVal);
    }

    // Button Logic
    const isFirst = currentStep === 0;
    const isLast = currentStep === assessmentModel.length - 1;
    
    backBtn.disabled = isFirst;
    if(mobileBackBtn) mobileBackBtn.disabled = isFirst;
    
    if(mobileNextBtn) mobileNextBtn.textContent = isLast ? 'Finish' : 'Next →';
}

function renderSlider(data, currentVal) {
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    
    const display = document.createElement('div');
    display.className = 'range-value-display';
    display.textContent = `${currentVal} ${data.unit}`;
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = data.min;
    input.max = data.max;
    input.step = data.step;
    input.value = currentVal;
    
    input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        display.textContent = `${val} ${data.unit}`;
        userAnswers[data.id] = val;
    });

    // Initial set
    userAnswers[data.id] = parseFloat(input.value);

    wrapper.appendChild(display);
    wrapper.appendChild(input);
    
    // Range labels
    const labels = document.createElement('div');
    labels.className = 'range-labels';
    labels.innerHTML = `<span>${data.min}</span><span>${data.max}</span>`;
    wrapper.appendChild(labels);

    inputArea.appendChild(wrapper);
}

function renderSelect(data, currentVal) {
    const wrapper = document.createElement('div');
    wrapper.className = 'select-grid';
    
    data.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'select-btn';
        if (opt.value === currentVal) btn.classList.add('selected');
        btn.textContent = opt.label;
        
        btn.addEventListener('click', () => {
            document.querySelectorAll('.select-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            userAnswers[data.id] = opt.value;
        });
        
        wrapper.appendChild(btn);
    });
    
    // Default assignment if undefined
    if (userAnswers[data.id] === undefined) userAnswers[data.id] = data.defaultValue;
    
    inputArea.appendChild(wrapper);
}

function renderNumberInput(data, currentVal) {
   const wrapper = document.createElement('div');
   wrapper.className = 'number-input-wrapper';

   const input = document.createElement('input');
   input.type = 'number';
   input.className = 'number-input';
   input.value = currentVal;
   if(data.min !== undefined) input.min = data.min;
   if(data.max !== undefined) input.max = data.max;

   input.addEventListener('input', (e) => {
       userAnswers[data.id] = parseFloat(e.target.value);
   });
   
   // Initial
   userAnswers[data.id] = parseFloat(input.value);

   const label = document.createElement('span');
   label.className = 'number-unit-label';
   label.textContent = data.unit;

   wrapper.appendChild(input);
   wrapper.appendChild(label);
   inputArea.appendChild(wrapper);
}

// --- BRANCHING LOGIC ---

function hasCriticalIssues(answers) {
    // Check specific critical failure points
    // 1. Sleep < 6 hours
    if (answers.sleep_hours !== undefined && answers.sleep_hours < 6) return true;
    // 2. Processed Food > 50%
    if (answers.processed_food !== undefined && answers.processed_food > 50) return true; 
    // 3. No Exercise
    if (answers.exercise_habit === 'no') return true;
    // 4. High Stress
    if (answers.stress_level === 'high' || answers.stress_level === 'extreme') return true;
    
    return false;
}

function shouldShowQuestion(index) {
    if (index < 0 || index >= assessmentModel.length) return false;
    const item = assessmentModel[index];
    
    // Skip nitpicks if we have bigger problems
    if (item.isNitpick && hasCriticalIssues(userAnswers)) {
        return false;
    }
    
    if (item.condition && typeof item.condition === 'function') {
        const show = item.condition(userAnswers);
        return show;
    }
    return true;
}

function nextQuestion() {
    let nextStep = currentStep + 1;
    
    // Scan ahead for the next valid question
    while (nextStep < assessmentModel.length && !shouldShowQuestion(nextStep)) {
        nextStep++;
    }

    if (nextStep < assessmentModel.length) {
        currentStep = nextStep;
        renderQuestion();
    } else {
        finishAssessment();
    }
}

function prevQuestion() {
    let prevStep = currentStep - 1;
    
    // Scan backwards for the previous valid question
    while (prevStep >= 0 && !shouldShowQuestion(prevStep)) {
        prevStep--;
    }

    if (prevStep >= 0) {
        currentStep = prevStep;
        renderQuestion();
    }
}

function finishAssessment() {
    switchView('results');
    generateProtocol();
}

function generateProtocol() {
    generatedProtocol = [];
    
    assessmentModel.forEach(item => {
        // Skip evaluation if logic says we shouldn't have seen it, BUT
        // some invisible logic might still apply? 
        // Generally if we skipped asking, we probably shouldn't evaluate.
        if (item.condition && !item.condition(userAnswers)) return;

        const val = userAnswers[item.id];
        if (val === undefined) return;
        
        const result = item.evaluate(val, userAnswers);
        if (result) {
            generatedProtocol.push(result);
        }
    });

    renderResults();
}

function renderResults() {
    const list = document.getElementById('results-list');
    list.innerHTML = '';
    
    let items = generatedProtocol;

    if (items.length === 0) {
        list.innerHTML = `<div class="empty-state">No items found. You are doing great!</div>`;
        return;
    }

    // Sort by priority: critical > high > medium
    const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2 };
    items.sort((a, b) => {
        const pA = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 3;
        const pB = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 3;
        return pA - pB;
    });

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = `result-card priority-${item.priority}`;
        
        const protocolHtml = item.protocol.map(step => `
            <li class="protocol-step">
                <span class="check-icon"></span>
                <span>${step.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</span>
            </li>
        `).join('');

        const timelineHtml = item.timeline_results.map(t => `
            <div class="timeline-item">
                <span class="time-label">${t.time}</span>
                <p>${t.effect}</p>
            </div>
        `).join('');

        // Capitalize priority for display
        const priorityLabel = item.priority.charAt(0).toUpperCase() + item.priority.slice(1);

        const sourcesHtml = item.sources.map(id => {
            const source = bibliography[id];
            return source ? `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a></li>` : '';
        }).join('');

        card.innerHTML = `
            <div class="card-header">
                <div class="header-main">
                    <span class="priority-label">${priorityLabel} Priority</span>
                    <h4>${item.title}</h4>
                </div>
            </div>
            
            <div class="card-body">
                <div class="reasoning-section">
                    <h5>The Why</h5>
                    <p>${item.reasoning}</p>
                </div>

                ${item.risks ? `
                <div class="risk-section">
                    <h5>The Cost of Inaction</h5>
                    <p>${item.risks}</p>
                </div>
                ` : ''}

                <div class="protocol-section">
                    <h5>The What</h5>
                    <ul class="protocol-list">
                        ${protocolHtml}
                    </ul>
                </div>

                <div class="timeline-section">
                    <h5>The Result</h5>
                    <div class="timeline-container">
                        ${timelineHtml}
                    </div>
                </div>

                <div class="sources-section">
                    <details>
                        <summary>View Sources</summary>
                        <ul class="source-list">
                            ${sourcesHtml}
                        </ul>
                    </details>
                </div>
            </div>
        `;
        
        list.appendChild(card);
    });
}
