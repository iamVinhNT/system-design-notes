const ANCHOR = /<a\s[^>]*>/gi;
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const NOFOLLOW = /\srel\s*=\s*["']?[^"'>]*\bnofollow\b/i;

function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// Regex scan of <a href>: tolerant of broken HTML, but it ignores <base>, scripts and comments.
// Returns raw hrefs (not resolved) in document order, at most `limit`.
function extractLinks(html, limit) {
  const links = [];
  for (const tag of html.matchAll(ANCHOR)) {
    if (links.length >= limit) break;
    const match = HREF.exec(tag[0]);
    if (!match || NOFOLLOW.test(tag[0])) continue;
    links.push(decode(match[1] ?? match[2] ?? match[3]));
  }
  return links;
}

function extractTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decode(match[1]).replace(/\s+/g, ' ').trim().slice(0, 200) : null;
}

module.exports = { extractLinks, extractTitle };
