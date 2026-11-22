"""Generate fictional PDF and photo reports; no clinical reference ranges."""
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / 'fixtures'


def generate() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    manifest = []
    for i in range(40):
        photo = i >= 32
        name = f'synthetic-{i + 1:02d}.{"png" if photo else "pdf"}'
        glucose, a1c, sodium = 60 + i * 4, round(4.0 + i / 10, 1), 130 + i % 20
        label = ['Glucose', 'Fasting glucose', 'Blood glucose', 'Fasting blood glucose'][i % 4]
        lines = ['CARELOOP SYNTHETIC REPORT - NOT A REAL PATIENT', f'Fictional sample {i + 1:02d}', f'{label}: {glucose} mg/dL', f'HbA1c: {a1c} %', f'Sodium: {sodium} mmol/L']
        expected = [{'testCode': 'glucose', 'value': glucose, 'unit': 'mg/dL', 'comparator': '='}, {'testCode': 'hba1c', 'value': a1c, 'unit': '%', 'comparator': '='}, {'testCode': 'sodium', 'value': sodium, 'unit': 'mmol/L', 'comparator': '='}]
        if i == 30:
            lines[2] = f'{label}: {glucose}'
            expected = expected[1:]
        if i == 31:
            lines[2] = f'{label}: > {glucose} mg/dL'
            expected[0]['comparator'] = '>'
        if photo:
            image = Image.new('RGB', (1800, 750), 'white')
            draw = ImageDraw.Draw(image)
            font_path = next((p for p in [Path('C:/Windows/Fonts/arial.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')] if p.exists()), None)
            font = ImageFont.truetype(str(font_path), 36) if font_path else ImageFont.load_default(size=36)
            for y, line in enumerate(lines):
                draw.text((70, 70 + y * 100), line, fill='black', font=font)
            image.save(FIXTURES / name)
        else:
            out = io.BytesIO()
            doc = canvas.Canvas(out)
            doc.setFont('Helvetica', 12)
            for y, line in enumerate(lines):
                doc.drawString(35, 780 - y * 40, line)
            doc.save()
            (FIXTURES / name).write_bytes(out.getvalue())
        manifest.append({'file': name, 'mime': 'image/png' if photo else 'application/pdf', 'expected': expected})
    (FIXTURES / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Generated 32 PDF and 8 photo fixtures, all synthetic.')


if __name__ == '__main__':
    generate()
