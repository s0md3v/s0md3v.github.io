# frozen_string_literal: true

# Only what's between the start of the post and its end is touched (the header's icons stay as they are).
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
