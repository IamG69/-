"""Initialize a writable workbook from the bundled synthetic template once."""
import os
import shutil
import tempfile
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parents[1] / 'templates/research-test.xlsx'


def ensure_workbook(destination: Path) -> None:
    destination = Path(destination)
    if destination.resolve() == TEMPLATE.resolve():
        raise RuntimeError('Working workbook must differ from the bundled template')
    if destination.exists():
        if not destination.is_file():
            raise RuntimeError('RESEARCH_WORKBOOK must point to a file')
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=destination.parent, prefix='.workbook-', suffix='.tmp'
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, 'wb') as target, TEMPLATE.open('rb') as source:
            shutil.copyfileobj(source, target)
            target.flush()
            os.fsync(target.fileno())
        # One worker is supported; never overwrite an existing persistent workbook.
        if not destination.exists():
            os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
