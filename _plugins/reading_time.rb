# frozen_string_literal: true

# Minutes a post takes to read, from its rendered HTML: its words at 200 a minute, but not the
# words in its code blocks, which are looked at, copied or skipped rather than read
module ReadingTime
  WORDS_A_MINUTE = 200.0

  def reading_minutes(html)
    text = html.to_s.gsub(%r{<pre\b.*?</pre>}im, " ").gsub(/<[^>]*>/, " ")
    words = text.split(/\s+/).count { |w| w =~ /[[:alnum:]]/ }
    [(words / WORDS_A_MINUTE).ceil, 1].max
  end
end

Liquid::Template.register_filter(ReadingTime)
