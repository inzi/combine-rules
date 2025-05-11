#!/usr/bin/env node
/**
 * combine-rules-with-claude.js
 * Description: Script to combine Windsurf and Cursor rules using Claude API
 * Date: 2025-05-11
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const axios = require('axios');
require('dotenv').config(); // Load environment variables from .env file

// Configuration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-20250219';

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');

/**
 * Reads a rule file and extracts metadata and content
 * @param {string} filePath - Path to the rule file
 * @returns {Object} - Parsed rule data
 */
function readRuleFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const metadataMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        
        if (!metadataMatch) {
            console.error(`Warning: Could not extract metadata from ${filePath}`);
            return { filePath, metadata: {}, content };
        }
        
        const metadataSection = metadataMatch[1];
        const bodyContent = metadataMatch[2];
        
        // Parse metadata
        const metadata = {};
        metadataSection.split('\n').forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                if (key && value !== undefined) {
                    metadata[key] = value;
                }
            }
        });
        
        return {
            filePath,
            metadata,
            content: bodyContent.trim(),
            format: filePath.endsWith('.md') ? 'windsurf' : 'cursor'
        };
    } catch (error) {
        console.error(`Error reading ${filePath}: ${error.message}`);
        return null;
    }
}

/**
 * Analyzes rules locally for dry-run mode
 * @param {Array} rules - Array of rule objects
 * @returns {Object} - Analysis results
 */
function analyzeRulesLocally(rules) {
    const analysis = {
        totalRules: rules.length,
        byFormat: {
            windsurf: rules.filter(r => r.format === 'windsurf').length,
            cursor: rules.filter(r => r.format === 'cursor').length
        },
        byTriggerType: {},
        duplicates: [],
        conflicts: []
    };
    
    // Analyze trigger types
    rules.forEach(rule => {
        const trigger = rule.metadata.trigger || rule.metadata.alwaysApply || 'unknown';
        analysis.byTriggerType[trigger] = (analysis.byTriggerType[trigger] || 0) + 1;
    });
    
    // Find potential duplicates (same description or similar content)
    for (let i = 0; i < rules.length; i++) {
        for (let j = i + 1; j < rules.length; j++) {
            const rule1 = rules[i];
            const rule2 = rules[j];
            
            // Check for same description
            if (rule1.metadata.description === rule2.metadata.description && rule1.metadata.description) {
                analysis.duplicates.push({
                    files: [path.basename(rule1.filePath), path.basename(rule2.filePath)],
                    reason: 'Same description',
                    description: rule1.metadata.description
                });
            }
            
            // Check for similar content (simple similarity check)
            const similarity = calculateSimilarity(rule1.content, rule2.content);
            if (similarity > 0.8) {
                analysis.duplicates.push({
                    files: [path.basename(rule1.filePath), path.basename(rule2.filePath)],
                    reason: 'Similar content',
                    similarity: `${(similarity * 100).toFixed(1)}%`
                });
            }
        }
    }
    
    // Find potential conflicts (same globs with different triggers)
    const globRules = rules.filter(r => r.metadata.globs);
    for (let i = 0; i < globRules.length; i++) {
        for (let j = i + 1; j < globRules.length; j++) {
            if (globRules[i].metadata.globs === globRules[j].metadata.globs &&
                globRules[i].metadata.trigger !== globRules[j].metadata.trigger) {
                analysis.conflicts.push({
                    files: [path.basename(globRules[i].filePath), path.basename(globRules[j].filePath)],
                    glob: globRules[i].metadata.globs,
                    triggers: [globRules[i].metadata.trigger, globRules[j].metadata.trigger]
                });
            }
        }
    }
    
    return analysis;
}

/**
 * Simple similarity calculation between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score between 0 and 1
 */
function calculateSimilarity(str1, str2) {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
}

/**
 * Sends rules to Claude API for analysis and combination
 * @param {Array} rules - Array of rule objects
 * @returns {Promise<string>} - Combined rules from Claude
 */
