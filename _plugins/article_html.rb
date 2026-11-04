# frozen_string_literal: true

# What a post's markdown can't say for itself, added to its HTML once it's built. Only what's
# between the start of the post and its end is touched (the header's icons stay as they are).
#
# - Pictures get their own width and height, so the text doesn't jump as each one arrives, load
#   only as they're scrolled to, and, if they're bigger than they can be shown, open full size.
# - Footnotes are named for what they are, not read out as "1" and an arrow, and the notes are
#   under a heading, if the post hasn't given them one, so they can be found by it.
# - Each section can be linked to: its heading has a link to itself, which copies its address
#   (article.js), from a pointer, a finger or the keyboard. Its "#" is drawn by the stylesheet, so it
#   isn't copied with the heading, and it's named for what it does.
# - Code is left as it is by a page translator.
# - An address shown as itself goes to the next line whole if it fits there (article.css), and
#   breaks only where it must, after a "/" or before a ".", "?", "&", "=" or "#", as a typesetter
#   would break it, not after whichever letter reaches the edge.
module ArticleHtml
  COLLECTIONS = %w(blog essays).freeze
  START = '<div class="post-content">'
  FINISH = '<div class="post-fin">'
  # Wider than the column is at its widest, at twice the screen's pixels: worth opening on its own
  ENLARGE_FROM = 1400

  def self.process(html, source)
    from = html.index(START) or return html
    to = html.index(FINISH, from) or return html
    body = html[from...to]
    body = pictures(body, source)
    body = sections(body)
    body = footnotes(body)
    body = code(body)
    body = addresses(body)
    html[0...from] + body + html[to..]
  end

  def self.pictures(body, source)
    out = +""
    rest = body
    while (m = rest.match(/<img\b[^>]*>/i))
      before = out + m.pre_match
      tag = m[0]
      src = tag[/\ssrc="([^"]+)"/i, 1]
      size = src && src.start_with?("/") ? ImageSize.of(File.join(source, src.split(/[?#]/).first)) : nil
      tag = tag.sub(/\s*\/?>\z/, "")
      tag << %( width="#{size[0]}" height="#{size[1]}") if size && tag !~ /\swidth=/i
      tag << ' loading="lazy"' unless tag =~ /\sloading=/i
      tag << ' decoding="async"' unless tag =~ /\sdecoding=/i
      tag << ">"
      linked = before.rindex(/<a\b/i).to_i > before.rindex(%r{</a>}i).to_i
      if size && size[0] >= ENLARGE_FROM && !linked
        alt = tag[/\salt="([^"]*)"/i, 1].to_s
        label = alt.empty? ? "Open the picture full size" : "#{alt}, full size"
        tag = %(<a class="full-size" href="#{src}" aria-label="#{label}">#{tag}</a>)
      end
      out = before + tag
      rest = m.post_match
    end
    out + rest
  end

  # A note's named by the number it's shown with, whatever it's called in the markdown
  def self.footnotes(body)
    shown = {}
    body = body.gsub(%r{<a href="#fn:([^"]+)" class="footnote"([^>]*)>([^<]*)</a>}) do
      name, rest, number = $1, $2, $3
      shown[name] ||= number
      %(<a href="#fn:#{name}" class="footnote" aria-label="Note #{number}"#{rest}>#{number}</a>)
    end
    body = body.gsub(%r{<a href="#fnref:([^"]+)" class="reversefootnote"}) do
      %(<a href="#fnref:#{$1}" class="reversefootnote" aria-label="Back to where note #{shown[$1.sub(/:\d+\z/, "")] || $1} was")
    end
    # Called "notes", not "footnotes", which Reader View takes for clutter and leaves out
    body = body.sub('<div class="footnotes" role="doc-endnotes">', '<div class="notes" role="doc-endnotes">')
    body.sub(%r{(</h[1-6]>\s*)?(<div class="notes" role="doc-endnotes">)}) do
      $1 ? $1 + $2 : %(<h2 class="sr-only" id="notes">Notes</h2>\n#{$2})
    end
  end

  def self.addresses(body)
    body.gsub(%r{(<a\b[^>]*>)(https?://[^<\s]+)(</a>)}) do
      open, text, close = $1, $2, $3
      scheme, rest = text.split("//", 2)
      open = open.sub(/\A<a\b/, '<a class="address"') unless open.include?(" class=")
      open + scheme + "//" + rest.gsub(%r{/(?!\z)}, "/<wbr>").gsub(/(?<=.)([.?&=#])/, "<wbr>\\1") + close
    end
  end

  def self.code(body)
    body.gsub(/<(code|pre class="highlight")(?=[\s>])/) { %(<#{$1} translate="no") }
  end

  def self.sections(body)
    body.gsub(%r{<h([23]) id="([^"]+)">(.*?)</h\1>}m) do
      level, id, text = $1, $2, $3
      %(<h#{level} id="#{id}">#{text}<a class="section-link" href="##{id}" aria-label="Copy link to this section"></a></h#{level}>)
    end
  end
end

# Width and height from the first bytes of a picture, for the kinds the posts use
module ImageSize
  @cache = {}

  def self.of(path)
    return @cache[path] if @cache.key?(path)

    @cache[path] = begin
      File.open(path, "rb") { |f| read(f.read(256 * 1024)) } if File.file?(path)
    rescue StandardError
      nil
    end
  end

  def self.read(b)
    if b.start_with?("\x89PNG".b)
      b[16, 8].unpack("NN")
    elsif b.start_with?("GIF8")
      b[6, 4].unpack("vv")
    elsif b.start_with?("\xFF\xD8".b)
      jpeg(b)
    elsif b[0, 4] == "RIFF" && b[8, 4] == "WEBP"
      webp(b)
    elsif b[4, 4] == "ftyp"
      avif(b)
    end
  end

  def self.jpeg(b)
    i = 2
    while i + 9 < b.bytesize
      i += 1 while b.getbyte(i) == 0xFF && b.getbyte(i + 1) == 0xFF
      marker = b.getbyte(i + 1)
      length = b[i + 2, 2].unpack1("n")
      if (0xC0..0xCF).cover?(marker) && ![0xC4, 0xC8, 0xCC].include?(marker)
        h, w = b[i + 5, 4].unpack("nn")
        return [w, h]
      end
      i += 2 + length
    end
    nil
  end

  def self.webp(b)
    case b[12, 4]
    when "VP8 "
      w, h = b[26, 4].unpack("vv")
      [w & 0x3FFF, h & 0x3FFF]
    when "VP8L"
      b0, b1, b2, b3 = b[21, 4].bytes
      [1 + (b0 | ((b1 & 0x3F) << 8)), 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0F) << 10))]
    when "VP8X"
      w = b[24, 3].bytes.each_with_index.sum { |v, k| v << (8 * k) }
      h = b[27, 3].bytes.each_with_index.sum { |v, k| v << (8 * k) }
      [w + 1, h + 1]
    end
  end

  def self.avif(b)
    at = b.index("ispe") or return nil
    b[at + 8, 8].unpack("NN")
  end
end

Jekyll::Hooks.register :documents, :post_render do |doc|
  next unless ArticleHtml::COLLECTIONS.include?(doc.collection.label)
  next unless doc.output.is_a?(String)

  doc.output = ArticleHtml.process(doc.output, doc.site.source)
end
