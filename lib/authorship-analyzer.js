import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';

export class AuthorshipAnalyzer extends EventEmitter {
  constructor(repoPath, options = {}) {
    super();
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this.quiet = options.quiet || false;
    this.json = options.json || false;
    this.ignoreExtensions = options.ignoreExtensions || [];
    this.ignoreDotFiles = options.ignoreDotFiles || false;
    this.errors = [];
    this.filteredFiles = [];
  }

  async getFileList() {
    const allFiles = await this.git.raw(['ls-files']);
    const files = allFiles.split('\n').filter(file => file.trim() !== '');
    
    if (this.ignoreExtensions.length === 0 && !this.ignoreDotFiles) {
      return files;
    }
    
    const filteredFiles = [];
    const ignoredFiles = [];
    
    for (const file of files) {
      let shouldIgnore = false;
      
      // Check if file or any parent directory starts with a dot
      if (this.ignoreDotFiles) {
        const pathParts = file.split('/');
        shouldIgnore = pathParts.some(part => part.startsWith('.'));
      }
      
      // Check extensions if not already ignored
      if (!shouldIgnore && this.ignoreExtensions.length > 0) {
        const ext = path.extname(file).toLowerCase();
        shouldIgnore = this.ignoreExtensions.some(ignoreExt => {
          // Ensure both extensions start with a dot
          const normalizedIgnoreExt = ignoreExt.startsWith('.') ? ignoreExt : '.' + ignoreExt;
          return file.toLowerCase().endsWith(normalizedIgnoreExt.toLowerCase());
        });
      }
      
      if (shouldIgnore) {
        ignoredFiles.push(file);
      } else {
        filteredFiles.push(file);
      }
    }
    
    this.filteredFiles = ignoredFiles;
    
    if (!this.quiet && ignoredFiles.length > 0) {
      const filterReasons = [];
      if (this.ignoreExtensions.length > 0) {
        filterReasons.push(`extensions: ${this.ignoreExtensions.join(', ')}`);
      }
      if (this.ignoreDotFiles) {
        filterReasons.push('dot files/folders');
      }
      this.emit('info', `\n🚫 Filtering ${ignoredFiles.length} files (${filterReasons.join(' and ')})`);
    }
    
    return filteredFiles;
  }

  async getFileAuthorship(filePath) {
    try {
      const blameOutput = await this.git.raw(['blame', '--line-porcelain', filePath]);
      const lines = blameOutput.split('\n');
      const authors = {};
      let currentAuthor = null;

      for (const line of lines) {
        if (line.startsWith('author ')) {
          currentAuthor = line.substring(7);
        } else if (line.startsWith('\t')) {
          if (currentAuthor) {
            authors[currentAuthor] = (authors[currentAuthor] || 0) + 1;
          }
        }
      }

      return authors;
    } catch (error) {
      const errorMsg = `Could not analyze "${filePath}": ${error.message}`;
      this.errors.push(errorMsg);
      
      // Only output to stderr if NOT in --quiet --json mode
      if (!(this.quiet && this.json)) {
        this.emit('warning', errorMsg);
      }
      
      return {};
    }
  }

  async analyzeAuthorship() {
    if (!this.quiet) {
      this.emit('info', '\n📊 Starting authorship analysis...');
    }
    const startTime = Date.now();
    
    const files = await this.getFileList();
    const fileAuthorship = {};
    const totalAuthorship = {};

    if (!this.quiet) {
      this.emit('info', `📁 Found ${files.length} files to analyze`);
      this.emit('info', '⏳ This may take a while for large repositories...\n');
    }

    let processed = 0;
    let skipped = 0;
    const startFileTime = Date.now();

    for (const file of files) {
      processed++;
      const progress = ((processed / files.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startFileTime) / 1000).toFixed(1);
      const rate = (processed / elapsed).toFixed(1);
      const eta = ((files.length - processed) / rate).toFixed(0);
      
      if (!this.quiet) {
        this.emit('progress', {
          processed,
          total: files.length,
          progress: parseFloat(progress),
          file,
          eta: parseInt(eta),
          rate: parseFloat(rate)
        });
      }
      
      const authors = await this.getFileAuthorship(file);
      
      if (Object.keys(authors).length === 0) {
        skipped++;
      }
      
      fileAuthorship[file] = authors;

      for (const [author, lines] of Object.entries(authors)) {
        totalAuthorship[author] = (totalAuthorship[author] || 0) + lines;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    if (!this.quiet) {
      this.emit('info', '\n\n✅ Analysis complete!');
      this.emit('info', `   • Files analyzed: ${files.length}`);
      this.emit('info', `   • Files skipped: ${skipped}`);
      this.emit('info', `   • Contributors found: ${Object.keys(totalAuthorship).length}`);
      this.emit('info', `   • Time taken: ${duration}s`);
      this.emit('info', `   • Average: ${(files.length / duration).toFixed(1)} files/second\n`);
    }

    return {
      fileAuthorship,
      totalAuthorship,
      totalFiles: files.length,
      repoPath: this.repoPath,
      errors: this.errors,
      filteredFiles: this.filteredFiles,
      ignoreExtensions: this.ignoreExtensions
    };
  }
}