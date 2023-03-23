---
layout: post
title:  "ReDOS in ModSecurity"
date:   2019-04-22 11:32:00 +0530
author: Somdev Sangwan
tags:   [security]
image: /imgs/thumbs/modsecurity-redos.png
permalink: /blog/modsecurity-redos
description: "A tale of how I found 5 ReDOS vulnerabilities in ModSecurity CRS."  
---

I have been spending a good amount of time writing ReDOS exploits and studying WAFs lately.
To practice my skills in the real world, I chose Mod Security Core Rule Set because it has tons of regular expressions.
On top of that, these regular expressions are being used by WAFs in the wild to detect attacks.
Two birds with one stone!

Well, CRS has 29 configuration files which contain tons of regular expression so it wasn’t possible for me to go through all of them so I decided to automate some part of it.
The program I wrote for this purpose isn’t public at the moment so please use this "[hack](https://twitter.com/s0md3v/status/1119645565845823489)" instead.

Anyways, after extracting potentially vulnerable patterns, I used [regex101.com](https://regex101.com/) to identify and remove alternate sub-patterns e.g. removing `(fine)` from `((fine)|(vulnerable))`.

I then used [RegexBuddy](https://www.regexbuddy.com/) to analyze the impact of different exploit approaches and then confirmed the exploits with Python interpreter.

Now, let’s talk about the different exploitable sub-patterns I found and how I wrote exploits for them.

### Case #1

**Pattern:** ```(?:(?:^[\"'`\\]*?[^\"'\`]+[\"'\`])+|(?:^[\"'\`\\]*?[\d\"'`]+)+)\s```\
**Exploit:** ```""""""""""""""``` (about 1000 "s)

#### Why this exploit works?

**1. Intersecting alternate patterns**
This pattern consists of two alternate sub-patterns. Both alternate patterns start with ```^["'`\\]*?``` which causes the regex engine to keep looking for both patterns and hence increasing the permutations.
In the second alternate pattern, the tokens ```["'`\\]*?``` and ```[\d"'`]+``` intersect and both of them match `"`, '\''and `.

**2. Nested repetition operators**
The structure of this subpattern is `((pattern 1)+|(pattern 2)+)+` and it’s clear that it’s using nested repetition operators which dramatically increases the complexity.

### Case #2

**Pattern:** `for(?:/[dflr].*)* %+[^ ]+ in\(.*\)\s?do`\
**Vulnerable part:** `for(?:/[dflr].*)* %`\
**Exploit:** `for/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r`

#### Why this exploit works?

Let’s take a look at how the string is matched, step by step

```
f
fo
for
for/
for/r
for/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r
```

The last match is matched by `.*` but the the pattern fails to match our exploit string completely because our string doesn’t have `%` in the end but that’s what the pattern wants to match.
In the hopes of matching, it goes one step backward

```
for/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/r/
```

But it still doesn’t match. You must be thinking that it would go one more step backwards and keep doing that until it reaches the end and realizes it doesn’t match.
Well, you are not wrong but a repetition operator applied over another repetition operator makes things more complex.
The fact that `/r` can be matched by both `.*` and `/[dflr]` makes things even worse.
I am not sure how much steps it goes through before failing but RegexBuddy4 has a limit of 10,00,000 steps so we don’t really know.

### Case #3

**Pattern:** `(?:\s|/\*.*\*/|//.*|#.*)*\(.*\)`\
**Exploit**: `################################################`

#### Why this exploit works?

`(?:\s|/\*.*\*/|//.*|#.*)*` this part of the pattern consists of 4 alternate patterns and 3 of them have the good old `.*` which can match anything.
When the regex engine compares the pattern against the string, the only part which matches is the last one but because there’s no `()` as required by the pattern, it fails to match and the regex engine goes nuts because there are nested repetition operators placed in such a way that adding a `#` to the string makes the number of steps to be tried grow exponentially.

The last case was found in 3 different rules so that explains why I discussed only 3 cases.

Following CVE IDs were assigned to the vulnerabilities:

- CVE-2019–11387
- CVE-2019–11388
- CVE-2019–11389
- CVE-2019–11390
- CVE-2019–11391
