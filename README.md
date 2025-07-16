# Bus Factor Analyzer

A simple command-line tool to analyze the bus factor of Git repositories using the ABF (Authorship-Based Factor) method by Avelino et al.

## What is Bus Factor?

The "bus factor" is the minimum number of team members that have to suddenly disappear from a project (e.g., hit by a bus) before the project stalls due to lack of knowledgeable or competent personnel. A low bus factor indicates high risk - the loss of just one or two key developers could severely impact the project.

## Installation

```bash
# Clone the repository
git clone <this-repo-url>
cd busfactor-analyzer

# Install dependencies
npm install
```

## Usage

```bash
node index.js <git-repo-url>
```

### Example

```bash
node index.js https://github.com/chalk/chalk.git
```

## How it Works

This analyzer implements the **Contribution-Based (ABF)** method by Avelino et al.:

1. **Analyze File Ownership**: Uses `git blame` to determine who contributed to each file
2. **Calculate Degree of Authorship (DOA)**: For each developer, calculates the percentage of files where they own >50% of the code
3. **Iterative Removal**: Removes developers one by one (starting with highest DOA) until more than 50% of files have adequate coverage from remaining developers
4. **Bus Factor**: The number of developers removed is the bus factor

## Output

The analyzer provides:

- **Bus Factor**: The calculated bus factor number
- **Risk Assessment**: Critical, High, Moderate, or Low risk level
- **Critical Contributors**: List of developers whose loss would most impact the project
- **Top Contributors**: Ranked list with their Degree of Authorship
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

## Limitations

- **Equal File Treatment**: All files are treated as equally important, regardless of complexity or criticality
- **50% Threshold**: Uses an arbitrary 50% threshold for determining file ownership
- **Line-Based Analysis**: Measures contribution by lines of code, which may not reflect actual knowledge or importance
- **Historical Data**: Only considers current code state, not historical contributions

## Requirements

- Node.js 14 or higher
- Git installed on your system
- Access to clone the target repository

## Dependencies

- `simple-git`: Git operations
- `fs-extra`: File system utilities
- `chalk`: Terminal styling

## License

MIT