# Combine Rules with Claude

This script combines development rules from Windsurf (.md) and Cursor (.mdc) formats using Claude's API to analyze and merge them intelligently.

## Based on scripts on X by user @build4growthsv 
### https://x.com/build4growthsv/status/1921403190316048395

Thanks for sharing!

## Setup

1. **Install dependencies**:
   ```bash
   npm install axios glob dotenv
   ```

2. **Create a `.env` file**:
   ```bash
   # Copy the example file
   cp .env.example .env
   
   # Edit the .env file and add your Claude API key
   ```

   Your `.env` file should contain:
   ```
   CLAUDE_API_KEY=your_actual_api_key_here
   ```

   You can get an API key at: https://console.anthropic.com/

3. **Run the script**:
   ```bash
   # Normal mode (uses Claude API)
   node combine-rules-with-claude.js
   
   # Dry-run mode (local analysis only, no API calls)
   node combine-rules-with-claude.js --dry-run
   # or
   node combine-rules-with-claude.js -d
   ```

## What it does

The script will:
- Find all `.md` and `.mdc` files in your `.windsurf/rules` directory
- Read and parse each file's metadata and content

**In normal mode:**
- Send all rules to Claude's API for analysis
- Claude will:
  - Identify duplicate rules
  - Resolve conflicts between similar rules
  - Suggest a unified format
  - Combine rules intelligently
- Output the combined rules to `.windsurf/combined-rules/`
- Create an analysis file explaining the combination decisions

**In dry-run mode:**
- Perform local analysis without using the API
- Show statistics about your rules
- Identify potential duplicates and conflicts
- Display a list of files that would be processed
- No API calls are made and no files are created

## Output

After running, you'll find:
- Combined rule files in `.windsurf/combined-rules/`
- An analysis report at `.windsurf/combined-rules/analysis.md`

## Configuration Options

You can customize the behavior by adding these optional variables to your `.env` file:

```env
# Specify a different Claude model
CLAUDE_MODEL=claude-3-7-sonnet-20250219

# Use a different API endpoint (for enterprise users)
CLAUDE_API_URL=https://api.anthropic.com/v1/messages
```

## Dry-Run Mode

Use the `--dry-run` or `-d` flag to analyze your rules without making API calls:

```bash
node combine-rules-with-claude.js --dry-run
```

This mode will show you:
- Total number of rules and their formats
- Distribution of trigger types
- Potential duplicate rules (based on descriptions and content similarity)
- Potential conflicts (same glob patterns with different triggers)
- List of all files that would be processed

This is useful for:
- Understanding your rule structure before combining
- Checking for issues without using API credits
- Testing the script setup without needing an API key

## Troubleshooting

- **API Key not found**: Make sure your `.env` file is in the same directory as the script (or use `--dry-run` mode)
- **No rules found**: Ensure you're running the script from your project root directory
- **API errors**: Check your API key is valid and you have available credits

## Cross-Platform Support

This script works on:
- Windows
- macOS
- Linux

The script automatically handles path differences between operating systems.
