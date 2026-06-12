


/**
 * @license MIT
 * Copyright (c) 2026-present AetherFramework Contributors.
 * SPDX-License-Identifier: MIT
 * @module @aetherframework/cli/src/factory/TemplateFactory
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Resolve directory paths in ES Modules to locate the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Assuming templates are located at the project root, two levels up from src/factories
const ROOT_DIR = path.join(__dirname, '..', '..');

/**
 * TemplateFactory Class
 * Implements the Factory pattern to handle project creation by copying pre-built templates.
 */
export class TemplateFactory {
  /**
   * @param {string} type - The template type identifier ('basic' or 'api')
   * @param {string} projectName - The name of the new project
   * @param {string} targetPath - The absolute path where the project will be created
   */
  constructor(type, projectName, targetPath) {
    this.type = type;
    this.projectName = projectName;
    this.targetPath = targetPath;
    // Construct the source path to the specific template directory
    this.sourcePath = path.join(ROOT_DIR, 'templates', type);
  }

  /**
   * Main execution method to create the project structure.
   * Validates source, ensures target directory, copies files, and updates metadata.
   */
  async create() {
    console.log(chalk.blue(`\n Initializing ${this.type} template...`));

    // 1. Validate that the source template directory exists
    if (!await fs.pathExists(this.sourcePath)) {
      throw new Error(`Template source not found: ${this.sourcePath}`);
    }

    // 2. Ensure the target directory exists (creates it if missing)
    await fs.ensureDir(this.targetPath);

    // 3. Copy all files from source template to target directory
    console.log(chalk.gray(`Copying files from ${this.type} to ${this.projectName}...`));
    await fs.copy(this.sourcePath, this.targetPath);

    // 4. Post-processing: Update package.json with the correct project name
    await this._updatePackageJson();

    console.log(chalk.green('Template copied successfully.'));
  }

  /**
   * Helper method to update the 'name' field in package.json
   * Ensures the generated project has the correct identifier.
   */
  async _updatePackageJson() {
    const pkgPath = path.join(this.targetPath, 'package.json');
    
    // Only update if package.json exists in the template
    if (await fs.pathExists(pkgPath)) {
      const pkg = await fs.readJson(pkgPath);
      pkg.name = this.projectName;
      // Write back with formatted JSON (2 spaces indentation)
      await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    }
  }
}
