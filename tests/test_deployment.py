import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.start import hosting_port
from app.storage import ensure_workbook


class DeploymentTests(unittest.TestCase):
    def test_hosting_port_default_and_override(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(hosting_port(), 8000)
        with patch.dict(os.environ, {'PORT': '10000'}):
            self.assertEqual(hosting_port(), 10000)
        for value in ['bad', '0', '65536']:
            with patch.dict(os.environ, {'PORT': value}):
                with self.assertRaises(ValueError):
                    hosting_port()

    def test_initialize_once_and_preserve_existing_workbook(self):
        with tempfile.TemporaryDirectory() as folder:
            template = Path(folder) / 'template.xlsx'
            template.write_bytes(b'synthetic test template')
            destination = Path(folder) / 'disk' / 'working.xlsx'
            with patch('app.storage.TEMPLATE', template):
                ensure_workbook(destination)
                self.assertEqual(destination.read_bytes(), template.read_bytes())
                destination.write_bytes(b'user test edits')
                ensure_workbook(destination)
                self.assertEqual(destination.read_bytes(), b'user test edits')
                self.assertFalse(list(destination.parent.glob('*.tmp')))

    def test_template_cannot_be_used_as_writable_workbook(self):
        with tempfile.TemporaryDirectory() as folder:
            template = Path(folder) / 'template.xlsx'
            template.write_bytes(b'synthetic template')
            with patch('app.storage.TEMPLATE', template):
                with self.assertRaises(RuntimeError):
                    ensure_workbook(template)
            self.assertEqual(template.read_bytes(), b'synthetic template')

    def test_reject_directory_as_workbook(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(RuntimeError):
                ensure_workbook(Path(folder))


if __name__ == '__main__':
    unittest.main()
