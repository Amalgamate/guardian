export type DemoPdfContent = {
  title: string
  subtitle?: string
  curriculum?: string
  grade?: string
  subject?: string
  questions?: string[]
}

function pdfSafe(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1')
}

export function downloadDemoPdf(resource: DemoPdfContent) {
  const q = resource.questions ?? [
    '1. Work out 3/4 + 2/5. Give your answer in its simplest form.',
    '2. A class has 30 learners. If 40% are absent, how many are present?',
    '3. Explain one way that saving water at school helps the community.',
  ]
  const textLines = [
    'THE GUARDIAN EXAMS - SAMPLE RESOURCE',
    resource.title,
    resource.subtitle ?? 'Practice paper and revision resource',
    `${resource.curriculum ?? 'CBC'} | ${resource.grade ?? 'Grade 8'} | ${resource.subject ?? 'Mathematics'}`,
    'DEMO DOWNLOAD - illustrative questions only; not an official examination paper.',
    '',
    ...q,
    '',
    'Answer guidance',
    'Use this sample paper to practise. Review your working and ask a teacher for feedback.',
    '',
    'The Guardian Exams. Prepare. Practise. Perform.',
  ]
  const commands = ['BT', '/F1 18 Tf', '48 750 Td', `(${pdfSafe(textLines[0])}) Tj`, '/F1 14 Tf', '0 -28 Td']
  textLines.slice(1).forEach((line) => commands.push(`0 -${line ? 20 : 11} Td`, `(${pdfSafe(line)}) Tj`))
  commands.push('ET')
  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n` })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  const blob = new Blob([pdf], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${resource.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'examify-sample'}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
