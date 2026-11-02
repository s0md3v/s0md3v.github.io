# frozen_string_literal: true

# The posts a reader can come across: not the unlisted ones, which are only for those they're
# sent to, and not ones dated ahead, unless the site's set to show those. The one rule for the
# lists, the feed, the sitemap and a post's neighbours.
#
#   {% assign posts = site.blog | listed %}
module ListedFilter
  def listed(docs)
    site = @context.registers[:site]
    Array(docs).reject { |doc| doc["unlisted"] || (!site.future && doc["date"] > site.time) }
  end
end

Liquid::Template.register_filter(ListedFilter)
