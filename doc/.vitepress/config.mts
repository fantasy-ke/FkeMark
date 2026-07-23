import { defineConfig } from 'vitepress'
import { defineTeekConfig, LayoutMode } from 'vitepress-theme-teek/config'

const repo = 'https://github.com/fantasy-ke/FkeMark'
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
// Cloudflare Pages 通常发布到根域名；如需子路径部署，请显式设置 DOCS_BASE。
const base = process.env.DOCS_BASE || (isGitHubActions ? '/FkeMark/' : '/')

const teekConfig = defineTeekConfig({
  teekHome: false,
  vpHome: true,
  pageStyle: 'card-nav',
  themeSize: 'default',
  sidebarTrigger: true,
  loading: 'FkeMark Docs',
  author: {
    name: 'fantasyke',
    link: repo
  },
  banner: {
    enabled: false
  },
  themeEnhance: {
    enabled: true,
    position: 'top',
    layoutSwitch: {
      defaultMode: LayoutMode.Original,
      disableHelp: true
    },
    themeColor: {
      defaultColorName: 'fkemark-green',
      append: [
        {
          label: 'FkeMark',
          tip: '适合 Markdown 长文阅读的项目主题色',
          options: [
            { value: 'fkemark-green', label: 'FkeMark 绿', color: '#2f7c68', title: 'FkeMark Green', ariaLabel: '切换到 FkeMark 绿色主题' },
            { value: 'vellum-brown', label: '墨纸棕', color: '#8f4f24', title: 'Vellum Brown', ariaLabel: '切换到墨纸棕色主题' }
          ]
        }
      ]
    },
    spotlight: {
      defaultValue: true
    }
  },
  backTop: {
    enabled: true,
    content: 'progress'
  },
  codeBlock: {
    enabled: true,
    collapseHeight: 700,
    overlay: true,
    overlayHeight: 420,
    langTextTransform: 'uppercase'
  },
  articleAnalyze: {
    showIcon: true,
    showInfo: true,
    showAuthor: false,
    showCreateDate: false,
    showUpdateDate: true,
    showCategory: false,
    showTag: false
  },
  articleUpdate: {
    enabled: true,
    limit: 5
  },
  docAnalysis: {
    enabled: true,
    title: '站点信息',
    createTime: '2026-07-22',
    wordCount: true,
    readingTime: true
  },
  footerGroup: [
    {
      title: '项目',
      links: [
        { name: '文档教程', link: '/guide/' },
        { name: 'GitHub', link: repo },
        { name: 'Releases', link: `${repo}/releases` }
      ]
    },
    {
      title: '部署',
      links: [
        { name: 'Cloudflare Pages', link: '/guide/deploy' },
        { name: 'VitePress', link: 'https://vitepress.dev/' },
        { name: 'Theme Teek', link: 'https://vp.teek.top/' }
      ]
    }
  ],
  footerInfo: {
    theme: {
      show: true,
      name: 'Theme Teek',
      link: 'https://github.com/Kele-Bingtang/vitepress-theme-teek'
    },
    copyright: {
      show: true,
      createYear: 2026,
      name: 'fantasyke',
      suffix: 'Released under AGPL-3.0-only.'
    }
  },
  logo: `${base}logo.svg`,
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
})

export default defineConfig({
  extends: teekConfig,
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
  }
})
