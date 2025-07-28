import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to validate Git URLs
function isValidGitUrl(url) {
  try {
    const parsed = new URL(url);
    
    // Only allow safe protocols
    const allowedProtocols = ['http:', 'https:', 'git:', 'ssh:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return false;
    }
    
    // Reject dangerous patterns
    const dangerousPatterns = [
      /^ext::/i,
      /[;&|`$()]/,  // Shell operators
      /--upload-pack/i,
      /--receive-pack/i,
      /--exec/i
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(url))) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// Helper function to sanitize repository names
function sanitizeRepoName(url) {
  // Extract base name and remove dangerous characters
  let repoName = path.basename(url, '.git');
  
  // Remove all non-alphanumeric characters except dash and underscore
  repoName = repoName.replace(/[^a-zA-Z0-9\-_]/g, '');
  
  // Ensure name is not empty after sanitization
  if (!repoName) {
    repoName = `repo-${Date.now()}`;
  }
  
  // Limit length to prevent issues
  if (repoName.length > 255) {
    repoName = repoName.substring(0, 255);
  }
  
  return repoName;
}

export class GitHandler {
  constructor(options = {}) {
    this.git = simpleGit();
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.quiet = options.quiet || false;
  }

  async cloneRepo(repoUrl) {
    // Validate URL for security
    if (!isValidGitUrl(repoUrl)) {
      throw new Error('Invalid or potentially dangerous repository URL');
    }
    
    // Sanitize repository name to prevent path traversal
    const repoName = sanitizeRepoName(repoUrl);
    const repoPath = path.join(this.tempDir, repoName);
    
    // Additional check: ensure final path is within tempDir
    const resolvedPath = path.resolve(repoPath);
    const resolvedTempDir = path.resolve(this.tempDir);
    
    if (!resolvedPath.startsWith(resolvedTempDir)) {
      throw new Error('Invalid repository path detected');
    }
    
    if (!this.quiet) {
      console.log(`📁 Preparing temporary directory...`);
    }
    await fs.ensureDir(this.tempDir);
    
    if (await fs.pathExists(repoPath)) {
      if (!this.quiet) {
        console.log(`🧹 Cleaning up existing repository...`);
      }
      await fs.remove(repoPath);
    }
    
    if (!this.quiet) {
      console.log(`📥 Cloning repository: ${repoUrl}`);
      console.log(`   Target: ${repoPath}`);
    }
    
    const startTime = Date.now();
    
    // Clone with progress callback
    const cloneOptions = this.quiet ? ['--quiet'] : ['--progress'];
    
    // Additional safety: use trimmed URL
    const safeUrl = repoUrl.trim();
    await this.git.clone(safeUrl, repoPath, cloneOptions);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    if (!this.quiet) {
      console.log(`\n✅ Repository cloned successfully in ${duration}s`);
    }
    
    return repoPath;
  }

  async cleanup() {
    if (await fs.pathExists(this.tempDir)) {
      await fs.remove(this.tempDir);
    }
  }
}