async function combineRulesWithClaude(rules) {
    if (!CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY not found in .env file');
    }
    
    const prompt = `
I have a set of development rules from two different systems: Windsurf (.md files) and Cursor (.mdc files). 
Please analyze these rules and combine them into a unified set, eliminating duplicates and resolving conflicts.

Here are the rules:

${rules.map(rule => `
File: ${path.basename(rule.filePath)}
Format: ${rule.format}
Metadata: ${JSON.stringify(rule.metadata, null, 2)}
Content:
${rule.content}
-------------------
`).join('\n')}

Please provide:
1. A combined set of rules that includes the best aspects of both systems
2. Identify any conflicts and explain how you resolved them
3. Suggest a unified format (either .md or .mdc or a new format)
4. Output the combined rules in the suggested format

Please format the output as a JSON object with this structure:
{
  "analysis": "Your analysis of the rules and conflicts",
  "suggestedFormat": "md" or "mdc",
  "combinedRules": [
    {
      "filename": "rule-name.ext",
      "metadata": { ... },
      "content": "rule content"
    }
  ]
}
`;

    try {
        const response = await axios.post(CLAUDE_API_URL, {
            model: CLAUDE_MODEL,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 4096,
            temperature: 0.3
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        });

        return response.data.content[0].text;
    } catch (error) {
        console.error('Error calling Claude API:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Writes the combined rules to files
 * @param {Object} combinedData - The parsed response from Claude
 * @param {string} outputDir - Directory to write the combined rules
 */
function writeCombinedRules(combinedData, outputDir) {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write analysis to a separate file
    fs.writeFileSync(
        path.join(outputDir, 'analysis.md'),
        `# Rules Combination Analysis\n\n${combinedData.analysis}\n\nSuggested Format: ${combinedData.suggestedFormat}`
    );
    
    // Write each combined rule
    combinedData.combinedRules.forEach(rule => {
        const filePath = path.join(outputDir, rule.filename);
        
        // Format the rule file
        let content = '---\n';
        Object.entries(rule.metadata).forEach(([key, value]) => {
            content += `${key}: ${value}\n`;
        });
        content += '---\n\n';
        content += rule.content;
        
        fs.writeFileSync(filePath, content);
        console.log(`Wrote combined rule: ${filePath}`);
    });
}

/**
 * Main function
 */
async function main() {
    const baseDir = process.cwd();
    const outputDir = path.join(baseDir, '.windsurf/combined-rules');
    
    if (DRY_RUN) {
        console.log('🔍 Running in DRY-RUN mode - no API calls will be made\n');
    }
    
    // Find all .md and .mdc files
    const mdFiles = glob.sync(path.join(baseDir, '.windsurf/rules/**/*.md'));
    const mdcFiles = glob.sync(path.join(baseDir, '.windsurf/rules/**/*.mdc'));
    
    console.log(`Found ${mdFiles.length} .md files and ${mdcFiles.length} .mdc files`);
    
    // Read all rules
    const allRules = [];
    
    [...mdFiles, ...mdcFiles].forEach(filePath => {
        const rule = readRuleFile(filePath);
        if (rule) {
            allRules.push(rule);
        }
    });
    
    if (allRules.length === 0) {
        console.log('No rules found to combine');
        return;
    }
    
    console.log(`Processing ${allRules.length} rules...`);
    
    try {
        if (DRY_RUN) {
            // Perform local analysis
            console.log('\nAnalyzing rules locally...\n');
            const analysis = analyzeRulesLocally(allRules);
            
            // Display analysis results
            console.log('📊 Rule Analysis:');
            console.log(`   Total rules: ${analysis.totalRules}`);
            console.log(`   Windsurf (.md): ${analysis.byFormat.windsurf}`);
            console.log(`   Cursor (.mdc): ${analysis.byFormat.cursor}`);
            
            console.log('\n📋 Trigger Types:');
            Object.entries(analysis.byTriggerType).forEach(([trigger, count]) => {
                console.log(`   ${trigger}: ${count}`);
            });
            
            if (analysis.duplicates.length > 0) {
                console.log('\n⚠️  Potential Duplicates:');
                analysis.duplicates.forEach((dup, i) => {
                    console.log(`   ${i + 1}. ${dup.files.join(' & ')}`);
                    console.log(`      Reason: ${dup.reason}`);
                    if (dup.description) console.log(`      Description: "${dup.description}"`);
                    if (dup.similarity) console.log(`      Similarity: ${dup.similarity}`);
                });
            }
            
            if (analysis.conflicts.length > 0) {
                console.log('\n⚡ Potential Conflicts:');
                analysis.conflicts.forEach((conflict, i) => {
                    console.log(`   ${i + 1}. ${conflict.files.join(' & ')}`);
                    console.log(`      Glob: "${conflict.glob}"`);
                    console.log(`      Different triggers: ${conflict.triggers.join(' vs ')}`);
                });
            }
            
            console.log('\n📁 Files to be processed:');
            allRules.forEach(rule => {
                console.log(`   ${path.basename(rule.filePath)} (${rule.format})`);
            });
            
            console.log('\n✅ Dry run complete!');
            console.log('   Run without --dry-run to perform actual combination with Claude API');
            
        } else {
            // Send to Claude for analysis
            console.log('Sending rules to Claude for analysis...');
            const claudeResponse = await combineRulesWithClaude(allRules);
            
            // Parse the response
            let combinedData;
            try {
                combinedData = JSON.parse(claudeResponse);
            } catch (e) {
                // If Claude didn't return valid JSON, try to extract it
                const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    combinedData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('Could not parse Claude response as JSON');
                }
            }
            
            // Write the combined rules
            writeCombinedRules(combinedData, outputDir);
            
            console.log(`\nCombination complete! Combined rules written to: ${outputDir}`);
            console.log(`Analysis available at: ${path.join(outputDir, 'analysis.md')}`);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Check for API key (only required if not in dry-run mode)
if (!CLAUDE_API_KEY && !DRY_RUN) {
    console.error('Error: CLAUDE_API_KEY not found');
    console.error('\nPlease create a .env file in the same directory with:');
    console.error('CLAUDE_API_KEY=your_api_key_here');
    console.error('\nOptionally, you can also set:');
    console.error('CLAUDE_MODEL=claude-3-7-sonnet-20250219');
    console.error('CLAUDE_API_URL=https://api.anthropic.com/v1/messages');
    console.error('\nOr run with --dry-run to analyze without API calls');
    process.exit(1);
}

// Run the script
main().catch(console.error);
