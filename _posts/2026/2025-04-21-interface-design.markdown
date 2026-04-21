---
layout: post
title:  "Thoughts on Interface Design"
date:   2026-04-21 21:27:00 +0530
author: Somdev Sangwan
type:   tech
image: /assets/thumbs/interface-design.png
permalink: /blog/interface-design
description: "Designing interfaces that real users love."
---

> tldr: if you are building an app, a machine, a website, a toy or any system that has a user - you will find something useful here. There's also a checklist in the end because I love you.

At the time of writing this, I have been programming for 9 years and studying epistemology for 2 years. Naturally, first we must think about:

### What's an interface? (important)
The system has some rules and the user wants something from the system. Interface sits between the two and tries to communicate needs to the system and rules to the user. When we are designing an interface, we are solving a communication problem.

A website is an interface and so is a warning message or pricing page within it. A locked door with a handle is an interface too (is it push or pull?). Even a litter box is an interface, it shouldn't get in the way of your cat doing its business.

Yes, that's what it all boils down to. A good interface lets the user perform the action they intend to perform in the easiest way possible.

### User is predicting
The user is always predicting. What is this? Can I click it? What will happen if I click it? Did it work? Can I undo it? Am I about to lose money? Am I being tricked?

This is happening very fast, usually without words. A user opens a food delivery app and thinks, where is pizza?
The answer has to be obvious or it all starts falling apart. Good interface design is mostly about making the user's predictions correct.

A button should look like it can be pressed. A disabled button should communicate why it is disabled. A destructive action should not look like a casual action. A "Continue" button should not secretly mean "Pay $5 every month until you notice".

A bad interface makes the user ask unnecessary questions. A good interface answers them before they become questions. This sounds simple, but apparently it is not, because half the internet is full of buttons named "Submit". Submit what? My soul?

Communicate clearly. "Continue to payment", "Pay", or "Pay $10" are better than "Continue".

### State
To help the users with predicting right, the system should always tell them what state it is in. Not in a philosophical way, although that would be nice. Just: where am I, what happened, what can I do now.

