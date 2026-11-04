# frozen_string_literal: true

require "cgi"
require "json"

# jekyll-seo-tag HTML-escapes the strings it puts in its JSON-LD, so a search engine reads
# "Magika &amp; Bullying AI". They're unescaped here; "</" stays escaped so a string can't close the script.
module JsonLd
  BLOCK = %r{(<script type="application/ld\+json">)(.*?)(</script>)}m.freeze

  def self.unescape(value)
    case value
    when String then CGI.unescapeHTML(value)
    when Array then value.map { |v| unescape(v) }
    when Hash then value.transform_values { |v| unescape(v) }
    else value
    end
  end

  def self.process(html)
    html.gsub(BLOCK) do
      open, json, close = Regexp.last_match.captures
      begin
        open + JSON.generate(unescape(JSON.parse(json))).gsub("</", "<\\/") + close
      rescue JSON::ParserError
        Regexp.last_match(0)
      end
    end
  end
end

Jekyll::Hooks.register [:pages, :documents], :post_render do |item|
  next unless item.output.is_a?(String) && item.output.include?("application/ld+json")

  item.output = JsonLd.process(item.output)
end
