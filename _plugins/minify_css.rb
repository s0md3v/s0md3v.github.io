# frozen_string_literal: true

require "sass-embedded"

module MinifyCss
  STYLE = %r{(<style\b[^>]*>)(.*?)(</style>)}m.freeze

  def self.process(html)
    html.gsub(STYLE) do
      open, css, close = Regexp.last_match.captures
      begin
        open + Sass.compile_string(css, syntax: :css, style: :compressed).css + close
      rescue Sass::CompileError => e
        Jekyll.logger.warn "MinifyCss:", e.message.lines.first
        Regexp.last_match(0)
      end
    end
  end
end

Jekyll::Hooks.register [:pages, :documents], :post_render do |item|
  next unless Jekyll.env == "production"
  next if item.relative_path.start_with?("playground/")
  next unless item.output.is_a?(String) && item.output.include?("<style")

  item.output = MinifyCss.process(item.output)
end
