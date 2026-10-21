export type User = { id: number; username: string; name: string; role: 'student' | 'teacher' };
export type Direction = 'north' | 'east' | 'south' | 'west';
export type World = { width: number; height: number; start: { x: number; y: number; direction: Direction }; goal: [number, number]; walls: [number, number][] };
export type Exercise = {
  id: string; title: string; kind: 'quiz' | 'short_answer' | 'robot'; prompt: string; starter_code: string;
  config: Record<string, unknown>; rules?: Record<string, unknown>; hints?: string[]; hint_count?: number;
  requirements?: { require_loop?: boolean; max_commands?: number };
};
export type Block = { id: string; kind: 'text' | 'exercise'; title: string; body: string; exercise?: string | Exercise | null };
export type Lesson = { id: string; title: string; summary: string; blocks: Block[]; release_count?: number };
export type Answer = { code?: string; selected?: string[]; text?: string; commands?: string[] };
export type Progress = { completed_blocks: string[]; attempts: number; hints_used: number };
export type Release = Lesson & { version: number; progress: Progress; drafts: Record<string, Answer>; hints: Record<string, string[]> };
export type CatalogItem = { lesson_id: string; release_id: string; title: string; summary: string; version: number; task_count: number; progress: Progress };
export type AttemptResult = { id: string; correct: boolean; feedback: string; verification: string; hints_used: number };
