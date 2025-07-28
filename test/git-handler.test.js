import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { GitHandler } from '../lib/git-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('GitHandler', () => {
  let gitHandler;
  let testTempDir;

  beforeEach(() => {
    gitHandler = new GitHandler({ quiet: true });
    testTempDir = path.join(__dirname, '..', 'temp');
  });

  afterEach(async () => {
    // Clean up any created directories
    if (await fs.pathExists(testTempDir)) {
      await fs.remove(testTempDir);
    }
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      assert.ok(gitHandler.git);
      assert.equal(gitHandler.tempDir, testTempDir);
    });

    it('should set tempDir relative to lib directory', () => {
      const expectedPath = path.join(__dirname, '..', 'temp');
      assert.equal(gitHandler.tempDir, expectedPath);
    });
  });

  describe('cloneRepo', () => {
    it('should extract repo name from URL correctly', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      const repoUrl = 'https://github.com/user/test-repo.git';
      const result = await gitHandler.cloneRepo(repoUrl);

      assert.equal(result, path.join(testTempDir, 'test-repo'));
      assert.equal(mockClone.mock.calls.length, 1);
      assert.deepEqual(mockClone.mock.calls[0].arguments, [
        repoUrl,
        path.join(testTempDir, 'test-repo'),
        ['--quiet']
      ]);
    });

    it('should handle URLs without .git extension', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      const repoUrl = 'https://github.com/user/test-repo';
      const result = await gitHandler.cloneRepo(repoUrl);

      assert.equal(result, path.join(testTempDir, 'test-repo'));
    });

    it('should create temp directory if it does not exist', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      assert.equal(await fs.pathExists(testTempDir), false);

      await gitHandler.cloneRepo('https://github.com/user/test.git');

      assert.equal(await fs.pathExists(testTempDir), true);
    });

    it('should remove existing repo directory before cloning', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      const repoPath = path.join(testTempDir, 'existing-repo');
      await fs.ensureDir(repoPath);
      await fs.writeFile(path.join(repoPath, 'test.txt'), 'test content');

      await gitHandler.cloneRepo('https://github.com/user/existing-repo.git');

      assert.equal(await fs.pathExists(path.join(repoPath, 'test.txt')), false);
      assert.equal(mockClone.mock.calls.length, 1);
    });

    it('should handle clone errors', async () => {
      const errorMessage = 'Clone failed';
      gitHandler.git.clone = mock.fn(async () => {
        throw new Error(errorMessage);
      });

      await assert.rejects(
        async () => await gitHandler.cloneRepo('https://github.com/user/test.git'),
        {
          name: 'Error',
          message: errorMessage
        }
      );
    });

    it('should reject invalid Git URLs', async () => {
      const invalidUrls = [
        'file:///etc/passwd',
        'ext::sh -c "rm -rf /"',
        'https://github.com/user/repo.git; rm -rf /',
        'https://github.com/user/repo.git | cat /etc/passwd',
        'https://github.com/user/repo.git --upload-pack=evil',
        'javascript:alert(1)',
        'data:text/plain,hello'
      ];

      for (const url of invalidUrls) {
        await assert.rejects(
          async () => await gitHandler.cloneRepo(url),
          {
            name: 'Error',
            message: 'Invalid or potentially dangerous repository URL'
          }
        );
      }
    });

    it('should sanitize repository names', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      const testCases = [
        { url: 'https://github.com/user/repo-name.git', expected: 'repo-name' },
        { url: 'https://github.com/user/repo%20name.git', expected: 'repo20name' },
        { url: 'https://github.com/user/repo-123.git', expected: 'repo-123' },
        { url: 'https://github.com/user/REPO_NAME.git', expected: 'REPO_NAME' },
        { url: 'https://github.com/user/repo@version.git', expected: 'repoversion' },
        { url: 'https://github.com/user/repo#branch.git', expected: 'repobranch' }
      ];

      for (const { url, expected } of testCases) {
        const result = await gitHandler.cloneRepo(url);
        assert.equal(result, path.join(testTempDir, expected));
      }
    });

    it('should prevent path traversal attacks', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      // Even with valid URL, ensure repo path stays within temp directory
      const url = 'https://github.com/user/normal-repo.git';
      const result = await gitHandler.cloneRepo(url);
      
      const resolvedPath = path.resolve(result);
      const resolvedTempDir = path.resolve(testTempDir);
      
      assert.ok(resolvedPath.startsWith(resolvedTempDir));
    });

    it('should log cloning message when not quiet', async () => {
      const verboseGitHandler = new GitHandler({ quiet: false });
      const mockClone = mock.fn(async () => {});
      verboseGitHandler.git.clone = mockClone;
      
      const originalLog = console.log;
      const mockLog = mock.fn();
      console.log = mockLog;

      try {
        const repoUrl = 'https://github.com/user/test-repo.git';
        await verboseGitHandler.cloneRepo(repoUrl);

        assert.ok(mockLog.mock.calls.length >= 1);
        const logMessages = mockLog.mock.calls.map(call => call.arguments[0]);
        assert.ok(logMessages.some(msg => msg.includes('Cloning repository:')));
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('cleanup', () => {
    it('should remove temp directory if it exists', async () => {
      await fs.ensureDir(testTempDir);
      await fs.writeFile(path.join(testTempDir, 'test.txt'), 'test content');

      await gitHandler.cleanup();

      assert.equal(await fs.pathExists(testTempDir), false);
    });

    it('should not throw error if temp directory does not exist', async () => {
      assert.equal(await fs.pathExists(testTempDir), false);

      await assert.doesNotReject(async () => {
        await gitHandler.cleanup();
      });
    });

    it('should handle removal errors', async () => {
      const originalRemove = fs.remove;
      const errorMessage = 'Permission denied';
      
      await fs.ensureDir(testTempDir);
      
      fs.remove = mock.fn(async () => {
        throw new Error(errorMessage);
      });

      try {
        await assert.rejects(
          async () => await gitHandler.cleanup(),
          {
            name: 'Error',
            message: errorMessage
          }
        );
      } finally {
        fs.remove = originalRemove;
      }
    });
  });

  describe('integration tests', () => {
    it('should handle full clone and cleanup cycle', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      const repoUrl = 'https://github.com/user/test-repo.git';
      const repoPath = await gitHandler.cloneRepo(repoUrl);

      assert.equal(await fs.pathExists(testTempDir), true);
      assert.equal(repoPath, path.join(testTempDir, 'test-repo'));

      await gitHandler.cleanup();

      assert.equal(await fs.pathExists(testTempDir), false);
    });

    it('should handle multiple clones with same repo name', async () => {
      const mockClone = mock.fn(async () => {});
      gitHandler.git.clone = mockClone;

      const repoUrl = 'https://github.com/user/test-repo.git';
      
      await gitHandler.cloneRepo(repoUrl);
      assert.equal(mockClone.mock.calls.length, 1);

      await gitHandler.cloneRepo(repoUrl);
      assert.equal(mockClone.mock.calls.length, 2);
    });
  });
});