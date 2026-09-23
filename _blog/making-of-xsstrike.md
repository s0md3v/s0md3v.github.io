---
layout: post
title:  "XSStrike: Solving XSS Scanning"
date:   2017-06-15 12:46:00 +0530
author: Somdev Sangwan
type:   tech
image: /assets/thumbs/xsstrike.png
permalink: /blog/making-of-xsstrike
description: "Making of s0md3v/xsstrike repository"  
---

Before XSStrike, existing XSS scanners followed a primitive approach: inject payloads blindly and hope something sticks. This brute-force methodology resulted in countless false positives and missed vulnerabilities that required more nuanced detection.

The fundamental issue I identified was that traditional XSS scanners were context-blind. They would inject the same generic payloads regardless of where user input was reflected in the HTML response. A payload that works in an HTML context might be completely useless in a JavaScript string context, and vice versa.

I realized that effective XSS detection required understanding the precise context where user input appears in the response. This led me to develop XSStrike's core innovation: context-aware payload generation.

### Novel Technique #1: Intelligent HTML Parsing

The first breakthrough was creating a sophisticated HTML parser that could identify not just where user input was reflected, but how it was reflected. My parser analyzes multiple contexts:

1. HTML context (between tags)
2. Attribute context (within tag attributes)
3. Script context (inside JavaScript code)
4. Comment context (within HTML comments)

It also collects surrounding text to understand how the input is used, which helps in crafting more effective payloads.

### Novel Technique #2: Context-Aware Payload Generation

Once I could accurately identify reflection contexts, I developed an payload generator that crafts XSS vectors specifically tailored to each context.

For HTML contexts, the generator creates payloads using event handlers and HTML tags. For JavaScript contexts, it analyzes the surrounding code structure using my JavaScript context analyzer to determine what characters are needed to break out of the current context.

The generator assigns confidence scores to payloads based on their likelihood of success, prioritizing the most promising vectors.

### Novel Technique #3: Efficiency-Based Filtering

Rather than just checking if a payload executes, I implemented an efficiency scoring system that measures how well a payload survives filtering mechanisms.

The checker wraps test payloads with marker strings (st4r7s and 3nd) and uses fuzzy string matching to determine what percentage of the payload survived any filtering. This allows XSStrike to identify partial filtering and adjust its approach accordingly.

### Novel Technique #4: WAF Detection and Evasion

I recognized that Web Application Firewalls (WAFs) were becoming increasingly common, so I built comprehensive WAF detection capabilities. XSStrike can identify over 60 different WAF products by analyzing response headers, status codes, and page content.

More importantly, I developed evasion techniques using character encoding, case randomization, and alternative syntax. The tool includes a fuzzing engine that tests various bypass techniques against detected filtering mechanisms.