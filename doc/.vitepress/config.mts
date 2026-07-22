import { defineConfig } from 'vitepress'

const repo = 'https://github.com/fantasy-ke/FkeMark'
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
// Cloudflare Pages 通常发布到根域名；如需子路径部署，请显式设置 DOCS_BASE。
const base = process.env.DOCS_BASE || (isGitHubActions ? '/FkeMark/' : '/')

export default defineConfig({
  title: 'FkeMark',
  description: '文件系统优先的 Markdown 混合即时渲染编辑器文档',
  lang: 'zh-CN',
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['README.md'],
  head: [
    ['meta', { name: 'theme-color', content: '#f3ead7' }],
    ['meta', { property: 'og:title', content: 'FkeMark 文档' }],
    ['meta', { property: 'og:description', content: '文件系统优先的 Markdown 混合即时渲染编辑器文档教程' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }]
  ],
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'FkeMark Docs',
    nav: [
      { text: '首页', link: '/' },
      { text: '文档教程', link: '/guide/' },
      { text: '主题设计', link: '/guide/theme' },
      { text: 'Releases', link: `${repo}/releases` },
      { text: 'GitHub', link: repo }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '文档教程',
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: '安装与构建', link: '/guide/install' },
            { text: '编辑教程', link: '/guide/editing' },
            { text: '墨纸主题', link: '/guide/theme' },
            { text: '部署文档站', link: '/guide/deploy' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: repo }
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除搜索',
            footer: { selectText: '选择', navigateText: '切换' }
          }
        }
      }
    },
    editLink: {
      pattern: `${repo}/edit/main/doc/:path`,
      text: '在 GitHub 上编辑此页'
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    outline: {
      label: '本页目录',
      level: [2, 3]
    },
    lastUpdated: {
      text: '最近更新'
    },
    footer: {
      message: 'Released under AGPL-3.0-only.',
      copyright: 'Copyright © 2026 fantasyke'
    }
  }
})
