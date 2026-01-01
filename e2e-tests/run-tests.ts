#!/usr/bin/env ts-node

/**
 * E2E test runner script for running tests across multiple problems.
 * 
 * Invocation:
 *   npx ts-node e2e-tests/run-tests.ts <base_output_dir> [--tests <test1,test2,...>] [--problems <problem1,problem2,...>]
 * 
 * Arguments:
 *   base_output_dir - Required. Base directory where test outputs will be written.
 *   --tests         - Optional. Comma-separated test names (default: "all")
 *   --problems      - Optional. Comma-separated problem names (default: "all")
 * 
 * Examples:
 *   npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests
 *   npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests clarify_test,rounds_test
 *   npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --problems kata1,kata3
 *   npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests summary_test --problems kata1
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// File and directory name constants
const PROBLEM_FILE_NAME = 'problem.md';
const RUN_TEST_SCRIPT_NAME = 'run_test.sh';
const EVAL_RUN_SCRIPT_NAME = 'eval_run.sh';
const EVAL_JSON_EXTENSION = '.eval.json';
const CSV_RESULTS_SUFFIX = '_results.csv';
const EXAMPLES_DIR_NAME = 'examples';
const E2E_TESTS_DIR_NAME = 'e2e-tests';

// File pattern constants
const DEBATE_CONFIG_PATTERN = /^debate-config(-.*)?\.json$/;
const EVAL_CONFIG_PATTERN = /^eval_config.*\.json$/;

// Command-line flag constants
const FLAG_TESTS = '--tests';
const FLAG_PROBLEMS = '--problems';

// CSV header constant
const CSV_HEADER = 'example name,eval result file name,functional_completeness score,performance_scalability score,security score,maintainability score,regulatory_compliance score,testability score,requirements_fulfillment score,overall_score';

// Exit code constants (matching project conventions)
const EXIT_GENERAL_ERROR = 1;

// Error message constants
const ERROR_BASE_OUTPUT_DIR_REQUIRED = 'Error: Base output directory argument is required\n';
const ERROR_USAGE = 'Usage: npx ts-node e2e-tests/run-tests.ts <base_output_dir> [--tests <test1,test2,...>] [--problems <problem1,problem2,...>]\n';
const WARNING_SKIPPING_UNDERSCORE_DIR = 'Warning: Skipping directory starting with underscore:';
const WARNING_MISSING_PROBLEM_FILE = 'Warning: Problem \'%s\' is missing required file: problem.md. Skipping.\n';
const WARNING_MISSING_DEBATE_CONFIG = 'Warning: Problem \'%s\' is missing required file: debate-config.json. Skipping.\n';
const WARNING_MISSING_EVAL_CONFIG = 'Warning: Problem \'%s\' is missing required file: eval_config*.json. Skipping.\n';
const WARNING_NO_EVAL_FILES = 'Warning: No evaluation JSON files found in %s. Skipping CSV generation.\n';
const WARNING_NO_VALID_EVAL_FILES = 'Warning: No valid evaluation JSON files found in %s. Skipping CSV generation.\n';
const WARNING_INVALID_JSON_STRUCTURE = 'Warning: Invalid evaluation JSON structure in %s. Skipping.\n';
const WARNING_PARSE_ERROR = 'Warning: Failed to parse evaluation JSON %s: %s. Skipping.\n';
const WARNING_TEST_NOT_FOUND = 'Warning: Test \'%s\' not found. Skipping.\n';
const WARNING_PROBLEM_NOT_FOUND = 'Warning: Problem \'%s\' not found. Skipping.\n';
const ERROR_SCRIPT_FAILED = 'Error: %s failed with exit code %d\n';

/**
 * Represents the structure of an evaluation JSON output file for a benchmark run.
 *
 * This interface reflects the scores and evaluation metrics captured after testing
 * a given solution on a coding problem, including both functional and non-functional
 * criteria, the overall aggregate score, and optional agent-specific data.
 */
