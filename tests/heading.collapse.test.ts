import { afterEach, describe, expect, it } from 'vitest'
import {
  extractHeadingCollapseMarkers,
  HEADING_COLLAPSE_MARKER,
  headingIdsAtIndexes,
  isHeadingCollapsed,
  setSessionCollapsedHeadingIds,
} from '../src/utils/markdown/headingCollapse'
import { blocksToMarkdownDirect } from '../src/utils/markdown/blockNoteSerializer'

afterEach(() => {
  setSessionCollapsedHeadingIds([])
})

describe('heading collapse markdown', () => {
  it('extracts collapsed heading indexes and strips the marker', () => {
    const source = [
      '# Open',
      '',
      '## Folded <!--fk-collapsed-->',
      '',
      '```md',
      '## Fake <!--fk-collapsed-->',
      '```',
      '',
      '### Nested <!--fk-collapsed-->',
    ].join('\n')

    const result = extractHeadingCollapseMarkers(source)
    expect(result.collapsedIndexes).toEqual([1, 2])
    expect(result.markdown).toContain('## Folded')
    expect(result.markdown).not.toContain('## Folded <!--fk-collapsed-->')
    expect(result.markdown).toContain('## Fake <!--fk-collapsed-->')
  })

  it('maps heading indexes to block ids without writing schema props', () => {
    expect(headingIdsAtIndexes([
      { type: 'heading', id: 'open' },
      { type: 'paragraph' },
      { type: 'heading', id: 'folded' },
    ], [1])).toEqual(['folded'])
  })

  it('serializes collapsed headings from session ids without heading props', () => {
    setSessionCollapsedHeadingIds(['h-fold'])
    expect(blocksToMarkdownDirect([{
      id: 'h-fold',
      type: 'heading',
      props: { level: 2 },
      content: [{ type: 'text', text: 'Folded', styles: {} }],
      children: [],
    }]).markdown).toBe(`## Folded ${HEADING_COLLAPSE_MARKER}`)
    expect(isHeadingCollapsed({ level: 2 })).toBe(false)
  })

  it('serializes collapsed headings with the markdown marker', () => {
    expect(blocksToMarkdownDirect([{
      type: 'heading',
      props: { level: 2, collapsed: true },
      content: [{ type: 'text', text: 'Folded', styles: {} }],
      children: [],
    }]).markdown).toBe(`## Folded ${HEADING_COLLAPSE_MARKER}`)
  })
})
