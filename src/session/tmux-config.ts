// The config for todos' own tmux server. Its job is to make Home the only
// way to move from one Thread to another (ADR 0001): there is nothing to see
// other windows by and no key that goes to one, apart from the key to Home.
// It also binds the keys that work in every todos window: capture, the
// task panel and Thoughts. tmux takes these before Claude sees them, so none of them may
// be a key Claude Code uses (it has Alt+o, p, t, w and the arrows).

import {shellLine} from './claude-command.js';

export const tmuxSession = 'todos';
export const homeWindow = `${tmuxSession}:home`;

// On a Mac whose terminal does not send Option as Meta, Option and a letter
// types a character instead, so those are bound as well and the keys work
// either way.
const optionH = '˙';
const optionX = '≈';
const optionC = 'ç';
const optionG = '©';

export const tasksPaneWidth = 46;
export const thoughtsHeight = '33%';

const prefixKeysThatSwitch = [
	'$', '&', "'", '(', ')', '<', 'c', 'f', 'l', 'n', 'p', 's', 'w', 'D', 'L', 'M-n', 'M-p',
	'0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
];

const rootKeysThatSwitch = [
	'MouseDown1Status', 'MouseDown3Status', 'MouseDown3StatusLeft', 'M-MouseDown3Status',
	'M-MouseDown3StatusLeft', 'WheelUpStatus', 'WheelDownStatus',
];

const quote = (key: string): string => (key === "'" ? `"'"` : `'${key}'`);

// `self` is the command that runs todos.
export function tmuxConfig(self: string[] = ['todos']): string {
	const toggleTasks = `run-shell -b "${shellLine([...self, 'toggle-tasks'])} '#{window_id}'"`;
	const toggleThoughts = `run-shell -b "${shellLine([...self, 'toggle-thoughts'])} '#{window_id}'"`;
	// A new pane starts in the Thread's Directory, as tmux would start it in
	// the session's; the Session's pane records it on its window.
	const startDirectory = '-c "#{?@todos_directory,#{@todos_directory},#{pane_current_path}}"';
	const capture = `display-popup -E -b rounded -S fg=#4a8bb5 -w 62 -h 3 "${shellLine([...self, 'capture'])}"`;
	return [
		'# Written by todos. Changes are overwritten.',
		'set -g status off',
		'set -g monitor-activity off',
		'set -g monitor-bell off',
		'set -g monitor-silence 0',
		'set -g visual-activity off',
		'set -g visual-bell off',
		'set -g escape-time 10',
		'set -g focus-events on',
		'set -g extended-keys on',
		'set -g default-terminal "tmux-256color"',
		'set -ga terminal-features ",*:RGB"',
		'set -g mouse on',
		...prefixKeysThatSwitch.map(key => `unbind-key -T prefix ${quote(key)}`),
		...rootKeysThatSwitch.map(key => `unbind-key -T root ${key}`),
		`bind-key -n M-h select-window -t ${homeWindow}`,
		`bind-key -n ${optionH} select-window -t ${homeWindow}`,
		`bind-key -n M-x ${toggleTasks}`,
		`bind-key -n ${optionX} ${toggleTasks}`,
		`bind-key -n M-g ${toggleThoughts}`,
		`bind-key -n ${optionG} ${toggleThoughts}`,
		`bind-key -n M-c ${capture}`,
		`bind-key -n ${optionC} ${capture}`,
		`bind-key '%' split-window -h ${startDirectory}`,
		`bind-key '"' split-window -v ${startDirectory}`,
		// When a Thread's window closes, tmux would show some other window.
		// Going to Home instead keeps every switch a choice.
		`set-hook -g window-unlinked "select-window -t ${homeWindow}"`,
		'',
	].join('\n');
}
