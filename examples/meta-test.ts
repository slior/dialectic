#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// File and directory name constants
const PROBLEM_FILE_NAME = 'problem.md';
const RUN_TEST_SCRIPT_NAME = 'run_test.sh';
const EVAL_RUN_SCRIPT_NAME = 'eval_run.sh';
const EVAL_JSON_EXTENSION = '.eval.json';
const CSV_RESULTS_SUFFIX = '_results.csv';

// File pattern constants
const DEBATE_CONFIG_PATTERN = /^debate-config(-.*)?\.json$/;
const EVAL_CONFIG_PATTERN = /^eval_config.*\.json$/;

// CSV header constant
const CSV_HEADER = 'example name,eval result file name,functional_completeness score,performance_scalability score,security score,maintainability score,regulatory_compliance score,testability score,overall_score';

// Exit code constants (matching project conventions)
const EXIT_GENERAL_ERROR = 1;

// Error message constants
const ERROR_BASE_OUTPUT_DIR_REQUIRED = 'Error: Base output directory argument is required\n';
const ERROR_USAGE = 'Usage: npx ts-node examples/meta-test.ts <base_output_dir> [test_name]\n';
const WARNING_SKIPPING_UNDERSCORE_DIR = 'Warning: Skipping directory starting with underscore:';
const WARNING_SKIPPING_UNDERSCORE_SUBDIR = 'Warning: Skipping test subdirectory starting with underscore:';
const WARNING_MISSING_PROBLEM_FILE = 'Warning: Example \'%s\' is missing required file: problem.md. Skipping.\n';
const WARNING_MISSING_DEBATE_CONFIG = 'Warning: Example \'%s\' is missing required file: debate-config.json. Skipping.\n';
const WARNING_MISSING_EVAL_CONFIG = 'Warning: Example \'%s\' is missing required file: eval_config*.json. Skipping.\n';
const WARNING_NO_EVAL_FILES = 'Warning: No evaluation JSON files found in %s. Skipping CSV generation.\n';
const WARNING_NO_VALID_EVAL_FILES = 'Warning: No valid evaluation JSON files found in %s. Skipping CSV generation.\n';
const WARNING_INVALID_JSON_STRUCTURE = 'Warning: Invalid evaluation JSON structure in %s. Skipping.\n';
const WARNING_PARSE_ERROR = 'Warning: Failed to parse evaluation JSON %s: %s. Skipping.\n';
const WARNING_TEST_NOT_FOUND = 'Warning: Example \'%s\' does not have test \'%s\'. Skipping.\n';
const ERROR_SCRIPT_FAILED = 'Error: %s failed with exit code %d\n';

interface EvaluationJsonOutput {
  evaluation: {
    functional_completeness?: { average_score: number | null };
    non_functional?: {
      performance_scalability?: { average_score: number | null };
      security?: { average_score: number | null };
      maintainability_evolvability?: { average_score: number | null };
      regulatory_compliance?: { average_score: number | null };
      testability?: { average_score: number | null };
    };
  };
  overall_score: number | null;
  agents?: Record<string, unknown>;
}