interface EvaluationJsonOutput {
  /**
   * Evaluation metrics containing both functional and non-functional scores.
   */
  evaluation: {
    /**
     * Optional metric representing the functional completeness score.
     * Contains an average_score indicating performance on functional requirements.
     */
    functional_completeness?: { 
      average_score: number | null;
    };
    /**
     * Optional metrics representing a variety of non-functional scores such as
     * performance, security, maintainability, regulatory compliance, and testability.
     */
    non_functional?: {
      
      performance_scalability?: { average_score: number | null }; /** Average score for performance and scalability. */
      security?: { average_score: number | null }; /** Average score for security. */
      maintainability_evolvability?: { average_score: number | null }; /** Average score for maintainability and evolvability. */
      regulatory_compliance?: { average_score: number | null }; /** Average score for regulatory compliance. */
      testability?: { average_score: number | null }; /** Average score for testability. */
      requirements_fulfillment?: { average_score: number | null }; /** Average score for requirements fulfillment. */
    };
  };
  
  overall_score: number | null; /** The overall aggregate score from the evaluation. */
  agents?: Record<string, unknown>; /** Optional data specific to evaluated agents, where keys represent agent names. */
}
  
/**
 * Represents a single row in the CSV output for benchmark results.
 * 
 * Each field captures a specific aspect of the evaluation summary for an example/problem,
 * providing both scores for criteria and filename reference for the evaluation outcome.
 */
interface CsvRow {
  
  exampleName: string; /** The name of the example or coding problem. */
  evalResultFileName: string; /** The file name of the JSON evaluation result associated with this row. */
  functionalCompleteness: string; /** String representation of the functional completeness score (averaged across relevant tests). */
  performanceScalability: string; /** String representation of the performance and scalability score. */
  security: string; /** String representation of the security evaluation score. */
  maintainability: string; /** String representation of the maintainability (and evolvability) score. */
  regulatoryCompliance: string; /** String representation of the regulatory compliance score. */
  testability: string; /** String representation of the testability score. */
  requirementsFulfillment: string; /** String representation of the requirements fulfillment score. */
  overallScore: string; /** String representation of the overall aggregate evaluation score. */
}

/**
 * Writes a warning message to stderr.
 * 
 * @param message - The warning message to write.
 */
function writeWarning(message: string): void {
  process.stderr.write(message);
}

/**
 * Writes a message to stdout.
 * 
 * @param message - The message to write.
 */
function say(message: string): void {
  process.stdout.write(message);
}

/**
 * Validates and converts base output directory to absolute path.
 * 
 * @param baseOutputDir - The base output directory path (may be undefined).
 * @returns The resolved absolute path to the base output directory.
 * @throws Exits with code 1 if baseOutputDir is missing or empty.
 */
function validateAndResolveBaseOutputDir(baseOutputDir: string | undefined): string {
  if (!baseOutputDir || baseOutputDir.trim() === '') {
    process.stderr.write(ERROR_BASE_OUTPUT_DIR_REQUIRED);
    process.exit(EXIT_GENERAL_ERROR);
  }
  return path.resolve(baseOutputDir);
}

/**
 * Gets the examples directory path relative to the project root.
 * 
 * @returns The absolute path to the examples directory.
 */
function getExamplesDirectory(): string {
  return path.resolve(process.cwd(), EXAMPLES_DIR_NAME);
}

/**
 * Gets the e2e-tests directory path relative to the project root.
 * 
 * @returns The absolute path to the e2e-tests directory.
 */
function getE2eTestsDirectory(): string {
  return path.resolve(process.cwd(), E2E_TESTS_DIR_NAME);
}

/**
 * Discovers all problem directories in the examples folder.
 * Skips directories starting with underscore.
 * 
 * @param examplesDir - The absolute path to the examples directory.
 * @returns An array of problem directory names (not paths).
 */
function discoverProblems(examplesDir: string): string[] {
  const problems: string[] = [];
  
  if (!fs.existsSync(examplesDir)) {
    return problems;
  }
  
  const entries = fs.readdirSync(examplesDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    
    if (entry.name.startsWith('_')) {
      writeWarning(`${WARNING_SKIPPING_UNDERSCORE_DIR} ${entry.name}\n`);
      continue;
    }
    
    problems.push(entry.name);
  }
  
  return problems;
}

