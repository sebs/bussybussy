import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GitHandler {
  constructor(options = {}) {
    this.git = simpleGit();
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.quiet = options.quiet || false;
  }

  async cloneRepo(repoUrl) {
    const repoName = path.basename(repoUrl, '.git');
    const repoPath = path.join(this.tempDir, repoName);
    
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
    await this.git.clone(repoUrl, repoPath, cloneOptions);
    
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