interface CsvRow {
  exampleName: string;
  evalResultFileName: string;
  functionalCompleteness: string;
  performanceScalability: string;
  security: string;
  maintainability: string;
  regulatoryCompliance: string;
  testability: string;
  overallScore: string;
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
 * Gets the examples directory path relative to the script location.
 * 
 * @returns The absolute path to the examples directory (where this script is located).
 */
function getExamplesDirectory(): string {
  const scriptDir = path.dirname(__filename);
  return path.resolve(scriptDir);
}

/**
 * Discovers all example directories in the examples folder.
 * Skips directories starting with underscore.
 * 
 * @param examplesDir - The absolute path to the examples directory.
 * @returns An array of example directory names (not paths).
 */
function discoverExamples(examplesDir: string): string[] {
  const examples: string[] = [];
  const entries = fs.readdirSync(examplesDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    
    if (entry.name.startsWith('_')) {
      writeWarning(`${WARNING_SKIPPING_UNDERSCORE_DIR} ${entry.name}\n`);
      continue;
    }
    
    examples.push(entry.name);
  }
  
  return examples;
}

/**
 * Validates that an example has all required files.
 * 
 * @param examplesDir - The absolute path to the examples directory.
 * @param exampleName - The name of the example directory to validate.
 * @returns True if the example has all required files, false otherwise.
 */
function validateExample(examplesDir: string, exampleName: string): boolean {
  const exampleDir = path.join(examplesDir, exampleName);
  
  // Check for problem.md
  const problemPath = path.join(exampleDir, PROBLEM_FILE_NAME);
  if (!fs.existsSync(problemPath)) {
    writeWarning(WARNING_MISSING_PROBLEM_FILE.replace('%s', exampleName));
    return false;
  }
  
  // Check for debate-config.json or debate-config-*.json
  const files = fs.readdirSync(exampleDir);
  const hasDebateConfig = files.some(file => DEBATE_CONFIG_PATTERN.test(file));
  if (!hasDebateConfig) {
    writeWarning(WARNING_MISSING_DEBATE_CONFIG.replace('%s', exampleName));
    return false;
  }
  
  // Check for at least one eval_config*.json
  const hasEvalConfig = files.some(file => EVAL_CONFIG_PATTERN.test(file));
  if (!hasEvalConfig) {
    writeWarning(WARNING_MISSING_EVAL_CONFIG.replace('%s', exampleName));
    return false;
  }
  
  return true;
}

/**
 * Recursively discovers test subdirectories containing both run_test.sh and eval_run.sh.
 * Skips directories starting with underscore.
 * 
 * @param examplesDir - The absolute path to the examples directory.
 * @param exampleName - The name of the example directory to search within.
 * @returns An array of relative paths from the example directory (not including example name).
 */
function discoverTestSubdirectories(examplesDir: string, exampleName: string): string[] {
  const exampleDir = path.join(examplesDir, exampleName);
  const testSubdirs: string[] = [];
  
  function searchRecursive(dir: string, relativePath: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      
      if (entry.name.startsWith('_')) {
        const fullPath = path.join(exampleName, relativePath, entry.name);
        writeWarning(`${WARNING_SKIPPING_UNDERSCORE_SUBDIR} ${fullPath}\n`);
        continue;
      }
      
      const subDirPath = path.join(dir, entry.name);
      const runTestPath = path.join(subDirPath, RUN_TEST_SCRIPT_NAME);
      const evalRunPath = path.join(subDirPath, EVAL_RUN_SCRIPT_NAME);
      
      if (fs.existsSync(runTestPath) && fs.existsSync(evalRunPath)) {
        const relativeSubDir = relativePath === '' ? entry.name : path.join(relativePath, entry.name);
        testSubdirs.push(relativeSubDir);
      } else {
        // Recursively search subdirectories
        const newRelativePath = relativePath === '' ? entry.name : path.join(relativePath, entry.name);
        searchRecursive(subDirPath, newRelativePath);
      }
    }
  }
  
  searchRecursive(exampleDir, '');
  return testSubdirs;
}

/**
 * Filters test subdirectories to only include those matching the specified test name (by basename).
 * 
 * @param testSubdirs - Array of relative paths to test subdirectories.
 * @param testName - The test name to filter by (matched against basename).
 * @returns An array of test subdirectories whose basename matches testName.
 */
function filterTestsByName(testSubdirs: string[], testName: string): string[] {
  return testSubdirs.filter(testSubDir => path.basename(testSubDir) === testName);
}

/**
 * Constructs the output directory path.
 * 
 * @param baseOutputDir - The base output directory path.
 * @param exampleName - The name of the example.
 * @param testSubDir - The relative path to the test subdirectory.
 * @returns The absolute path to the output directory for this test.
 */
function constructOutputDir(baseOutputDir: string, exampleName: string, testSubDir: string): string {
  return path.join(baseOutputDir, exampleName, testSubDir);
}

/**
 * Executes a shell script with the given output directory.
 * Scripts are executed from the project root to ensure correct path resolution.
 * 
 * @param scriptPath - The absolute path to the shell script to execute.
 * @param outputDir - The output directory to pass as the first argument to the script.
 * @param scriptName - A descriptive name for the script (used in error messages).
 * @returns True if the script executed successfully, false otherwise.
 */
function executeScript(scriptPath: string, outputDir: string, scriptName: string): boolean {
  try {
    execSync(`bash "${scriptPath}" "${outputDir}"`, {
      cwd: process.cwd(), // Use project root so relative paths in scripts resolve correctly
      stdio: 'inherit',
    });
    return true;
  } catch (error: unknown) {
    // Extract exit code from execSync error
    const execError = error as { status?: number };
    const exitCode = execError.status ?? 1;
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
      escapeCsvField(row.overallScore),
    ].join(',');
  });
  
  return [CSV_HEADER, ...dataRows].join('\n') + '\n';
}

