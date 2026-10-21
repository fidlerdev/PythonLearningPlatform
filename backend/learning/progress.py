"""Learning analytics derived from attempts, not self-reported client counters."""
from collections import defaultdict
from datetime import timedelta

from django.utils import timezone

from .models import Attempt, Draft, HintUsage
from .services import published_lessons


def student_progress(student):
    attempts = list(Attempt.objects.filter(student=student).select_related("release").order_by("created_at", "id"))
    hints = list(HintUsage.objects.filter(student=student))
    drafts = list(Draft.objects.filter(student=student))
    by_task = defaultdict(list)
    hints_by_task = defaultdict(int)
    last_by_task = {}
    activity = []
    for attempt in attempts:
        key = (attempt.release_id, str(attempt.block_id))
        by_task[key].append(attempt)
        last_by_task[key] = attempt.created_at
        activity.append(attempt.created_at)
    for item in [*hints, *drafts]:
        key = (item.release_id, str(item.block_id))
        date = item.created_at if isinstance(item, HintUsage) else item.updated_at
        last_by_task[key] = max(last_by_task.get(key, date), date)
        activity.append(date)
        if isinstance(item, HintUsage):
            hints_by_task[key] += 1

    lifetime_solved = lifetime_independent = recovered = 0
    solved_by_release = defaultdict(set)
    for task_attempts in by_task.values():
        first_correct = next((attempt for attempt in task_attempts if attempt.correct), None)
        if first_correct:
            solved_by_release[first_correct.release_id].add(str(first_correct.block_id))
            lifetime_solved += 1
            lifetime_independent += first_correct.hints_used == 0
            recovered += any(not attempt.correct for attempt in task_attempts[:task_attempts.index(first_correct)])
    historical_releases = {attempt.release_id: attempt.release for attempt in attempts}
    completed_before = any(
        {block["id"] for block in release.snapshot["blocks"] if block["kind"] == "exercise"}
        and {block["id"] for block in release.snapshot["blocks"] if block["kind"] == "exercise"}.issubset(solved_by_release[release.id])
        for release in historical_releases.values()
    )

    lessons = []
    for lesson in published_lessons():
        release = lesson.releases.all()[0]
        tasks = []
        for block in release.snapshot["blocks"]:
            if block["kind"] != "exercise":
                continue
            key = (release.id, block["id"])
            history = by_task[key]
            first_correct = next((attempt for attempt in history if attempt.correct), None)
            last = history[-1] if history else None
            tasks.append({
                "id": block["id"], "title": block["title"] or block["exercise"]["title"],
                "kind": block["exercise"]["kind"],
                "status": "solved" if first_correct else "practicing" if key in last_by_task else "not_started",
                "attempts": len(history), "hints_used": hints_by_task[key],
                "independent": first_correct.hints_used == 0 if first_correct else None,
                "needs_support": not first_correct and len(history) >= 2,
                "last_feedback": last.feedback if last else "",
                "last_activity": last_by_task[key].isoformat() if key in last_by_task else None,
            })
        dates = [task["last_activity"] for task in tasks if task["last_activity"]]
        solved = sum(task["status"] == "solved" for task in tasks)
        lessons.append({
            "release_id": str(release.id), "title": release.snapshot["title"], "version": release.version,
            "section": lesson.section, "tags": lesson.tags, "tasks": tasks, "total": len(tasks), "solved": solved,
            "attempts": sum(task["attempts"] for task in tasks),
            "hints_used": sum(task["hints_used"] for task in tasks),
            "independent": sum(task["independent"] is True for task in tasks),
            "started": any(task["status"] != "not_started" for task in tasks),
            "completed": bool(tasks) and solved == len(tasks),
            "last_activity": max(dates) if dates else None,
        })
    total = sum(lesson["total"] for lesson in lessons)
    solved = sum(lesson["solved"] for lesson in lessons)
    summary = {
        "total_tasks": total, "solved_tasks": solved, "percent": round(100 * solved / total) if total else 0,
        "total_lessons": len(lessons), "completed_lessons": sum(lesson["completed"] for lesson in lessons),
        "started_lessons": sum(lesson["started"] for lesson in lessons),
        "independent_tasks": sum(lesson["independent"] for lesson in lessons),
        "attempts": sum(lesson["attempts"] for lesson in lessons),
        "hints_used": sum(lesson["hints_used"] for lesson in lessons),
    }
    in_progress = sorted([lesson for lesson in lessons if lesson["started"] and not lesson["completed"]], key=lambda lesson: lesson["last_activity"] or "", reverse=True)
    remaining = [lesson for lesson in lessons if not lesson["completed"]]
    next_lesson = (in_progress or remaining or [None])[0]
    recommendation = None
    if next_lesson:
        next_task = next(task for task in next_lesson["tasks"] if task["status"] != "solved")
        recommendation = {"release_id": next_lesson["release_id"], "block_id": next_task["id"], "title": next_lesson["title"], "task": next_task["title"], "started": next_lesson["started"]}
    today = timezone.localdate()
    week = []
    for days_ago in range(6, -1, -1):
        date = today - timedelta(days=days_ago)
        day_attempts = [attempt for attempt in attempts if timezone.localdate(attempt.created_at) == date]
        week.append({"date": date.isoformat(), "attempts": len(day_attempts), "correct": sum(attempt.correct for attempt in day_attempts)})
    return {
        "summary": summary, "lessons": lessons, "recommendation": recommendation,
        "lifetime": {"solved_tasks": lifetime_solved, "independent_tasks": lifetime_independent,
                     "recovered_tasks": recovered, "attempts": len(attempts), "hints_used": len(hints),
                     "active_days": len({timezone.localdate(date) for date in activity}),
                     "last_activity": max(activity).isoformat() if activity else None},
        "week": week,
        "achievements": [
            {"id": "first", "title": "Первое открытие", "description": "Решить первое задание", "unlocked": lifetime_solved >= 1},
            {"id": "persistent", "title": "Я разобрался!", "description": "Исправить решение после неудачной попытки", "unlocked": recovered >= 1},
            {"id": "independent", "title": "Своим умом", "description": "Решить 3 задания без подсказок", "unlocked": lifetime_independent >= 3},
            {"id": "lesson", "title": "Маршрут пройден", "description": "Завершить все задания одного урока", "unlocked": completed_before},
        ],
        "recent": [{"id": str(attempt.id), "lesson": attempt.release.snapshot["title"], "version": attempt.release.version,
                    "correct": attempt.correct, "feedback": attempt.feedback, "hints_used": attempt.hints_used,
                    "created_at": attempt.created_at.isoformat()} for attempt in reversed(attempts[-12:])],
    }
