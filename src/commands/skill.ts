import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { action } from '../lib/cli';
import { VirloError } from '../client/errors';
import { SKILL_MARKDOWN, SKILL_NAME } from '../skill/template';

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

const PROJECT_DIR = path.join(process.cwd(), '.claude', 'skills', SKILL_NAME);
const GLOBAL_DIR = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME);

function relativeOrAbs(abs: string): string {
  const rel = path.relative(process.cwd(), abs);
  return rel === '' || rel.startsWith('..') ? abs : `./${rel}`;
}

/** True when the directory looks like a Claude Code skill dir (.claude/skills/<name>). */
function isClaudeSkillDir(dir: string): boolean {
  return /\.claude[\\/]skills[\\/][^\\/]+$/.test(dir);
}

function writeSkillFile(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'SKILL.md');
  fs.writeFileSync(file, SKILL_MARKDOWN, 'utf8');
  return file;
}

interface InstallOptions {
  dir?: string;
  global?: boolean;
  force?: boolean;
}

async function runInstall(o: InstallOptions): Promise<void> {
  const flagged = Boolean(o.dir || o.global);
  const interactive = !flagged && Boolean(process.stdout.isTTY);

  let targetDir: string;
  if (o.dir) {
    targetDir = path.resolve(expandHome(o.dir));
  } else if (o.global) {
    targetDir = GLOBAL_DIR;
  } else if (!interactive) {
    targetDir = PROJECT_DIR; // sensible default when piped with no flags
  } else {
    p.intro(pc.bold(pc.magenta('Install the Virlo skill')));
    const choice = await p.select({
      message: 'Where should SKILL.md go?',
      options: [
        { value: 'project', label: 'This project', hint: relativeOrAbs(PROJECT_DIR) },
        { value: 'global', label: 'Global (all projects)', hint: GLOBAL_DIR },
        { value: 'custom', label: 'Custom directory…' },
      ],
    });
    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      return;
    }
    if (choice === 'project') {
      targetDir = PROJECT_DIR;
    } else if (choice === 'global') {
      targetDir = GLOBAL_DIR;
    } else {
      const custom = await p.text({
        message: 'Directory to create SKILL.md in',
        initialValue: PROJECT_DIR,
        validate: (v) => (v && v.trim() ? undefined : 'A directory is required.'),
      });
      if (p.isCancel(custom)) {
        p.cancel('Cancelled.');
        return;
      }
      targetDir = path.resolve(expandHome(custom.trim()));
    }
  }

  const file = path.join(targetDir, 'SKILL.md');
  if (fs.existsSync(file) && !o.force) {
    if (!interactive) {
      throw new VirloError(`SKILL.md already exists at ${file}. Re-run with --force to overwrite.`);
    }
    const ok = await p.confirm({ message: `${file} exists. Overwrite?`, initialValue: false });
    if (p.isCancel(ok) || !ok) {
      p.cancel('Kept the existing file.');
      return;
    }
  }

  writeSkillFile(targetDir);

  const tip = isClaudeSkillDir(targetDir)
    ? 'Claude Code will auto-discover this skill from that directory.'
    : 'For Claude Code auto-discovery, place it under .claude/skills/<name>/.';

  if (interactive) {
    p.note(`${pc.cyan(file)}\n\n${tip}`, 'Installed');
    p.outro('Done.');
  } else if (process.stdout.isTTY) {
    process.stdout.write(`Installed skill → ${file}\n${pc.dim(tip)}\n`);
  } else {
    process.stdout.write(`${file}\n`); // machine-friendly: just the path
  }
}

export function registerSkill(program: Command): void {
  const skill = program
    .command('skill')
    .description('Install the Virlo agent skill (SKILL.md) so an AI agent has full context');

  skill
    .command('install')
    .description('Write a SKILL.md that gives an agent full Virlo + CLI context')
    .option('--dir <path>', 'directory to write SKILL.md into (non-interactive)')
    .option('--global', 'install to ~/.claude/skills/virlo (non-interactive)')
    .option('--force', 'overwrite an existing SKILL.md without prompting')
    .action(
      action(async ({ opts }) => {
        await runInstall({
          dir: opts.dir as string | undefined,
          global: opts.global as boolean | undefined,
          force: opts.force as boolean | undefined,
        });
      }),
    );

  skill
    .command('print')
    .description('Print the skill markdown to stdout (writes no file)')
    .action(
      action(async () => {
        process.stdout.write(SKILL_MARKDOWN);
      }),
    );
}
