# frozen_string_literal: true

# Code blocks aren't counted: they're looked at, copied or skipped rather than read
module ReadingTime
  WORDS_A_MINUTE = 200.0

  def reading_minutes(html)
    text = html.to_s.gsub(%r{<pre\b.*?</pre>}im, " ").gsub(/<[^>]*>/, " ")
    words = text.split(/\s+/).count { |w| w =~ /[[:alnum:]]/ }
    [(words / WORDS_A_MINUTE).ceil, 1].max
  end
end

Liquid::Template.register_filter(ReadingTime)
