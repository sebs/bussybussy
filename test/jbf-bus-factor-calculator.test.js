import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JBFBusFactorCalculator } from '../lib/jbf-bus-factor-calculator.js';

describe('JBFBusFactorCalculator', () => {
  let calculator;

  beforeEach(() => {
    calculator = new JBFBusFactorCalculator({ quiet: true });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const calc = new JBFBusFactorCalculator();
      assert.equal(calc.quiet, false);
      assert.equal(calc.decayRate, 0.5);
      assert.equal(calc.timeWindow, 548);
      assert.equal(calc.threshold, 0.5);
    });

    it('should accept custom options', () => {
      const calc = new JBFBusFactorCalculator({
        quiet: true,
        decayRate: 0.3,
        timeWindow: 365,
        threshold: 0.6
      });
      assert.equal(calc.quiet, true);
      assert.equal(calc.decayRate, 0.3);
      assert.equal(calc.timeWindow, 365);
      assert.equal(calc.threshold, 0.6);
    });
  });

  describe('applyKnowledgeDecay', () => {
    it('should apply decay based on time since last commit', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100, 'Bob': 50 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {
        'file1.js': [
          { author: 'Alice', timestamp: currentTime - 30 * 24 * 60 * 60 * 1000 }, // 30 days ago
          { author: 'Bob', timestamp: currentTime - 365 * 24 * 60 * 60 * 1000 } // 1 year ago
        ]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // Alice's contribution should have less decay (more recent)
      assert.ok(weighted['file1.js']['Alice'] > weighted['file1.js']['Bob']);
      assert.ok(weighted['file1.js']['Alice'] < 100); // Some decay applied
      assert.ok(weighted['file1.js']['Bob'] < 50); // More decay applied
    });

    it('should apply maximum decay when no recent commits exist', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const fileCommitData = {
        'file1.js': [] // No commits
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // Should apply maximum decay (0.01 multiplier)
      assert.equal(weighted['file1.js']['Alice'], 1);
    });
  });

  describe('getFileOwnership', () => {
    it('should determine primary author based on weighted contributions', () => {
      const weightedFileAuthorship = {
        'file1.js': { 'Alice': 80, 'Bob': 20 },
        'file2.js': { 'Bob': 60, 'Charlie': 40 },
        'file3.js': { 'Charlie': 100 }
      };

      const ownership = calculator.getFileOwnership(weightedFileAuthorship);
      
      assert.equal(ownership['file1.js'], 'Alice');
      assert.equal(ownership['file2.js'], 'Bob');
      assert.equal(ownership['file3.js'], 'Charlie');
    });

    it('should handle files with zero weighted contributions', () => {
      const weightedFileAuthorship = {
        'file1.js': { 'Alice': 0, 'Bob': 0 }
      };

      const ownership = calculator.getFileOwnership(weightedFileAuthorship);
      
      assert.equal(ownership['file1.js'], null);
    });
  });

  describe('calculateAuthorDOA', () => {
    it('should calculate degree of authorship correctly', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': 'Alice',
        'file3.js': 'Bob',
        'file4.js': 'Charlie'
      };
      
      const weightedFileAuthorship = {
        'file1.js': { 'Alice': 100 },
        'file2.js': { 'Alice': 80, 'Bob': 20 },
        'file3.js': { 'Bob': 100 },
        'file4.js': { 'Charlie': 100 }
      };

      const authorDOA = calculator.calculateAuthorDOA(fileOwnership, weightedFileAuthorship);
      
      assert.equal(authorDOA['Alice'].weightedDOA, 0.5); // Owns 2 out of 4 files
      assert.equal(authorDOA['Bob'].weightedDOA, 0.25); // Owns 1 out of 4 files
      assert.equal(authorDOA['Charlie'].weightedDOA, 0.25); // Owns 1 out of 4 files
      assert.equal(authorDOA['Alice'].filesOwned, 2);
      assert.equal(authorDOA['Bob'].filesOwned, 1);
      assert.equal(authorDOA['Charlie'].filesOwned, 1);
    });
  });

  describe('calculateFinalOwnerlessRatio', () => {
    it('should calculate ownerless ratio correctly', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': 'Bob',
        'file3.js': 'Charlie',
        'file4.js': null
      };
      
      const removedAuthors = ['Alice', 'Bob'];
      const ratio = calculator.calculateFinalOwnerlessRatio(fileOwnership, removedAuthors);
      
      assert.equal(ratio, 0.75); // 3 out of 4 files are ownerless
    });
  });

  describe('interpretResults', () => {
    it('should return CRITICAL risk for bus factor of 1', () => {
      const result = calculator.interpretResults(1);
      assert.equal(result.risk, 'CRITICAL');
      assert.ok(result.message.includes('bus factor of 1'));
    });

    it('should return HIGH risk for bus factor of 2', () => {
      const result = calculator.interpretResults(2);
      assert.equal(result.risk, 'HIGH');
      assert.ok(result.message.includes('bus factor of 2'));
    });

    it('should return MODERATE risk for bus factor of 3-4', () => {
      const result = calculator.interpretResults(3);
      assert.equal(result.risk, 'MODERATE');
      assert.ok(result.message.includes('bus factor of 3'));
    });

    it('should return LOW risk for bus factor > 4', () => {
      const result = calculator.interpretResults(5);
      assert.equal(result.risk, 'LOW');
      assert.ok(result.message.includes('bus factor of 5'));
    });
  });

  describe('generateReport', () => {
    it('should generate complete report with all required fields', () => {
      const analysisData = {
        fileAuthorship: {
          'file1.js': { 'Alice': 100 }
        },
        totalAuthorship: { 'Alice': 100 },
        totalFiles: 1
      };
      
      const jbfResult = {
        busFactor: 1,
        removedAuthors: ['Alice'],
        ownerlessRatio: 1.0,
        authorDetails: [{ author: 'Alice', doa: 1.0, recentContributions: 100 }],
        analysisMetadata: {
          decayRate: 0.5,
          timeWindow: 548,
          threshold: 0.5
        },
        fileOwnership: { 'file1.js': 'Alice' },
        weightedFileAuthorship: { 'file1.js': { 'Alice': 100 } }
      };

      const report = calculator.generateReport(analysisData, jbfResult);
      
      assert.equal(report.summary.busFactor, 1);
      assert.equal(report.summary.totalFiles, 1);
      assert.equal(report.summary.totalContributors, 1);
      assert.deepEqual(report.summary.criticalContributors, ['Alice']);
      assert.equal(report.analysis.method, 'Jabrayilzade et al. - JBF (Time-Weighted Bus Factor)');
      assert.ok(report.analysis.description.includes('knowledge decay'));
      assert.equal(report.constants.decayRate, 0.5);
      assert.equal(report.constants.timeWindow, 548);
      assert.ok(report.fileAuthorshipMap['file1.js']['Alice']);
      assert.equal(report.interpretation.risk, 'CRITICAL');
    });
  });
});