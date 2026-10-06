import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class ApprovedSchemaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = json.loads((ROOT / 'app/schema.json').read_text())
        cls.rules = json.loads((ROOT / 'docs/approved-research-rules.json').read_text())

    def field(self, section, name):
        return next(f for s in self.schema if s['name'] == section for f in s['fields'] if f['name'] == name)

    def test_birads_zero_and_five_six_are_available_on_both_sides(self):
        for name in ['BI-RADS справа', 'BI-RADS слева']:
            self.assertEqual([x['value'] for x in self.field('Скрининг', name)['options']], list(range(7)))

    def test_risk_labels_follow_approved_categories(self):
        self.assertEqual([x['label'] for x in self.field('Пациенты', 'СС риск записанный')['options']],
                         ['1 · низкий', '2 · относительный', '3 · высокий', '4 · очень высокий'])

    def test_excluded_and_merged_actions_cannot_be_selected(self):
        options = self.field('Рекомендации врача', 'Код рекомендации')['options']
        codes = {x['value'] for x in options}
        self.assertFalse(codes & set(self.rules['inactive']))
        self.assertTrue({'BP02', 'D13', 'D14', 'ONC09'} <= codes)

    def test_no_new_input_columns_or_calculated_health_group(self):
        self.assertEqual(len(self.field('Пациенты', 'СС риск записанный')['options']), 4)
        self.assertFalse(any('Группы здоровья расчётные' == s['name'] for s in self.schema))
        self.assertFalse(any(f['name'] in {'ПСА', 'HbA1c'} for s in self.schema for f in s['fields']))

if __name__ == '__main__':
    unittest.main()
