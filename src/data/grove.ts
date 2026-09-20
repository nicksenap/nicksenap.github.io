export type GrovePart = {
	id: string;
	name: string; // the Grove concept or command
	part: string; // the machine part it is drawn as
	role: string;
	blurb: string;
};

// Top → bottom of the drawing, in label order.
export const GROVE_PARTS: GrovePart[] = [
	{
		id: 'connector',
		name: 'plugins',
		part: 'ribbon connector',
		role: 'gw-* on PATH',
		blurb: 'The one socket on the carriage. Anything not in core is a separate executable, git-style; agent, terminal and recipe integrations plug in here.',
	},
	{
		id: 'carriage',
		name: 'workspace',
		part: 'carriage',
		role: 'gw create · gw delete',
		blurb: 'One crossbar over every rail. gw create lowers it onto the repos you name, on one branch; gw delete lifts it off and takes the worktrees and branches with it.',
	},
	{
		id: 'indicator',
		name: 'gw status',
		part: 'indicator',
		role: 'changed · clean',
		blurb: 'Lit where a worktree has uncommitted changes. One table for the whole carriage instead of a visit to each rail.',
	},
	{
		id: 'block',
		name: 'worktree',
		part: 'bearing block',
		role: 'one per repo',
		blurb: 'Where the carriage meets a rail: a git worktree on the workspace branch, in its own directory under the workspace.',
	},
	{
		id: 'screw',
		name: 'base branch',
		part: 'lead screw',
		role: 'gw sync',
		blurb: 'Turn it and the carriage advances along every rail at once: each worktree rebased onto its own base branch.',
	},
	{
		id: 'rail',
		name: 'repo',
		part: 'rail',
		role: 'web · api · worker',
		blurb: 'Each rail is a main clone with its own length of history. Grove never moves the rails; it only rides them.',
	},
	{
		id: 'stop',
		name: '.grove.toml',
		part: 'end stop',
		role: 'per-repo setup',
		blurb: 'Set in the rail itself: which base branch to start from, and what to run once the worktree exists.',
	},
	{
		id: 'plate',
		name: 'gw init',
		part: 'base plate',
		role: 'registered directories',
		blurb: 'The directories Grove may look in for repos. Everything else is bolted to it.',
	},
];
