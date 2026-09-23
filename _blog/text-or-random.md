---
layout: post
title:  "Detecting Linguistic Information in Text"
date:   2019-04-22 00:00:00 +0530
author: Somdev Sangwan
type:   tech
image: /assets/thumbs/text-or-random.png
permalink: /blog/text-or-random
description: "A phonetic approach to differentiating human-readable text from random data."
---

How can a computer tell the difference between meaningful text and a random string of characters? This question seems simple, but the obvious answers are often wrong. It's a problem that pops up everywhere, from analyzing data streams and detecting obfuscated code to simple input validation.

### The Obvious (and Flawed) Solutions

Your first instinct might be to check for valid words using a dictionary. But what about made-up but meaningful words like `reddit`? Or what about strings common in programming like `frontendElementAsyncInit`? A dictionary-based approach would flag these as gibberish.

Okay, so what about a more mathematical approach? Let's use entropy. In simple terms, entropy measures the randomness of data. The more varied the characters, the higher the entropy. A string like `abcdefg` has higher entropy than `aaaaaaa`. Many programs use an entropy threshold to classify data as random.

But this is also flawed. Consider these two strings:

1.  `frontendElementAsyncInit`
2.  `9033e0e305f247c0c3c80d0c7848c8b3` (a random MD5 hash)

Ironically, the entropy of `frontendElementAsyncInit` is **3.70**, while the hash's entropy is only **3.35**. According to a typical entropy-based check, the human-readable string is more "random" than the actual random data! This happens because the hash is limited to a smaller set of hexadecimal characters, which lowers its entropy score, while the other string uses a wider variety of letters.

### A Linguistic Approach: Can You Say It?

The most noticeable difference between text and random junk is that one follows the rules of a language, and the other doesn't. But instead of trying to teach a computer complex grammar, we can use a simpler proxy: **pronounceability**.

Meaningful text, even if it contains made-up words, tends to be pronounceable. Gibberish usually isn't. Consider these words:

*   **Pulp**: A real, pronounceable word.
*   **Pelp**: Not a real word, but you can say it. It could become a word.
*   **Pqlp**: Gibberish. Your mouth can't form this combination of letters.

This is the core idea. We can determine if a string is meaningful by checking if it's pronounceable in a given language.

### The How-To

To do this, I broke text down into **bigrams**—pairs of adjacent characters. For example, `resin` becomes `re`, `es`, `si`, `in`.

The algorithm works like this:

1.  **Build a Database:** I first created a database of all possible two-letter bigrams in English (`aa`, `ab`, `ac`... `zz`). I then scanned a massive dictionary and recorded which bigrams are common, which are rare, and which never appear. For example, `th` is very common, while a bigram like `zq` is impossible in English.

2.  **Scan the String:** The program iterates through the input string, bigram by bigram.

3.  **Score It:** Each bigram is checked against the database. If it's a common and pronounceable pair (like `re`), it adds to the "good" score. If it's an unpronounceable pair (like `pqlp`'s `pq`), it adds to the "bad" score.

After scanning the whole string, we get a simple percentage of how "meaningful" the text is based on the ratio of good to bad bigrams.

Here's a snippet of the implementation in Python:

```python
def phonetic(string, bigrams):
    i = bad = good = total = 0
    string = string.lower()
    previous_char = '*'
    string_length = len(string)
    alphas = 'abcdefghijklmnopqrstuvwxyz'
    while i < string_length - 1:
        current_char = string[i]
        next_char = string[i + 1]
        if next_char not in alphas:
            next_char = '*'
            if previous_char == '*' and current_char in 'bcdefghjklmnopqrstuvwxyz':
                bad += 1
            previous_char = current_char
            i += 1
            continue
        if current_char in alphas:
            bigram = current_char + next_char
            value = bigrams[bigram]
            if value == 0:
                bad += 1
            elif value == 1:
                good += 1
            else:
                if previous_char in value or previous_char == '*':
                    good += 1
                else:
                    bad += 1
            total += 1
        previous_char = current_char
        i += 1
    return total, good, bad
```

### Does It Work?

When I ran the entire Oxford English Dictionary (a 4.3 MB file) through the script, it finished in **2 seconds** and classified the text as **98% meaningful**. The 2% error came from abbreviations and foreign words.

When I tested it against 200,000 truly random characters, it correctly identified the text as only **44% meaningful**, successfully classifying it as gibberish.

This phonetic approach provides a fast and surprisingly accurate way to distinguish between information and noise, without the pitfalls of dictionary or entropy-based methods.