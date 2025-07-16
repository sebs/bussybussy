import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ABFBusFactorCalculator } from '../lib/abf-bus-factor-calculator.js';

describe('ABFBusFactorCalculator', () => {
  let calculator;

  beforeEach(() => {
    calculator = new ABFBusFactorCalculator();
  });

  describe('getFileOwnership', () => {
    it('should assign file to author with most lines', () => {
      const fileAuthorship = {
        'file1.js': {
          'Alice': 70,
          'Bob': 30
        },
        'file2.js': {
          'Bob': 60,
          'Charlie': 40
        }
      };

      const ownership = calculator.getFileOwnership(fileAuthorship);

      assert.deepEqual(ownership, {
        'file1.js': 'Alice',
        'file2.js': 'Bob'
      });
    });

    it('should handle single author files', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 }
      };

      const ownership = calculator.getFileOwnership(fileAuthorship);

      assert.deepEqual(ownership, {
        'file1.js': 'Alice'
      });
    });

    it('should handle empty files', () => {
      const fileAuthorship = {
        'empty.js': {}
      };

      const ownership = calculator.getFileOwnership(fileAuthorship);

      assert.deepEqual(ownership, {
        'empty.js': null
      });
    });

    it('should handle ties by selecting first author found', () => {
      const fileAuthorship = {
        'tie.js': {
          'Alice': 50,
          'Bob': 50
        }
      };

      const ownership = calculator.getFileOwnership(fileAuthorship);
      
      // Either Alice or Bob could win, depending on object iteration order
      assert.ok(ownership['tie.js'] === 'Alice' || ownership['tie.js'] === 'Bob');
    });
  });

  describe('calculateAuthorDOA', () => {
    it('should calculate degree of authorship correctly', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': 'Alice',
        'file3.js': 'Bob',
        'file4.js': 'Alice'
      };

      const doa = calculator.calculateAuthorDOA(fileOwnership);

      assert.deepEqual(doa, {
        'Alice': 0.75,  // 3/4 files
        'Bob': 0.25     // 1/4 files
      });
    });

    it('should handle null owners', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': null,
        'file3.js': 'Alice',
        'file4.js': null
      };

      const doa = calculator.calculateAuthorDOA(fileOwnership);

      assert.deepEqual(doa, {
        'Alice': 0.5  // 2/4 files
      });
    });

    it('should return empty object for no files', () => {
      const fileOwnership = {};

      const doa = calculator.calculateAuthorDOA(fileOwnership);

      assert.deepEqual(doa, {});
    });

    it('should handle single author owning all files', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': 'Alice',
        'file3.js': 'Alice'
      };

      const doa = calculator.calculateAuthorDOA(fileOwnership);

      assert.deepEqual(doa, {
        'Alice': 1.0
      });
    });
  });

  describe('calculateFinalOwnerlessRatio', () => {
    it('should calculate ownerless ratio correctly', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': 'Bob',
        'file3.js': 'Charlie',
        'file4.js': 'Alice'
      };

      const ratio = calculator.calculateFinalOwnerlessRatio(fileOwnership, ['Alice', 'Bob']);

      assert.equal(ratio, 0.75); // 3/4 files are ownerless
    });

    it('should return 0 when no authors removed', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': 'Bob'
      };

      const ratio = calculator.calculateFinalOwnerlessRatio(fileOwnership, []);

      assert.equal(ratio, 0);
    });

    it('should return 1 when all authors removed', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': 'Bob'
      };

      const ratio = calculator.calculateFinalOwnerlessRatio(fileOwnership, ['Alice', 'Bob']);

      assert.equal(ratio, 1);
    });

    it('should handle null owners', () => {
      const fileOwnership = {
        'file1.js': 'Alice',
        'file2.js': null,
        'file3.js': 'Bob'
      };

      const ratio = calculator.calculateFinalOwnerlessRatio(fileOwnership, ['Alice']);

      assert.equal(ratio, 1/3); // Only file1.js becomes ownerless
    });
  });

  describe('calculateABF', () => {
    it('should calculate bus factor correctly', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 },
        'file2.js': { 'Alice': 80, 'Bob': 20 },
        'file3.js': { 'Bob': 100 },
        'file4.js': { 'Charlie': 100 }
      };

      const result = calculator.calculateABF(fileAuthorship);

      assert.equal(result.busFactor, 2); // Alice + Bob > 50%
      assert.deepEqual(result.removedAuthors, ['Alice', 'Bob']);
      assert.equal(result.ownerlessRatio, 0.75); // 3/4 files
    });

    it('should handle single dominant author', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 },
        'file2.js': { 'Alice': 100 },
        'file3.js': { 'Alice': 90, 'Bob': 10 },
        'file4.js': { 'Bob': 100 }
      };

      const result = calculator.calculateABF(fileAuthorship);

      assert.equal(result.busFactor, 1); // Alice owns > 50%
      assert.deepEqual(result.removedAuthors, ['Alice']);
    });

    it('should handle many contributors', () => {
      const fileAuthorship = {};
      // Create 10 files, each owned by different author
      for (let i = 1; i <= 10; i++) {
        fileAuthorship[`file${i}.js`] = { [`Author${i}`]: 100 };
      }

      const result = calculator.calculateABF(fileAuthorship);

      assert.equal(result.busFactor, 6); // Need to remove 6 authors to reach > 50%
      assert.equal(result.removedAuthors.length, 6);
    });

    it('should sort authors by DOA correctly', () => {
      const fileAuthorship = {
        'file1.js': { 'Charlie': 100 }, // Charlie: 1 file
        'file2.js': { 'Bob': 100 },     // Bob: 2 files  
        'file3.js': { 'Bob': 100 },
        'file4.js': { 'Alice': 100 },   // Alice: 3 files
        'file5.js': { 'Alice': 100 },
        'file6.js': { 'Alice': 100 }
      };

      const result = calculator.calculateABF(fileAuthorship);

      // Alice should be removed first (highest DOA)
      assert.equal(result.removedAuthors[0], 'Alice');
      assert.equal(result.busFactor, 2); // Alice + Bob
    });

    it('should handle empty repository', () => {
      const fileAuthorship = {};

      const result = calculator.calculateABF(fileAuthorship);

      assert.equal(result.busFactor, 0);
      assert.deepEqual(result.removedAuthors, []);
      assert.ok(isNaN(result.ownerlessRatio)); // 0/0
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report', () => {
      const analysisData = {
        fileAuthorship: {
          'file1.js': { 'Alice': 100 },
          'file2.js': { 'Bob': 100 }
        },
        totalAuthorship: {
          'Alice': 100,
          'Bob': 100,
          'Charlie': 50
        },
        totalFiles: 2
      };

      const abfResult = {
        busFactor: 2,
        removedAuthors: ['Alice', 'Bob'],
        ownerlessRatio: 1.0,
        authorDetails: [
          { author: 'Alice', doa: 0.5 },
          { author: 'Bob', doa: 0.5 }
        ]
      };

      const report = calculator.generateReport(analysisData, abfResult);

      assert.equal(report.summary.busFactor, 2);
      assert.equal(report.summary.totalFiles, 2);
      assert.equal(report.summary.totalContributors, 3);
      assert.deepEqual(report.summary.criticalContributors, ['Alice', 'Bob']);

      assert.equal(report.analysis.method, 'Avelino et al. - ABF (Authorship-Based Factor)');
      assert.equal(report.analysis.finalOwnerlessRatio, 1.0);
      assert.equal(report.analysis.threshold, 0.5);

      assert.equal(report.topContributors.length, 2);
      assert.equal(report.topContributors[0].author, 'Alice');
      assert.equal(report.topContributors[0].degreeOfAuthorship, '50.00%');
      assert.equal(report.topContributors[0].filesOwned, 1);

      assert.ok(report.interpretation);
    });

    it('should limit top contributors to 10', () => {
      const authorDetails = [];
      for (let i = 1; i <= 15; i++) {
        authorDetails.push({ author: `Author${i}`, doa: 0.1 });
      }

      const analysisData = {
        fileAuthorship: {},
        totalAuthorship: {},
        totalFiles: 100
      };

      const abfResult = {
        busFactor: 5,
        removedAuthors: [],
        ownerlessRatio: 0.5,
        authorDetails
      };

      const report = calculator.generateReport(analysisData, abfResult);

      assert.equal(report.topContributors.length, 10);
    });
  });

  describe('interpretResults', () => {
    it('should return CRITICAL for bus factor of 1', () => {
      const interpretation = calculator.interpretResults(1);

      assert.equal(interpretation.risk, 'CRITICAL');
      assert.ok(interpretation.message.includes('bus factor of 1'));
      assert.ok(interpretation.recommendation.includes('Urgent'));
    });

    it('should return HIGH for bus factor of 2', () => {
      const interpretation = calculator.interpretResults(2);

      assert.equal(interpretation.risk, 'HIGH');
      assert.ok(interpretation.message.includes('bus factor of 2'));
    });

    it('should return MODERATE for bus factor of 3-4', () => {
      let interpretation = calculator.interpretResults(3);
      assert.equal(interpretation.risk, 'MODERATE');

      interpretation = calculator.interpretResults(4);
      assert.equal(interpretation.risk, 'MODERATE');
    });

    it('should return LOW for bus factor > 4', () => {
      const interpretation = calculator.interpretResults(5);
      assert.equal(interpretation.risk, 'LOW');

      const interpretation2 = calculator.interpretResults(10);
      assert.equal(interpretation2.risk, 'LOW');
    });

    it('should include appropriate recommendations', () => {
      const critical = calculator.interpretResults(1);
      assert.ok(critical.recommendation.includes('Urgent'));

      const high = calculator.interpretResults(2);
      assert.ok(high.recommendation.includes('pair programming'));

      const moderate = calculator.interpretResults(3);
      assert.ok(moderate.recommendation.includes('Continue efforts'));

      const low = calculator.interpretResults(5);
      assert.ok(low.recommendation.includes('Maintain'));
    });
  });

  describe('edge cases and calculation accuracy', () => {
    it('should handle fractional ownership correctly', () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 51, 'Bob': 49 },
        'file2.js': { 'Bob': 51, 'Alice': 49 },
        'file3.js': { 'Charlie': 100 },
        'file4.js': { 'Alice': 60, 'Bob': 40 }
      };

      const result = calculator.calculateABF(fileAuthorship);
      const ownership = calculator.getFileOwnership(fileAuthorship);

      assert.equal(ownership['file1.js'], 'Alice');
      assert.equal(ownership['file2.js'], 'Bob');
      assert.equal(ownership['file4.js'], 'Alice');
    });

    it('should stop exactly when threshold exceeded', () => {
      // Create scenario where removing 2 authors gets exactly to 50%, 
      // but need 3 to exceed
      const fileAuthorship = {
        'file1.js': { 'A': 100 },
        'file2.js': { 'A': 100 },
        'file3.js': { 'B': 100 },
        'file4.js': { 'B': 100 },
        'file5.js': { 'C': 100 },
        'file6.js': { 'D': 100 }
      };

      const result = calculator.calculateABF(fileAuthorship);

      // Removing A and B gives 4/6 = 0.667 > 0.5
      assert.equal(result.busFactor, 2);
    });

    it('should handle very small DOA differences', () => {
      const fileAuthorship = {};
      // Create 100 files with slightly different ownership patterns
      for (let i = 0; i < 50; i++) {
        fileAuthorship[`file${i}.js`] = { 'Alice': 100 };
      }
      for (let i = 50; i < 99; i++) {
        fileAuthorship[`file${i}.js`] = { 'Bob': 100 };
      }
      fileAuthorship['file99.js'] = { 'Charlie': 100 };

      const result = calculator.calculateABF(fileAuthorship);
      const doa = calculator.calculateAuthorDOA(calculator.getFileOwnership(fileAuthorship));

      assert.equal(doa['Alice'], 0.5);
      assert.equal(doa['Bob'], 0.49);
      assert.equal(doa['Charlie'], 0.01);
      assert.equal(result.busFactor, 2); // Alice + Bob
    });
  });
});