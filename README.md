# Bus Factor Analyzer

A command-line tool to analyze the bus factor of Git repositories using multiple calculation methods.

> Evaluation pourposes only: Calculations are wrong, it will probably delete all your code and most likely go to the kitchen and eat the cake too. 

## What is Bus Factor?

The "bus factor" is the minimum number of team members that have to suddenly disappear from a project (e.g., hit by a bus) before the project stalls due to lack of knowledgeable or competent personnel. A low bus factor indicates high risk - the loss of just one or two key developers could severely impact the project.

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd bus-factor-analyzer

# Install dependencies
npm install
```

## Usage

The analyzer supports two calculation methods:

### ABF (Authorship-Based Factor)

```bash
node lib/index.js abf <git-repo-url>
```

### JBF (Jabrayilzade Bus Factor)

```bash
node lib/index.js jbf <git-repo-url>
```

### Options

- `--json` - Output results as JSON
- `--quiet` - Minimal output
- `--summary` - Summary only

### Examples

```bash
# Analyze with ABF method
node lib/index.js abf https://github.com/chalk/chalk.git

# Analyze with JBF method and JSON output
node lib/index.js jbf https://github.com/chalk/chalk.git --json

# Quiet mode - only show bus factor number
node lib/index.js abf https://github.com/chalk/chalk.git --quiet
```

## Calculation Methods

### ABF (Authorship-Based Factor)

Implements the method by Avelino et al.:

1. **Analyze File Ownership**: Uses `git blame` to determine who contributed to each file
2. **Calculate Degree of Authorship (DOA)**: For each developer, calculates the percentage of files where they own >50% of the code
3. **Iterative Removal**: Removes developers one by one (starting with highest DOA) until more than 50% of files have adequate coverage from remaining developers
4. **Bus Factor**: The number of developers removed is the bus factor

### JBF (Jabrayilzade Bus Factor)

Implements the time-weighted bus factor method by Jabrayilzade et al., which considers:
- Historical contribution patterns over time
- Knowledge decay and recency of contributions
- Weighted authorship based on temporal factors

## Output

The analyzer provides:

- **Bus Factor**: The calculated bus factor number
- **Risk Assessment**: Critical, High, Moderate, or Low risk level
- **Critical Contributors**: List of developers whose loss would most impact the project
- **Top Contributors**: Ranked list with their contribution metrics
- **Recommendations**: Actionable advice based on the risk level

### Example Output

```
🚌 Bus Factor Analyzer

✓ Repository cloned successfully
🔍 Analyzing file authorship...
✓ Analyzed 34 files

📊 Analysis Results

Summary:
  Bus Factor: 2
  Total Files: 150
  Total Contributors: 25
  Critical Contributors: John Doe, Jane Smith

Risk Assessment:
  Risk Level: HIGH
  Project has a bus factor of 2. Very few developers hold critical knowledge.
  Consider implementing pair programming, code reviews, and documentation to spread knowledge.

Top Contributors (by Degree of Authorship):
  1. John Doe
     DOA: 45.20% (owns ~68 files)
  2. Jane Smith
     DOA: 28.30% (owns ~42 files)
```

## Architecture

The project uses an event-driven architecture with ES modules:

- **Event-Based Progress**: Real-time updates during analysis
- **Modular Design**: Separate components for Git operations, authorship analysis, and calculations
- **Schema Validation**: Input/output validation using JSON schemas
- **Clean Architecture**: Factory pattern for calculation methods

## Testing

```bash
# Run all tests
npm test

# Run specific test file
node --test test/bus-factor-calculator.test.js
```

## Limitations

- **Equal File Treatment**: All files are treated as equally important, regardless of complexity or criticality
- **50% Threshold**: Uses an arbitrary 50% threshold for determining file ownership
- **Line-Based Analysis**: Measures contribution by lines of code, which may not reflect actual knowledge or importance
- **Historical Data**: Only considers current code state, not historical contributions

## Requirements

- Node.js 20 or higher
- Git installed on your system
- Access to clone the target repository

## License

MIT