#!/bin/bash

# Create output directory if it doesn't exist
mkdir -p analysis-results

# Track statistics
total=0
skipped=0
success=0
failed=0

# Skip the header line and read the CSV
tail -n +2 all_opencode_projects.csv | while IFS=',' read -r name url
do
    # Trim whitespace
    name=$(echo "$name" | xargs)
    url=$(echo "$url" | xargs)
    
    # Increment total count
    ((total++))
    
    # Create filename from name (lowercase, replace spaces with hyphens)
    filename=$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g' | sed 's/-\+/-/g' | sed 's/^-//;s/-$//')
    
    # Check if analysis already exists
    if [ -f "analysis-results/${filename}.json" ]; then
        echo "⏭️  Skipping $name (already analyzed)"
        ((skipped++))
        echo "---"
        continue
    fi
    
    echo "Analyzing $name..."
    echo "Repository: $url"
    echo "Output file: analysis-results/${filename}.json"
    
    # Only skip obvious non-Git URLs (documents)
    if [[ "$url" =~ \.(pdf|html|htm|doc|docx)$ ]]; then
        echo "✗ Skipping: Document URL, not a Git repository"
        ((failed++))
        echo "---"
        continue
    fi
    
    # Run the analysis using ABF method with JSON output, with timeout
    node lib/index.js abf "$url" --json --quiet > "analysis-results/${filename}.json" 2> "analysis-results/${filename}.error"
    
    # Check if the command succeeded
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        # Check if output file is valid JSON and not empty
        if [ -s "analysis-results/${filename}.json" ] && jq empty "analysis-results/${filename}.json" 2>/dev/null; then
            echo "✓ Successfully analyzed $name"
            ((success++))
            rm -f "analysis-results/${filename}.error"
        else
            echo "✗ Failed to analyze $name: Invalid output"
            ((failed++))
            rm -f "analysis-results/${filename}.json"
        fi
    elif [ $exit_code -eq 124 ]; then
        echo "✗ Failed to analyze $name: Timeout after 5 minutes"
        ((failed++))
        rm -f "analysis-results/${filename}.json"
        # Save error for debugging
        echo "Timeout: Git clone took longer than 5 minutes" > "analysis-results/${filename}.error"
    else
        echo "✗ Failed to analyze $name: Exit code $exit_code"
        ((failed++))
        rm -f "analysis-results/${filename}.json"
        # Check if there's an error message
        if [ -s "analysis-results/${filename}.error" ]; then
            echo "   Error: $(head -n 1 analysis-results/${filename}.error)"
        fi
    fi
    
    echo "---"
done

echo ""
echo "Analysis complete!"
echo "Total repositories: $total"
echo "Already analyzed: $skipped"
echo "Successfully analyzed: $success"
echo "Failed: $failed"
echo "Results saved in analysis-results/"