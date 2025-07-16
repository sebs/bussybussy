import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { AuthorshipAnalyzer } from '../lib/authorship-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('AuthorshipAnalyzer', () => {
  let analyzer;
  let mockGit;
  let testRepoPath;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testRepoPath = path.join(__dirname, '..', 'temp-test-repo');
    await fs.ensureDir(testRepoPath);
    
    mockGit = {
      raw: mock.fn()
    };
    analyzer = new AuthorshipAnalyzer(testRepoPath);
    analyzer.git = mockGit;
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await fs.pathExists(testRepoPath)) {
      await fs.remove(testRepoPath);
    }
  });

  describe('constructor', () => {
    it('should initialize with correct properties', async () => {
      const testPath = path.join(__dirname, '..', 'temp-test-constructor');
      await fs.ensureDir(testPath);
      
      try {
        const analyzer = new AuthorshipAnalyzer(testPath);
        assert.equal(analyzer.repoPath, testPath);
        assert.ok(analyzer.git);
      } finally {
        await fs.remove(testPath);
      }
    });
  });

  describe('getFileList', () => {
    it('should return list of files from git ls-files', async () => {
      const mockFiles = 'file1.js\nfile2.py\nfile3.md\n';
      mockGit.raw.mock.mockImplementation(async (args) => {
        assert.deepEqual(args, ['ls-files']);
        return mockFiles;
      });

      const files = await analyzer.getFileList();
      
      assert.deepEqual(files, ['file1.js', 'file2.py', 'file3.md']);
      assert.equal(mockGit.raw.mock.calls.length, 1);
    });

    it('should filter out empty lines', async () => {
      const mockFiles = 'file1.js\n\nfile2.py\n\n';
      mockGit.raw.mock.mockImplementation(async () => mockFiles);

      const files = await analyzer.getFileList();
      
      assert.deepEqual(files, ['file1.js', 'file2.py']);
    });

    it('should handle empty repository', async () => {
      mockGit.raw.mock.mockImplementation(async () => '');

      const files = await analyzer.getFileList();
      
      assert.deepEqual(files, []);
    });
  });

  describe('getFileAuthorship', () => {
    it('should parse git blame output correctly', async () => {
      const mockBlameOutput = `12345678901234567890123456789012345678901 1 1 1
author John Doe
author-mail <john@example.com>
author-time 1234567890
author-tz +0000
committer John Doe
committer-mail <john@example.com>
committer-time 1234567890
committer-tz +0000
summary Initial commit
filename test.js
	console.log('line 1');
12345678901234567890123456789012345678902 2 2 1
author Jane Smith
author-mail <jane@example.com>
author-time 1234567891
author-tz +0000
committer Jane Smith
committer-mail <jane@example.com>
committer-time 1234567891
committer-tz +0000
summary Add feature
filename test.js
	console.log('line 2');
12345678901234567890123456789012345678903 3 3 1
author John Doe
author-mail <john@example.com>
author-time 1234567892
author-tz +0000
committer John Doe
committer-mail <john@example.com>
committer-time 1234567892
committer-tz +0000
summary Fix bug
filename test.js
	console.log('line 3');`;

      mockGit.raw.mock.mockImplementation(async (args) => {
        assert.deepEqual(args, ['blame', '--line-porcelain', 'test.js']);
        return mockBlameOutput;
      });

      const authorship = await analyzer.getFileAuthorship('test.js');
      
      assert.deepEqual(authorship, {
        'John Doe': 2,
        'Jane Smith': 1
      });
    });

    it('should handle files with single author', async () => {
      const mockBlameOutput = `12345678901234567890123456789012345678901 1 1 1
author Alice
author-mail <alice@example.com>
	line 1
12345678901234567890123456789012345678901 2 2 1
author Alice
author-mail <alice@example.com>
	line 2`;

      mockGit.raw.mock.mockImplementation(async () => mockBlameOutput);

      const authorship = await analyzer.getFileAuthorship('single-author.js');
      
      assert.deepEqual(authorship, {
        'Alice': 2
      });
    });

    it('should handle git blame errors gracefully', async () => {
      let warningEmitted = false;
      let warningMessage = '';

      analyzer.on('warning', (msg) => {
        warningEmitted = true;
        warningMessage = msg;
      });

      mockGit.raw.mock.mockImplementation(async () => {
        throw new Error('fatal: no such path');
      });

      const authorship = await analyzer.getFileAuthorship('nonexistent.js');
      
      assert.deepEqual(authorship, {});
      assert.equal(warningEmitted, true);
      assert.ok(warningMessage.includes('Could not analyze "nonexistent.js"'));
    });

    it('should handle empty files', async () => {
      mockGit.raw.mock.mockImplementation(async () => '');

      const authorship = await analyzer.getFileAuthorship('empty.js');
      
      assert.deepEqual(authorship, {});
    });
  });

  describe('analyzeAuthorship', () => {
    it('should aggregate authorship data for all files', async () => {
      const infoMessages = [];

      analyzer.on('info', (msg) => {
        infoMessages.push(msg);
      });

      mockGit.raw.mock.mockImplementation(async (args) => {
        if (args[0] === 'ls-files') {
          return 'file1.js\nfile2.js';
        } else if (args[0] === 'blame') {
          if (args[2] === 'file1.js') {
            return `author John Doe
	line 1
author John Doe
	line 2
author Jane Smith
	line 3`;
          } else if (args[2] === 'file2.js') {
            return `author Jane Smith
	line 1
author Bob Johnson
	line 2`;
          }
        }
      });

      const result = await analyzer.analyzeAuthorship();
      
      assert.deepEqual(result.fileAuthorship, {
        'file1.js': {
          'John Doe': 2,
          'Jane Smith': 1
        },
        'file2.js': {
          'Jane Smith': 1,
          'Bob Johnson': 1
        }
      });
      
      assert.deepEqual(result.totalAuthorship, {
        'John Doe': 2,
        'Jane Smith': 2,
        'Bob Johnson': 1
      });
      
      assert.equal(result.totalFiles, 2);
      assert.ok(infoMessages.some(msg => 
        msg.includes('Found 2 files to analyze')
      ));
    });

    it('should handle empty repository', async () => {
      mockGit.raw.mock.mockImplementation(async () => '');

      const result = await analyzer.analyzeAuthorship();
      
      assert.deepEqual(result.fileAuthorship, {});
      assert.deepEqual(result.totalAuthorship, {});
      assert.equal(result.totalFiles, 0);
    });

    it('should skip files that cannot be analyzed', async () => {
      const originalWarn = console.warn;
      console.warn = mock.fn();

      mockGit.raw.mock.mockImplementation(async (args) => {
        if (args[0] === 'ls-files') {
          return 'good.js\nbad.js';
        } else if (args[0] === 'blame') {
          if (args[2] === 'good.js') {
            return `author Alice
	line 1`;
          } else {
            throw new Error('Binary file');
          }
        }
      });

      try {
        const result = await analyzer.analyzeAuthorship();
        
        assert.deepEqual(result.fileAuthorship, {
          'good.js': { 'Alice': 1 },
          'bad.js': {}
        });
        assert.deepEqual(result.totalAuthorship, { 'Alice': 1 });
        assert.equal(result.totalFiles, 2);
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});