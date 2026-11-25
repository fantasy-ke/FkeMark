(() => {
  if (document.readyState === 'loading' || !/^(text\/html|application\/xhtml\+xml)$/i.test(document.contentType)) {
    return { error: 'webpage_not_ready' }
  }
  if (Array.from(document.querySelectorAll('input[type="password"]')).some((input) =>
    input.getClientRects().length && getComputedStyle(input).visibility === 'visible')) {
    return { error: 'webpage_sign_in' }
  }
  const root = document.querySelector('main, [role="main"]') || document.querySelector('article') || document.body
  if (!root) return { error: 'webpage_not_ready' }

  const doc = document.implementation.createHTMLDocument(document.title.slice(0, 512))
  const supported = new Set('h1 h2 h3 h4 h5 h6 p div span br hr blockquote ul ol li dl dt dd a img strong b em i del s strike pre code kbd sub sup table caption thead tbody tfoot tr th td figure figcaption'.split(' '))
  const excluded = 'script, style, noscript, template, form, input, textarea, select, button, iframe, frame, object, embed, svg, canvas, nav, aside, footer, [role="navigation"], [hidden], [aria-hidden="true"], [contenteditable]:not([contenteditable="false"])'
  const base = new URL(location.pathname, location.origin)
  const maxSize = 5 * 1024 * 1024
  let remaining = maxSize
  const stack = [[root, doc.body]]
  while (stack.length) {
    const [node, parent] = stack.pop()
    if (--remaining < 0) return { error: 'input_too_large' }
    if (node.nodeType === Node.TEXT_NODE) {
      remaining -= node.length
      if (remaining < 0) return { error: 'input_too_large' }
      parent.append(doc.createTextNode(node.data))
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches(excluded)) continue
    const css = getComputedStyle(node)
    if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse') continue

    let target = parent
    const tag = node.localName
    if (supported.has(tag)) {
      target = doc.createElement(tag)
      parent.append(target)
      for (const attr of ['alt', 'title', 'colspan', 'rowspan', 'start']) {
        const value = node.getAttribute(attr)
        if (value !== null && value.length <= 512) target.setAttribute(attr, value)
      }
      if (tag === 'code') {
        const language = Array.from(node.classList).find((name) => /^language-[\w+-]{1,40}$/.test(name))
        if (language) target.className = language
      }
      const attr = tag === 'a' ? 'href' : tag === 'img' ? 'src' : null
      const value = attr && (tag === 'img' ? node.currentSrc || node.getAttribute(attr) : node.getAttribute(attr))
      if (value && value.length <= 8192) {
        try {
          const url = new URL(value, base)
          if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
            // 导出路径，不保留查询参数或可能含令牌的 URL 片段。
            url.search = ''
            url.hash = ''
            target.setAttribute(attr, url.href)
          }
        } catch {
          // 无效地址不写入结果。
        }
      }
    }
    for (let child = node.lastChild; child; child = child.previousSibling) stack.push([child, target])
  }
  if (!doc.body.textContent.trim() && !doc.body.querySelector('img[src]')) return { error: 'empty_result' }
  const html = doc.documentElement.outerHTML
  return new TextEncoder().encode(html).length > maxSize ? { error: 'input_too_large' } : { html }
})()