/**
 * Validates that a problem has all required files.
 * 
 * @param examplesDir - The absolute path to the examples directory.
 * @param problemName - The name of the problem directory to validate.
 * @returns True if the problem has all required files, false otherwise.
 */
function validateProblem(examplesDir: string, problemName: string): boolean {
  const problemDir = path.join(examplesDir, problemName);
  
  // Check for problem.md
  const problemPath = path.join(problemDir, PROBLEM_FILE_NAME);
  if (!fs.existsSync(problemPath)) {
    writeWarning(WARNING_MISSING_PROBLEM_FILE.replace('%s', problemName));
    return false;
  }
  
  // Check for debate-config.json or debate-config-*.json
  const files = fs.readdirSync(problemDir);
  const hasDebateConfig = files.some(file => DEBATE_CONFIG_PATTERN.test(file));
  if (!hasDebateConfig) {
    writeWarning(WARNING_MISSING_DEBATE_CONFIG.replace('%s', problemName));
    return false;
  }
  
  // Check for at least one eval_config*.json
  const hasEvalConfig = files.some(file => EVAL_CONFIG_PATTERN.test(file));
  if (!hasEvalConfig) {
    writeWarning(WARNING_MISSING_EVAL_CONFIG.replace('%s', problemName));
    return false;
  }
  
  return true;
}

/**
 * Discovers all test directories in the e2e-tests folder.
 * Skips directories starting with underscore.
 * 
 * @param e2eTestsDir - The absolute path to the e2e-tests directory.
 * @returns An array of test directory names (not paths).
 */
function discoverTests(e2eTestsDir: string): string[] {
  const tests: string[] = [];
  
  if (!fs.existsSync(e2eTestsDir)) {
    return tests;
  }
  
  const entries = fs.readdirSync(e2eTestsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    
    if (entry.name.startsWith('_')) {
      writeWarning(`${WARNING_SKIPPING_UNDERSCORE_DIR} ${entry.name}\n`);
      continue;
    }
    
    // Check that test has both required scripts
    const testDir = path.join(e2eTestsDir, entry.name);
    const runTestPath = path.join(testDir, RUN_TEST_SCRIPT_NAME);
    const evalRunPath = path.join(testDir, EVAL_RUN_SCRIPT_NAME);
    
    if (fs.existsSync(runTestPath) && fs.existsSync(evalRunPath)) {
      tests.push(entry.name);
    }
  }
  
  return tests;
}

/**
 * Filters problems to only include those matching the specified names.
 * 
 * @param problems - Array of problem names.
 * @param filterNames - Array of problem names to filter by (empty means all).
 * @returns An array of filtered problem names.
 */
function filterProblems(problems: string[], filterNames: string[]): string[] {
  if (filterNames.length === 0) {
    return problems;
  }
  return problems.filter(problem => filterNames.includes(problem));
}

/**
 * Filters tests to only include those matching the specified names.
 * 
 * @param tests - Array of test names.
 * @param filterNames - Array of test names to filter by (empty means all).
 * @returns An array of filtered test names.
 */
function filterTests(tests: string[], filterNames: string[]): string[] {
  if (filterNames.length === 0) {
    return tests;
  }
  return tests.filter(test => filterNames.includes(test));
}

/**
 * Constructs the output directory path.
 * 
 * @param baseOutputDir - The base output directory path.
 * @param problemName - The name of the problem.
 * @param testName - The name of the test.
 * @returns The absolute path to the output directory for this test-problem combination.
 */
function constructOutputDir(baseOutputDir: string, problemName: string, testName: string): string {
  return path.join(baseOutputDir, problemName, testName);
}

/**
 * Executes a shell script with the given arguments.
 * Scripts are executed from the project root to ensure correct path resolution.
 * 
 * @param scriptPath - The absolute path to the shell script to execute.
 * @param problemDir - The absolute path to the problem directory.
 * @param outputDir - The absolute path to the output directory.
 * @param testDir - The absolute path to the test directory.
 * @param scriptName - A descriptive name for the script (used in error messages).
 * @returns True if the script executed successfully, false otherwise.
 */
