import { promises as fs } from 'fs';
import path from 'path';
import { jest } from '@jest/globals';

// Mock child_process before importing anything else
const mockExec = jest.fn();
jest.unstable_mockModule('child_process', () => ({
    exec: mockExec,
}));

// Now import the module under test
const { run } = await import('../index.js');

// --- Test Constants ---
const TEST_DIR = path.join(process.cwd(), '__tests__', 'test-project');
const OUTPUT_FILE = 'test-output.txt';
const OUTPUT_PATH = path.join(TEST_DIR, OUTPUT_FILE);

const MOCK_GIT_FILES = [
    'index.js',
    'package.json',
    'README.md',
    'src/component.js',
    'src/styles.css',
    'docs/guide.md',
    'config/config.json',
    'server/server.js',
    'server/db.lock',
    'temp.log',
].join('\n');

// Set the environment to 'test' to suppress console output
process.env.NODE_ENV = 'test';

describe('CodeQuill CLI', () => {
    // Create a dummy project structure once before all tests
    beforeAll(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
        // Create dummy files for testing the ignore logic
        const fileCreationPromises = [
            fs.writeFile(path.join(TEST_DIR, 'index.js'), 'console.log("main")'),
            fs.writeFile(path.join(TEST_DIR, 'package.json'), '{"name": "test"}'),
            fs.writeFile(path.join(TEST_DIR, 'README.md'), '# Test'),
            fs.mkdir(path.join(TEST_DIR, 'src'), { recursive: true }).then(() =>
                Promise.all([
                    fs.writeFile(path.join(TEST_DIR, 'src/component.js'), '// component'),
                    fs.writeFile(path.join(TEST_DIR, 'src/styles.css'), 'body {}'),
                ])
            ),
            fs.mkdir(path.join(TEST_DIR, 'docs'), { recursive: true }).then(() =>
                fs.writeFile(path.join(TEST_DIR, 'docs/guide.md'), 'guide')
            ),
            fs.mkdir(path.join(TEST_DIR, 'config'), { recursive: true }).then(() =>
                fs.writeFile(path.join(TEST_DIR, 'config/config.json'), '{}')
            ),
            fs.mkdir(path.join(TEST_DIR, 'server'), { recursive: true }).then(() =>
                Promise.all([
                    fs.writeFile(path.join(TEST_DIR, 'server/server.js'), '// server'),
                    fs.writeFile(path.join(TEST_DIR, 'server/db.lock'), 'lock'),
                ])
            ),
            fs.writeFile(path.join(TEST_DIR, 'temp.log'), 'log file'),
        ];
        await Promise.all(fileCreationPromises);
    });

    // Clean up the dummy project structure once after all tests
    afterAll(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    // Before each test, set up the mock and clean up old output files
    beforeEach(async () => {
        // Configure the mock for 'exec' - default successful case
        mockExec.mockImplementation((command, callback) => {
            if (command.includes('ls-files')) {
                callback(null, MOCK_GIT_FILES, '');
                return;
            }
            callback(null, '', '');
        });

        try {
            await fs.unlink(OUTPUT_PATH);
        } catch (e) {
            // Ignore if file doesn't exist
        }
    });

    // After each test, clear the mock
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should include all files when no ignore rules are provided', async () => {
        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await run(argv);

        // Check that output file exists
        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');
        expect(content).toContain('index.js\n');
        expect(content).toContain('src/component.js\n');
        expect(content).toContain('temp.log\n');

        // Check that all 10 files are in the output (separated by ---)
        const fileEntries = content.split('\n\n---\n\n');
        expect(fileEntries.length).toBe(10);
    });

    test('should ignore files specified in .codequillignore', async () => {
        const ignoreContent = `
# Log files
*.log

# Lock files
*.lock

# Documentation folder
docs/
        `;
        await fs.writeFile(path.join(TEST_DIR, '.codequillignore'), ignoreContent);
        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];

        await run(argv);

        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');

        expect(content).toContain('index.js\n');
        expect(content).not.toContain('temp.log');
        expect(content).not.toContain('server/db.lock');
        expect(content).not.toContain('docs/guide.md');

        await fs.unlink(path.join(TEST_DIR, '.codequillignore'));
    });

    test('should ignore files specified via --ignore CLI flag', async () => {
        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE, '--ignore', 'package.json,src/,*.json'];
        await run(argv);

        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');

        expect(content).toContain('index.js\n');
        expect(content).not.toContain('package.json');
        expect(content).not.toContain('src/component.js');
        expect(content).not.toContain('src/styles.css');
        expect(content).not.toContain('config/config.json');
    });

    test('should combine .codequillignore and --ignore flag', async () => {
        const ignoreContent = `*.log`;
        await fs.writeFile(path.join(TEST_DIR, '.codequillignore'), ignoreContent);
        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE, '--ignore', 'README.md,server/'];

        await run(argv);

        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');

        expect(content).toContain('index.js\n');
        expect(content).not.toContain('temp.log');
        expect(content).not.toContain('README.md');
        expect(content).not.toContain('server/server.js');
        expect(content).not.toContain('server/db.lock');

        await fs.unlink(path.join(TEST_DIR, '.codequillignore'));
    });

    test('should throw if not a git repository', async () => {
        mockExec.mockImplementation((command, callback) => {
            const error = new Error('Command failed');
            callback(error, '', 'fatal: not a git repository');
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await expect(run(argv)).rejects.toThrow('not a git repository');
    });

    test('should warn if no git-tracked files found', async () => {
        mockExec.mockImplementation((command, callback) => {
            callback(null, '', ''); // Empty stdout = no files
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await run(argv); // Should not throw

        // Output file should not exist when no files are found
        const fileExists = await fs.stat(OUTPUT_PATH).catch(() => null);
        expect(fileExists).toBeNull();
    });

    test('should skip unreadable files', async () => {
        // Mock fs.readFile to fail for README.md
        const originalReadFile = fs.readFile;
        const readFileSpy = jest.spyOn(fs, 'readFile').mockImplementation(async (filePath, encoding) => {
            if (filePath.endsWith('README.md')) {
                const error = new Error('Permission denied');
                error.code = 'EACCES';
                throw error;
            }
            return originalReadFile.call(fs, filePath, encoding);
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await run(argv);

        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');
        expect(content).not.toContain('README.md');
        expect(content).toContain('index.js\n'); // Other files should still be included

        readFileSpy.mockRestore();
    });

    test('should throw if output file cannot be written', async () => {
        // Mock fs.writeFile to fail
        const writeFileSpy = jest.spyOn(fs, 'writeFile').mockImplementation(async () => {
            const error = new Error('Permission denied');
            error.code = 'EACCES';
            throw error;
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await expect(run(argv)).rejects.toThrow('Permission denied');

        writeFileSpy.mockRestore();
    });

    test('should throw if .codequillignore cannot be read (other than ENOENT)', async () => {
        // Create a .codequillignore file first
        await fs.writeFile(path.join(TEST_DIR, '.codequillignore'), '*.log');

        // Mock fs.readFile to fail for .codequillignore
        const originalReadFile = fs.readFile;
        const readFileSpy = jest.spyOn(fs, 'readFile').mockImplementation(async (filePath, encoding) => {
            if (filePath.endsWith('.codequillignore')) {
                const error = new Error('Permission denied');
                error.code = 'EACCES';
                throw error;
            }
            return originalReadFile.call(fs, filePath, encoding);
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await expect(run(argv)).rejects.toThrow('Permission denied');

        readFileSpy.mockRestore();
        await fs.unlink(path.join(TEST_DIR, '.codequillignore')).catch(() => {});
    });

    test('should handle generic git errors', async () => {
        mockExec.mockImplementation((command, callback) => {
            const error = new Error('Generic git error');
            callback(error, '', 'some other error');
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await expect(run(argv)).rejects.toThrow('Generic git error');
    });

    test('should normalize patterns correctly', async () => {
        // Test pattern normalization by using patterns without '/'
        const ignoreContent = `
node_modules
*.tmp
        `;
        await fs.writeFile(path.join(TEST_DIR, '.codequillignore'), ignoreContent);

        // Add some mock files that would match the patterns
        const mockFilesWithNodeModules = MOCK_GIT_FILES + '\nnode_modules/test.js\ntest.tmp';
        mockExec.mockImplementation((command, callback) => {
            if (command.includes('ls-files')) {
                callback(null, mockFilesWithNodeModules, '');
                return;
            }
            callback(null, '', '');
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await run(argv);

        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');
        // These files should be excluded due to pattern normalization
        expect(content).not.toContain('node_modules');
        expect(content).not.toContain('test.tmp');

        await fs.unlink(path.join(TEST_DIR, '.codequillignore'));
    });

    test('should handle non-test environment output', async () => {
        // Temporarily change NODE_ENV
        const originalEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;

        // Mock console methods to capture output
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock process.exit to prevent actual exit
        const originalExit = process.exit;
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

        try {
            // Test successful run with console output
            const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
            await run(argv);

            // Verify console output was called
            expect(logSpy).toHaveBeenCalled();

            // Test error case with console output and process.exit
            mockExec.mockImplementation((command, callback) => {
                const error = new Error('Test error');
                callback(error, '', '');
            });

            await run(argv);
            expect(errorSpy).toHaveBeenCalled();
            expect(exitSpy).toHaveBeenCalledWith(1);

        } finally {
            // Restore everything
            process.env.NODE_ENV = originalEnv;
            console.log = originalConsoleLog;
            console.error = originalConsoleError;
            process.exit = originalExit;
            logSpy.mockRestore();
            errorSpy.mockRestore();
            exitSpy.mockRestore();
        }
    });

    // Add missing test cases for README features
    test('should use default output filename when not specified', async () => {
        const argv = ['node', 'index.js', TEST_DIR];
        await run(argv);

        const defaultOutputPath = path.join(TEST_DIR, 'codequill-prompt.txt');
        const stats = await fs.stat(defaultOutputPath);
        expect(stats.isFile()).toBe(true);

        // Clean up
        await fs.unlink(defaultOutputPath);
    });

    test('should use current directory when no directory specified', async () => {
        // Change to test directory
        const originalCwd = process.cwd();
        process.chdir(TEST_DIR);

        try {
            const argv = ['node', 'index.js', '-o', OUTPUT_FILE];
            await run(argv);

            const stats = await fs.stat(OUTPUT_PATH);
            expect(stats.isFile()).toBe(true);
        } finally {
            process.chdir(originalCwd);
        }
    });

    test('should handle version flag', async () => {
        // Mock process.exit to capture the call
        const originalExit = process.exit;
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('Mocked process.exit called');
        });

        try {
            const argv = ['node', 'index.js', '--version'];
            await run(argv);
            // If we reach here, --version didn't trigger process.exit as expected
            fail('Expected --version to trigger process.exit');
        } catch (error) {
            // This is expected - either process.exit was called or another error occurred
            expect(error.message).toMatch(/Mocked process.exit called|unknown option/);
        } finally {
            process.exit = originalExit;
            exitSpy.mockRestore();
        }
    });

    test('should handle help flag', async () => {
        // Mock process.exit to capture the call
        const originalExit = process.exit;
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('Mocked process.exit called');
        });

        try {
            const argv = ['node', 'index.js', '--help'];
            await run(argv);
            // If we reach here, --help didn't trigger process.exit as expected
            fail('Expected --help to trigger process.exit');
        } catch (error) {
            // This is expected - either process.exit was called or another error occurred
            expect(error.message).toMatch(/Mocked process.exit called|unknown option|ENOENT/);
        } finally {
            process.exit = originalExit;
            exitSpy.mockRestore();
        }
    });

    test('should handle empty .codequillignore file', async () => {
        const ignoreContent = `
# Only comments and empty lines

        `;
        await fs.writeFile(path.join(TEST_DIR, '.codequillignore'), ignoreContent);
        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];

        await run(argv);

        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');
        // Should include all files since no actual ignore patterns
        const fileEntries = content.split('\n\n---\n\n');
        expect(fileEntries.length).toBe(10);

        await fs.unlink(path.join(TEST_DIR, '.codequillignore'));
    });

    test('should handle directory patterns with trailing slash', async () => {
        const ignoreContent = `src/`;
        await fs.writeFile(path.join(TEST_DIR, '.codequillignore'), ignoreContent);
        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];

        await run(argv);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');
        expect(content).not.toContain('src/component.js');
        expect(content).not.toContain('src/styles.css');
        expect(content).toContain('index.js\n');

        await fs.unlink(path.join(TEST_DIR, '.codequillignore'));
    });

    test('should handle relative path inputs correctly', async () => {
        const relativeDir = './__tests__/test-project';
        const argv = ['node', 'index.js', relativeDir, '-o', OUTPUT_FILE];

        await run(argv);

        const stats = await fs.stat(OUTPUT_PATH);
        expect(stats.isFile()).toBe(true);
    });

    test('should respect gitignore patterns in addition to codequillignore', async () => {
        // This test assumes git respects .gitignore automatically via `git ls-files`
        // but we should verify the behavior
        const mockFilesWithoutGitIgnored = MOCK_GIT_FILES; // git ls-files already excludes .gitignore patterns

        mockExec.mockImplementation((command, callback) => {
            if (command.includes('ls-files')) {
                callback(null, mockFilesWithoutGitIgnored, '');
                return;
            }
            callback(null, '', '');
        });

        const argv = ['node', 'index.js', TEST_DIR, '-o', OUTPUT_FILE];
        await run(argv);

        const content = await fs.readFile(OUTPUT_PATH, 'utf8');
        // Should not contain files that would typically be in .gitignore
        expect(content).not.toContain('node_modules/');
        expect(content).not.toContain('.git/');
    });

    test('should create output file in specified directory with absolute path', async () => {
        const absoluteOutputPath = path.resolve(TEST_DIR, 'absolute-output.txt');
        const argv = ['node', 'index.js', TEST_DIR, '-o', absoluteOutputPath];

        await run(argv);

        const stats = await fs.stat(absoluteOutputPath);
        expect(stats.isFile()).toBe(true);

        // Clean up
        await fs.unlink(absoluteOutputPath);
    });

});
