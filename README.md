# ✒️ CodeQuill

A lightning-fast CLI tool to bundle all your git-tracked project files into a single, context-rich text file for seamless interaction with Large Language Models.

-----

## 🤔 Why CodeQuill?

When working with Large Language Models (LLMs) like GPT-4, Claude, or Gemini, providing the full context of a software project is crucial for getting accurate, relevant, and useful responses. Manually copying and pasting each file is tedious and error-prone.

**CodeQuill automates this entire process.** It intelligently scans your project, respects your `.gitignore` rules, and packages everything into one clean text file, ready to be used as a comprehensive prompt.

-----

## ✨ Features

- **Git-Aware**: Only includes files that are tracked by `git`, automatically respecting all rules in your `.gitignore` files.
- **Flexible Ignore System**: Exclude specific files or patterns using a `.codequillignore` file or a command-line flag.
- **Blazing Fast**: Built with modern, asynchronous Node.js for maximum performance.
- **User-Friendly CLI**: Clear instructions, colorful output, and helpful progress spinners.
- **Fully Customizable**: Specify your target directory and output file name.
- **Cross-Platform**: Works on macOS, Windows (with Git Bash), and Linux.

-----

## 🚀 Installation

First, ensure you have **Node.js** (v18 or newer) and **Git** installed on your system.

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/your-username/CodeQuill.git
    cd CodeQuill
    ```

2.  **Install dependencies**:

    ```bash
    npm install
    ```

3.  **(Optional) Make it globally available**:
    To run `codequill` from any directory, link it globally.

    ```bash
    npm link
    ```

-----

## 📖 Usage

Run CodeQuill from within your project's root directory.

### **Basic Usage**

This will scan the current directory and create `codequill-prompt.txt`.

```bash
codequill
```

### **Specify Directory and Output**

```bash
codequill ./src -o src-context.txt
```

### **Ignoring Files via CLI**

Use the `-i` or `--ignore` flag with a comma-separated list of patterns.

```bash
# Ignore the lockfile and all .log files
codequill --ignore "package-lock.json,*.log"

# Ignore the entire dist directory
codequill -i "dist/"
```

### **Command Line Options**

```bash
codequill [project-dir] [options]
```

**Arguments:**
- `project-dir` - The source project directory to scan (default: current directory)

**Options:**
- `-o, --output <file>` - The name of the output file (default: `codequill-prompt.txt`)
- `-i, --ignore <patterns>` - Comma-separated list of files/patterns to ignore
- `-v, --version` - Output the current version
- `-h, --help` - Display help information

-----

## ⚙️ Ignoring Files

You have two ways to tell CodeQuill which files to exclude from the final output, in addition to the standard `.gitignore` rules.

### 1\. Using a `.codequillignore` file

For persistent ignore rules, create a file named `.codequillignore` in the root of your project. Its syntax is similar to `.gitignore`:

- Each line represents a pattern.
- Lines starting with `#` are comments.
- Empty lines are ignored.
- To ignore a directory, end the pattern with a `/`.

**Example `.codequillignore`**:

```
# Configuration files
*.lock
.env

# Build output
dist/
build/

# Logs
*.log
```

### 2\. Using the `--ignore` Flag

For one-time exclusions, use the command-line flag. This is perfect for quick adjustments without modifying project files. Patterns are separated by commas.

```bash
codequill --ignore "README.md,docs/,*.test.js"
```

**Note**: Patterns from the CLI are combined with patterns from the `.codequillignore` file.

-----

## 🏗️ Architecture & Code Structure

CodeQuill is built with a modular architecture that emphasizes clarity and testability. Here's how the code is organized:

### Core Functions

#### `executeCommand(command)`
Executes shell commands asynchronously with specific error handling for git operations.

**Parameters:**
- `command` (string) - The shell command to execute

**Returns:** Promise<string> - Command output
**Throws:** Error when command fails or not in a git repository

#### `getIgnorePatternsFromFile(projectDir)`
Reads and parses ignore patterns from a `.codequillignore` file, filtering out comments and empty lines.

**Parameters:**
- `projectDir` (string) - Directory path to search for ignore file

**Returns:** Promise<string[]> - Array of ignore patterns
**Example:**
```javascript
const patterns = await getIgnorePatternsFromFile('./my-project');
// Returns: ['*.log', 'dist/', 'node_modules']
```

#### `normalizeGitignorePattern(pattern)`
Converts gitignore-style patterns to minimatch-compatible glob patterns.

**Parameters:**
- `pattern` (string) - Raw pattern from ignore file or CLI

**Returns:** string - Normalized pattern for minimatch

**Pattern Conversion Examples:**
- `docs/` → `docs/**` (directory pattern)
- `*.log` → `**/*.log` (filename pattern)
- `src/main.js` → `src/main.js` (path pattern, unchanged)

#### `run(argv)`
Main entry point that orchestrates the entire process: CLI parsing, file discovery, filtering, and output generation.

**Parameters:**
- `argv` (string[], optional) - Command-line arguments (defaults to `process.argv`)

**Returns:** Promise<void>

**Process Flow:**
1. Parse command-line arguments using Commander.js
2. Resolve absolute paths for project directory and output file
3. Execute `git ls-files` to discover tracked files
4. Load ignore patterns from `.codequillignore` and CLI
5. Filter files using normalized patterns with minimatch
6. Read file contents and combine into single output
7. Write final result to output file

### Dependencies

- **Commander.js** - Command-line interface parsing and help generation
- **ora** - Elegant terminal spinners and progress indicators
- **picocolors** - Fast, minimal terminal color library
- **minimatch** - Glob pattern matching (same engine used by npm)

### Error Handling

CodeQuill implements comprehensive error handling:

- **Git Repository Detection**: Specific error messages when not in a git repository
- **File Permission Errors**: Graceful handling of unreadable files with warnings
- **Invalid Patterns**: Robust pattern matching with fallback behavior
- **Test Environment**: Special handling to suppress output during testing

### Output Format

The generated file uses a simple, LLM-friendly format:

```
filename1.js
[file content]

---

filename2.py
[file content]

---

...
```

Each file is separated by `\n\n---\n\n` for clear delineation.

-----

## 🧪 Testing

CodeQuill includes comprehensive test coverage with Jest:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test -- --coverage
```

The test suite covers:
- CLI argument parsing
- File discovery and filtering
- Ignore pattern processing
- Error scenarios
- Edge cases and boundary conditions

Tests use mocking for:
- File system operations
- Git command execution
- Console output (in test environment)

-----

## 📁 Project Structure

```
CodeQuill/
├── index.js              # Main application code
├── package.json          # Dependencies and scripts
├── README.md             # This documentation
├── LICENSE               # MIT license
├── .codequillignore      # Example ignore file
├── .gitignore            # Git ignore rules
└── __tests__/            # Test suite
    └── codequill.test.js # Comprehensive test cases
```

-----

## 🤝 Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or pull requests, please feel free to open an issue or submit a PR.

### Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Make your changes
5. Ensure tests pass
6. Submit a pull request

-----

## 📜 License

This project is licensed under the MIT License.

## Copyright

© 2025 Hans-L-Max. All rights reserved.
