# frozen_string_literal: true

# Adds loading="lazy" decoding="async" to <img> tags in blog/essay pages.
# Only images inside <main> are touched, so header icons stay eager.
# Images that already set loading= are left alone.
module LazyImages
  COLLECTIONS = %w(blog essays).freeze
  IMG_TAG = /<img\b(?![^>]*\bloading=)/i.freeze

  def self.process(html)
    start = html.index("<main") || 0
    head = html[0...start]
    body = html[start..-1].gsub(IMG_TAG) do |tag|
      attrs = +' loading="lazy"'
      attrs << ' decoding="async"' unless Regexp.last_match.post_match[/\A[^>]*/] =~ /\bdecoding=/i
      tag + attrs
    end
    head + body
  end
end

Jekyll::Hooks.register :documents, :post_render do |doc|
  next unless LazyImages::COLLECTIONS.include?(doc.collection.label)
  next unless doc.output.is_a?(String) && doc.output.include?("<img")

  doc.output = LazyImages.process(doc.output)
end
