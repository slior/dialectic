# Changelog


## [0.4.0]

### Added
- **Langfuse Tracing Support**: Added Langfuse tracing support with enhanced metadata for better observability and debugging

### Changed
- **Tool Registry**: Refactored tool registry and agent configuration for improved flexibility
- **Logging**: Refactored logging to use unified message formatting for consistency

### Fixed
- **Context Search Tool**: Fixed context search tool issues

### Documentation
- **Tool Configuration**: Added tool configuration documentation and new tools guide

---

## [0.3.0]

### Added
- **Tool Calling Support**: Implemented tool calling support for agents, allowing agents to interact with external tools during debates
- **Logger Support**: Added logger support to agents for improved message handling

### Changed
- **Progress UI**: Enhanced DebateProgressUI for improved message handling and display

---

## [0.2.2]

### Fixed
- **Problem Description Handling**: Fixed problem description handling in debate command to prioritize file option over positional argument
- **Diagram**: Fixed diagram issue

---

## [0.2.1]

### Added
- **Context File Option**: Added option to specify a context file for additional problem context in debate command
- **CSV Output Format**: Enhanced evaluation command to support CSV output format
- **Test Infrastructure**: Added clarification test, summary test, and tests for different models and role subsets across all examples
- **Test Execution**: Added option to run a specific sub test on all examples
- **Kata Examples**: Added kata1, kata2, and kata3 example problems
- **Batch Testing**: Added script for running multiple tests at once

### Changed
- **Rounds Test**: Updated rounds test to cover 1 to 5 rounds
- **Example Configurations**: Renamed example 3 eval config for consistency and refactored evaluator names in eval config
- **Setup Test Command**: Enhanced setup-test command to create structured example directories
- **Test Scripts**: Added progress messages for meta-test script
- **Examples Cleanup**: Removed obsolete examples

### Documentation
- **README**: Updated README to include DeepWiki badge

---

## [0.2.0]

### Added
- **Shared Context Support**: Enhanced debate command with optional context support for providing additional context to agents

### Changed
- Updated to version 0.2.0 with new shared context option

---

## [0.1.2]

### Changed
- Package metadata updates

---

## [0.1.1]

### Added
- **KISS Agent**: Added KISS (Keep It Simple, Stupid) agent role to challenge complexity
- **Report Command**: Added CLI command to generate markdown reports from debate results
- **Evaluator Command**: Added evaluator command for debate assessment with example configurations
- **Interactive Clarifications**: Added interactive clarifications phase before debates to refine problem statements
- **Multiple LLM Providers**: Support for multiple LLM providers including OpenRouter API
- **Security Agent**: Added SecurityAgent to enhance debate system with cybersecurity expertise
- **Progress UI**: Implemented real-time progress UI for debate execution
- **Dotenv Support**: Added dotenv support for environment variable management
- **Problem Description Files**: Allow providing problem description in a file
- **System Prompt Files**: Enhanced agent configuration with system prompt file support
- **Context Summarization**: Implemented context summarization for debate agents to manage debate history length
- **Markdown Report Generation**: Added markdown report generation for debate results
- **Shared Agent Instructions**: Introduced shared instructions for agent prompts
- **Test Coverage Script**: Added test:coverage script to run Jest with coverage

### Changed
- **Parallel Critiques**: Made the critique phase run in parallel for better performance
- **Round-based Proposals**: Improved debate flow with round-based proposal sourcing
- **Agent Role Consolidation**: Consolidated agent roles into RoleBasedAgent
- **Verbose Output**: Added verbose summary output with token usage capture
- **Report Formatting**: Updated report formatting and processRelevantContributions to exclude critiques
- **CLI Invocation**: Improved CLI invocation and command structure
- **Built-in Prompts**: Enhanced built-in agent prompts and evaluation prompts

### Fixed
- **Summarization Bug**: Fixed summarization to use agent's model instead of default
- **Type Safety**: Removed any types and improved type safety in eval command
- **Token Display**: Fixed tokens display to use nullish coalescing

### Documentation
- **AGENTS.md**: Added comprehensive AGENTS.md documentation with detailed command-line usage instructions
- **Debate Flow**: Added comprehensive Debate Flow documentation
- **Configuration**: Enhanced agent filtering documentation in configuration.md
- **README**: Rewrote README for clarity and added configuration documentation
- **Commands**: Added commands documentation
- **Examples**: Added example problems, configurations, and evaluation configs
- **License**: Added License file
