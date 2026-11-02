// The capture popup: one line that saves a bare Task to the Inbox. It shows
// nothing else, so capturing never pulls my attention (CONTEXT.md, Capture).

import {Text, useApp, useInput} from 'ink';
import {useState} from 'react';
import type {Client} from '../client/client.js';
import {colours} from './look.js';
import {TextInput} from './text-input.js';

export function Capture({client}: {client: Client}) {
	const {exit} = useApp();
	const [title, setTitle] = useState('');
	const [failed, setFailed] = useState(false);

	useInput((_, key) => {
		if (key.escape) exit();
	});

	const save = async (value: string) => {
		if (!value.trim()) return exit();
		try {
			await client.addTask({title: value});
			exit();
		} catch {
			// Kept on screen, so what I typed is not lost.
			setFailed(true);
		}
	};

	return (
		<Text>
			<Text color={failed ? colours.faint : colours.accent}>{failed ? ' Could not save. Capture: ' : ' Capture: '}</Text>
			<TextInput value={title} onChange={setTitle} onSubmit={value => void save(value)} />
		</Text>
	);
}
