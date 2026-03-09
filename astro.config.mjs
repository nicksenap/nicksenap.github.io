// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { readFileSync } from 'fs';

const terminalDark = JSON.parse(readFileSync('./src/styles/shiki-terminal-dark.json', 'utf-8'));
const terminalLight = JSON.parse(readFileSync('./src/styles/shiki-terminal-light.json', 'utf-8'));

// https://astro.build/config
export default defineConfig({
	site: 'https://nicksenap.github.io',
	integrations: [mdx(), sitemap()],
	markdown: {
		shikiConfig: {
			themes: {
				light: terminalLight,
				dark: terminalDark,
			},
		},
	},
});
