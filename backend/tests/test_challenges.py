import ast
import copy
import json
from pathlib import Path
import unittest

from learning.domain import ContentError, count_code_commands, grade, public_exercise, validate_exercise

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = json.loads((ROOT / "content/robot-challenges.json").read_text())
SOLUTIONS = json.loads((ROOT / "tests/fixtures/robot-challenge-solutions.json").read_text())
EXERCISES = {exercise["key"]: exercise for exercise in BUNDLE["exercises"]}


def commands(solution):
    return [command for _ in range(solution.get("repeat", 1))
            for command, count in solution["segments"] for _ in range(count)]


class ChallengeContentTests(unittest.TestCase):
    def test_four_lessons_have_unique_references_and_four_exercises_each(self):
        self.assertEqual(len(BUNDLE["lessons"]), 4)
        self.assertEqual(len(EXERCISES), len(BUNDLE["exercises"]))
        used = []
        for lesson in BUNDLE["lessons"]:
            blocks = [block for block in lesson["blocks"] if block["kind"] == "exercise"]
            self.assertEqual(len(blocks), 4)
            for block in blocks:
                self.assertIn(block["exercise_key"], EXERCISES)
                used.append(block["exercise_key"])
        self.assertEqual(set(used), set(EXERCISES))

    def test_all_exercises_validate_and_have_progressive_hints(self):
        for exercise in EXERCISES.values():
            with self.subTest(key=exercise["key"]):
                validate_exercise(exercise)
                self.assertGreaterEqual(len(exercise["hints"]), 3)
                if exercise["kind"] == "robot":
                    self.assertNotIn("from robot import", exercise["starter_code"])

    def test_every_robot_has_a_solution_within_both_budgets_and_no_function_definitions(self):
        robots = {key for key, item in EXERCISES.items() if item["kind"] == "robot"}
        self.assertEqual(robots, {solution["key"] for solution in SOLUTIONS})
        for solution in SOLUTIONS:
            with self.subTest(key=solution["key"]):
                tree = ast.parse(solution["code"])
                self.assertFalse(any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) for node in ast.walk(tree)))
                self.assertEqual(count_code_commands(tree), solution["written"])
                result = grade(EXERCISES[solution["key"]], {"code": solution["code"], "commands": commands(solution)})
                self.assertTrue(result[0], result[1])

    def test_written_budget_rejects_copying_even_when_route_is_correct(self):
        exercise = copy.deepcopy(EXERCISES["courier-six-steps"])
        exercise["rules"]["require_loop"] = False
        result = grade(exercise, {"code": "from robot import *\n" + "forward()\n" * 6, "commands": ["forward"] * 6})
        self.assertFalse(result[0])
        self.assertIn("В программе 6", result[1])

    def test_route_budget_rejects_unnecessary_turns_even_when_goal_is_reached(self):
        exercise = copy.deepcopy(EXERCISES["courier-six-steps"])
        exercise["rules"].pop("max_code_commands")
        result = grade(exercise, {"code": "for step in range(6):\n    forward()\nfor turn in range(4):\n    turn_right()",
                                  "commands": ["forward"] * 6 + ["right"] * 4})
        self.assertFalse(result[0])
        self.assertIn("10 действий", result[1])

    def test_command_counter_handles_semicolons_comments_imports_and_aliases(self):
        cases = [
            ("forward(); forward()\n# forward()", 2),
            ("for i in range(6):\n    forward()", 1),
            ("import robot as r\nr.forward()\nr.turn_left()", 2),
            ("from robot import forward as go\ngo()", 1),
            ("step = forward\nmove = step\nmove()\nmove()", 2),
            ("if can_move() and not at_goal():\n    forward()", 1),
        ]
        for code, expected in cases:
            with self.subTest(code=code):
                self.assertEqual(count_code_commands(ast.parse(code)), expected)

    def test_invalid_budgets_rejected_and_valid_limits_are_public(self):
        for value in [0, -1, True, "4", 1001]:
            exercise = copy.deepcopy(EXERCISES["courier-six-steps"])
            exercise["rules"]["max_code_commands"] = value
            with self.subTest(value=value), self.assertRaises(ContentError):
                validate_exercise(exercise)
        public = public_exercise(EXERCISES["courier-six-steps"])
        self.assertEqual(public["requirements"]["max_code_commands"], 1)
        self.assertEqual(public["requirements"]["max_commands"], 6)
        self.assertNotIn("rules", public)


if __name__ == "__main__":
    unittest.main()
