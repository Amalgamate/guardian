import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, BookOpenCheck, Check, ChevronRight, CircleHelp, GraduationCap, Layers3, Plus, RefreshCw, Search, X } from 'lucide-react'
import { academicStructureApi, type AcademicKind, type AcademicRecord, type AcademicStructure } from './academicStructureApi'
import './admin-academic-structure.css'

const sections: Array<{ id: AcademicKind; label: string; singular: string; description: string }> = [
  { id: 'curricula', label: 'Curricula', singular: 'Curriculum', description: 'The national or examination framework, such as CBC or 8-4-4.' },
  { id: 'levels', label: 'Education levels', singular: 'Level', description: 'Stages within a curriculum, such as Primary or Junior School.' },
  { id: 'grades', label: 'Grades & forms', singular: 'Grade or form', description: 'The class level used for school placement, papers, and reporting.' },
  { id: 'subjects', label: 'Subjects', singular: 'Subject', description: 'Curriculum subjects used to classify teaching and exam content.' },
  { id: 'terms', label: 'Terms', singular: 'Term', description: 'Academic periods used to schedule, filter, and report on learning.' },
]
const emptyStructure: AcademicStructure = { curricula: [], levels: [], grades: [], subjects: [], terms: [], gradeSubjects: [] }

export default function AdminAcademicStructure() {
  const [structure, setStructure] = useState<AcademicStructure>(emptyStructure)
  const [section, setSection] = useState<AcademicKind>('curricula')
  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<AcademicRecord | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setStructure(await academicStructureApi.get()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the academic structure.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const activeSection = sections.find((item) => item.id === section) ?? sections[0]
  const records = useMemo(() => (structure[section] as AcademicRecord[])
    .filter((record) => includeArchived || record.status === 'active')
    .filter((record) => `${record.name} ${record.code ?? ''} ${record.curriculumName ?? ''} ${record.levelName ?? ''}`.toLowerCase().includes(query.toLowerCase())), [structure, section, includeArchived, query])
  const openCreate = () => {
    setEditing(null)
    setDraft(section === 'curricula' ? { code: '', name: '', description: '' } : section === 'levels' || section === 'subjects' || section === 'terms' ? { curriculumId: structure.curricula.find((item) => item.status === 'active')?.id ?? '', name: '', sortOrder: section === 'terms' ? '1' : '0', code: '' } : { levelId: structure.levels.find((item) => item.status === 'active')?.id ?? '', name: '', sortOrder: '0' })
    setError('')
    setEditorOpen(true)
  }
  const openEdit = (record: AcademicRecord) => {
    setEditing(record)
    setDraft({ name: record.name, code: record.code ?? '', description: record.description ?? '', curriculumId: record.curriculumId ?? '', levelId: record.levelId ?? '', sortOrder: String(record.sortOrder ?? 0), status: record.status })
    setError('')
    setEditorOpen(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const input: Record<string, string | number | null> = { name: draft.name.trim() }
    if (section === 'curricula') Object.assign(input, { code: draft.code.trim(), description: draft.description.trim() || null })
    if (section === 'levels' || section === 'subjects' || section === 'terms') Object.assign(input, { curriculumId: draft.curriculumId, sortOrder: Number(draft.sortOrder || 0) })
    if (section === 'grades') Object.assign(input, { levelId: draft.levelId, sortOrder: Number(draft.sortOrder || 0) })
    if (section === 'subjects') input.code = draft.code.trim() || ''
    if (editing) Object.assign(input, { status: draft.status })
    try {
      if (editing) await academicStructureApi.update(section, editing.id, input)
      else await academicStructureApi.create(section, input)
      setEditorOpen(false)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this academic record.') }
    finally { setSaving(false) }
  }
  const archiveRecord = async (record: AcademicRecord) => {
    if (!window.confirm(`Archive “${record.name}”? It will no longer appear in new forms, but existing records will be preserved.`)) return
    setError('')
    try { await academicStructureApi.archive(section, record.id); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not archive this record.') }
  }
  const countFor = (kind: AcademicKind) => structure[kind].filter((record) => record.status === 'active').length
  const parentName = (record: AcademicRecord) => record.curriculumName ?? record.levelName ?? '—'

  return <section className="ws-card aas-screen">
    <header className="aas-heading"><div><span className="ws-kicker">PLATFORM CONFIGURATION</span><h2>Academic structure</h2><p>Maintain the shared curriculum catalogue used to classify school classes, papers, assessments, and reports.</p></div><button className="ws-button ws-light" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/> Refresh</button></header>
    {error && !editorOpen && <p className="aas-error" role="alert">{error}</p>}
    <div className="aas-purpose"><span><CircleHelp size={19}/></span><div><strong>Why this matters</strong><p>Admins maintain the master list. Schools select the levels and grades they teach; teachers use those selections on exams and resources; the marketplace and reports use the same terms and subjects for filters and grouping.</p></div></div>
    <div className="aas-steps" aria-label="Academic structure hierarchy"><span><BookOpenCheck size={15}/> Curriculum</span><ChevronRight size={15}/><span><Layers3 size={15}/> Education level</span><ChevronRight size={15}/><span><GraduationCap size={15}/> Grade or form</span><ChevronRight size={15}/><span><BookOpenCheck size={15}/> Subject & term</span></div>
    <div className="aas-summary">{sections.map((item) => <button className={`aas-summary-card ${section === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSection(item.id); setQuery('') }}><span>{item.label}</span><strong>{countFor(item.id)}</strong><small>active</small></button>)}</div>
    <div className="aas-list-header"><div><span className="ws-kicker">MASTER DATA</span><h3>{activeSection.label}</h3><p>{activeSection.description}</p></div><button className="ws-button ws-primary" onClick={openCreate}><Plus size={15}/> Add {activeSection.singular.toLowerCase()}</button></div>
    <div className="aas-controls"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeSection.label.toLowerCase()}`}/></label><label className="aas-archived-toggle"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)}/> Show archived</label></div>
    {loading ? <div className="ws-admin-empty"><RefreshCw size={17}/><span>Loading academic records…</span></div> : records.length === 0 ? <div className="ws-admin-empty"><Layers3 size={20}/><strong>{query ? 'No matching records' : `No ${activeSection.label.toLowerCase()} added yet`}</strong><small>{query ? 'Adjust your search or clear it to see all records.' : `Add your first ${activeSection.singular.toLowerCase()} to start building the catalogue.`}</small>{!query && <button className="ws-button ws-primary" onClick={openCreate}><Plus size={14}/> Add {activeSection.singular.toLowerCase()}</button>}</div> : <div className="aas-table-wrap"><table className="aas-table"><thead><tr><th>Name</th>{section === 'curricula' || section === 'subjects' ? <th>Code</th> : <th>Belongs to</th>}{section !== 'curricula' && section !== 'subjects' && <th>Order</th>}<th>Status</th><th>Actions</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.name}</strong>{section === 'curricula' && record.description && <small>{record.description}</small>}</td>{section === 'curricula' || section === 'subjects' ? <td><span className="aas-code">{record.code || '—'}</span></td> : <td>{parentName(record)}</td>}{section !== 'curricula' && section !== 'subjects' && <td>{record.sortOrder ?? 0}</td>}<td><span className={`aas-status aas-status-${record.status}`}>{record.status}</span></td><td><div className="aas-row-actions"><button className="ws-button ws-light" onClick={() => openEdit(record)}>Edit</button>{record.status === 'active' && <button className="aas-archive-button" onClick={() => void archiveRecord(record)} aria-label={`Archive ${record.name}`} title="Archive"><Archive size={15}/></button>}</div></td></tr>)}</tbody></table></div>}
    <div className="aas-usage-note"><Check size={16}/><span><strong>One shared source of truth</strong><small>New records are available from the signed-in admin data endpoint immediately. Active records are exposed through the public structure endpoint for teacher forms and customer filters; archived records stay attached to existing work.</small></span></div>
    {editorOpen && <div className="aas-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditorOpen(false) }}><form className="aas-editor" role="dialog" aria-modal="true" aria-labelledby="aas-editor-title" onSubmit={(event) => void save(event)}><header><div><span className="ws-kicker">{editing ? 'UPDATE MASTER DATA' : 'ADD MASTER DATA'}</span><h3 id="aas-editor-title">{editing ? `Edit ${activeSection.singular.toLowerCase()}` : `Add ${activeSection.singular.toLowerCase()}`}</h3></div><button type="button" className="aas-close" onClick={() => setEditorOpen(false)} aria-label="Close form"><X size={18}/></button></header>
      {section === 'curricula' && <><label>Curriculum name<input autoFocus required maxLength={120} value={draft.name ?? ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Competency Based Curriculum"/></label><label>Short code<input required maxLength={40} value={draft.code ?? ''} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="e.g. CBC"/></label><label>Description <small>Optional</small><textarea rows={3} maxLength={1000} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Purpose or scope of this curriculum"/></label></>}
      {section !== 'curricula' && <><label>{section === 'grades' ? 'Education level' : 'Curriculum'}<select required value={section === 'grades' ? draft.levelId ?? '' : draft.curriculumId ?? ''} onChange={(event) => setDraft({ ...draft, [section === 'grades' ? 'levelId' : 'curriculumId']: event.target.value })}><option value="">Choose a parent record</option>{section === 'grades' ? structure.levels.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.curriculumName} · {item.name}</option>) : structure.curricula.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label><label>{activeSection.singular}<input autoFocus required maxLength={120} value={draft.name ?? ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={section === 'grades' ? 'e.g. Grade 7 or Form 2' : section === 'levels' ? 'e.g. Junior School' : section === 'subjects' ? 'e.g. Integrated Science' : 'e.g. Term 1'}/></label>{section === 'subjects' && <label>Subject code <small>Optional</small><input maxLength={40} value={draft.code ?? ''} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="e.g. SCI"/></label>}{['levels', 'grades', 'terms'].includes(section) && <label>Display order<input type="number" min="0" max="999" value={draft.sortOrder ?? '0'} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}/><small>Lower numbers appear first in forms.</small></label>}</>}
      {editing && <label>Visibility<select value={draft.status ?? 'active'} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="active">Active</option><option value="archived">Archived</option></select></label>}
      {error && <p className="aas-error" role="alert">{error}</p>}<footer><button type="button" className="ws-button ws-light" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="ws-button ws-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add record'} <Check size={14}/></button></footer>
    </form></div>}
  </section>
}