function executeScript(
  scriptPath: string,
  problemDir: string,
  outputDir: string,
  testDir: string,
  scriptName: string
): boolean {
  try {
    execSync(`bash "${scriptPath}" "${problemDir}" "${outputDir}" "${testDir}"`, {
      cwd: process.cwd(), // Use project root so relative paths in scripts resolve correctly
      stdio: 'inherit',
    });
    return true;
  } catch (error: unknown) {
    
    const execError = error as { status?: number }; // Extract exit code from execSync error
    const exitCode = execError.status ?? 1; // Default to 1 if no status is provided
    writeWarning(ERROR_SCRIPT_FAILED.replace('%s', scriptName).replace('%d', String(exitCode)));
    return false;
  }
}

/**
 * Scans output directory for evaluation JSON files.
 * 
 * @param outputDir - The absolute path to the output directory to scan.
 * @returns An array of absolute paths to evaluation JSON files (files ending with .eval.json).
 */
function scanEvaluationJsonFiles(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) {
    return [];
  }
  
  const files = fs.readdirSync(outputDir);
  return files
    .filter(file => file.endsWith(EVAL_JSON_EXTENSION))
    .map(file => path.join(outputDir, file));
}

/**
 * Converts a score value to a string, using empty string for null values.
 * 
 * @param score - The score value (number or null).
 * @returns The score as a string, or empty string if null.
 */
function scoreToString(score: number | null): string {
  return score !== null ? String(score) : '';
}

/**
 * Parses evaluation JSON and extracts scores.
 * 
 * @param jsonPath - The absolute path to the evaluation JSON file to parse.
 * @returns A CsvRow object with extracted scores, or null if parsing fails.
 */
