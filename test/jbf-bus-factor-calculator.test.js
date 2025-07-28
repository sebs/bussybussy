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

  describe('edge cases and boundary conditions', () => {
    it('should handle empty repository', () => {
      const fileAuthorship = {};
      const fileCommitData = {};

      // Manually test the algorithm without async operations
      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      const ownership = calculator.getFileOwnership(weighted);
      const doa = calculator.calculateAuthorDOA(ownership, weighted);

      assert.deepEqual(weighted, {});
      assert.deepEqual(ownership, {});
      assert.deepEqual(doa, {});
    });

    it('should handle single author repository', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 },
        'file2.js': { 'Alice': 100 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {
        'file1.js': [{ author: 'Alice', timestamp: currentTime }],
        'file2.js': [{ author: 'Alice', timestamp: currentTime }]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      const ownership = calculator.getFileOwnership(weighted);
      const doa = calculator.calculateAuthorDOA(ownership, weighted);

      assert.equal(ownership['file1.js'], 'Alice');
      assert.equal(ownership['file2.js'], 'Alice');
      assert.equal(doa['Alice'].filesOwned, 2);
      assert.equal(doa['Alice'].weightedDOA, 1.0);
    });

    it('should handle files with no commit data', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const fileCommitData = {
        'file1.js': []
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // Should apply maximum decay
      assert.equal(weighted['file1.js']['Alice'], 1); // 100 * 0.01
    });

    it('should handle exact threshold boundary', () => {
      const fileAuthorship = {
        'file1.js': { 'A': 100 },
        'file2.js': { 'B': 100 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {
        'file1.js': [{ author: 'A', timestamp: currentTime }],
        'file2.js': [{ author: 'B', timestamp: currentTime }]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      const ownership = calculator.getFileOwnership(weighted);
      
      // Test ownerless ratio calculation
      const ratioWithA = calculator.calculateFinalOwnerlessRatio(ownership, ['A']);
      const ratioWithBoth = calculator.calculateFinalOwnerlessRatio(ownership, ['A', 'B']);
      
      assert.equal(ratioWithA, 0.5); // Exactly 50%
      assert.equal(ratioWithBoth, 1.0); // 100%
    });

    it('should handle multiple authors with identical weighted DOA', () => {
      const fileAuthorship = {
        'file1.js': { 'A': 100 },
        'file2.js': { 'B': 100 },
        'file3.js': { 'C': 100 },
        'file4.js': { 'D': 100 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {
        'file1.js': [{ author: 'A', timestamp: currentTime }],
        'file2.js': [{ author: 'B', timestamp: currentTime }],
        'file3.js': [{ author: 'C', timestamp: currentTime }],
        'file4.js': [{ author: 'D', timestamp: currentTime }]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      const ownership = calculator.getFileOwnership(weighted);
      const doa = calculator.calculateAuthorDOA(ownership, weighted);
      
      // All authors should have equal DOA
      assert.equal(doa['A'].weightedDOA, 0.25);
      assert.equal(doa['B'].weightedDOA, 0.25);
      assert.equal(doa['C'].weightedDOA, 0.25);
      assert.equal(doa['D'].weightedDOA, 0.25);
    });

    it('should handle zero contribution after decay', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 1 } // Very small contribution
      };
      
      const fileCommitData = {
        'file1.js': [] // No commits, maximum decay
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // 1 * 0.01 = 0.01, which rounds to 0 in the implementation
      assert.equal(weighted['file1.js']['Alice'], 0.01);
    });

    it('should handle floating point precision at threshold', () => {
      const fileAuthorship = {
        'file1.js': { 'A': 100 },
        'file2.js': { 'A': 100 },
        'file3.js': { 'A': 100 },
        'file4.js': { 'B': 100 },
        'file5.js': { 'B': 100 },
        'file6.js': { 'C': 100 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {};
      for (let i = 1; i <= 6; i++) {
        const author = Object.keys(fileAuthorship[`file${i}.js`])[0];
        fileCommitData[`file${i}.js`] = [{ 
          author: author, 
          timestamp: currentTime 
        }];
      }

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      const ownership = calculator.getFileOwnership(weighted);
      const doa = calculator.calculateAuthorDOA(ownership, weighted);

      // A owns 3/6 = 0.5 exactly
      assert.equal(doa['A'].filesOwned, 3);
      assert.equal(doa['A'].weightedDOA, 0.5);
      assert.equal(doa['B'].filesOwned, 2);
      assert.equal(doa['B'].weightedDOA, 1/3);
    });
  });

  describe('time decay calculations', () => {
    it('should apply no decay for very recent commits', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {
        'file1.js': [{ author: 'Alice', timestamp: currentTime }] // Just now
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // No decay for current timestamp (exp(0) = 1)
      assert.ok(weighted['file1.js']['Alice'] >= 99.99 && weighted['file1.js']['Alice'] <= 100);
    });

    it('should apply exponential decay based on time', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const currentTime = Date.now();
      const daysAgo = 365; // 1 year ago
      const fileCommitData = {
        'file1.js': [{ 
          author: 'Alice', 
          timestamp: currentTime - (daysAgo * 24 * 60 * 60 * 1000) 
        }]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // Exponential decay: lines * exp(-decayRate * days / 365)
      // With decayRate=0.5 and days=365: 100 * exp(-0.5) ≈ 60.65
      const expectedDecay = 100 * Math.exp(-0.5);
      assert.ok(weighted['file1.js']['Alice'] >= expectedDecay - 1 && weighted['file1.js']['Alice'] <= expectedDecay + 1);
    });

    it('should apply strong decay for very old commits', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {
        'file1.js': [{ 
          author: 'Alice', 
          timestamp: currentTime - (1000 * 24 * 60 * 60 * 1000) // 1000 days ago
        }]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // Very old commits should have very strong decay
      // exp(-0.5 * 1000/365) ≈ 0.254
      const expectedDecay = 100 * Math.exp(-0.5 * 1000/365);
      assert.ok(weighted['file1.js']['Alice'] >= expectedDecay - 1 && weighted['file1.js']['Alice'] <= expectedDecay + 1);
    });

    it('should use most recent commit for each author', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const currentTime = Date.now();
      const fileCommitData = {
        'file1.js': [
          { author: 'Alice', timestamp: currentTime - (1000 * 24 * 60 * 60 * 1000) }, // Old
          { author: 'Alice', timestamp: currentTime }, // Recent
          { author: 'Alice', timestamp: currentTime - (500 * 24 * 60 * 60 * 1000) } // Medium
        ]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // Should use the most recent timestamp (currentTime)
      assert.equal(weighted['file1.js']['Alice'], 100); // No decay
    });

    it('should handle different decay rates correctly', () => {
      const customCalculator = new JBFBusFactorCalculator({ 
        quiet: true, 
        decayRate: 0.8 // Higher decay rate
      });
      
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const currentTime = Date.now();
      const daysAgo = 365;
      const fileCommitData = {
        'file1.js': [{ 
          author: 'Alice', 
          timestamp: currentTime - (daysAgo * 24 * 60 * 60 * 1000) 
        }]
      };

      const weighted = customCalculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // With 0.8 decay rate and 365 days: 100 * exp(-0.8) ≈ 44.93
      const expectedDecay = 100 * Math.exp(-0.8);
      assert.ok(weighted['file1.js']['Alice'] >= expectedDecay - 1 && weighted['file1.js']['Alice'] <= expectedDecay + 1);
    });

    it('should handle decay calculation correctly over different periods', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };
      
      const currentTime = Date.now();
      
      // Test different time periods
      const periods = [
        { days: 0, expected: 100 },       // No decay
        { days: 183, expected: 77.83 },   // ~6 months: 100 * exp(-0.5 * 183/365)
        { days: 365, expected: 60.65 },   // 1 year: 100 * exp(-0.5)
        { days: 730, expected: 36.79 }    // 2 years: 100 * exp(-1)
      ];
      
      for (const { days, expected } of periods) {
        const fileCommitData = {
          'file1.js': [{ 
            author: 'Alice', 
            timestamp: currentTime - (days * 24 * 60 * 60 * 1000)
          }]
        };
        
        const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
        assert.ok(
          weighted['file1.js']['Alice'] >= expected - 1 && weighted['file1.js']['Alice'] <= expected + 1,
          `Expected ~${expected} for ${days} days, got ${weighted['file1.js']['Alice']}`
        );
      }
    });

    it('should preserve relative contributions after decay', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 80, 'Bob': 20 }
      };
      
      const currentTime = Date.now();
      const oldTime = currentTime - (100 * 24 * 60 * 60 * 1000); // 100 days ago
      const fileCommitData = {
        'file1.js': [
          { author: 'Alice', timestamp: oldTime },
          { author: 'Bob', timestamp: oldTime }
        ]
      };

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      
      // Both should have same decay, so relative contribution should be preserved
      const aliceRatio = weighted['file1.js']['Alice'] / (weighted['file1.js']['Alice'] + weighted['file1.js']['Bob']);
      assert.ok(aliceRatio >= 0.79 && aliceRatio <= 0.81); // Should still be ~80%
    });
  });

  describe('performance and large scale tests', () => {
    it('should handle large repositories efficiently', () => {
      const fileAuthorship = {};
      const fileCommitData = {};
      const currentTime = Date.now();
      
      // Create 1000 files distributed among 10 authors
      for (let i = 0; i < 1000; i++) {
        const author = `Author${i % 10}`;
        fileAuthorship[`file${i}.js`] = { [author]: 100 };
        fileCommitData[`file${i}.js`] = [{ author, timestamp: currentTime }];
      }

      const start = Date.now();
      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      const ownership = calculator.getFileOwnership(weighted);
      const doa = calculator.calculateAuthorDOA(ownership, weighted);
      const duration = Date.now() - start;

      // Each author owns 100 files (10%)
      Object.values(doa).forEach(authorData => {
        assert.equal(authorData.filesOwned, 100);
        assert.equal(authorData.weightedDOA, 0.1);
      });
      
      assert.ok(duration < 1000, `Calculation took ${duration}ms, should be < 1000ms`);
    });

    it('should handle files with many contributors', () => {
      const fileAuthorship = { 'complex.js': {} };
      const fileCommitData = { 'complex.js': [] };
      const currentTime = Date.now();
      
      // Add 100 contributors to a single file
      for (let i = 0; i < 100; i++) {
        fileAuthorship['complex.js'][`Author${i}`] = i + 1;
        fileCommitData['complex.js'].push({ 
          author: `Author${i}`, 
          timestamp: currentTime - (i * 24 * 60 * 60 * 1000) 
        });
      }

      const weighted = calculator.applyKnowledgeDecay(fileAuthorship, fileCommitData);
      const ownership = calculator.getFileOwnership(weighted);
      
      // Author99 should be the owner (highest contribution: 100)
      assert.equal(ownership['complex.js'], 'Author99');
    });
  });
});