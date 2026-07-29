import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/code-review.yml'), 'utf8');

const extractNodeHeredoc = (functionName: string) => {
  const functionStart = workflow.indexOf(`          ${functionName}() {`);
  expect(functionStart).toBeGreaterThanOrEqual(0);
  const marker = /node - "\$1" "\$2" <<'NODE'\r?\n/g;
  marker.lastIndex = functionStart;
  const match = marker.exec(workflow);
  expect(match).not.toBeNull();
  const scriptStart = match!.index + match![0].length;
  const end = workflow.indexOf('\n          NODE', scriptStart);
  expect(end).toBeGreaterThan(scriptStart);
  return workflow.slice(scriptStart, end);
};

const extractSanitizerScript = () => extractNodeHeredoc('sanitize_ocr_output');
const extractFormatterScript = () => extractNodeHeredoc('format_ocr_report');

describe('AI code review workflow', () => {
  it('keeps the workflow YAML valid and configurable', () => {
    const parsed = parse(workflow);

    expect(parsed.env.OCR_VERSION).toBe("${{ vars.OCR_VERSION || '1.7.17' }}");
    expect(parsed.on.push.branches).toEqual(['dev']);
    expect(parsed.on.pull_request_target.types).toEqual([
      'opened',
      'reopened',
      'synchronize',
      'ready_for_review',
    ]);
    expect(parsed.concurrency.group).toBe(
      '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
    );
    const generateStep = parsed.jobs.review.steps.find(
      (step: { name?: string }) => step.name === 'Generate OpenCodeReview report',
    );

    expect(parsed.permissions).toEqual({});
    expect(parsed.env.AI_API_KEY).toBeUndefined();
    expect(parsed.jobs.review.if).toBe("github.event_name == 'push'");
    expect(parsed.jobs.review.permissions.contents).toBe('write');
    expect(parsed.jobs.review.steps).toEqual(expect.any(Array));
    expect(generateStep.env.AI_API_KEY).toBe('${{ secrets.AI_API_KEY }}');
    expect(workflow).toContain('Invalid OCR_VERSION: ${OCR_VERSION}');
    expect(workflow).not.toContain('cache-dependency-path: package-lock.json');
  });

  it('reviews pull requests and posts incremental PR comments with minimum permissions', () => {
    const parsed = parse(workflow);
    const prJob = parsed.jobs['pull-request-review'];
    const reviewStep = prJob.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith('alibaba/open-code-review@'),
    );

    expect(prJob.if).toBe("github.event_name == 'pull_request_target' && github.event.pull_request.draft == false");
    expect(prJob.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    expect(reviewStep.uses).toBe(
      'alibaba/open-code-review@0ced7165718725e15223c3e5a506df7b7e9de51f',
    );
    expect(reviewStep.with.sticky_summary).toBe('true');
    expect(reviewStep.with.incremental).toBe('true');
    expect(reviewStep.with.github_token).toBe('${{ github.token }}');
    expect(reviewStep.with.llm_timeout).toBe('${{ steps.review-config.outputs.timeout_seconds }}');
    expect(workflow).not.toContain('ref: ${{ github.event.pull_request.head.sha }}');
  });

  it('sanitizes OCR terminal output before writing the report', () => {
    expect(workflow).toContain('sanitize_ocr_output()');
    expect(workflow).toContain('export NO_COLOR=1');
    expect(workflow).toContain('export FORCE_COLOR=0');
    expect(workflow).toContain('export TERM=dumb');
    expect(workflow).toContain(".replace(/\\u001b\\[[0-?]*[ -/]*[@-~]/g, '')");
    expect(workflow).toContain('if (/^\\[ocr\\]\\s+/i.test(trimmed)) return false;');
    expect(workflow).toContain('format_ocr_report()');
    expect(workflow).toContain('cat "$FORMATTED_OUTPUT_PATH"');
    expect(workflow).not.toContain('cat "$CLEAN_OUTPUT_PATH"');
    expect(workflow).not.toContain('cat "$REPORT_PATH"');
  });

  it('removes ANSI control output and OCR execution summaries from report text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fkemark-ocr-'));
    const inputPath = join(dir, 'raw.txt');
    const outputPath = join(dir, 'clean.txt');

    try {
      writeFileSync(
        inputPath,
        [
          '\u001b[2m\u2500\u2500\u2500 .github/workflows/code-review.yml:16-16 \u2500\u2500\u2500\u001b[0m',
          '[ocr] Summary: 1 file(s) reviewed, 3 comment(s), ~88189 token(s) used',
          '\uFFFD[93m[bug low]\u001b[0m valid review opinion',
          '',
        ].join('\n'),
        'utf8',
      );

      execFileSync(process.execPath, ['-', inputPath, outputPath], {
        input: extractSanitizerScript(),
        encoding: 'utf8',
      });

      const cleaned = readFileSync(outputPath, 'utf8');
      expect(cleaned).not.toContain('\u001b');
      expect(cleaned).not.toContain('[ocr] Summary');
      expect(cleaned).toContain('valid review opinion');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('wraps OCR code suggestions in Markdown diff fences', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fkemark-ocr-'));
    const inputPath = join(dir, 'clean.txt');
    const outputPath = join(dir, 'formatted.md');

    try {
      writeFileSync(
        inputPath,
        [
          '\u2500\u2500\u2500 src/components/editor/EditorLayout.tsx:80-83 \u2500\u2500\u2500',
          '[bug high] use reactive theme state',
          '',
          '- normal Markdown list item',
          '+ another Markdown list item',
          '- [ ] normal Markdown task item',
          '',
          "-   const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches",
          "+   const blockNoteTheme = isDarkTheme(settings.theme, systemDark) ? 'dark' : 'light'",
          '- follow-up Markdown list item',
          '',
        ].join('\n'),
        'utf8',
      );

      execFileSync(process.execPath, ['-', inputPath, outputPath], {
        input: extractFormatterScript(),
        encoding: 'utf8',
      });

      const formatted = readFileSync(outputPath, 'utf8');
      expect(formatted).toContain('### `src/components/editor/EditorLayout.tsx:80-83`');
      expect(formatted).toContain('- normal Markdown list item');
      expect(formatted).toContain('+ another Markdown list item');
      expect(formatted).toContain('- [ ] normal Markdown task item');
      expect(formatted).toContain('- follow-up Markdown list item');
      expect(formatted).not.toContain('```diff\n- normal Markdown list item');
      expect(formatted).not.toContain('```diff\n- [ ] normal Markdown task item');
      expect(formatted).not.toContain('- follow-up Markdown list item\n```');
      expect(formatted).toContain('```diff\n-   const systemDark');
      expect(formatted).toContain('+   const blockNoteTheme');
      expect(formatted).toContain('\n```\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('guards commit comment truncation from negative slice lengths', () => {
    expect(workflow).toContain('const maxContentLength = Math.max(0, maxLength - suffix.length - overflowNotice.length);');
    expect(workflow).toContain('const truncatedBody = maxContentLength > 0');
    expect(workflow).toContain('report.slice(0, maxContentLength)');
  });
});
