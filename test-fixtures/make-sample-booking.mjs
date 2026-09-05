// Builds a small, valid one-page PDF that looks like a flight booking
// confirmation, for testing document extraction without real personal data.
// Usage: node test-fixtures/make-sample-booking.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lines = [
  ['Helvetica-Bold', 18, 'Qantas Airways  -  Booking Confirmation'],
  ['Helvetica', 11, 'Booking reference: K7Q2XR'],
  ['Helvetica', 11, 'Passengers: 2 adults, 2 children (names as per passports)'],
  ['Helvetica', 11, 'Issued: 1 September 2026'],
  ['Helvetica', 6, ' '],
  ['Helvetica-Bold', 13, 'Outbound  -  Monday 12 October 2026'],
  ['Helvetica', 11, 'QF43  Melbourne (MEL) Terminal 1  to  Denpasar (DPS)'],
  ['Helvetica', 11, 'Departs 10:05 AEDT     Arrives 13:25 WITA     Duration 6h 20m'],
  ['Helvetica', 11, 'Seats 23A, 23B, 23C, 23D    Economy    Baggage 30 kg per person'],
  ['Helvetica', 6, ' '],
  ['Helvetica-Bold', 13, 'Return  -  Monday 19 October 2026'],
  ['Helvetica', 11, 'QF44  Denpasar (DPS)  to  Melbourne (MEL) Terminal 1'],
  ['Helvetica', 11, 'Departs 14:35 WITA     Arrives 23:35 AEDT     Duration 6h 00m'],
  ['Helvetica', 11, 'Seats 23A, 23B, 23C, 23D    Economy    Baggage 30 kg per person'],
  ['Helvetica', 6, ' '],
  ['Helvetica', 11, 'Total paid: AUD 2,148.00 (includes taxes and charges)'],
  ['Helvetica', 10, 'This is a sample document generated for testing. It is not a real ticket.'],
];

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

let y = 780;
const ops = ['BT'];
for (const [font, size, text] of lines) {
  y -= size + 8;
  const f = font === 'Helvetica-Bold' ? '/F2' : '/F1';
  ops.push(`${f} ${size} Tf`, `1 0 0 1 56 ${y} Tm`, `(${esc(text)}) Tj`);
}
ops.push('ET');
const stream = ops.join('\n');

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
];

let pdf = '%PDF-1.4\n%âãÏÓ\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, 'latin1'));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const out = join(dirname(fileURLToPath(import.meta.url)), 'sample-flight-booking.pdf');
writeFileSync(out, Buffer.from(pdf, 'latin1'));
console.log(`wrote ${out} (${Buffer.byteLength(pdf, 'latin1')} bytes)`);
