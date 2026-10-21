"""These tests also run with plain Python, before Django dependencies are installed."""
import copy
import json
from pathlib import Path
import unittest

from learning.domain import ContentError, grade, public_exercise, public_snapshot, validate_answer, validate_exercise, validate_world

BUNDLE = json.loads((Path(__file__).resolve().parents[1] / "content/robot-introduction.json").read_text())


def exercise(key):
    return copy.deepcopy(next(item for item in BUNDLE["exercises"] if item["key"] == key))


class ContentTests(unittest.TestCase):
    def test_all_seed_exercises_are_valid(self):
        for item in BUNDLE["exercises"]:
            with self.subTest(key=item["key"]):
                validate_exercise(item)

    def test_seed_lesson_references_existing_exercises(self):
        keys = {item["key"] for item in BUNDLE["exercises"]}
        for lesson in BUNDLE["lessons"]:
            for block in lesson["blocks"]:
                if block["kind"] == "exercise":
                    self.assertIn(block["exercise_key"], keys)

    def test_world_rejects_unreachable_goal(self):
        world = exercise("robot-loop")["config"]
        world["walls"] = [[2, y] for y in range(world["height"])]
        with self.assertRaisesRegex(ContentError, "нельзя добраться"):
            validate_world(world)

    def test_world_rejects_invalid_dimensions_and_blocked_endpoints(self):
        for patch in [{"width": True}, {"width": 100}, {"goal": [-1, 2]}, {"walls": [[0, 2]]}, {"walls": [[2, 1], [2, 1]]}]:
            world = exercise("robot-loop")["config"]
            world.update(patch)
            with self.subTest(patch=patch), self.assertRaises(ContentError):
                validate_world(world)

    def test_quiz_rejects_unknown_or_duplicate_choice_ids(self):
        for patch in [[], ["unknown"], ["four", "four"]]:
            data = exercise("predict-loop")
            data["rules"]["correct_options"] = patch
            with self.subTest(patch=patch), self.assertRaises(ContentError):
                validate_exercise(data)

    def test_private_fields_never_leak_even_from_unknown_config_keys(self):
        data = exercise("predict-loop")
        data["config"]["correct_options"] = ["four"]
        public = public_exercise(data)
        self.assertNotIn("rules", public)
        self.assertNotIn("hints", public)
        self.assertNotIn("correct_options", public["config"])
        self.assertEqual(public["hint_count"], 2)

    def test_public_snapshot_does_not_mutate_saved_snapshot(self):
        snapshot = {"blocks": [{"kind": "exercise", "exercise": exercise("robot-loop")}]}
        public_snapshot(snapshot)
        self.assertIn("rules", snapshot["blocks"][0]["exercise"])

    def test_invalid_hint_content_is_rejected(self):
        data = exercise("robot-loop")
        for hints in [[""], ["x"] * 5, [42]]:
            data["hints"] = hints
            with self.subTest(hints=hints), self.assertRaises(ContentError):
                validate_exercise(data)


class GradingTests(unittest.TestCase):
    def test_quiz_correct_and_incorrect(self):
        self.assertTrue(grade(exercise("predict-loop"), {"selected": ["four"]})[0])
        self.assertFalse(grade(exercise("predict-loop"), {"selected": ["three"]})[0])

    def test_quiz_rejects_forged_answer(self):
        with self.assertRaises(ContentError):
            grade(exercise("predict-loop"), {"selected": ["not-an-option"]})

    def test_quiz_multiple_answers_ignores_order(self):
        data = exercise("predict-loop")
        data["config"]["multiple"] = True
        data["rules"]["correct_options"] = ["three", "four"]
        self.assertTrue(grade(data, {"selected": ["four", "three"]})[0])
        self.assertFalse(grade(data, {"selected": ["four"]})[0])

    def test_short_answer_normalization(self):
        data = {"kind": "short_answer", "rules": {"answers": ["Python"]}}
        self.assertTrue(grade(data, {"text": "  PYTHON "})[0])
        data["rules"]["case_sensitive"] = True
        self.assertFalse(grade(data, {"text": "python"})[0])

    def test_robot_accepts_valid_for_loop(self):
        answer = {"code": "from robot import *\nfor i in range(4):\n    forward()", "commands": ["forward"] * 4}
        result = grade(exercise("robot-loop"), answer)
        self.assertTrue(result[0])
        self.assertEqual(result[2], "client_trace")

    def test_robot_accepts_alternative_while_loop(self):
        answer = {"code": "from robot import *\nwhile not at_goal():\n    forward()", "commands": ["forward"] * 4}
        self.assertTrue(grade(exercise("robot-loop"), answer)[0])

    def test_robot_rejects_stopping_before_goal(self):
        answer = {"code": "for i in range(2):\n    forward()", "commands": ["forward"] * 2}
        self.assertFalse(grade(exercise("robot-loop"), answer)[0])

    def test_robot_loop_is_required_only_when_requested(self):
        answer = {"code": "forward()\n" * 4, "commands": ["forward"] * 4}
        self.assertFalse(grade(exercise("robot-loop"), answer)[0])
        self.assertTrue(grade(exercise("robot-experiment"), answer)[0])

    def test_robot_wall_and_boundary_collisions(self):
        data = exercise("robot-experiment")
        for commands in [["left", "forward", "forward", "right", "forward", "forward"], ["forward"] * 7]:
            with self.subTest(commands=commands):
                self.assertFalse(grade(data, {"code": "pass", "commands": commands})[0])

    def test_robot_transfer_route(self):
        answer = {"code": "for i in range(5):\n    forward()\nturn_left()\nfor i in range(3):\n    forward()",
                  "commands": ["forward"] * 5 + ["left"] + ["forward"] * 3}
        self.assertTrue(grade(exercise("robot-transfer"), answer)[0])

    def test_robot_rejects_forged_commands_and_overlong_trace(self):
        for commands in [["teleport"], ["forward"] * 1001, None]:
            with self.subTest(commands=commands), self.assertRaises(ContentError):
                grade(exercise("robot-experiment"), {"code": "pass", "commands": commands})

    def test_robot_returns_syntax_feedback_without_running_python(self):
        result = grade(exercise("robot-loop"), {"code": "for :", "commands": []})
        self.assertFalse(result[0])
        self.assertIn("строке 1", result[1])

    def test_invalid_answers_and_large_code_rejected(self):
        for answer in [None, [], {"code": "x" * 20001}, {"code": 12}]:
            with self.subTest(answer_type=type(answer)), self.assertRaises(ContentError):
                validate_answer(exercise("robot-loop"), answer)

    def test_drafts_allow_incomplete_python(self):
        self.assertEqual(validate_answer(exercise("robot-loop"), {"code": "for "}), {"code": "for "})


if __name__ == "__main__":
    unittest.main()
