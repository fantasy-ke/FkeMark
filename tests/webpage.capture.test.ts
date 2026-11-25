import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const capture = () => window.eval(readFileSync(resolve('src-tauri/src/document_import/capture_page.js'), 'utf8')) as { html?: string; error?: string }

function render(html: string) {
  document.title = '文档标题'
  document.body.innerHTML = html
  Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' })
}

describe('登录窗口网页快照', () => {
  it('保留已渲染正文结构，剔除登录表单、脚本和带参数的链接', () => {
    render('<nav>站点导航</nav><main><h1>团队文档</h1><form><input name="token" value="PRIVATE"><button>提交</button></form><p hidden>隐藏正文</p><script>window.privateToken="PRIVATE"</script><a href="https://example.com/read?ticket=PRIVATE#token">手册</a><a href="#section">本页</a><a href="javascript:alert(1)">无效</a><img src="https://example.com/photo.png?token=PRIVATE" alt="截图"><table><tr><td>值</td></tr></table><pre><code class="language-js">const a = 1</code></pre></main>')
    const { html } = capture()
    expect(html).toContain('<title>文档标题</title>')
    expect(html).toContain('<h1>团队文档</h1>')
    expect(html).toContain('href="https://example.com/read"')
    expect(html).not.toContain('href="#section"')
    expect(html).toContain('src="https://example.com/photo.png"')
    expect(html).toContain('<td>值</td>')
    expect(html).toContain('<code class="language-js">const a = 1</code>')
    expect(html).not.toMatch(/PRIVATE|站点导航|隐藏正文|javascript:|<form|<script/)
  })

  it('不把登录界面的密码字段当成可导入正文', () => {
    render('<main><h1>登录</h1><input type="password" value="PRIVATE"></main>')
    document.querySelector('input')!.getClientRects = () => ({ length: 1 }) as DOMRectList
    expect(capture()).toEqual({ error: 'webpage_sign_in' })
  })
})