function parseEvaluationJson(jsonPath: string): CsvRow | null {
  try {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    const data: EvaluationJsonOutput = JSON.parse(content);
    
    // Validate structure
    if (!data.evaluation) {
      writeWarning(WARNING_INVALID_JSON_STRUCTURE.replace('%s', jsonPath));
      return null;
    }
    
    const fileName = path.basename(jsonPath);
    const functionalCompleteness = data.evaluation.functional_completeness?.average_score ?? null;
    const performanceScalability = data.evaluation.non_functional?.performance_scalability?.average_score ?? null;
    const security = data.evaluation.non_functional?.security?.average_score ?? null;
    const maintainability = data.evaluation.non_functional?.maintainability_evolvability?.average_score ?? null;
    const regulatoryCompliance = data.evaluation.non_functional?.regulatory_compliance?.average_score ?? null;
    const testability = data.evaluation.non_functional?.testability?.average_score ?? null;
    const requirementsFulfillment = data.evaluation.non_functional?.requirements_fulfillment?.average_score ?? null;
    const overallScore = data.overall_score ?? null;
    
    return {
      exampleName: '', // Will be filled by caller
      evalResultFileName: fileName,
      functionalCompleteness: scoreToString(functionalCompleteness),
      performanceScalability: scoreToString(performanceScalability),
      security: scoreToString(security),
      maintainability: scoreToString(maintainability),
      regulatoryCompliance: scoreToString(regulatoryCompliance),
      testability: scoreToString(testability),
      requirementsFulfillment: scoreToString(requirementsFulfillment),
      overallScore: scoreToString(overallScore),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Replace both placeholders: first %s with jsonPath, second %s with message
    writeWarning(WARNING_PARSE_ERROR.replace('%s', jsonPath).replace('%s', message));
    return null;
  }
}

/**
 * Escapes CSV field value according to RFC 4180.
 * Fields containing commas, quotes, or newlines must be quoted, and quotes must be escaped.
 * 
 * @param value - The field value to escape.
 * @returns The escaped CSV field value.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generates CSV content from rows.
 * 
 * @param rows - An array of CsvRow objects to convert to CSV format.
 * @returns The complete CSV content as a string (header + data rows).
 */
function generateCsvContent(rows: CsvRow[]): string {
  const dataRows = rows.map(row => {
    return [
      escapeCsvField(row.exampleName),
      escapeCsvField(row.evalResultFileName),
      escapeCsvField(row.functionalCompleteness),
      escapeCsvField(row.performanceScalability),
      escapeCsvField(row.security),
      escapeCsvField(row.maintainability),
      escapeCsvField(row.regulatoryCompliance),
      escapeCsvField(row.testability),
      escapeCsvField(row.requirementsFulfillment),
      escapeCsvField(row.overallScore),
    ].join(',');
  });
  
  return [CSV_HEADER, ...dataRows].join('\n') + '\n';
}

/**
 * Generates CSV from evaluation results in output directory.
 * 
 * @param outputDir - The absolute path to the output directory containing evaluation JSON files.
 * @param problemName - The name of the problem (used in CSV filename and data).
 * @param testName - The name of the test (used in CSV filename).
 */
function generateCsvFromEvaluationResults(
  outputDir: string,
  problemName: string,
  testName: string
): void {
  const jsonFiles = scanEvaluationJsonFiles(outputDir);
  
  if (jsonFiles.length === 0) {
    writeWarning(WARNING_NO_EVAL_FILES.replace('%s', outputDir));
    return;
  }
  
  const rows: CsvRow[] = [];
  
  for (const jsonFile of jsonFiles) {
    const row = parseEvaluationJson(jsonFile);
    if (row) {
      row.exampleName = problemName;
      rows.push(row);
    }
  }
  
  if (rows.length === 0) {
    writeWarning(WARNING_NO_VALID_EVAL_FILES.replace('%s', outputDir));
    return;
  }
  
  const csvContent = generateCsvContent(rows);
  const csvFileName = `${problemName}_${testName}${CSV_RESULTS_SUFFIX}`;
  const csvPath = path.join(outputDir, csvFileName);
  
  fs.writeFileSync(csvPath, csvContent, 'utf-8');
  say(`Generated CSV: ${csvPath}\n`);
}

/**
 * Parses command-line arguments for --tests and --problems flags.
 * 
 * @param args - Command-line arguments array.
 * @returns Object with baseOutputDir, testNames, and problemNames.
 */
function parseArguments(args: string[]): {
  baseOutputDir: string;
  testNames: string[];
  problemNames: string[];
} {
  if (args.length === 0) {
    process.stderr.write(ERROR_BASE_OUTPUT_DIR_REQUIRED);
    process.stderr.write(ERROR_USAGE);
    process.exit(EXIT_GENERAL_ERROR);
  }
  
  const baseOutputDir = args[0]!; // Safe because we checked length > 0
  let testNames: string[] = [];
  let problemNames: string[] = [];
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === FLAG_TESTS && i + 1 < args.length) {
      const testArg = args[i + 1];
      if (testArg !== undefined) {
        testNames = testArg.split(',').map(name => name.trim()).filter(name => name.length > 0);
        i++; // Skip the next argument as we've consumed it
      }
    } else if (args[i] === FLAG_PROBLEMS && i + 1 < args.length) {
      const problemArg = args[i + 1];
      if (problemArg !== undefined) {
        problemNames = problemArg.split(',').map(name => name.trim()).filter(name => name.length > 0);
        i++; // Skip the next argument as we've consumed it
      }
    }
  }
  
  return { baseOutputDir, testNames, problemNames };
}

/**
 * Validates that requested problem and test names exist in the discovered lists.
 * Writes warnings for any requested names that are not found.
 * 
 * @param requestedProblemNames - Array of problem names requested by the user.
 * @param requestedTestNames - Array of test names requested by the user.
 * @param allProblems - Array of all discovered problem names.
 * @param allTests - Array of all discovered test names.
 */
function validateRequestedNames(
  requestedProblemNames: string[],
  requestedTestNames: string[],
  allProblems: string[],
  allTests: string[]
): void {
  if (requestedProblemNames.length > 0) {
    const missingProblems = requestedProblemNames.filter(name => !allProblems.includes(name));
    for (const missing of missingProblems) {
      writeWarning(WARNING_PROBLEM_NOT_FOUND.replace('%s', missing));
    }
  }
  
  if (requestedTestNames.length > 0) {
    const missingTests = requestedTestNames.filter(name => !allTests.includes(name));
    for (const missing of missingTests) {
      writeWarning(WARNING_TEST_NOT_FOUND.replace('%s', missing));
    }
  }
}

