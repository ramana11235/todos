// The nvim config for Thoughts. nvim is started with `--clean -u` and this
// config, so nothing from my own nvim setup comes in. It makes the strip look
// like the task panel, reads and saves the page through `todos`, which talks
// to the API, and saves by itself so nothing written is ever lost.

import {colours} from './look.js';

// It finds the command that runs todos in TODOS_SELF, as JSON.
export function nvimConfig(): string {
	return `-- Written by todos. Changes are overwritten.
local colours = {
	blue = '${colours.blue}',
	deepBlue = '${colours.deepBlue}',
	line = '${colours.line}',
	text = '${colours.text}',
	faint = '${colours.faint}',
	dim = '${colours.dim}',
}
local todos = vim.json.decode(os.getenv('TODOS_SELF'))

local o = vim.opt
o.termguicolors = true
o.number = false
o.relativenumber = false
o.signcolumn = 'no'
o.foldcolumn = '2' -- the panel's two columns of padding on the left
o.foldenable = false
o.laststatus = 0
o.cmdheight = 0
o.ruler = false
o.showmode = false
o.showcmd = false
o.fillchars = {eob = ' ', fold = ' ', foldopen = ' ', foldclose = ' ', foldsep = ' '}
o.wrap = true
o.linebreak = true
o.breakindent = true
o.swapfile = false
o.shortmess:append('WIcFsS')
o.updatetime = 1000
o.mouse = 'a'

-- The header says what the strip is, with the key that closes it on the
-- right, or a message when a save did not go through.
local function header(message)
	local right = message and ('%#ThoughtsMessage#' .. message) or '%#ThoughtsHint#alt+g close'
	o.winbar = '%#ThoughtsTitle#  Thoughts%=' .. right .. '  '
end
header()

local function hl(group, value) vim.api.nvim_set_hl(0, group, value) end

local function look()
	hl('Normal', {fg = colours.text})
	hl('NormalNC', {fg = colours.text})
	hl('FoldColumn', {})
	hl('EndOfBuffer', {fg = colours.line})
	hl('NonText', {fg = colours.dim})
	hl('WinBar', {fg = colours.blue})
	hl('WinBarNC', {fg = colours.blue})
	hl('ThoughtsTitle', {fg = colours.blue, bold = true})
	hl('ThoughtsHint', {fg = colours.dim})
	hl('ThoughtsMessage', {fg = colours.blue})
	hl('Visual', {bg = colours.line})
	hl('Search', {fg = colours.text, bg = colours.deepBlue})
	hl('CurSearch', {fg = '#000000', bg = colours.blue})
	hl('IncSearch', {fg = '#000000', bg = colours.blue})
	hl('MatchParen', {fg = colours.blue, bold = true})
	hl('MsgArea', {fg = colours.faint})
	hl('ErrorMsg', {fg = colours.blue})
	hl('WarningMsg', {fg = colours.blue})
	hl('Title', {fg = colours.blue, bold = true})
	for level = 1, 6 do
		hl('markdownH' .. level, {fg = colours.blue, bold = true})
		hl('markdownH' .. level .. 'Delimiter', {fg = colours.deepBlue, bold = true})
		hl('@markup.heading.' .. level .. '.markdown', {fg = colours.blue, bold = true})
		hl('@markup.heading.' .. level .. '.marker.markdown', {fg = colours.deepBlue, bold = true})
	end
	hl('markdownListMarker', {fg = colours.dim})
	hl('markdownOrderedListMarker', {fg = colours.dim})
	hl('@markup.list.markdown', {fg = colours.dim})
	hl('markdownBold', {fg = colours.text, bold = true})
	hl('@markup.strong', {fg = colours.text, bold = true})
	hl('markdownItalic', {fg = colours.text, italic = true})
	hl('@markup.italic', {fg = colours.text, italic = true})
	hl('markdownCode', {fg = colours.faint})
	hl('@markup.raw', {fg = colours.faint})
	hl('markdownRule', {fg = colours.dim})
	hl('@markup.quote', {fg = colours.faint})
end
look()
vim.api.nvim_create_autocmd('ColorScheme', {callback = look})

-- A blank line between the header and the page, like the gap under the
-- task panel's lists. It is put back on line 1 after every change, so it
-- stays at the top when lines are added above, and nvim hides lines drawn
-- above line 1 unless the view asks for them.
local gap = vim.api.nvim_create_namespace('thoughts-gap')
local function show_gap()
	local view = vim.fn.winsaveview()
	if view.topline == 1 and view.topfill ~= 1 then vim.fn.winrestview({topline = 1, topfill = 1}) end
end
local function place_gap()
	vim.api.nvim_buf_clear_namespace(0, gap, 0, -1)
	vim.api.nvim_buf_set_extmark(0, gap, 0, 0, {virt_lines = {{{' ', 'Normal'}}}, virt_lines_above = true})
	show_gap()
end
vim.api.nvim_create_autocmd({'BufWinEnter', 'TextChanged', 'TextChangedI'}, {callback = place_gap})
vim.api.nvim_create_autocmd({'WinScrolled', 'CursorMoved', 'CursorMovedI'}, {callback = show_gap})

local function run(args, stdin, done)
	local command = vim.list_extend(vim.deepcopy(todos), args)
	if done then return vim.system(command, {stdin = stdin, text = true}, done) end
	return vim.system(command, {stdin = stdin, text = true}):wait()
end

-- The version of the page this buffer was loaded from, sent with every save
-- so an older copy can never save over a newer one.
local version = nil
local saving, again = false, false

local function read()
	local result = run({'thoughts-read'})
	if result.code ~= 0 then
		header('Thoughts could not be loaded. :e! tries again')
		vim.api.nvim_buf_set_lines(0, 0, -1, false, {})
		vim.bo.modified = false
		vim.bo.modifiable = false
		return
	end
	local page = vim.json.decode(result.stdout)
	version = page.version
	vim.bo.modifiable = true
	vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(page.text, '\\n', {plain = true}))
	vim.bo.modified = false
	vim.bo.filetype = 'markdown'
	header()
end

local function saved(result, tick, buf)
	saving = false
	if result.code ~= 0 then
		header('Thoughts could not be saved yet')
		return
	end
	local answer = vim.json.decode(result.stdout)
	if answer.saved then
		version = answer.version
		if vim.b[buf].changedtick == tick then vim.bo[buf].modified = false end
		header()
	else
		header('Changed somewhere else, so not saved. :e! loads it')
	end
end

-- Saves in the background on every pause and every way out. Only one save
-- is on its way at a time, and a change made meanwhile is saved after it.
local function save(wait)
	local buf = vim.api.nvim_get_current_buf()
	if version == nil or not vim.bo[buf].modified then return end
	-- On the way out, let a save that is on its way land first.
	if wait then vim.wait(5000, function() return not saving end) end
	if saving then
		again = true
		return
	end
	saving = true
	local tick = vim.b[buf].changedtick
	local text = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), '\\n')
	local args = {'thoughts-save', tostring(version)}
	if wait then return saved(run(args, text), tick, buf) end
	run(args, text, function(result)
		vim.schedule(function()
			saved(result, tick, buf)
			if again then
				again = false
				save()
			end
		end)
	end)
end

vim.api.nvim_create_autocmd('BufReadCmd', {pattern = 'Thoughts.md', callback = read})
vim.api.nvim_create_autocmd('BufWriteCmd', {pattern = 'Thoughts.md', callback = function() save() end})
vim.api.nvim_create_autocmd(
	{'InsertLeave', 'TextChanged', 'CursorHold', 'CursorHoldI', 'FocusLost', 'BufLeave'},
	{callback = function() save() end}
)
-- Quitting waits for the save, so nvim never stops me over unsaved changes.
-- When nvim is killed, as when tmux stops, what it sends on the way out
-- arrives empty and would wipe the page, so it is not sent; the save after
-- the last pause in typing has it.
vim.api.nvim_create_autocmd({'QuitPre', 'VimLeavePre'}, {callback = function()
	if vim.v.dying == 0 then save(true) end
end})
`;
}
