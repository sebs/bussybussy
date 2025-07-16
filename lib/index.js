#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { GitHandler } from './git-handler.js';
import { AuthorshipAnalyzer } from './authorship-analyzer.js';
import { BusFactorCalculator } from './bus-factor-calculator.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getVersion() {
  try {
    const packagePath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    return '1.0.0';
  }
}

async function analyzeBusFactor(repoUrl, options) {
  const gitHandler = new GitHandler({ quiet: options.quiet });
  
  try {
    if (!options.quiet) {
      console.log(chalk.blue.bold('\n🚌 Bus Factor Analyzer\n'));
      console.log(chalk.gray('=' .repeat(60)));
    }
    
    const repoPath = await gitHandler.cloneRepo(repoUrl);
    
    const analyzer = new AuthorshipAnalyzer(repoPath, { quiet: options.quiet, json: options.json });
    
    // Set up event listeners for authorship analyzer
    analyzer.on('info', (message) => {
      if (!options.quiet) {
        console.log(message);
      }
    });
    
    analyzer.on('warning', (message) => {
      if (!(options.quiet && options.json)) {
        console.warn(message);
      }
    });
    
    analyzer.on('progress', (data) => {
      if (!options.quiet) {
        process.stdout.write(`\r🔍 Analyzing: [${data.processed}/${data.total}] ${data.progress}% | ${data.file.substring(0, 50)}${data.file.length > 50 ? '...' : ''} | ETA: ${data.eta}s`);
      }
    });
    
    const analysisData = await analyzer.analyzeAuthorship();
    
    const calculator = new BusFactorCalculator({ quiet: options.quiet });
    
    // Set up event listeners for bus factor calculator
    calculator.on('info', (message) => {
      if (!options.quiet) {
        console.log(message);
      }
    });
    
    calculator.on('warning', (message) => {
      if (!(options.quiet && options.json)) {
        console.warn(message);
      }
    });
    
    calculator.on('progress', (data) => {
      if (!options.quiet) {
        process.stdout.write(`\r${data}`);
      }
    });
    
    const report = await calculator.calculate(options.method || 'abf', analysisData.fileAuthorship, analysisData);
    
    if (options.json && options.quiet) {
      console.log(JSON.stringify(report));
    } else if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      displayReport(report, options);
    }
    
    if (!options.quiet) {
      console.log(chalk.gray('\n🧹 Cleaning up temporary files...'));
    }
    await gitHandler.cleanup();
    if (!options.quiet) {
      console.log(chalk.green('✅ Cleanup complete!'));
    }
    
  } catch (error) {
    if (options.json && options.quiet) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      if (!options.quiet) {
        console.log(chalk.gray('\n🧹 Cleaning up temporary files...'));
      }
    }
    await gitHandler.cleanup();
    if (!options.quiet && !(options.json && options.quiet)) {
      console.log(chalk.green('✅ Cleanup complete!'));
    }
    process.exit(1);
  }
}

function displayReport(report, options) {
  if (options.quiet) {
    console.log(report.summary.busFactor);
    return;
  }
  
  console.log(chalk.blue.bold('\n📊 Analysis Results\n'));
  
  console.log(chalk.white.bold('Summary:'));
  console.log(`  Bus Factor: ${chalk.yellow.bold(report.summary.busFactor)}`);
  console.log(`  Total Files: ${report.summary.totalFiles}`);
  console.log(`  Total Contributors: ${report.summary.totalContributors}`);
  console.log(`  Critical Contributors: ${report.summary.criticalContributors.join(', ')}\n`);
  
  if (!options.summary) {
    console.log(chalk.white.bold('Risk Assessment:'));
    const riskColor = report.interpretation.risk === 'CRITICAL' ? chalk.red :
                      report.interpretation.risk === 'HIGH' ? chalk.yellow :
                      report.interpretation.risk === 'MODERATE' ? chalk.blue :
                      chalk.green;
    console.log(`  Risk Level: ${riskColor.bold(report.interpretation.risk)}`);
    console.log(`  ${report.interpretation.message}\n`);
    
    console.log(chalk.white.bold('Top Contributors (by Degree of Authorship):'));
    report.topContributors.forEach((contributor, index) => {
      console.log(`  ${index + 1}. ${contributor.author}`);
      console.log(`     DOA: ${contributor.degreeOfAuthorship} (owns ~${contributor.filesOwned} files)`);
    });
    
    console.log(chalk.gray(`\nAnalysis Method: ${report.analysis.method}`));
    console.log(chalk.gray(`Ownerless Files Ratio: ${(report.analysis.finalOwnerlessRatio * 100).toFixed(2)}%\n`));
  }
}

async function main() {
  const program = new Command();
  const version = await getVersion();
  
  program
    .name('busfactor-analyzer')
    .description('A bus factor analyzer for Git repositories')
    .version(version);
  
  // ABF subcommand
  program
    .command('abf <repo-url>')
    .description('Analyze bus factor using the ABF (Augmented Bus Factor) method')
    .option('-j, --json', 'output results as JSON')
    .option('-q, --quiet', 'output only the bus factor value')
    .option('-s, --summary', 'show only summary information')
    .action((repoUrl, options) => {
      analyzeBusFactor(repoUrl, { ...options, method: 'abf' });
    });
  
  // JBF subcommand
  program
    .command('jbf <repo-url>')
    .description('Analyze bus factor using the JBF (Just Bus Factor) method')
    .option('-j, --json', 'output results as JSON')
    .option('-q, --quiet', 'output only the bus factor value')
    .option('-s, --summary', 'show only summary information')
    .action((repoUrl, options) => {
      analyzeBusFactor(repoUrl, { ...options, method: 'jbf' });
    });
  
  program.parse();
}

main().catch(error => {
  console.error(chalk.red(`\nUnexpected error: ${error.message}`));
  process.exit(1);
});