/**
 * Executes the run_test.sh script for a given problem-test combination.
 * 
 * @param problemName - The name of the problem.
 * @param testName - The name of the test.
 * @param problemDir - The absolute path to the problem directory.
 * @param testDir - The absolute path to the test directory.
 * @param outputDir - The absolute path to the output directory.
 * @returns True if the script executed successfully, false otherwise.
 */
function executeRunTestScript(
  problemName: string,
  testName: string,
  problemDir: string,
  testDir: string,
  outputDir: string
): boolean {
  say(`Running test: ${problemName}/${testName}\n`);
  const runTestPath = path.join(testDir, RUN_TEST_SCRIPT_NAME);
  return executeScript(
    runTestPath,
    problemDir,
    outputDir,
    testDir,
    `${RUN_TEST_SCRIPT_NAME} for ${problemName}/${testName}`
  );
}

/**
 * Executes the eval_run.sh script for a given problem-test combination.
 * 
 * @param problemName - The name of the problem.
 * @param testName - The name of the test.
 * @param problemDir - The absolute path to the problem directory.
 * @param testDir - The absolute path to the test directory.
 * @param outputDir - The absolute path to the output directory.
 * @returns True if the script executed successfully, false otherwise.
 */
function executeEvalRunScript(
  problemName: string,
  testName: string,
  problemDir: string,
  testDir: string,
  outputDir: string
): boolean {
  say(`Evaluating: ${problemName}/${testName}\n`);
  const evalRunPath = path.join(testDir, EVAL_RUN_SCRIPT_NAME);
  return executeScript(
    evalRunPath,
    problemDir,
    outputDir,
    testDir,
    `${EVAL_RUN_SCRIPT_NAME} for ${problemName}/${testName}`
  );
}

/**
 * Main execution function.
 * Orchestrates the e2e test process: discovers problems and tests, executes tests against problems, and generates CSV reports.
 */
function main(): void {
  const args = process.argv.slice(2);
  const { baseOutputDir, testNames, problemNames } = parseArguments(args);
  
  const resolvedBaseOutputDir = validateAndResolveBaseOutputDir(baseOutputDir);
  const examplesDir = getExamplesDirectory();
  const e2eTestsDir = getE2eTestsDirectory();
  
  // Ensure base output directory exists
  if (!fs.existsSync(resolvedBaseOutputDir)) {
    fs.mkdirSync(resolvedBaseOutputDir, { recursive: true });
  }
  
  // Discover problems and tests
  const allProblems = discoverProblems(examplesDir);
  const allTests = discoverTests(e2eTestsDir);
  
  // Filter problems and tests
  const filteredProblems = filterProblems(allProblems, problemNames);
  const filteredTests = filterTests(allTests, testNames);
  
  // Validate filtered lists
  validateRequestedNames(problemNames, testNames, allProblems, allTests);
  
  let totalProblemsProcessed = 0;
  let totalTestsExecuted = 0;
  let totalCsvsGenerated = 0;
  
  // Process each problem-test combination
  for (const problemName of filteredProblems) {
    if (!validateProblem(examplesDir, problemName)) {
      continue;
    }
    
    totalProblemsProcessed++;
    
    const problemDir = path.join(examplesDir, problemName);
    
    for (const testName of filteredTests) {
      const testDir = path.join(e2eTestsDir, testName);
      const outputDir = constructOutputDir(resolvedBaseOutputDir, problemName, testName);
      
      if (!fs.existsSync(outputDir)) { // Ensure output directory exists
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const runTestSuccess = executeRunTestScript(problemName, testName, problemDir, testDir, outputDir);
      if (!runTestSuccess) continue;
      
      const evalRunSuccess = executeEvalRunScript(problemName, testName, problemDir, testDir, outputDir);
      if (!evalRunSuccess)  continue;
      
      totalTestsExecuted++;
      
      generateCsvFromEvaluationResults(outputDir, problemName, testName);
      totalCsvsGenerated++;
    }
  }
  
  // Summary
  say(`\nSummary:\n`);
  say(`  Problems processed: ${totalProblemsProcessed}\n`);
  say(`  Tests executed: ${totalTestsExecuted}\n`);
  say(`  CSVs generated: ${totalCsvsGenerated}\n`);
}

// Run main function
main();