/**
 * Generates CSV from evaluation results in output directory.
 * 
 * @param outputDir - The absolute path to the output directory containing evaluation JSON files.
 * @param exampleName - The name of the example (used in CSV filename and data).
 * @param testSubDirName - The name of the test subdirectory (used in CSV filename).
 */
function generateCsvFromEvaluationResults(
  outputDir: string,
  exampleName: string,
  testSubDirName: string
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
      row.exampleName = exampleName;
      rows.push(row);
    }
  }
  
  if (rows.length === 0) {
    writeWarning(WARNING_NO_VALID_EVAL_FILES.replace('%s', outputDir));
    return;
  }
  
  const csvContent = generateCsvContent(rows);
  const csvFileName = `${exampleName}_${testSubDirName}${CSV_RESULTS_SUFFIX}`;
  const csvPath = path.join(outputDir, csvFileName);
  
  fs.writeFileSync(csvPath, csvContent, 'utf-8');
  say(`Generated CSV: ${csvPath}\n`);
}

/**
 * Main execution function.
 * Orchestrates the meta-test process: discovers examples, executes tests, and generates CSV reports.
 */
function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    process.stderr.write(ERROR_BASE_OUTPUT_DIR_REQUIRED);
    process.stderr.write(ERROR_USAGE);
    process.exit(EXIT_GENERAL_ERROR);
  }
  
  const baseOutputDir = validateAndResolveBaseOutputDir(args[0]);
  const testName = args.length > 1 ? args[1] : undefined;
  const examplesDir = getExamplesDirectory();
  
  // Ensure base output directory exists
  if (!fs.existsSync(baseOutputDir)) {
    fs.mkdirSync(baseOutputDir, { recursive: true });
  }
  
  const examples = discoverExamples(examplesDir);
  let totalExamplesProcessed = 0;
  let totalTestsExecuted = 0;
  let totalCsvsGenerated = 0;
  
  for (const exampleName of examples) {
    if (!validateExample(examplesDir, exampleName)) {
      continue;
    }
    
    const testSubdirs = discoverTestSubdirectories(examplesDir, exampleName);
    
    // Filter by test name if provided
    let filteredTestSubdirs: string[];
    if (testName !== undefined) {
      filteredTestSubdirs = filterTestsByName(testSubdirs, testName);
      if (filteredTestSubdirs.length === 0) {
        writeWarning(WARNING_TEST_NOT_FOUND.replace('%s', exampleName).replace('%s', testName));
        continue;
      }
    } else {
      filteredTestSubdirs = testSubdirs;
    }
    
    totalExamplesProcessed++;
    
    for (const testSubDir of filteredTestSubdirs) {
      const testSubDirPath = path.join(examplesDir, exampleName, testSubDir);
      const outputDir = constructOutputDir(baseOutputDir, exampleName, testSubDir);
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Execute run_test.sh
      say(`Running test: ${exampleName}/${testSubDir}\n`);
      const runTestPath = path.join(testSubDirPath, RUN_TEST_SCRIPT_NAME);
      const runTestSuccess = executeScript(runTestPath, outputDir, `${RUN_TEST_SCRIPT_NAME} for ${exampleName}/${testSubDir}`);
      
      if (!runTestSuccess) {
        continue;
      }
      
      // Execute eval_run.sh
      say(`Evaluating: ${exampleName}/${testSubDir}\n`);
      const evalRunPath = path.join(testSubDirPath, EVAL_RUN_SCRIPT_NAME);
      const evalRunSuccess = executeScript(evalRunPath, outputDir, `${EVAL_RUN_SCRIPT_NAME} for ${exampleName}/${testSubDir}`);
      
      if (!evalRunSuccess) {
        continue;
      }
      
      totalTestsExecuted++;
      
      // Generate CSV
      const testSubDirName = path.basename(testSubDir);
      generateCsvFromEvaluationResults(outputDir, exampleName, testSubDirName);
      totalCsvsGenerated++;
    }
  }
  
  // Summary
  say(`\nSummary:\n`);
  say(`  Examples processed: ${totalExamplesProcessed}\n`);
  say(`  Tests executed: ${totalTestsExecuted}\n`);
  say(`  CSVs generated: ${totalCsvsGenerated}\n`);
}

// Run main function
main();