If I click save and I don't see a clear indicator of success, indicator of progress or explanation of why saving failed - I will be disoriented. And I don't want to see a technical failure message either (unless you are sure I'll understand it), tell me if I messed up or your system messed up.
If I messed up, tell me how to do it right. If your system messed up, tell me if I should wait, contact you or try restarting.

A good interface talks back at the right time, with the right information and in a language that makes sense to the user.

"Payment failed" or "Unable to reach server, payment failed" is bad. Tell me "The payment failed but no money was deducted. Try again after some time." or "The payment failed but money was deducted. Contact support."

### Visual Hierarchy & Structure

What do you want the user to look at first? What things are related to each other and how? That's what visual hierarchy is about.

A dashboard where every metric has the same weight is saying that all of those metrics are equally important. Interface needs to have an opinion on what the user needs to pay attention to first.

It needs to say "this is important" and "this is less important". Also, "this will be rarely used" and "this is dangerous". And in many cases, "this is decorative and should maybe shut up when there are more important things."

Visual hierarchy is done through size, colors, spacing etc. - you can find all that in plenty of learning material.

Also, it is easy to confuse simplicity with emptiness. Sure, an app for beginners should not look like an aircraft cockpit with many buttons BUT an aircraft cockpit should look like an aircraft cockpit.

A dense interface can be good if relationships are clear. A sparse interface can be bad if it hides useful information and actions. People don't always want fewer things. They want the right things in the right place.

"Make it clean" is not enough. Clean for whom? Clean for first use or repeated use?

If a feature is not commonly used, it's fine to keep it tucked away but easy to find. If a feature is meant to be used fifty times a day, don't get in user's way. Make it approachable for first use and a delight to use in long term.

You can't have everything, you can't please everyone. Thus, the interface needs to have an opinion on what the user needs to see first and needs most. This opinion can be validated by letting people test it.

### Consistency
The user should be able to tell whether two things are similar or different.

If a blue underlined word opens a new page in one place, downloads a file in another place, and opens a modal somewhere else, the user has to keep relearning your interface. That is bad.

If one dropdown opens on click, don't make another open on hover. If one destructive action is red, don't make another look harmless. Similar things should look similar. Different things should look different.

Try to reuse what the user has already seen. Not just on your interface, but in the world.

An average user knows what a save icon looks like. Don't use a basket icon for "save" just because it fits your recipe app theme. Yes, I know, that example is cute. But every new concept you teach the user is extra work for them.

If your app is really, really good and people love it and you are pure-hearted, then maybe you can get away with teaching new patterns. Otherwise, no, your clever little metaphor is probably not helping.

Here's the gist:

Don't go against common patterns unless you have a very good reason and you have tested it with real people.
Make the user learn as few new things as possible.
Reuse your patterns. Let the user predict right.

### Mistakes
The best error message is the one the user never sees because the interface prevented the error in the first place.

If a username is taken, say it before the user submits the whole form. If you reject files above a certain size, say that before the user picks one.

Good design prevents mistakes, even if you think no one would make them. They will. Be serious.

Reality means slow internet, old phones, tired people, autofill doing insane things, long names, small screens, color blindness, noisy rooms, shaky hands, low literacy, interrupted attention, and people who are already annoyed before they even reach your product.

Some day there will be a user who is pissed off at your system and your system will piss them off even more and they will leave. Design with that person in mind.

Some actions should be harder to do by accident. Deleting an account, sending money, publishing something public, exposing private data, rotating production keys. Those actions should require the user to understand what is about to happen and still choose it.

### Recovery
Users forgive mistakes if they can recover. Undo is one of the most humane inventions in software. Mistakes will happen and the user needs to be safe when they do.

Always think: what if the user doesn't want what just happened? Back, cancel, restore, edit, draft, history, preview. These things make the user feel safe and in control.

Some pop-ups grab you by force and yell "decide now." No. I don't want to decide now. Maybe I want to go back and check something. Maybe I clicked by mistake. Maybe your pop-up shouldn't exist.

Try your best to prevent mistakes. If one still happens, give the user a clear way out.

Recovery also applies to things the user wants to stop. A subscription. A newsletter. A public post. A saved card. A synced device. The user should be able to leave, cancel, undo, go back, or change their mind without feeling like they are fighting the product.

### Accessibility
It is very common to design interfaces and only then think about how to make them accessible, this is wrong.

If you are displaying low contrast text because it looks aesthetic, there's a user unable to read it well under sunlight or a VGA monitor with a bad glare. It’s not just about people with low vision.

If your interface doesn't work with keyboard alone, you have excluded the users with mobility disabilities who are unable to use mouse but have also annoyed the keyboard-first power users.

Closed captioning (subtitles *sigh*) are not just for deaf people, a lot of people use them.

Keeping the layout, structure, navigation and language clear helps everyone. Accessibility isn't charity or a checkbox.

### Beauty & Delight

Effects of beauty are hard-wired in humans, and many other animals. A beautiful interface will be perceived to be more trustworthy, usable and delightful.

The literal interpretation of "form follows function" (i.e. make it work first then make it pretty) does more harm than good. The beauty/form has a function, the function is to make the user feel a certain way - calm, in control, excited, safe - whatever the interface's intent is.

A functional but old-looking website will make the user skeptical of the quality of the system. On the other hand, a beautiful interface will feel more good than it actually is.

What makes something beautiful is too abstract. It has an entire field of philosophy called aesthetics. Lets not get into that.

But it is safe to say that you shouldn't add a gradient, glass effect, animation, shadow, illustration or any fancy material blindly. Everything you add needs to have a reason. Use them to guide attention, create hierarchy, reduce fear, signal playfulness or explain something. Looking "cool" is a good enough reason but only if it doesn't degrade the interface.

If the interface is designed well and it looks beautiful, think about delight. Delight is a small hanger placed next to a washbasin so the person can have both hands free in case they are carrying something. Delight is details, it makes a good design great.

Have you ever tried to select an item in a secondary dropdown menu but you accidentally moved your cursor slightly out of the menu and the dropdown closes? Think about those things.

I don't know what else to say, I think it's a good place to end. If this helps you in future or has helped you already, you can [buy me a coffee](https://buymeacoffee.com/s0md3v) or even better, [sponsor me on GitHub](https://github.com/sponsors/s0md3v).

> Keep in mind: Interface design is a communication problem. Communicate clearly and honestly. Help the user's predictions be right. If they mess up, help them recover. Create interfaces that are delightful to use.

<details>
<summary>Here's the checklist:</summary>

- Can the user tell what is clickable?
- Does the button say what it actually does?
- Can the user predict what will happen before they click?
- Is it obvious what state the system is in?
- If something fails, does the user know what happened?
- Does the user know if they messed up or your system messed up?
- Are dangerous actions hard to do by accident?
- Are common mistakes prevented early?
- Are limits and constraints disclosed before the user runs into them?
- Can the user undo, cancel, go back, restore, edit, or change their mind?
- Are similar things behaving similarly?
- Does the interface guide attention to the right thing first?
- Are frequent actions easy to do repeatedly?
- Are uncommon actions tucked away but still easy to find?
- Does it work on slow internet, old phones, small screens and keyboard alone?
- Is the text readable in bad conditions?
- Is the beauty helping the interface or just decorating confusion?
- Does the interface get in the way less than it helps?
</details>
