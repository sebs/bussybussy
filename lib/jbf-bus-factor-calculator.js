import { EventEmitter } from 'events';

export class JBFBusFactorCalculator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.quiet = options.quiet || false;
    this.decayRate = options.decayRate || 0.5; // Exponential decay rate
    this.timeWindow = options.timeWindow || 548; // 1.5 years in days
    this.threshold = options.threshold || 0.5;
  }

  async calculateJBF(fileAuthorship, analysisData) {
    if (!this.quiet) {
      this.emit('info', `\n🧮 Calculating bus factor using JBF method (Jabrayilzade et al.)...`);
      this.emit('info', `   ⏰ Using knowledge decay with ${this.timeWindow} day window`);
      this.emit('info', `   📊 Step 1: Calculating time-weighted Degree of Authorship (DOA)...`);
    }

    // Get commit history with timestamps for knowledge decay
    const fileCommitData = await this.getFileCommitHistory(analysisData.repoPath, fileAuthorship);
    
    // Calculate time-weighted DOA
    const weightedFileAuthorship = this.applyKnowledgeDecay(fileAuthorship, fileCommitData);
    const fileOwnership = this.getFileOwnership(weightedFileAuthorship);
    
    if (!this.quiet) {
      this.emit('info', `   📊 Step 2: Aggregating author contributions with decay weights...`);
    }
    
    const authorDOA = this.calculateAuthorDOA(fileOwnership, weightedFileAuthorship);
    const sortedAuthors = Object.entries(authorDOA)
      .sort((a, b) => b[1].weightedDOA - a[1].weightedDOA)
      .map(([author, data]) => ({ 
        author, 
        doa: data.weightedDOA,
        recentContributions: data.recentContributions,
        totalContributions: data.totalContributions
      }));

    if (!this.quiet) {
      this.emit('info', `   📊 Step 3: Iteratively removing authors by weighted DOA...\n`);
    }
    
    const totalFiles = Object.keys(fileAuthorship).length;
    let removedAuthors = [];
    let busFactor = 0;

    for (const { author, doa, recentContributions } of sortedAuthors) {
      removedAuthors.push(author);
      busFactor++;

      let ownerlessFiles = 0;
      for (const owner of Object.values(fileOwnership)) {
        if (removedAuthors.includes(owner)) {
          ownerlessFiles++;
        }
      }

      const ownerlessRatio = ownerlessFiles / totalFiles;
      const ownerlessPercent = (ownerlessRatio * 100).toFixed(1);
      
      if (!this.quiet) {
        this.emit('info', `   👤 Removed: ${author}`);
        this.emit('info', `      → Weighted DOA: ${(doa * 100).toFixed(1)}%`);
        this.emit('info', `      → Recent contributions: ${recentContributions}`);
        this.emit('info', `      → Ownerless files: ${ownerlessFiles}/${totalFiles} (${ownerlessPercent}%)`);
      }
      
      if (ownerlessRatio > this.threshold) {
        if (!this.quiet) {
          this.emit('info', `\n   ✅ Threshold exceeded! Bus Factor = ${busFactor}`);
        }
        break;
      }
    }

    return {
      busFactor,
      removedAuthors,
      ownerlessRatio: this.calculateFinalOwnerlessRatio(fileOwnership, removedAuthors),
      authorDetails: sortedAuthors,
      analysisMetadata: {
        decayRate: this.decayRate,
        timeWindow: this.timeWindow,
        threshold: this.threshold
      },
      fileOwnership,
      weightedFileAuthorship
    };
  }

  async getFileCommitHistory(repoPath, fileAuthorship) {
    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(repoPath);
    
    const currentDate = new Date();
    const cutoffDate = new Date(currentDate.getTime() - this.timeWindow * 24 * 60 * 60 * 1000);
    
    const fileCommitData = {};
    
    try {
      // Use the already filtered file list from fileAuthorship
      const fileList = Object.keys(fileAuthorship);
      
      // For each file, get commit history with timestamps
      for (const file of fileList) {
        try {
          const logOutput = await git.raw([
            'log',
            '--since=' + cutoffDate.toISOString(),
            '--pretty=format:%H|%an|%at',
            '--',
            file
          ]);
          
          if (logOutput.trim()) {
            fileCommitData[file] = logOutput.trim().split('\n').map(line => {
              const [hash, author, timestamp] = line.split('|');
              return {
                author,
                timestamp: parseInt(timestamp) * 1000, // Convert to milliseconds
                hash
              };
            });
          } else {
            fileCommitData[file] = [];
          }
        } catch (error) {
          // Skip files that can't be analyzed
          fileCommitData[file] = [];
        }
      }
    } catch (error) {
      console.error('Error getting commit history:', error);
    }
    
    return fileCommitData;
  }

  applyKnowledgeDecay(fileAuthorship, fileCommitData) {
    const weightedAuthorship = {};
    const currentTime = Date.now();
    
    for (const [file, authors] of Object.entries(fileAuthorship)) {
      weightedAuthorship[file] = {};
      const commits = fileCommitData[file] || [];
      
      for (const [author, lines] of Object.entries(authors)) {
        // Find most recent commit by this author for this file
        const authorCommits = commits.filter(c => c.author === author);
        
        if (authorCommits.length > 0) {
          // Sort by timestamp descending
          authorCommits.sort((a, b) => b.timestamp - a.timestamp);
          const mostRecentCommit = authorCommits[0];
          
          // Calculate days since last commit
          const daysSinceCommit = (currentTime - mostRecentCommit.timestamp) / (1000 * 60 * 60 * 24);
          
          // Apply exponential decay
          const decayFactor = Math.exp(-this.decayRate * daysSinceCommit / 365);
          weightedAuthorship[file][author] = lines * decayFactor;
        } else {
          // If no recent commits, apply maximum decay
          weightedAuthorship[file][author] = lines * 0.01;
        }
      }
    }
    
    return weightedAuthorship;
  }

  getFileOwnership(weightedFileAuthorship) {
    const fileOwnership = {};
    
    for (const [file, authors] of Object.entries(weightedFileAuthorship)) {
      const totalWeightedLines = Object.values(authors).reduce((sum, weight) => sum + weight, 0);
      
      if (totalWeightedLines === 0) {
        fileOwnership[file] = null;
        continue;
      }
      
      let primaryAuthor = null;
      let maxWeightedContribution = 0;
      
      for (const [author, weightedLines] of Object.entries(authors)) {
        const contribution = weightedLines / totalWeightedLines;
        if (contribution > maxWeightedContribution) {
          maxWeightedContribution = contribution;
          primaryAuthor = author;
        }
      }
      
      fileOwnership[file] = primaryAuthor;
    }
    
    return fileOwnership;
  }

  calculateAuthorDOA(fileOwnership, weightedFileAuthorship) {
    const authorDOA = {};
    const totalFiles = Object.keys(fileOwnership).length;
    
    // Calculate weighted DOA and track contributions
    for (const [file, authors] of Object.entries(weightedFileAuthorship)) {
      for (const [author, weightedLines] of Object.entries(authors)) {
        if (!authorDOA[author]) {
          authorDOA[author] = {
            weightedDOA: 0,
            recentContributions: 0,
            totalContributions: 0,
            filesOwned: 0
          };
        }
        
        // Track if this author owns the file
        if (fileOwnership[file] === author) {
          authorDOA[author].filesOwned++;
        }
        
        // Add weighted contribution
        authorDOA[author].recentContributions += weightedLines;
      }
    }
    
    // Calculate final DOA as percentage of files owned
    for (const author in authorDOA) {
      authorDOA[author].weightedDOA = authorDOA[author].filesOwned / totalFiles;
    }
    
    return authorDOA;
  }

  calculateFinalOwnerlessRatio(fileOwnership, removedAuthors) {
    let ownerlessFiles = 0;
    const totalFiles = Object.keys(fileOwnership).length;
    
    for (const owner of Object.values(fileOwnership)) {
      if (removedAuthors.includes(owner) || owner === null) {
        ownerlessFiles++;
      }
    }
    
    return ownerlessFiles / totalFiles;
  }

  generateReport(analysisData, jbfResult, repoUrl) {
    // Calculate file authorship percentages with decay weights
    const fileAuthorshipWithPercentages = {};
    for (const [file, authors] of Object.entries(analysisData.fileAuthorship)) {
      const totalLines = Object.values(authors).reduce((sum, lines) => sum + lines, 0);
      const weightedAuthors = jbfResult.weightedFileAuthorship[file] || {};
      const totalWeightedLines = Object.values(weightedAuthors).reduce((sum, weight) => sum + weight, 0);
      
      fileAuthorshipWithPercentages[file] = {};
      for (const [author, lines] of Object.entries(authors)) {
        const weightedLines = weightedAuthors[author] || 0;
        fileAuthorshipWithPercentages[file][author] = {
          lines: lines,
          percentage: totalLines > 0 ? (lines / totalLines * 100).toFixed(2) : '0.00',
          weightedLines: weightedLines.toFixed(2),
          weightedPercentage: totalWeightedLines > 0 ? (weightedLines / totalWeightedLines * 100).toFixed(2) : '0.00'
        };
      }
    }

    const report = {
      repositoryUrl: repoUrl,
      summary: {
        busFactor: jbfResult.busFactor,
        totalFiles: analysisData.totalFiles,
        totalContributors: Object.keys(analysisData.totalAuthorship).length,
        criticalContributors: jbfResult.removedAuthors,
        filteredFiles: analysisData.filteredFiles ? analysisData.filteredFiles.length : 0,
        ignoreExtensions: analysisData.ignoreExtensions || []
      },
      analysis: {
        method: 'Jabrayilzade et al. - JBF (Time-Weighted Bus Factor)',
        description: 'Advanced method using knowledge decay and time-weighted contributions',
        finalOwnerlessRatio: jbfResult.ownerlessRatio,
        threshold: jbfResult.analysisMetadata.threshold,
        metadata: {
          decayRate: jbfResult.analysisMetadata.decayRate,
          timeWindowDays: jbfResult.analysisMetadata.timeWindow,
          analysisDate: new Date().toISOString()
        }
      },
      constants: {
        threshold: jbfResult.analysisMetadata.threshold,
        decayRate: jbfResult.analysisMetadata.decayRate,
        timeWindow: jbfResult.analysisMetadata.timeWindow
      },
      topContributors: jbfResult.authorDetails.slice(0, 10).map(({ author, doa, recentContributions }) => ({
        author,
        degreeOfAuthorship: (doa * 100).toFixed(2) + '%',
        filesOwned: Math.round(doa * analysisData.totalFiles),
        recentActivityScore: recentContributions.toFixed(0)
      })),
      fileOwnership: jbfResult.fileOwnership,
      fileAuthorshipMap: fileAuthorshipWithPercentages,
      interpretation: this.interpretResults(jbfResult.busFactor),
      errors: analysisData.errors || []
    };

    return report;
  }

  interpretResults(busFactor) {
    if (busFactor === 1) {
      return {
        risk: 'CRITICAL',
        message: 'Project has a bus factor of 1. Recent knowledge is concentrated in a single developer.',
        recommendation: 'Urgent action needed. Implement immediate knowledge transfer sessions and pair programming.'
      };
    } else if (busFactor <= 2) {
      return {
        risk: 'HIGH',
        message: `Project has a bus factor of ${busFactor}. Very few developers hold current project knowledge.`,
        recommendation: 'Prioritize knowledge sharing through code reviews, documentation, and rotating responsibilities.'
      };
    } else if (busFactor <= 4) {
      return {
        risk: 'MODERATE',
        message: `Project has a bus factor of ${busFactor}. Knowledge distribution could be improved.`,
        recommendation: 'Continue promoting cross-team collaboration and regular knowledge sharing sessions.'
      };
    } else {
      return {
        risk: 'LOW',
        message: `Project has a bus factor of ${busFactor}. Current knowledge is well distributed.`,
        recommendation: 'Maintain current practices and monitor for changes in contribution patterns.'
      };
    }
  }
}