export type User = { id: number; username: string; name: string; role: 'student' | 'teacher' };
export type Direction = 'north' | 'east' | 'south' | 'west';
export type World = { width: number; height: number; start: { x: number; y: number; direction: Direction }; goal: [number, number]; walls: [number, number][] };
export type Exercise = {
  id: string; title: string; kind: 'quiz' | 'short_answer' | 'robot'; prompt: string; starter_code: string;
  config: Record<string, unknown>; rules?: Record<string, unknown>; hints?: string[]; hint_count?: number;
  requirements?: { require_loop?: boolean; max_commands?: number; max_code_commands?: number };
};
export type Block = { id: string; kind: 'text' | 'exercise'; title: string; body: string; exercise?: string | Exercise | null };
export type Lesson = { id: string; title: string; summary: string; section?: string; tags?: string[]; blocks: Block[]; release_count?: number };
export type Answer = { code?: string; selected?: string[]; text?: string; commands?: string[] };
export type Progress = { completed_blocks: string[]; attempts: number; hints_used: number };
export type Release = Lesson & { version: number; progress: Progress; drafts: Record<string, Answer>; hints: Record<string, string[]> };
export type CatalogItem = { lesson_id: string; release_id: string; title: string; summary: string; section?: string; tags?: string[]; version: number; task_count: number; progress: Progress };
export type AttemptResult = { id: string; correct: boolean; feedback: string; verification: string; hints_used: number };
export type TaskProgress = { id: string; title: string; kind: string; status: 'solved' | 'practicing' | 'not_started'; attempts: number; hints_used: number; independent: boolean | null; needs_support: boolean; last_feedback: string; last_activity: string | null };
export type LessonProgress = { release_id: string; title: string; version: number; section: string; tags: string[]; tasks: TaskProgress[]; total: number; solved: number; attempts: number; hints_used: number; independent: number; started: boolean; completed: boolean; last_activity: string | null };
export type ProgressReport = {
  student?: User;
  summary: { total_tasks: number; solved_tasks: number; percent: number; total_lessons: number; completed_lessons: number; started_lessons: number; independent_tasks: number; attempts: number; hints_used: number };
  lifetime: { solved_tasks: number; independent_tasks: number; recovered_tasks: number; attempts: number; hints_used: number; active_days: number; last_activity: string | null };
  lessons: LessonProgress[];
  recommendation: { release_id: string; block_id: string; title: string; task: string; started: boolean } | null;
  achievements: { id: string; title: string; description: string; unlocked: boolean }[];
  week: { date: string; attempts: number; correct: number }[];
  recent: { id: string; lesson: string; version: number; correct: boolean; feedback: string; hints_used: number; created_at: string }[];
};
