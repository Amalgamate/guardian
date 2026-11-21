export const guardianExamSeries2006 = [
  { id: 'guardian-2006-t1-opener', term: 'Term 1', exam: 'Opener', subject: 'Mathematics', pages: 12, questions: 40 },
  { id: 'guardian-2006-t1-midterm', term: 'Term 1', exam: 'Midterm', subject: 'English', pages: 10, questions: 35 },
  { id: 'guardian-2006-t1-closing', term: 'Term 1', exam: 'Closing', subject: 'Integrated Science', pages: 14, questions: 45 },
  { id: 'guardian-2006-t2-opener', term: 'Term 2', exam: 'Opener', subject: 'Kiswahili', pages: 10, questions: 34 },
  { id: 'guardian-2006-t2-midterm', term: 'Term 2', exam: 'Midterm', subject: 'Mathematics', pages: 12, questions: 40 },
  { id: 'guardian-2006-t2-closing', term: 'Term 2', exam: 'Closing', subject: 'English', pages: 11, questions: 38 },
  { id: 'guardian-2006-t3-opener', term: 'Term 3', exam: 'Opener', subject: 'Integrated Science', pages: 12, questions: 39 },
  { id: 'guardian-2006-t3-midterm', term: 'Term 3', exam: 'Midterm', subject: 'Kiswahili', pages: 10, questions: 35 },
  { id: 'guardian-2006-t3-closing', term: 'Term 3', exam: 'Closing', subject: 'Mathematics', pages: 15, questions: 50 },
] as const

export const guardianGradeOptions = [
  ...Array.from({ length: 9 }, (_, index) => ({ grade: `Grade ${index + 1}`, curriculum: 'CBC', level: index < 6 ? 'Primary' : 'Junior School' })),
  ...Array.from({ length: 4 }, (_, index) => ({ grade: `Form ${index + 1}`, curriculum: '8-4-4', level: 'Secondary' })),
] as const
