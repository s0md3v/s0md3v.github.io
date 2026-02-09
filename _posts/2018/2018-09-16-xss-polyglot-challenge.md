---
layout: post
title:  "Creating an XSS Polyglot"
date:   2018-09-16 08:26:00 +0530
author: Somdev Sangwan
type:   tech
image: /assets/thumbs/xss-polyglot-challenge.png
permalink: /blog/xss-polyglot-challenge
description: "I participated in the XSS Polyglot Challenge and created a polyglot that works across multiple contexts."
---

I recently participated in the XSS Polyglot Challenge, where the goal was to create the shortest polyglot that works across multiple contexts. An XSS polyglot is a single string of code that can execute as JavaScript regardless of where it's injected on an HTML page.

After a lot of trial and error, here's the payload I came up with:

```html
javascript:`/*\"/*-->&lt;svg onload='/*</template></noembed></noscript></style></title></textarea></script><html onmouseover="/**/ alert()//'">`
```

Let's break down how it works.

### The Many Faces of Injection

The core challenge is that an XSS payload can land in many different places (or "contexts") within the HTML. For example:

*   Inside an HTML tag: `<div name="[payload]">`
*   Inside a script tag: `<script>var x = "[payload]";</script>`
*   Inside an HTML comment: `<!-- [payload] -->`
*   Inside a specific tag like `<textarea>`: `<textarea>[payload]</textarea>`
*   As a URL: `<a href="[payload]">`

A true polyglot needs to escape its current context and then execute, no matter which one it's in.

### Deconstructing the Payload

My payload is essentially a chain of escape sequences and context breakers, designed to handle multiple scenarios.

**Part 1: The Openers**
```
javascript:`/*\"/*-->
```
*   `javascript:`: This handles the case where the payload is used in a URL context, like an `href` attribute. The browser will execute the code that follows.
*   `/*`: This starts a JavaScript multi-line comment. If we are inside a script, this helps to comment out any code that comes after our injection point.
*   `\"`: This is an escaped quote. If our payload is inside a JavaScript string literal (e.g., `var a = "[payload]"`), this will terminate the string.
*   `-->`: This closes an HTML comment, for the scenario where we are injected inside `<!-- ... -->`.

**Part 2: The Great Escape**
```
&lt;svg onload='/*</template></noembed></noscript></style></title></textarea></script>
```
This is the real workhorse. It's a "tag soup" designed to break out of whatever HTML tag we might be in.

*   `&lt;svg onload='...'>`: This is a classic trick. It attempts to create an `<svg>` element. The `onload` event is a common vector for executing JavaScript. However, the real payload isn't in the `onload` here. Instead, this part is designed to be a valid-looking tag that can be easily broken out of.
*   `</template></noembed></noscript></style></title></textarea></script>`: This is a sequence of closing tags. The idea is that no matter what tag we were injected into (`<textarea>`, `<title>`, etc.), one of these closing tags will match and terminate it. This frees our payload from its prison, allowing the final part to be parsed as regular HTML.


**Part 3: The Grand Finale**
```
<html onmouseover="/**/ alert()//'">
```
After the previous section has closed out any containing tags, this is what's left. It's a standalone HTML element.

*   `<html onmouseover="...">`: It creates a new `<html>` element.
*   `onmouseover="/**/ alert()//'"`: This is the actual execution. When the user's mouse moves over the element this payload creates (which can be the whole page if it breaks out effectively), the `alert()` function is called. The `/**/` and `//` are just JavaScript comments to ensure the code remains valid in slightly different parsing contexts.

By chaining these context-breaking and escaping techniques together, this short string becomes a versatile key that can unlock an XSS vulnerability in a surprising number of places.