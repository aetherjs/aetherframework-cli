
/**
 * @license MIT
 * Copyright (c) 2026-present AetherFramework Contributors.
 * SPDX-License-Identifier: MIT
 * @module @aetherframework/cli/bin/cli
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { TemplateFactory } from '../src/factories/TemplateFactory.js';

const program = new Command();

program
  .name('aether')
  .description('CLI tool to scaffold AetherJS projects using factory pattern')
  .version('1.0.0');

program
  .command('create [project-name]')
  .description('Create a new project using basic or api template')
  .action(async (projectName) => {
    try {
      let finalProjectName = projectName;

      // 1. Prompt for project name if not provided as an argument
      if (!finalProjectName) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'projectName',
            message: 'Enter project name:',
            validate: (input) => input.trim() !== '' || 'Project name cannot be empty'
          }
        ]);
        finalProjectName = answer.projectName;
      }

      // Construct the absolute target path
      const targetPath = path.join(process.cwd(), finalProjectName);

      // 2. Check if the target directory already exists
      if (await fs.pathExists(targetPath)) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Directory "${finalProjectName}" already exists. Overwrite?`,
            default: false
          }
        ]);

        // Exit if user chooses not to overwrite
        if (!overwrite) {
          console.log(chalk.red('Operation cancelled.'));
          process.exit(0);
        }
        
        // Remove existing directory to start fresh
        console.log(chalk.yellow('Cleaning up existing directory...'));
        await fs.remove(targetPath);
      }

      // 3. Prompt user to select the template type
      const { templateType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'templateType',
          message: 'Select a template type:',
          choices: [
            { name: 'Basic (Minimal Hello World)', value: 'basic' },
            { name: 'API (Production Structure)', value: 'api' }
          ]
        }
      ]);

      // 4. Instantiate the Factory and execute creation
      // The factory encapsulates the logic for copying the specific template
      const factory = new TemplateFactory(templateType, finalProjectName, targetPath);
      await factory.create();

      // 5. Display success message and next steps
      console.log(chalk.green('\n Project created successfully!'));
      console.log(chalk.yellow('\nNext steps:'));
      console.log(`  cd ${finalProjectName}`);
      console.log('  npm install');
      console.log('  npm run dev\n');

    } catch (error) {
      // Handle any errors during the process
      console.error(chalk.red('\n Error:'), error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
