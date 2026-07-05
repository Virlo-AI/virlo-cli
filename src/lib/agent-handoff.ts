import { spawnSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';

export interface AgentTarget {
  id: 'claude' | 'codex';
  label: string;
  bin: string;
}

const AGENTS: AgentTarget[] = [
  { id: 'claude', label: 'Claude Code', bin: 'claude' },
  { id: 'codex', label: 'Codex', bin: 'codex' },
];

/**
 * The tour seeded into the agent session after onboarding. Read-path only by
 * intent: the skill's own money-safety rules make the agent confirm before
 * running any 💲 command, so the first-run experience never spends credits
 * without the user saying yes inside the session.
 */
const TOUR =
  'Give me a quick tour: run `virlo whoami` to confirm my setup works, briefly ' +
  "explain what Virlo can do, then show me something interesting that's trending " +
  'in short-form right now. Ask me before running anything that spends credits.';

/**
 * Claude Code auto-discovers SKILL.md from .claude/skills; Codex does not read
 * that directory, so its prompt points at the installed file explicitly.
 */
export function examplePrompt(agent: AgentTarget, skillFile: string): string {
  if (agent.id === 'claude') return `You have the virlo skill available. ${TOUR}`;
  return `Read ${skillFile} first — it documents the \`virlo\` CLI. Then: ${TOUR}`;
}

function onPath(bin: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [bin], { stdio: 'ignore' }).status === 0;
}

/** Agents found on PATH, in preference order. */
export function detectAgents(): AgentTarget[] {
  return AGENTS.filter((a) => onPath(a.bin));
}

/** Hand the terminal to `<bin> "<prompt>"` and block until the session ends. */
function launchAgent(agent: AgentTarget, prompt: string): void {
  if (process.platform === 'win32') {
    // npm-style .cmd shims need a shell on Windows, and shell mode does not
    // quote args — quote the prompt ourselves.
    spawnSync(`${agent.bin} "${prompt.replace(/"/g, '\\"')}"`, { stdio: 'inherit', shell: true });
  } else {
    spawnSync(agent.bin, [prompt], { stdio: 'inherit' });
  }
}

export type HandoffResult = 'launched' | 'declined' | 'unavailable';

/**
 * Final onboarding step: if a supported AI agent is installed, offer to launch
 * it with the example query (shown to the user verbatim before anything runs).
 * The clack session must still be open; this prints its own outro before
 * handing the terminal over, and a closing line when the session ends.
 */
export async function offerAgentHandoff(skillFile: string): Promise<HandoffResult> {
  const detected = detectAgents();
  if (detected.length === 0) return 'unavailable';

  const choice = await p.select({
    message: 'Open an AI agent now and try an example query?',
    options: [
      ...detected.map((a) => ({ value: a.id as string, label: a.label, hint: a.bin })),
      { value: 'skip', label: "I'll poke around on my own" },
    ],
  });
  if (p.isCancel(choice) || choice === 'skip') return 'declined';

  const agent = detected.find((a) => a.id === choice)!;
  const prompt = examplePrompt(agent, skillFile);

  p.note(
    [
      pc.italic(`"${prompt}"`),
      '',
      pc.dim(`First run of ${agent.label} may ask you to sign in and/or confirm you`),
      pc.dim('trust this folder — your query runs right after.'),
    ].join('\n'),
    'Sending this prompt',
  );
  p.outro(`Handing off to ${agent.label}…`);

  launchAgent(agent, prompt);

  process.stdout.write(
    `\nWelcome back. Run ${pc.cyan('virlo --help')} anytime, or re-launch with ${pc.cyan(
      agent.bin,
    )}.\n`,
  );
  return 'launched';
}

/**
 * "You can now do x y z" panel for every onboarding exit that does not end in
 * a live agent session.
 */
export function nextStepsNote(): string {
  return [
    `${pc.cyan('virlo sounds trending')}   breakout sounds right now ${pc.dim('(💲 small read cost)')}`,
    `${pc.cyan('virlo trends list')}       AI-detected trends ${pc.dim('(💲 small read cost)')}`,
    `${pc.cyan('virlo whoami')}            your key + balance ${pc.dim('(free)')}`,
    '',
    `All commands: ${pc.cyan('virlo --help')} · Docs: ${pc.cyan('https://dev.virlo.ai')}`,
  ].join('\n');
}
