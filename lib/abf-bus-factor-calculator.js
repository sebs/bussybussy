import { EventEmitter } from 'events';

export class ABFBusFactorCalculator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.quiet = options.quiet || false;
  }
  calculateABF(fileAuthorship) {
    this.emit('info', '\n🧮 Calculating bus factor using ABF method...');
    this.emit('info', '   📊 Step 1: Determining file ownership...');
    const fileOwnership = this.getFileOwnership(fileAuthorship);
    
    this.emit('info', '   📊 Step 2: Calculating Degree of Authorship (DOA)...');
    const authorDOA = this.calculateAuthorDOA(fileOwnership);
    const sortedAuthors = Object.entries(authorDOA)
      .sort((a, b) => b[1] - a[1])
      .map(([author, doa]) => ({ author, doa }));

    this.emit('info', '   📊 Step 3: Iteratively removing authors...\n');
    
    const totalFiles = Object.keys(fileAuthorship).length;
    let removedAuthors = [];
    let busFactor = 0;

    for (const { author, doa } of sortedAuthors) {
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
      
      this.emit('info', `   👤 Removed: ${author} (DOA: ${(doa * 100).toFixed(1)}%)`);
      this.emit('info', `      → Ownerless files: ${ownerlessFiles}/${totalFiles} (${ownerlessPercent}%)`);
      
      if (ownerlessRatio > 0.5) {
        this.emit('info', `\n   ✅ Threshold exceeded! Bus Factor = ${busFactor}`);
        break;
      }
    }

    return {
      busFactor,
      removedAuthors,
      ownerlessRatio: this.calculateFinalOwnerlessRatio(fileOwnership, removedAuthors),
      authorDetails: sortedAuthors,
      fileOwnership
    };
  }

  getFileOwnership(fileAuthorship) {
    const fileOwnership = {};
    
    for (const [file, authors] of Object.entries(fileAuthorship)) {
      const totalLines = Object.values(authors).reduce((sum, lines) => sum + lines, 0);
      let primaryAuthor = null;
      let maxContribution = 0;
      
      for (const [author, lines] of Object.entries(authors)) {
        const contribution = lines / totalLines;
        if (contribution > maxContribution) {
          maxContribution = contribution;
          primaryAuthor = author;
        }
      }
      
      fileOwnership[file] = primaryAuthor;
    }
    
    return fileOwnership;
  }

  calculateAuthorDOA(fileOwnership) {
    const authorDOA = {};
    const totalFiles = Object.keys(fileOwnership).length;
    
    for (const owner of Object.values(fileOwnership)) {
      if (owner) {
        authorDOA[owner] = (authorDOA[owner] || 0) + 1;
      }
    }
    
    for (const author in authorDOA) {
      authorDOA[author] = authorDOA[author] / totalFiles;
    }
    
    return authorDOA;
  }

  calculateFinalOwnerlessRatio(fileOwnership, removedAuthors) {
    let ownerlessFiles = 0;
    const totalFiles = Object.keys(fileOwnership).length;
    
    for (const owner of Object.values(fileOwnership)) {
      if (removedAuthors.includes(owner)) {
        ownerlessFiles++;
      }
    }
    
    return ownerlessFiles / totalFiles;
  }

  generateReport(analysisData, abfResult, repoUrl) {
    // Calculate file authorship percentages
    const fileAuthorshipWithPercentages = {};
    for (const [file, authors] of Object.entries(analysisData.fileAuthorship)) {
      const totalLines = Object.values(authors).reduce((sum, lines) => sum + lines, 0);
      fileAuthorshipWithPercentages[file] = {};
      for (const [author, lines] of Object.entries(authors)) {
        fileAuthorshipWithPercentages[file][author] = {
          lines: lines,
          percentage: totalLines > 0 ? (lines / totalLines * 100).toFixed(2) : '0.00'
        };
      }
    }

    const report = {
      repositoryUrl: repoUrl,
      summary: {
        busFactor: abfResult.busFactor,
        totalFiles: analysisData.totalFiles,
        totalContributors: Object.keys(analysisData.totalAuthorship).length,
        criticalContributors: abfResult.removedAuthors,
        filteredFiles: analysisData.filteredFiles ? analysisData.filteredFiles.length : 0,
        ignoreExtensions: analysisData.ignoreExtensions || []
      },
      analysis: {
        method: 'Avelino et al. - ABF (Authorship-Based Factor)',
        description: 'Iteratively removes developers with highest Degree of Authorship until >50% of files have coverage',
        finalOwnerlessRatio: abfResult.ownerlessRatio,
        threshold: 0.5
      },
      constants: {
        threshold: 0.5
      },
      topContributors: abfResult.authorDetails.slice(0, 10).map(({ author, doa }) => ({
        author,
        degreeOfAuthorship: (doa * 100).toFixed(2) + '%',
        filesOwned: Math.round(doa * analysisData.totalFiles)
      })),
      fileOwnership: abfResult.fileOwnership,
      fileAuthorshipMap: fileAuthorshipWithPercentages,
      interpretation: this.interpretResults(abfResult.busFactor),
      errors: analysisData.errors || []
    };

    return report;
  }

  interpretResults(busFactor) {
    if (busFactor === 1) {
      return {
        risk: 'CRITICAL',
        message: 'Project has a bus factor of 1. The loss of a single developer would severely impact the project.',
        recommendation: 'Urgent action needed to distribute knowledge and ownership across more team members.'
      };
    } else if (busFactor <= 2) {
      return {
        risk: 'HIGH',
        message: `Project has a bus factor of ${busFactor}. Very few developers hold critical knowledge.`,
        recommendation: 'Consider implementing pair programming, code reviews, and documentation to spread knowledge.'
      };
    } else if (busFactor <= 4) {
      return {
        risk: 'MODERATE',
        message: `Project has a bus factor of ${busFactor}. Knowledge is somewhat concentrated.`,
        recommendation: 'Continue efforts to involve more developers in different parts of the codebase.'
      };
    } else {
      return {
        risk: 'LOW',
        message: `Project has a bus factor of ${busFactor}. Knowledge is well distributed.`,
        recommendation: 'Maintain current practices for knowledge sharing and collaboration.'
      };
    }
  }
}