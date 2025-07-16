import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BusFactorCalculator } from '../lib/bus-factor-calculator.js';

describe('BusFactorCalculator', () => {
  let calculator;

  beforeEach(() => {
    calculator = new BusFactorCalculator();
  });

  describe('calculate', () => {
    it('should calculate bus factor using ABF method', async () => {
      const fileAuthorship = {
        'file1.js': { 'Alice': 100 },
        'file2.js': { 'Alice': 80, 'Bob': 20 },
        'file3.js': { 'Bob': 100 },
        'file4.js': { 'Charlie': 100 }
      };

      const analysisData = {
        fileAuthorship,
        totalAuthorship: {
          'Alice': 180,
          'Bob': 120,
          'Charlie': 100
        },
        totalFiles: 4
      };

      const report = await calculator.calculate('abf', fileAuthorship, analysisData);

      assert.equal(report.summary.busFactor, 2);
      assert.equal(report.summary.totalFiles, 4);
      assert.equal(report.summary.totalContributors, 3);
      assert.deepEqual(report.summary.criticalContributors, ['Alice', 'Bob']);
      assert.equal(report.analysis.method, 'Avelino et al. - ABF (Authorship-Based Factor)');
    });

    it('should throw error for unknown method', async () => {
      const fileAuthorship = {};
      const analysisData = {};

      await assert.rejects(async () => {
        await calculator.calculate('unknown', fileAuthorship, analysisData);
      }, /Unknown bus factor calculation method: unknown/);
    });
  });

  describe('listAvailableMethods', () => {
    it('should list all available calculation methods', () => {
      const methods = calculator.listAvailableMethods();
      
      assert.ok(Array.isArray(methods));
      assert.ok(methods.includes('abf'));
      assert.ok(methods.includes('jbf'));
      assert.equal(methods.length, 2); // ABF and JBF are implemented
    });
  });
});