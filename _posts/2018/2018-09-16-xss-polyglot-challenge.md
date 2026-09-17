---
layout: post
title:  "Creating an XSS Polyglot"
date:   2018-09-16 08:26:00 +0530
author: Somdev Sangwan
type:   tech
image: /assets/thumbs/xss-polyglot-challenge.png
permalink: /blog/xss-polyglot-challenge
description: "An XSS polyglot example with explanations of injection contexts, JavaScript quoting, HTML end tags and event handling."
---

An XSS polyglot is a payload that can execute JavaScript in more than one injection context.

I wrote this one for the [XSS Polyglot Challenge](https://web.archive.org/web/20190617111911/https://polyglot.innerht.ml/). The goal was to make a short payload work across multiple contexts:

```html
javascript:`/*\"/*-->&lt;svg onload='/*</template></noembed></noscript></style></title></textarea></script><html onmouseover="/**/ alert()//'">`
```

My [AwesomeXSS collection](https://github.com/s0md3v/AwesomeXSS#awesome-polyglots) has a version with `%0a` at the start.

## Injection contexts

The injection context is where your input ends up in the page. Here are a few examples:

* HTML attribute: `<div name="[payload]">`
* JavaScript string: `<script>var x = "[payload]";</script>`
* HTML comment: `<!-- [payload] -->`
* Textarea content: `<textarea>[payload]</textarea>`
* URL: `<a href="[payload]">`

I cover choosing a payload for the context and working around filters in my paper, [Bypassing XSS Detection Mechanisms](/assets/papers/bypassing-xss-detection.pdf).

I've also collected [context-breaking examples in AwesomeXSS](https://github.com/s0md3v/AwesomeXSS#awesome-context-breaking).

## URL scheme, quotes and comments

```
javascript:`/*\"/*-->
```

* `javascript:` makes this a [JavaScript URL](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/javascript). The browser runs the code after it when you navigate to the URL.
* `/*` marks the start of a JavaScript block comment.
* `-->` closes an HTML comment.

A double quote can close a double-quoted HTML attribute. In a JavaScript string, though, `\"` is an [escaped quote](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#escape_sequences), so it doesn't close the string.

## HTML end tags

```
&lt;svg onload='/*</template></noembed></noscript></style></title></textarea></script>
```

If the payload lands in a textarea, `</textarea>` closes it so the browser can parse the rest as HTML. There are closing tags for `template`, `noembed`, `noscript`, `style`, `title` and `script` too.

In HTML text, `&lt;` becomes a literal `<`. It stays text, so `&lt;svg` doesn't become an SVG element on that parse.

## Event handler

```
<html onmouseover="/**/ alert()//'">
```

When the HTML parser is in its [*in body* mode](https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody), this `<html>` tag adds any missing attributes to the existing root element. It ignores the tag if there's a `template` element on the stack of open elements.

The handler runs on `mouseover`. `/**/` is an empty comment, `alert()` opens the alert box and `//` comments out the trailing apostrophe.
