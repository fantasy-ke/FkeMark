import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/code-review.yml'), 'utf8');

const extractSanitizerScript = () => {
  const marker = 'node - "$1" "$2" <<\'NODE\'\n';
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const scriptStart = start + marker.length;
  const end = workflow.indexOf('\n          NODE', scriptStart);
  expect(end).toBeGreaterThan(scriptStart);
  return workflow.slice(scriptStart, end);
};

describe('AI code review workflow', () => {
  it('keeps the workflow YAML valid and configurable', () => {
    const parsed = parse(workflow);

    expect(parsed.env.OCR_VERSION).toBe("${{ vars.OCR_VERSION || '1.7.17' }}");
    expect(parsed.jobs.review.steps).toEqual(expect.any(Array));
    expect(workflow).toContain('cache: npm');
    expect(workflow).toContain('cache-dependency-path: package-lock.json');
  });

  it('sanitizes OCR terminal output before writing the report', () => {
    expect(workflow).toContain('sanitize_ocr_output()');
    expect(workflow).toContain('export NO_COLOR=1');
    expect(workflow).toContain('export FORCE_COLOR=0');
    expect(workflow).toContain('export TERM=dumb');
    expect(workflow).toContain(".replace(/\\u001b\\[[0-?]*[ -/]*[@-~]/g, '')");
    expect(workflow).toContain('if (/^\\[ocr\\]\\s+/i.test(trimmed)) return false;');
    expect(workflow).toContain('cat "$CLEAN_OUTPUT_PATH"');
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
          '\u001b[2m─── .github/workflows/code-review.yml:16-16 ───\u001b[0m',
          '[ocr] Summary: 1 file(s) reviewed, 3 comment(s), ~88189 token(s) used',
          '\uFFFD[93m[bug · low]\u001b[0m 这里是有效审核意见',
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
      expect(cleaned).toContain('这里是有效审核意见');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('guards commit comment truncation from negative slice lengths', () => {
    expect(workflow).toContain('const maxContentLength = Math.max(0, maxLength - suffix.length - overflowNotice.length);');
    expect(workflow).toContain('report.slice(0, maxContentLength)');
  });
});
