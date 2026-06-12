
# Aether Scaffold CLI

A lightweight, factory-pattern based CLI tool for scaffolding Node.js projects. It supports `basic` and `api` templates by directly copying pre-configured directory structures.

## Features

- **Factory Pattern Architecture**: Modular design separating CLI logic from file operations.
- **Static Template Copying**: Fast and reliable project creation by copying pre-built templates.
- **Interactive Prompts**: User-friendly interface for selecting project names and template types.
- **Automatic Metadata Update**: Automatically updates `package.json` with the correct project name.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd aether-scaffold
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Link the CLI globally (optional):
   ```bash
   npm link
   ```

## Usage

### Create a New Project

Run the following command to start the interactive setup:

```bash
aether create my-project
```

Or specify the project name directly:

```bash
aether create my-project
```

You will be prompted to select a template:
- **Basic**: A minimal Hello World setup.
- **API**: A production-ready structure with common API configurations.

### Manual Execution

If you haven't linked the package globally, you can run it via npx or node:

```bash
node bin/cli.js create my-project
```

## License

MIT
