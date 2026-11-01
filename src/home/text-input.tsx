import {Text, useInput} from 'ink';
import {colours} from './look.js';

// A one-line text field. It only takes keys while it is focused.
export function TextInput({
	value,
	onChange,
	onSubmit,
	focused = true,
	placeholder = '',
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit?: (value: string) => void;
	focused?: boolean;
	placeholder?: string;
}) {
	useInput(
		(input, key) => {
			if (key.return) onSubmit?.(value);
			else if (key.backspace || key.delete) onChange(value.slice(0, -1));
			else if (key.ctrl && input === 'u') onChange('');
			else if (!key.ctrl && !key.meta && !key.escape && !key.tab && !key.upArrow && !key.downArrow && input) {
				onChange(value + input.replace(/[\r\n]+/g, ' '));
			}
		},
		{isActive: focused},
	);
	if (!value && placeholder) {
		return (
			<Text color={colours.faint}>
				{focused ? <Text inverse> </Text> : null}
				{placeholder}
			</Text>
		);
	}
	return (
		<Text color={colours.text}>
			{value}
			{focused ? <Text inverse> </Text> : null}
		</Text>
	);
}
