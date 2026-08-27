---
layout: post
title:  "Thoughts on Code Quality"
date:   2026-08-27 20:01:00 +0530
author: Somdev Sangwan
type:   tech
image: /assets/thumbs/code-quality.png
permalink: /blog/code-quality
description: "Code quality and vibe coding."
---

Good code is readable, secure by design, performant, resilient and easy to modify when needed. There are plenty of classic books about how to write code that does those things well.

The problem is that such advice needs judgement to apply. You usually can't create absolute rules out of it and apply them blindly everywhere every time.

AI agents are now good enough to make those judgements given the context, you just need to remind them to do so through AGENTS.md or $current_trend.

Also, now there are new aspects to programming that weren't there before. "Computa!!  Port my codebase to rust and refactor it to make the modules deep, not shallow." and it's done. It is tempting to think that everything is possible and reversible, lets just build it.

Another issue is context and memory. A good codebase is comprehensible i.e. the programmer doesn't need to make unnecessary jumps between files and functions to understand something. It is even more important for LLMs because the quality drops as context fills up. It takes longer and costs more too.

We will discuss how to build better software with AI in three phases: design, the code itself, and how to keep it all together as it evolves.

## Design
If you want to build something good and serious, don't rush into it even though it's so easy. Making prototypes is fine, they can help you get clarity.

Then, start by writing down what parts your software will have. Some will be necessary, some will be things you think your software should do. It's okay to not have a complete plan. User feedback and real world testing will change some (if not many) assumptions about your software's future. Our main goal is to put some thought into the decisions that will be tedious to undo because they spread through the entire codebase.

This helps the agents too, in two ways:  
1. Agents struggle with context, memory and nuances. Our opinions/feedback/decisions are the last lines of defence against the mess the agents will create with their "recommended" decisions.
2. If you can show the agent the "big picture" without really asking it build it in one go, it makes better choices and can give you heads up on things.

Before you really start though, look at existing similar software first. Software improve with feedback from real world usage, those software have already gone through that. See if there's something you can learn. Also, many parts of building software are already solved problems. Don't reinvent the wheel, at least not until your car becomes too fast for the wheel. 
If building it requires domain knowledge and you don't have it, spend some time learning.

It's not advisable to spend time coming up with the perfect architecture, you can spend it on what the software is actually meant to do. Use mature dependencies instead of cobbling together your own implementation, you can always replace it later once everything works. Make it work before making it right, just take notes or add comments on what may break later.

## The code itself
This is the part that first comes to mind when code quality is discussed. How the code is formatted, how much abstraction is good, approach to testing, file structure etc.

Why do we even care about these things? Because they exist so that the code can be understood, reviewed and changed easily.

The easiest way to do that is to minimize the amount of information you need to keep in your mind (or context window :p) to understand/review/change something. When you look at a function or module, you should be able to grasp its purpose from its name and public interface, deep inspection is to see the implementation.

Absolute advice like "break down large modules" or "don't repeat yourself" will break the logic down into many pieces and spread them through many files. For every change, the agent will need to make sense of this web and cross its fingers hoping nothing breaks because all you will do is to get another agent to review it and make sure your thousands of AI-written tests pass. Some may even not do that.

If something can be tested automatically, do that instead of wasting agent's context and attention. Set up type checking, linting, tests, dependency checks and so on.

## Evolution

A function can have the perfect name on the day it is created but then shrink/grow/change its functionality. An abstraction can be clean while writing but then it may force unrelated parts of the system to change together. Same goes for modules or even concepts.

We need to keep reviewing changes to understand their rippling effects and rename/remove/move/combine/split things accordingly. Trust me, doing it as you go is much much better than a big refactor.

Do it when you are done making changes. With either a fresh session or subagent(s).
If you have a step in your pipeline that uses AI to review the code for bugs, keep this code quality review step before that so the code quality changes don't accidentally break something.

## So, how do we do this?
I don't know what's the best way to do this because that will require a lot of benchmarking to claim that it is the best way. I just hope that I was able to help you think about code quality in this new era. Here are a few lines that you may want to use a starting point:

```
Make architectural decisions for the long term. If clarity for long term decision is missing, pick something safe instead of premature optimization/engineering.

Use a proven dependency over custom implementation whenever possible.

Write tests for behavior, not implementation details. If a test is written to prove a fix/removal, either delete it before finalizing your response or don't write in the first place.

Prefer deep modules over shallow ones whenever justifiable.

Duplicated code is better than a unjustified abstraction. Abstraction is good when it is for a stable concept.

Write error handling only for errors that can actually happen.

Once changes are confirmed to work, review the changes to:
- Remove dead code and unwanted speculative code
- See if something can be named better, collapsed (e.g. abstractions with no benefit), or split (e.g. unrelated responsibilities)
- Simplify conditionals and data flow
```
