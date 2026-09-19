export type HarnessPart = {
	id: string;
	name: string;
	part: string; // the Raspberry Pi component it stands in for
	role: string; // one-line role in the setup
	blurb: string; // why it is there
	url?: string;
};

// Bottom → top, in explode order.
export const HARNESS_PARTS: HarnessPart[] = [
	{
		id: 'ghostty',
		name: 'ghostty',
		part: 'case',
		role: 'terminal',
		blurb: 'GPU-rendered, native splits, one config file; it keeps up with agent output and otherwise stays out of the way.',
		url: 'https://ghostty.org',
	},
	{
		id: 'herdr',
		name: 'herdr',
		part: 'PCB',
		role: 'agent multiplexer',
		blurb: 'A multiplexer for agents rather than shells: a pane per agent, a workspace per task, and everything below mounts here.',
		url: 'https://github.com/herdrdev/herdr',
	},
	{
		id: 'pi',
		name: 'pi',
		part: 'SoC',
		role: 'coding agent',
		blurb: 'Small core, any model, and every part of it is a TypeScript extension I can read rather than a product I configure.',
		url: 'https://github.com/earendil-works/pi-coding-agent',
	},
	{
		id: 'brain',
		name: 'fable 5.1 · high',
		part: 'microSD',
		role: 'oracle',
		blurb: 'What the board boots from: it plans, reviews and decides what gets fixed, at high effort because a wrong call here costs the most.',
	},
	{
		id: 'workers',
		name: 'sol 5.6 · med / grok 4.6',
		part: 'RAM',
		role: 'workers',
		blurb: 'One per slice, several at once, briefed and then checked by the oracle; medium effort is plenty once the task is specified.',
	},
	{
		id: 'scout',
		name: 'luna · low',
		part: 'wireless',
		role: 'scout',
		blurb: 'Sent out first to read, grep, fetch and summarise; cheap enough to send often, low effort because it only reports back.',
	},
	{
		id: 'skills',
		name: 'agent-skills',
		part: 'GPIO header',
		role: 'workflow · addy osmani',
		blurb: 'Planning, TDD, review loops and shipping as skills the agent loads when they apply, one pack per session.',
		url: 'https://github.com/addyosmani/agent-skills',
	},
	{
		id: 'browser',
		name: 'BrowserSkill',
		part: 'HDMI',
		role: 'chrome devtools',
		blurb: 'The display output: a real browser in the loop so the agent can verify, dogfood and profile what it just built.',
		url: 'https://github.com/Tencent/BrowserSkill',
	},
	{
		id: 'mcp',
		name: 'mcp servers',
		part: 'USB',
		role: 'context7 · notion · slack',
		blurb: 'Peripherals: docs, notes and conversations plugged in per task and unplugged when done.',
		url: 'https://context7.com',
	},
	{
		id: 'context',
		name: 'context-mode',
		part: 'ethernet',
		role: 'context sandbox',
		blurb: 'Big outputs run in a sandbox and only the answer comes back, so logs and test runs stop eating the context window.',
		url: 'https://github.com/mksglu/context-mode',
	},
	{
		id: 'grove',
		name: 'grove',
		part: 'camera port',
		role: 'worktrees',
		blurb: 'One worktree per task across several repos, so parallel agents never edit the same checkout.',
		url: 'https://github.com/nicksenap/grove',
	},
];
