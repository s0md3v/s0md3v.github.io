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
                title: "Get more sleep",
                reasoning: "You're likely sleep-deprived. Sleeping less than 6 hours makes it hard to focus and affects your mood in ways caffeine can't fix.",
                timeline_results: [
                    { time: '1 Week', effect: 'You\'ll feel less anxious and irritable. Cravings for sugary foods will start to fade.' },
                    { time: '30 Days', effect: 'You\'ll have more stable energy throughout the day without the afternoon crash.' },
                    { time: 'Long Term', effect: 'Your brain clears out metabolic waste and toxins while you sleep, protecting your long-term cognitive health.' }
                ],
                protocol: [
                    "**Screen curfew**: Stop looking at screens an hour before you want to sleep.",
                    "**Cool room**: Keep your bedroom cool (around 18°C/65°F).",
                    "**Magnesium**: Some find Magnesium Glycinate helpful for relaxing before bed."
                ],
                sources: [1, 5],
                risks: "Chronic sleep deprivation is linked to long-term health issues and constant brain fog."
            };
            if (val < 7) return {
                id: 'sleep_optimization',
                type: 'foundation',
                priority: 'medium',
                title: "Sleep a bit more",
                reasoning: "You're close, but getting an extra hour of sleep can significantly improve your memory and focus.",
                timeline_results: [
                    { time: '1 Week', effect: 'Waking up will feel easier. You\'ll feel sharper during the day.' },
                    { time: '1 Month', effect: 'You\'ll be more resilient to stress. Little annoyances won\'t bother you as much.' },
                    { time: '1 Year', effect: 'Your immune system will be stronger, meaning you\'ll likely get sick less often.' }
                ],
                protocol: [
                    "**15-minute shifts**: Try going to bed 15 minutes earlier every few days until you reach 8 hours.",
                    "**Earlier coffee**: Try to have your last coffee before 2 PM.",
                    "**Darkness**: Make your room as dark as possible."
                ],
                sources: [1],
                risks: "Consistently missing just one hour of sleep adds up over time, affecting your performance and long-term health."
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
            { value: 'consistent', label: 'Consistent (within 30 mins)' },
            { value: 'varied', label: 'I sleep in on weekends' },
            { value: 'irregular', label: 'It varies by 2+ hours' }
        ],
        defaultValue: 'consistent',
        evaluate: (val) => {
            if (val === 'irregular' || val === 'varied') return {
                id: 'circadian_anchor',
                type: 'foundation',
                priority: 'high',
                title: "Wake up at the same time",
                reasoning: "Waking up at different times confuses your body clock, making it harder to wake up and fall asleep.",
                timeline_results: [
                    { time: '3 Days', effect: 'Waking up feels like less of a chore.' },
                    { time: '2 Weeks', effect: 'You\'ll fall asleep faster at night because your body knows when bedtime is.' },
                    { time: 'Long Term', effect: 'Better energy levels and more consistent metabolism.' }
                ],
                protocol: [
                    "**Same wake time**: Try to wake up at the same time every day, even if you stayed up late.",
                    "**Morning light**: Get some sunlight in your eyes shortly after waking up.",
                    "**No snooze**: Avoid the snooze button; it just makes you more groggy."
                ],
                sources: [1],
                risks: "An irregular schedule makes it harder for your body to regulate hormones and energy."
            };
            return null;
        }
    },
    {
        id: 'screens_before_bed',
        category: 'Sleep',
        prompt: 'Do you look at your phone in bed?',
        inputType: 'select',
        options: [
            { value: 'always', label: 'Every night' },
            { value: 'sometimes', label: 'A few times a week' },
            { value: 'no', label: 'Rarely / Never' }
        ],
        defaultValue: 'always',
        evaluate: (val) => {
            if (val === 'always') return {
                id: 'blue_light_detox',
                type: 'foundation',
                priority: 'high',
                title: "No screens in bed",
                reasoning: "The light from your phone tells your brain it's daytime, which stops it from producing the hormones you need to sleep.",
                timeline_results: [
                    { time: 'Tonight', effect: 'You\'ll likely fall asleep faster.' },
                    { time: '1 Week', effect: 'Better quality sleep and more vivid dreams.' },
                    { time: '1 Month', effect: 'You\'ll feel more rested because your sleep wasn\'t disrupted by light.' }
                ],
                protocol: [
                    "**Phone station**: Charge your phone away from your bed.",
                    "**Night mode**: Use 'warm' color settings on your devices after sunset.",
                    "**Paper books**: Read a physical book if you need something to do before sleep."
                ],
                sources: [4],
                risks: "Screen use in bed is one of the most common reasons for poor sleep quality."
            };
            return null;
        }
    },

    // --- NUTRITION ---
    {
        id: 'processed_food',
        category: 'Nutrition',
        prompt: 'How much do you rely on processed food?',
        subtext: '(Chips, fast food, frozen meals, soda)',
        inputType: 'slider',
        min: 0, max: 100, step: 10,
        unit: '%',
        defaultValue: 30,
        evaluate: (val) => {
            if (val > 40) return {
                id: 'whole_foods_transition',
                type: 'foundation',
                priority: 'critical',
                title: "Eat less processed food",
                reasoning: "Processed foods are designed to be overeaten and often lead to inflammation and low energy.",
                timeline_results: [
                    { time: '3 Days', effect: 'You\'ll feel less bloated and have more consistent energy.' },
                    { time: '2 Weeks', effect: 'Your taste buds will adjust, and real food will start to taste better.' },
                    { time: '3 Months', effect: 'Better weight management and clearer skin.' }
                ],
                protocol: [
                    "**Shop the edges**: Buy most of your food from the produce, meat, and dairy sections.",
                    "**Simple ingredients**: Try to avoid foods with long lists of ingredients you don't recognize.",
                    "**Batch cook**: Prepare some simple meals in advance so you aren't tempted by fast food."
                ],
                sources: [109, 112],
                risks: "A diet high in processed foods is a major driver of most modern health problems."
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
            { value: 'late', label: '1-2 hours before bed' },
            { value: 'snack', label: 'Right before bed / In bed' }
        ],
        defaultValue: 'late',
        evaluate: (val) => {
            if (val === 'late' || val === 'snack') return {
                id: 'early_dinner',
                type: 'foundation',
                priority: 'high',
                title: "Don't eat before bed",
                reasoning: "Your body needs to focus on resting and repairing itself while you sleep, not digesting a heavy meal.",
                timeline_results: [
                    { time: 'Tonight', effect: 'Your heart rate will be lower during sleep, leading to better recovery.' },
                    { time: '1 Week', effect: 'Reduced chance of heartburn or indigestion.' },
                    { time: 'Long Term', effect: 'Better metabolic health and weight control.' }
                ],
                protocol: [
                    "**Kitchen's closed**: Pick a time (like 8 PM) to stop eating for the night.",
                    "**Tea**: If you feel like snacking, try a cup of herbal tea instead.",
                    "**Brush early**: Brushing your teeth right after dinner can help stop the urge to snack."
                ],
                sources: [14],
                risks: "Eating late can disrupt your sleep and slow down your body's natural repair processes."
            };
            return null;
        }
    },

    // --- MOVEMENT (BRANCHED) ---
    {
        id: 'exercise_habit',
        category: 'Movement',
        prompt: 'Do you exercise regularly?',
        subtext: '(Gym, running, sports, home workouts)',
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
                title: "Exercise more",
                reasoning: "Humans aren't meant to be sedentary. Regular movement is essential for almost every part of your health.",
                timeline_results: [
                    { time: 'Immediately', effect: 'Exercise releases endorphins that improve your mood right away.' },
                    { time: '2 Weeks', effect: 'You\'ll notice you have more stamina and get tired less easily.' },
                    { time: '1 Year', effect: 'You\'re significantly lowering your risk of major health issues and adding years to your life.' }
                ],
                protocol: [
                    "**Daily walk**: Start with just 20 minutes a day.",
                    "**Take the stairs**: Skip the elevator and take the stairs whenever you can.",
                    "**Bodyweight basics**: Try doing 5-10 squats or pushups when you have a free moment."
                ],
                sources: [139],
                risks: "Not moving enough is a major risk factor for chronic disease and faster aging."
            };
            return null;
        }
    },
    {
        id: 'sedentary_bouts',
        category: 'Movement',
        prompt: 'How long do you usually sit at a time without getting up?',
        subtext: '(Work, TV, gaming, studying)',
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
                title: "Sit less",
                reasoning: "Sitting for hours at a time is bad for your circulation and metabolism, even if you exercise later.",
                timeline_results: [
                    { time: 'Immediately', effect: 'Standing up improves your blood sugar regulation and wakes up your muscles.' },
                    { time: '1 Month', effect: 'Less stiffness in your hips and lower back.' },
                    { time: 'Long Term', effect: 'Better overall metabolic health.' }
                ],
                protocol: [
                    "**The 30-minute rule**: Try to stand up every half hour, even just for 30 seconds.",
                    "**Drink water**: It'll keep you hydrated and force you to get up more often.",
                    "**Active breaks**: Do a quick stretch or pace around while waiting for things (like coffee brewing)."
                ],
                sources: [139],
                risks: "Long periods of sitting are linked to metabolic issues and increased inflammation."
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
                title: "Walk more",
                reasoning: "Walking 7,000 steps a day cuts your risk of early death by nearly 50%. It is one of the most effective things you can do for your health.",
                timeline_results: [
                    { time: '1 Week', effect: 'Better digestion and a more stable mood.' },
                    { time: '1 Month', effect: 'Possible improvements in blood pressure and energy.' },
                    { time: 'Lifetime', effect: 'Staying mobile now helps you stay independent as you get older.' }
                ],
                protocol: [
                    "**Walk and talk**: Take phone calls while walking around.",
                    "**Park further away**: Don't always look for the closest parking spot.",
                    "**Post-meal walk**: A 10-minute walk after dinner is great for your blood sugar."
                ],
                sources: [139, 140],
                risks: "Very low activity levels are linked to poor cardiovascular health and brain aging."
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
                title: "See people more often",
                reasoning: "Regular social contact is essential for mental health. Chronic loneliness carries a health risk comparable to smoking 15 cigarettes a day.",
                timeline_results: [
                    { time: 'Immediately', effect: 'Socializing can instantly improve your mood and lower your stress.' },
                    { time: '1 Month', effect: 'You\'ll feel more connected and less anxious on a daily basis.' },
                    { time: 'Long Term', effect: 'Strong social ties are one of the best predictors of long-term happiness and brain health.' }
                ],
                protocol: [
                    "**Schedule a date**: Put a coffee date or a quick call on your calendar.",
                    "**Quick call**: Call a friend for just 10 minutes to catch up.",
                    "**Join a group**: Look for a local club or hobby group to meet new people."
                ],
                sources: [130, 31],
                risks: "Chronic isolation is linked to higher stress levels and a weaker immune system."
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
            { value: 'extreme', label: 'Extreme - Constantly overwhelmed' }
        ],
        defaultValue: 'moderate',
        evaluate: (val) => {
            if (val === 'high' || val === 'extreme') return {
                id: 'stress_protocol',
                type: 'foundation',
                priority: 'critical',
                title: "Manage stress",
                reasoning: "Being constantly stressed is hard on your heart and makes it difficult to sleep or recover from exercise.",
                timeline_results: [
                    { time: 'Immediate', effect: 'Simple breathing exercises can lower your heart rate in seconds.' },
                    { time: '1 Week', effect: 'You\'ll likely find it easier to fall asleep and stay asleep.' },
                    { time: 'Long Term', effect: 'You\'ll be better protected against burnout and stress-related health issues.' }
                ],
                protocol: [
                    "**Physiological Sigh**: Take a deep double-breath in through your nose, then a long exhale through your mouth. Repeat 3 times.",
                    "**Nature time**: Spend just 10 minutes outside; it lowers stress hormones naturally.",
                    "**Short breaks**: Take 10 minutes a day to sit quietly without your phone."
                ],
                sources: [154],
                risks: "Constant high stress affects your memory and makes it harder for your body to manage weight."
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
                title: "Fix your gums",
                reasoning: "Bleeding gums are a sign of inflammation. Keeping your mouth healthy is surprisingly important for your heart health too.",
                timeline_results: [
                    { time: '1 Week', effect: 'Bleeding will start to stop as your gums heal.' },
                    { time: '1 Month', effect: 'Less inflammation in your mouth means less stress on your immune system.' },
                    { time: 'Long Term', effect: 'Good oral health is linked to a lower risk of heart disease.' }
                ],
                protocol: [
                    "**Floss daily**: Use a gentle floss to clean between your teeth every day.",
                    "**Salt water**: Rinsing with warm salt water can help soothe irritated gums.",
                    "**See a dentist**: If bleeding persists, a professional cleaning is usually necessary."
                ],
                sources: [56, 112],
                risks: "Gum issues can allow bacteria to enter your bloodstream, which can affect your heart over time."
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
            { value: 'supplement', label: 'I take Vitamin D' },
            { value: 'low', label: 'Mostly indoors / < 15 mins' }
        ],
        defaultValue: 'low',
        evaluate: (val) => {
            if (val === 'low') return {
                id: 'vitamin_d_sun',
                type: 'foundation',
                priority: 'high',
                title: "Get some sun",
                reasoning: "Sunlight helps your body produce Vitamin D and regulates your internal clock. Lack of sun is linked to lower mood and energy.",
                timeline_results: [
                    { time: '1 Week', effect: 'Getting morning sun helps you fall asleep more easily at night.' },
                    { time: '3 Months', effect: 'Improved mood and stronger immune function.' },
                    { time: 'Long Term', effect: 'Better bone health and lower risk of chronic issues.' }
                ],
                protocol: [
                    "**Morning sun**: Try to get 10-20 minutes of sun on your skin before 10 AM.",
                    "**Supplement**: If you live somewhere with little sun, consider a Vitamin D supplement.",
                    "**Eat fish**: Foods like salmon are good natural sources of Vitamin D."
                ],
                sources: [160],
                risks: "Vitamin D deficiency is very common and is linked to depression and weak immunity."
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
                title: "Intense exercise",
                reasoning: "Occasionally pushing your heart rate up makes your cardiovascular system much more efficient.",
                timeline_results: [
                    { time: 'During Workout', effect: 'It feels hard, but that\'s what signals your heart to get stronger.' },
                    { time: '1 Month', effect: 'Normal activities like climbing stairs will feel much easier.' },
                    { time: '1 Year', effect: 'You\'ll have significantly better cardiovascular fitness and endurance.' }
                ],
                protocol: [
                    "**Intervals**: Try 1 minute of fast running or cycling followed by 1 minute of rest. Repeat a few times.",
                    "**Hill walks**: Walk up a steep hill until you're breathing hard.",
                    "**Sports**: Play a game that involves some sprinting, like football or tennis."
                ],
                sources: [17],
                risks: "Without occasional intensity, your cardiovascular fitness can decline faster as you age."
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
                title: "Strength training",
                reasoning: "Keeping your muscles strong protects your joints and helps maintain your metabolism.",
                timeline_results: [
                    { time: '2 Weeks', effect: 'You\'ll start to feel more "solid" and capable during daily tasks.' },
                    { time: '3 Months', effect: 'Visible changes in posture and muscle tone.' },
                    { time: 'Long Term', effect: 'Strong muscles protect your bones and help you stay mobile as you get older.' }
                ],
                protocol: [
                    "**Basic movements**: Try pushups, squats, and lunges.",
                    "**Twice a week**: Just two strength sessions a week are enough to see big benefits.",
                    "**Use weights**: If bodyweight exercises get easy, try using some dumbbells or resistance bands."
                ],
                sources: [20],
                risks: "Muscle loss is a major cause of weakness and injury as people age."
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
                title: "Less phone time",
                reasoning: "Constant scrolling can fragment your attention and make you feel more anxious or bored with real life.",
                timeline_results: [
                    { time: '2 Days', effect: 'You might feel bored at first, but this often leads to more creativity.' },
                    { time: '2 Weeks', effect: 'Your focus will improve, making it easier to read or work without distraction.' },
                    { time: '1 Year', effect: 'You\'ll get back a surprising amount of time for other hobbies and activities.' }
                ],
                protocol: [
                    "**Grayscale**: Try setting your phone to black and white; it makes it much less addictive.",
                    "**Turn off alerts**: Disable non-essential notifications so your phone isn't constantly buzzing.",
                    "**Keep it away**: Don't keep your phone in your pocket when you're at home."
                ],
                sources: [153],
                risks: "Endless scrolling can lower your attention span and increase feelings of restlessness."
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
                    <h5>Why it matters</h5>
                    <p>${item.reasoning}</p>
                </div>

                ${item.risks ? `
                <div class="risk-section">
                    <h5>If you don't</h5>
                    <p>${item.risks}</p>
                </div>
                ` : ''}

                <div class="protocol-section">
                    <h5>What to do</h5>
                    <ul class="protocol-list">
                        ${protocolHtml}
                    </ul>
                </div>

                <div class="timeline-section">
                    <h5>What to expect</h5>
                    <div class="timeline-container">
                        ${timelineHtml}
                    </div>
                </div>

                <div class="sources-section">
                    <details>
                        <summary>Sources</summary>
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
