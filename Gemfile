source "https://rubygems.org"

# Pinned to the Jekyll line github-pages (v232) used, to avoid output drift.
gem "jekyll", "~> 3.10.0"

# kramdown 2.x needs this for `input: GFM` (configured in _config.yml).
gem "kramdown-parser-gfm", "~> 1.1"

# Stdlib gems no longer default on Ruby >= 3.4 (needed by safe_yaml, liquid, jekyll).
gem "base64"
gem "bigdecimal"
gem "logger"

group :jekyll_plugins do
  gem "jekyll-seo-tag", "~> 2.8"
  gem "jekyll-redirect-from", "~> 0.16"
  gem "jekyll-minifier", "~> 0.1"
end
