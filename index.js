#!/usr/bin/env node

/**
 * @fileoverview CodeQuill - A lightning-fast CLI tool to bundle all git-tracked project files
 * into a single, context-rich text file for seamless interaction with Large Language Models.
 *
 * @author Hans-L-Max
 * @version 1.0.0
 * @license MIT
 * @copyright © 2025 Hans-L-Max
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { minimatch } from 'minimatch';

/** @constant {string} - The filename for the ignore configuration file */
const IGNORE_CONFIG_FILENAME = '.codequillignore';

/**
 * Executes a shell command asynchronously and returns its standard output.
 * Provides specific error handling for git repository detection.
 *
 * @param {string} command - The shell command to execute
 * @returns {Promise<string>} A promise that resolves with the stdout from the command
 * @throws {Error} When the command fails or when not in a git repository
 */
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                if (stderr && stderr.includes('not a git repository')) {
                    return reject(new Error('This is not a git repository. CodeQuill requires a git-tracked project.'));
                }
                return reject(error);
            }
            resolve(stdout);
        });
    });
}

/**
 * Reads and parses ignore patterns from a .codequillignore file.
 * Filters out empty lines and comments that start with '#'.
 *
 * @param {string} projectDir - The project directory path to search for the ignore file
 * @returns {Promise<string[]>} Array of ignore patterns, empty array if file doesn't exist
 * @throws {Error} When file exists but cannot be read due to permissions or other errors
 */
async function getIgnorePatternsFromFile(projectDir) {
    const ignoreFilePath = path.join(projectDir, IGNORE_CONFIG_FILENAME);
    try {
        const fileContent = await fs.readFile(ignoreFilePath, 'utf8');
        return fileContent.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Normalizes gitignore-style patterns to be compatible with minimatch.
 * Handles directory patterns (ending with '/') and simple filename patterns.
 *
 * @param {string} pattern - The raw pattern from ignore file or CLI
 * @returns {string} Normalized pattern suitable for minimatch
 *
 * @example
 * normalizeGitignorePattern('docs/') // returns 'docs/**'
 * normalizeGitignorePattern('*.log') // returns '**\/*.log'
 * normalizeGitignorePattern('src/main.js') // returns 'src/main.js'
 */
function normalizeGitignorePattern(pattern) {
    pattern = pattern.trim();

    if (pattern.endsWith('/')) {
        return pattern + '**';
    }

    if (!pattern.includes('/')) {
        return '**/' + pattern;
    }

    return pattern;
}

/**
 * Main entry point for the CodeQuill CLI application.
 * Handles command-line argument parsing, file discovery, filtering, and output generation.
 *
 * @param {string[]} [argv=process.argv] - Command-line arguments array for testability
 * @returns {Promise<void>} Resolves when the operation completes successfully
 * @throws {Error} When git operations fail, file operations fail, or invalid arguments provided
 *
 * @example
 * // Run with default arguments
 * await run();
 *
 * // Run with custom arguments (useful for testing)
 * await run(['node', 'codequill', '/path/to/project', '-o', 'output.txt']);
 */
export async function run(argv = process.argv) {
    const program = new Command();

    program
        .name('codequill')
        .version('1.0.0', '-v, --version', 'Output the current version')
        .description(pc.cyan('A tool to bundle git-tracked files into a single prompt file for LLMs.'))
        .argument('[project-dir]', 'The source project directory to scan', '.')
        .option('-o, --output <file>', 'The name of the output file', 'codequill-prompt.txt')
        .option('-i, --ignore <patterns>', 'Comma-separated list of files/patterns to ignore', '')
        .parse(argv);

    const options = program.opts();
    const projectDir = program.args[0] || '.';
    const outputFile = options.output;

    const absoluteProjectDir = path.resolve(projectDir);
    const absoluteOutputFile = path.resolve(absoluteProjectDir, outputFile);

    const isTest = process.env.NODE_ENV === 'test';
    if (!isTest) {
        console.log(pc.bold(pc.blue(`\n✒️  Welcome to CodeQuill!`)));
        console.log(`${pc.gray('Source Directory:')} ${pc.yellow(absoluteProjectDir)}`);
        console.log(`${pc.gray('Output File:')}      ${pc.yellow(absoluteOutputFile)}\n`);
    }

    const spinner = ora({ text: 'Initializing...', isEnabled: !isTest }).start();

    try {
        spinner.text = 'Scanning git repository for tracked files...';
        const gitCommand = `git -C "${absoluteProjectDir}" ls-files --exclude-standard`;
        const fileListString = await executeCommand(gitCommand);
        let allTrackedFiles = fileListString.split('\n').filter(p => p.trim() !== '');

        if (allTrackedFiles.length === 0) {
            spinner.warn(pc.yellow('No git-tracked files found.'));
            return;
        }
        spinner.succeed(pc.green(`Found ${allTrackedFiles.length} tracked files.`));
        spinner.start('Applying ignore rules...');

        const patternsFromFile = await getIgnorePatternsFromFile(absoluteProjectDir);
        const patternsFromCLI = options.ignore ? options.ignore.split(',').map(p => p.trim()) : [];
        const allIgnorePatterns = [...patternsFromFile, ...patternsFromCLI];

        const normalizedPatterns = allIgnorePatterns.map(normalizeGitignorePattern);

        if (normalizedPatterns.length === 0 && !isTest) {
            spinner.info('No custom ignore rules to apply.');
        }

        const filesToInclude = allTrackedFiles.filter(file => {
            return !normalizedPatterns.some(pattern => minimatch(file, pattern, { dot: true }));
        });

        const ignoredCount = allTrackedFiles.length - filesToInclude.length;
        if (ignoredCount > 0) {
            spinner.succeed(pc.green(`Applied ignore rules. ${ignoredCount} file(s) will be excluded.`));
        }

        spinner.start(`Reading ${filesToInclude.length} files and crafting the prompt...`);
        let combinedContent = [];

        for (const filePath of filesToInclude) {
            const fullPath = path.join(absoluteProjectDir, filePath);
            try {
                const content = await fs.readFile(fullPath, 'utf8');
                const entry = `${filePath}\n${content}`;
                combinedContent.push(entry);
            } catch (readError) {
                spinner.warn(pc.yellow(`Skipping unreadable file: ${filePath}`));
            }
        }

        const finalOutput = combinedContent.join('\n\n---\n\n');
        await fs.writeFile(absoluteOutputFile, finalOutput);

        spinner.succeed(pc.green('Successfully crafted the context file!'));
        if (!isTest) {
            console.log(pc.bold(pc.blue(`\n✅ Done! Your prompt is ready at: ${pc.underline(pc.yellow(absoluteOutputFile))}\n`)));
        }

    } catch (error) {
        spinner.fail(pc.red('A critical error occurred.'));
        if (!isTest) {
            console.error(pc.red(`\nError: ${error.message}`));
        }
        if (isTest) {
            throw error;
        }
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.js')) {
    run();
}
