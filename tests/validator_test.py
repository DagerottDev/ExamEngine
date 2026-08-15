import copy
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / ".agents/skills/mcq-pack-generator/scripts/validate_pack.py"
spec = importlib.util.spec_from_file_location("validator", VALIDATOR_PATH)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class ValidatorParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sample = json.loads((ROOT / "mcq-exam-website/sample-mcq-pack.json").read_text(encoding="utf-8"))

    def test_sample_is_valid(self):
        errors, _ = validator.validate_data(copy.deepcopy(self.sample))
        self.assertEqual(errors, [])

    def test_boolean_id_is_rejected(self):
        pack = copy.deepcopy(self.sample)
        pack["questions"][0]["id"] = True
        errors, _ = validator.validate_data(pack)
        self.assertTrue(any("booleans are invalid" in e for e in errors))

    def test_single_and_multi_answers_are_mutually_exclusive(self):
        pack = copy.deepcopy(self.sample)
        pack["questions"][0]["answerIndices"] = [0, 1]
        errors, _ = validator.validate_data(pack)
        self.assertTrue(any("exactly one" in e for e in errors))

    def test_total_marks_must_match_calculated_maximum(self):
        pack = copy.deepcopy(self.sample)
        pack["exam"]["totalMarks"] = 999
        errors, _ = validator.validate_data(pack)
        self.assertTrue(any("does not equal calculated maximum" in e for e in errors))

    def test_unknown_section_is_rejected(self):
        pack = copy.deepcopy(self.sample)
        pack["questions"][0]["sectionId"] = "missing"
        errors, _ = validator.validate_data(pack)
        self.assertTrue(any("unknown section" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
