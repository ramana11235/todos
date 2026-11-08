import type {Area, Project} from '../core/project.js';
import type {Task} from '../core/task.js';
import type {Settings} from '../core/settings.js';
import type {Page} from '../core/thoughts.js';
import type {Prompt, Thread} from '../core/thread.js';
import type {PushDevice} from '../core/push.js';

// Where Threads and Tasks are kept. Every method is async so that D1 can stand in for
// the local SQLite file in the cloud without changes elsewhere.
export interface Storage {
	listThreads(): Promise<Thread[]>;
	getThread(id: string): Promise<Thread | undefined>;
	saveThread(thread: Thread): Promise<void>;
	// Writes only the given fields, so changes to different fields of one
	// Thread made at the same moment all land.
	updateThread(id: string, changes: Partial<Thread>): Promise<void>;
	listTasks(): Promise<Task[]>;
	getTask(id: string): Promise<Task | undefined>;
	saveTask(task: Task): Promise<void>;
	// Saves them all in one query, so a long list fits the hosted Instance's
	// queries per request.
	saveTasks(tasks: Task[]): Promise<void>;
	// Each update below writes only the given fields, as updateThread does.
	updateTask(id: string, changes: Partial<Task>): Promise<void>;
	// Gives each Task its place in `ids` as its position, from 0, in one
	// query, so a long list fits the hosted Instance's queries per request.
	renumberTasks(ids: string[]): Promise<void>;
	// Only for a Task turned into a Thread, which then holds all it had.
	deleteTask(id: string): Promise<void>;
	// Prompts waiting to be delivered, oldest first.
	listPrompts(): Promise<Prompt[]>;
	savePrompt(prompt: Prompt): Promise<void>;
	deletePrompt(id: string): Promise<void>;
	listAreas(): Promise<Area[]>;
	saveArea(area: Area): Promise<void>;
	updateArea(id: string, changes: Partial<Area>): Promise<void>;
	listProjects(): Promise<Project[]>;
	saveProject(project: Project): Promise<void>;
	updateProject(id: string, changes: Partial<Project>): Promise<void>;
	// Goes up with every change to a Thread, a Task, a project or an area.
	changeNumber(): Promise<number>;
	getThoughts(): Promise<Page>;
	// Saves only if the page is still at `version`, and says whether it did.
	saveThoughts(text: string, version: number): Promise<boolean>;
	getSettings(): Promise<Settings>;
	// Writes only the given settings.
	updateSettings(changes: Partial<Settings>): Promise<void>;
	// Adding a device it already has replaces its keys.
	addPushDevice(device: PushDevice): Promise<void>;
	listPushDevices(): Promise<PushDevice[]>;
	removePushDevice(endpoint: string): Promise<void>;
	close(): void;
}
