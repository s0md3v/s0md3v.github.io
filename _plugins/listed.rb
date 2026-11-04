# frozen_string_literal: true

# The posts a reader can come across: not unlisted ones, nor ones dated ahead unless the site shows those.
# The one rule for the lists, the feed, the sitemap and a post's neighbours.
module ListedFilter
  def listed(docs)
    site = @context.registers[:site]
    Array(docs).reject { |doc| doc["unlisted"] || (!site.future && doc["date"] > site.time) }
  end
end

Liquid::Template.register_filter(ListedFilter)
