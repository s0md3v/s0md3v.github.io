source "https://rubygems.org"

# Jekyll 4, for jekyll-minifier 0.2, which minifies with Terser: Uglifier, before it,
# couldn't parse JavaScript newer than ES2017. Moving from 3.10 changed no page visibly.
gem "jekyll", "~> 4.4"

# kramdown 2.x needs this for `input: GFM` (configured in _config.yml).
gem "kramdown-parser-gfm", "~> 1.1"

# Stdlib gems no longer default on Ruby >= 3.4 (needed by safe_yaml, liquid, jekyll).
gem "base64"
gem "bigdecimal"
gem "logger"

group :jekyll_plugins do
  gem "jekyll-seo-tag", "~> 2.8"
  gem "jekyll-redirect-from", "~> 0.16"
  gem "jekyll-minifier", "~> 0.2.2"
end
