---
layout: post
title:  "Geolocating Satellite Dishes"
date:   2024-08-09 17:19:00 +0530
author: Somdev Sangwan
tags:   [research, osint]
image: /imgs/thumbs/dishtance.png
permalink: /blog/geolocating-satellite-dishes
description: "How to be good at multiple things and why?"  
---

When a video/photograph is part of an investigation, it is crucial to determine when and where it was shot. Sometimes, this information is within the context itself and sometimes it is present within the metadata of the image/video file. During real-world criminal/fact-check investigations, usually it's not simple, and you have to find clues within the footage such as written text, shadows, weather, flora/fauna, brands, cultural references, etc.
One of these clues is satellite dishes, most commonly used for television broadcasting to the general public.

### Basics
> Note: This information is intended for a non-technical audience, thus some terms may be used loosely.

Satellites that need to be in a fixed spot in the sky at all times must be placed in the geostationary orbit. Geostationary orbit is an orbit 35,786 km right above the equator, and the satellites in it are called geostationary satellites. Satellites in this orbit revolve around the earth at a speed equivalent to earth's spin speed, thus they appear "stationary".

![geostationary orbit animated](https://science.nasa.gov/wp-content/uploads/2023/07/05-geostationary-sat-ani.gif)

To connect to a geostationary satellite, you must point your antenna towards it at a certain angle. The angle is proportional to your distance from the satellite.

![elevation](https://github.com/user-attachments/assets/5ee93343-129e-4eb1-9fc6-789f6b79c85a)

### The big idea
At a given location, the angle (called elevation angle) and the direction (called north angle) required to connect to a specific satellite can be [easily calculated](https://www.satsig.net/maps/satellite-tv-dish-pointing-south-east-asia.htm) using trigonomety. What if we could guess the angle and direction of a dish from a photo and 'reverse' this calculation? We will get a set of coordinates, yes.

If a formula takes multiple arbitrary inputs to produce an output, it is not possible* to get the inputs back with just the result. There's an opportunity to use brute-force here as we can pick random inputs, apply the formula and check if it matches our result. To optimize this trial-and-error approach, I used [gradient desecent](https://en.wikipedia.org/wiki/Gradient_descent) algorithm which factors in how far we are from the result while brute-forcing.
Based on this, I wrote code that takes elevation angle, north angle, and satellite longitude to produce a set of coordinates where these angles are required to connect to the given satellite. Let's call that code findLocation function for now.
Realistically, it is unlikely to get accurate angles from a photo. Thus, in addition to, let's say, 30 degrees - the program must accept a range as input e.g., 35-45 degrees.\
To get around this limitation, we use a different approach.

![calculation](https://raw.githubusercontent.com/s0md3v/s0md3v.github.io/main/imgs/inline/calculation.png)

**Step 1.** Use the upper limit of elevation angle range as elevation angle to find a set of coordinates with findLocation function. Then, measure the distance between this location and location right under satellite on earth (let's call it center). Finally, create a circle around the center using the said distance as radius.\
**Step 2.** Do the same process but using the lower limit this time.\
**Step 3.** Create a ring by subtracting the first circle from the second circle.\
**Step 4.** Then, create two lines emerging from the center to locations calculated by using max_elevation_angle+10 with min_north_angle and max_north_angle respectively. Join the ends of these two lines to create a triangle ABC.\
**Step 5.** Intersect the triangle ABC and the ring obtained in `Step 3`. to get the desired area.

On top of the inability to precisely determine angles from a photo, it is unlikely to determine what satellite a dish is connected to. If we perform these calculations for each satellite, we would have more than 300 guesses which is mostly unhelpful. However, I was able to overcome this with some clever tricks; let's walk through them.

#### Coverage
Just because a satellite is visible from your location doesn't mean that you can connect to it. Each satellite projects one or more "beams" at specific regions on the ground and only those regions can connect to the satellite. Each beam can serve a different purpose and have a different frequency (called a band).

I collected such coverage data for 300+ satellites from various sources. If a guessed location for a given satellite doesn't fall under that satellite's coverage, it can be discarded. This significantly reduces the search space.

#### Deductions
There are other methods to further narrow the number of guesses down:

1. Any guessed places that are unlikely such as in the middle of nowhere or an ocean - they can be discarded.
2. The footage may have enough clues for the location to be narrowed down to a handful of countries or exclude a list of countries. Such information can rule out many guesses.
3. In some cases, the context and size of the satellite can be used to deduce the band the dish might be using. Thus, the coverage areas can be filtered out based on what bands they operate with.
4. If any branding is visible on the dish, a simple Google search can reveal which satellite(s) that brand is affiliated with.

### Tool: Dishtance
Keeping all this in mind, I created a tool named "Dishtance". It allows the user to control all the parameters of the search and displays the results on the world map.

**Github:** [https://github.com/s0md3v/dishtance](https://github.com/s0md3v/dishtance)

![dishtance demo](https://github.com/user-attachments/assets/bb79cfd6-2feb-4c86-a929-1a06fbfaecfb)

This solves an incredibly niche problem but it must prove invaluable to journalists and investigators when needed. Furthermore, I hope this project motivates researchers to automate more *non-automatable* problems in chronolocation, geolocation, and other related fields.
