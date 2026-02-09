---
layout: post
title:  "Arjun: Solving Parameter Discovery"
date:   2018-05-11 12:46:00 +0530
author: Somdev Sangwan
type:   tech
image: /assets/thumbs/arjun.png
permalink: /blog/making-of-arjun
description: "Making of s0md3v/arjun repository"  
---

Webpages and APIs often have more parameters than they let users interact with. For security testing, it is important for the testers to discover these hidden parameters.

Even if we have list of commonly-used parameter names, testing each parameter from the list is time consuming and by security measures for the sheer number of requests.

### How to know if a parameter is valid?
The obvious way to check if a parameter is valid is to send a request with the parameter and check the response. If the response is different from the one without the parameter, it is likely that the parameter is valid.

However, modern webpages have dynamic content such as CSRF tokens, timestamps, live numbers etc. Thus the same request sent twice may return slighty different responses so it is important to determine what parts are static and what parts are dynamic.

### How to determine static and dynamic parts?
Tools for comparing differences in text already exist because they are not reliable in complex cases.

To create a solution, I first created a list of all the things that can tell if two response are difference. Here's the actual list from the code:

```python
factors = {
	'same_code': None, # if http status code is same, contains that code
	'same_body': None, # if http body is same, contains that body
	'same_plaintext': None, # if http body isn't same but is same after removing html, contains that non-html text
	'lines_num': None, # if number of lines in http body is same, contains that number
	'lines_diff': None, # if http-body or plaintext aren't and there are more than two lines, contain which lines are same
	'same_headers': None, # if the headers are same, contains those headers
	'same_redirect': None, # if both requests redirect in similar manner, contains that redirection
	'param_missing': None, # if param name is missing from the body, contains words that are already there
	'value_missing': None # contains whether param value is missing from the body
}
```

Now, we can send the same HTTP request twice and determine what anamolies from the list above are present. Since the HTTP request is the same, the anamolies are because of the dynamic content in the response, not user input.

When we send a request with a parameter, we can compare the anamolies of the response with the anamolies of the response without the parameter. If they are different, it is likely that the parameter is valid.

### Solving the brute-force problem
So far so good. But how do we test all the parameters? We can send a request with each parameter from the wordlist and check the response, but that would be too many requests.

We can send a request with multiple parameters at but then problem changes from brute-force to figuring out which parameter(s) caused the response to change.

I solved this problem by using the binary search algorithm. Once a response shows anamoly, we can split the parameters into two halves and send requests with each half. If one half shows anamoly, we can further split that half and continue until we find the parameter(s) that caused the anamoly.

### Expanding the scope
Now that core problem was solved, I wanted to expand the scope as follows:

1. Extract input fields from HTML forms and adding them to the wordlist.
2. Extract variable names from JavaScript and JSON keys and adding them to the wordlist.
3. Add support for parameters like 'debug=true' or 'enabled=1' that only respond to a specific value.