const kinds = {
  curricula: { table: 'academic_curricula', label: 'curriculum' },
  levels: { table: 'academic_levels', label: 'level' },
  grades: { table: 'academic_grades', label: 'grade' },
  subjects: { table: 'academic_subjects', label: 'subject' },
  terms: { table: 'academic_terms', label: 'term' },
}

export async function handleAcademicStructureRequest(context) {
  const { request, response, url, path, method, payload, db, prepare, getAuth, requireRole, audit, now, sendJson, fail } = context

  if (method === 'GET' && path === '/api/public/academic-structure') {
    const [curricula, levels, grades, subjects, terms] = await Promise.all([
      db.many(`SELECT id,code,name,description FROM academic_curricula WHERE status='active' ORDER BY name`),
      db.many(`SELECT id,curriculum_id AS "curriculumId",name,sort_order AS "sortOrder" FROM academic_levels WHERE status='active' ORDER BY sort_order,name`),
      db.many(`SELECT id,level_id AS "levelId",name,sort_order AS "sortOrder" FROM academic_grades WHERE status='active' ORDER BY sort_order,name`),
      db.many(`SELECT id,curriculum_id AS "curriculumId",code,name FROM academic_subjects WHERE status='active' ORDER BY name`),
      db.many(`SELECT id,curriculum_id AS "curriculumId",name,sort_order AS "sortOrder" FROM academic_terms WHERE status='active' ORDER BY sort_order,name`),
    ])
    sendJson(response, 200, { curricula, levels, grades, subjects, terms })
    return true
  }

  if (method === 'GET' && path === '/api/admin/academic-structure') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const [curricula, levels, grades, subjects, terms, gradeSubjects] = await Promise.all([
      db.many(`SELECT id,code,name,description,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM academic_curricula ORDER BY name`),
      db.many(`SELECT l.id,l.curriculum_id AS "curriculumId",c.name AS "curriculumName",l.name,l.sort_order AS "sortOrder",l.status FROM academic_levels l JOIN academic_curricula c ON c.id=l.curriculum_id ORDER BY c.name,l.sort_order,l.name`),
      db.many(`SELECT g.id,g.level_id AS "levelId",l.name AS "levelName",c.id AS "curriculumId",c.name AS "curriculumName",g.name,g.sort_order AS "sortOrder",g.status FROM academic_grades g JOIN academic_levels l ON l.id=g.level_id JOIN academic_curricula c ON c.id=l.curriculum_id ORDER BY c.name,l.sort_order,g.sort_order,g.name`),
      db.many(`SELECT s.id,s.curriculum_id AS "curriculumId",c.name AS "curriculumName",s.code,s.name,s.status FROM academic_subjects s JOIN academic_curricula c ON c.id=s.curriculum_id ORDER BY c.name,s.name`),
      db.many(`SELECT t.id,t.curriculum_id AS "curriculumId",c.name AS "curriculumName",t.name,t.sort_order AS "sortOrder",t.status FROM academic_terms t JOIN academic_curricula c ON c.id=t.curriculum_id ORDER BY c.name,t.sort_order,t.name`),
      db.many(`SELECT gs.grade_id AS "gradeId",gs.subject_id AS "subjectId",gs.marketplace_required AS "marketplaceRequired" FROM academic_grade_subjects gs`),
    ])
    sendJson(response, 200, { curricula, levels, grades, subjects, terms, gradeSubjects })
    return true
  }

  const marketplaceRequiredMatch = path.match(/^\/api\/admin\/academic-structure\/grades\/([0-9a-f-]+)\/marketplace-subjects\/([0-9a-f-]+)$/i)
  if (method === 'PATCH' && marketplaceRequiredMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    if (typeof payload.required !== 'boolean') fail(400, 'MARKETPLACE_SUBJECT_FLAG_INVALID', 'Set required to true or false.')
    const [gradeId, subjectId] = [marketplaceRequiredMatch[1], marketplaceRequiredMatch[2]]
    const updated = await prepare(`UPDATE academic_grade_subjects SET marketplace_required=? WHERE grade_id=? AND subject_id=? RETURNING grade_id AS "gradeId",subject_id AS "subjectId",marketplace_required AS "marketplaceRequired"`).get(payload.required, gradeId, subjectId)
    if (!updated) fail(404, 'GRADE_SUBJECT_LINK_NOT_FOUND', 'That subject is not linked to the selected grade.')
    await audit('admin.marketplace_series_requirement_updated', null, auth.user.id, updated)
    sendJson(response, 200, { gradeSubject: updated })
    return true
  }

  const createMatch = path.match(/^\/api\/admin\/academic-structure\/(curricula|levels|grades|subjects|terms)$/)
  if (method === 'POST' && createMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const kind = createMatch[1]
    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
    const code = typeof payload.code === 'string' ? payload.code.trim().replace(/\s+/g, '-').toUpperCase().slice(0, 40) : null
    const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 1000) || null : null
    const sortOrder = Number.isInteger(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0
    if (name.length < 2) fail(400, 'ACADEMIC_NAME_INVALID', 'Enter a name with at least 2 characters.')
    let created
    try {
      if (kind === 'curricula') {
        if (!code || code.length < 2) fail(400, 'ACADEMIC_CODE_REQUIRED', 'Enter a short curriculum code, such as CBC or 8-4-4.')
        created = await prepare(`INSERT INTO academic_curricula(code,name,description,created_by) VALUES(?,?,?,?) RETURNING id,code,name,description,status`).get(code, name, description, auth.user.id)
      } else if (kind === 'levels') {
        const curriculumId = typeof payload.curriculumId === 'string' ? payload.curriculumId : ''
        if (!await prepare(`SELECT 1 AS found FROM academic_curricula WHERE id=? AND status='active'`).get(curriculumId)) fail(400, 'ACADEMIC_CURRICULUM_REQUIRED', 'Choose an active curriculum for this level.')
        created = await prepare(`INSERT INTO academic_levels(curriculum_id,name,sort_order) VALUES(?,?,?) RETURNING id,curriculum_id AS "curriculumId",name,sort_order AS "sortOrder",status`).get(curriculumId, name, sortOrder)
      } else if (kind === 'grades') {
        const levelId = typeof payload.levelId === 'string' ? payload.levelId : ''
        if (!await prepare(`SELECT 1 AS found FROM academic_levels WHERE id=? AND status='active'`).get(levelId)) fail(400, 'ACADEMIC_LEVEL_REQUIRED', 'Choose an active education level for this grade or form.')
        created = await prepare(`INSERT INTO academic_grades(level_id,name,sort_order) VALUES(?,?,?) RETURNING id,level_id AS "levelId",name,sort_order AS "sortOrder",status`).get(levelId, name, sortOrder)
      } else if (kind === 'subjects') {
        const curriculumId = typeof payload.curriculumId === 'string' ? payload.curriculumId : ''
        if (!await prepare(`SELECT 1 AS found FROM academic_curricula WHERE id=? AND status='active'`).get(curriculumId)) fail(400, 'ACADEMIC_CURRICULUM_REQUIRED', 'Choose an active curriculum for this subject.')
        created = await prepare(`INSERT INTO academic_subjects(curriculum_id,code,name) VALUES(?,?,?) RETURNING id,curriculum_id AS "curriculumId",code,name,status`).get(curriculumId, code || null, name)
      } else {
        const curriculumId = typeof payload.curriculumId === 'string' ? payload.curriculumId : ''
        if (!await prepare(`SELECT 1 AS found FROM academic_curricula WHERE id=? AND status='active'`).get(curriculumId)) fail(400, 'ACADEMIC_CURRICULUM_REQUIRED', 'Choose an active curriculum for this term.')
        created = await prepare(`INSERT INTO academic_terms(curriculum_id,name,sort_order) VALUES(?,?,?) RETURNING id,curriculum_id AS "curriculumId",name,sort_order AS "sortOrder",status`).get(curriculumId, name, sortOrder)
      }
    } catch (error) {
      if (error.code === '23505') fail(409, 'ACADEMIC_DUPLICATE', `That ${kinds[kind].label} or code already exists in this scope.`)
      throw error
    }
    await audit(`admin.academic_${kinds[kind].label}_created`, null, auth.user.id, { id: created.id, name: created.name })
    sendJson(response, 201, { record: created })
    return true
  }

  const updateMatch = path.match(/^\/api\/admin\/academic-structure\/(curricula|levels|grades|subjects|terms)\/([0-9a-f-]+)$/i)
  if (['PATCH', 'DELETE'].includes(method) && updateMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const [, kind, id] = updateMatch
    const config = kinds[kind]
    if (method === 'DELETE') {
      const archived = await prepare(`UPDATE ${config.table} SET status='archived',updated_at=? WHERE id=? AND status='active' RETURNING id,name,status`).get(now(), id)
      if (!archived) fail(404, 'ACADEMIC_RECORD_NOT_FOUND', 'That active academic record was not found.')
      await audit(`admin.academic_${config.label}_archived`, null, auth.user.id, { id: archived.id, name: archived.name })
      sendJson(response, 200, { record: archived })
      return true
    }
    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
    const code = typeof payload.code === 'string' ? payload.code.trim().replace(/\s+/g, '-').toUpperCase().slice(0, 40) : null
    const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 1000) || null : null
    const sortOrder = Number.isInteger(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0
    const status = payload.status === 'archived' ? 'archived' : 'active'
    if (name.length < 2) fail(400, 'ACADEMIC_NAME_INVALID', 'Enter a name with at least 2 characters.')
    let updated
    try {
      if (kind === 'curricula') {
        if (!code || code.length < 2) fail(400, 'ACADEMIC_CODE_REQUIRED', 'Enter a short curriculum code.')
        updated = await prepare(`UPDATE academic_curricula SET code=?,name=?,description=?,status=?,updated_at=? WHERE id=? RETURNING id,code,name,description,status`).get(code, name, description, status, now(), id)
      } else if (kind === 'levels') updated = await prepare(`UPDATE academic_levels SET name=?,sort_order=?,status=?,updated_at=? WHERE id=? RETURNING id,curriculum_id AS "curriculumId",name,sort_order AS "sortOrder",status`).get(name, sortOrder, status, now(), id)
      else if (kind === 'grades') updated = await prepare(`UPDATE academic_grades SET name=?,sort_order=?,status=?,updated_at=? WHERE id=? RETURNING id,level_id AS "levelId",name,sort_order AS "sortOrder",status`).get(name, sortOrder, status, now(), id)
      else if (kind === 'subjects') updated = await prepare(`UPDATE academic_subjects SET code=?,name=?,status=?,updated_at=? WHERE id=? RETURNING id,curriculum_id AS "curriculumId",code,name,status`).get(code || null, name, status, now(), id)
      else updated = await prepare(`UPDATE academic_terms SET name=?,sort_order=?,status=?,updated_at=? WHERE id=? RETURNING id,curriculum_id AS "curriculumId",name,sort_order AS "sortOrder",status`).get(name, sortOrder, status, now(), id)
    } catch (error) {
      if (error.code === '23505') fail(409, 'ACADEMIC_DUPLICATE', `That ${config.label} or code already exists in this scope.`)
      throw error
    }
    if (!updated) fail(404, 'ACADEMIC_RECORD_NOT_FOUND', 'That academic record was not found.')
    await audit(`admin.academic_${config.label}_updated`, null, auth.user.id, { id: updated.id, name: updated.name, status })
    sendJson(response, 200, { record: updated })
    return true
  }
  return false
}
