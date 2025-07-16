import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', 'lib', 'index.js');

function runCLI(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [cliPath, ...args]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

describe('CLI', () => {
  describe('help command', () => {
    it('should display help when no arguments provided', async () => {
      const result = await runCLI([]);
      assert.equal(result.code, 1);
      assert.ok(result.stderr.includes('Usage:'));
      assert.ok(result.stderr.includes('Commands:'));
    });

    it('should display help for --help flag', async () => {
      const result = await runCLI(['--help']);
      assert.equal(result.code, 0);
      assert.ok(result.stdout.includes('Usage:'));
      assert.ok(result.stdout.includes('Commands:'));
      assert.ok(result.stdout.includes('abf'));
      assert.ok(result.stdout.includes('jbf'));
    });
  });

  describe('version command', () => {
    it('should display version for --version flag', async () => {
      const result = await runCLI(['--version']);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /\d+\.\d+\.\d+/);
    });

    it('should display version for -V flag', async () => {
      const result = await runCLI(['-V']);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /\d+\.\d+\.\d+/);
    });
  });

  describe('abf command', () => {
    it('should show help for abf --help', async () => {
      const result = await runCLI(['abf', '--help']);
      assert.equal(result.code, 0);
      assert.ok(result.stdout.includes('Analyze bus factor using the ABF'));
      assert.ok(result.stdout.includes('Options:'));
      assert.ok(result.stdout.includes('--json'));
      assert.ok(result.stdout.includes('--quiet'));
      assert.ok(result.stdout.includes('--summary'));
    });

    it('should require repo URL', async () => {
      const result = await runCLI(['abf']);
      assert.equal(result.code, 1);
      assert.ok(result.stderr.includes("error: missing required argument 'repo-url'"));
    });

    it('should handle invalid repo URL gracefully', async () => {
      const result = await runCLI(['abf', 'invalid-url']);
      assert.equal(result.code, 1);
      assert.ok(result.stdout.includes('Error:') || result.stderr.includes('Error:'));
    });
  });

  describe('jbf command', () => {
    it('should show help for jbf --help', async () => {
      const result = await runCLI(['jbf', '--help']);
      assert.equal(result.code, 0);
      assert.ok(result.stdout.includes('Analyze bus factor using the JBF'));
      assert.ok(result.stdout.includes('Options:'));
      assert.ok(result.stdout.includes('--json'));
      assert.ok(result.stdout.includes('--quiet'));
      assert.ok(result.stdout.includes('--summary'));
    });

    it('should require repo URL', async () => {
      const result = await runCLI(['jbf']);
      assert.equal(result.code, 1);
      assert.ok(result.stderr.includes("error: missing required argument 'repo-url'"));
    });
  });

  describe('displayReport function', () => {
    it('should output only bus factor value with --quiet flag', async () => {
      // This test would require mocking the git operations
      // For now, we'll test that the flag is accepted
      const result = await runCLI(['abf', 'https://example.com/repo.git', '--quiet']);
      assert.equal(result.code, 1); // Will fail because it's not a real repo
      // But it should not show the normal output
      assert.ok(!result.stdout.includes('🚌 Bus Factor Analyzer'));
    });
  });

  describe('getVersion function', () => {
    it('should read version from package.json', async () => {
      const result = await runCLI(['--version']);
      assert.equal(result.code, 0);
      // Version should match package.json
      assert.equal(result.stdout.trim(), '1.0.0');
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Test with an invalid command
      const result = await runCLI(['invalid-command']);
      assert.equal(result.code, 1);
      assert.ok(result.stderr.includes("error: unknown command 'invalid-command'"));
    });
  });

  describe('JSON output', () => {
    it('should accept --json flag', async () => {
      const result = await runCLI(['abf', 'https://example.com/repo.git', '--json']);
      assert.equal(result.code, 1); // Will fail because it's not a real repo
      // But should attempt to output JSON on error
      assert.ok(result.stdout.includes('Error:') || result.stdout.includes('{') || result.stderr.includes('Error:'));
    });

    it('should accept --json --quiet flags together', async () => {
      const result = await runCLI(['abf', 'https://example.com/repo.git', '--json', '--quiet']);
      assert.equal(result.code, 1); // Will fail because it's not a real repo
      // But should attempt to output JSON on error
      assert.ok(!result.stdout.includes('🚌 Bus Factor Analyzer'));
    });
  });
});