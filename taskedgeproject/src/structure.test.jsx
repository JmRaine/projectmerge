import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = new URL('.', import.meta.url)

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  })
}

test('frontend source uses the review-friendly folder structure and jsx extension', () => {
  const requiredFiles = [
    'app/App.jsx',
    'components/layout/Sidebar.jsx',
    'components/common/WorkspaceUi.jsx',
    'pages/OverviewPages.jsx',
    'pages/ProjectPages.jsx',
    'pages/OrganizationPages.jsx',
    'pages/ActivityPages.jsx',
    'pages/TaskDetailsPage.jsx',
    'pages/ProfilePage.jsx',
    'modals/WorkspaceModals.jsx',
    'services/authApi.jsx',
    'services/taskApi.jsx',
    'utils/taskLogic.jsx',
    'styles/App.css',
  ]

  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(new URL(relativePath, sourceRoot)), true, `${relativePath} should exist`)
  }

  const sourceFiles = collectFiles(fileURLToPath(sourceRoot))
  const legacyJavaScript = sourceFiles.filter((path) => /\.js$/.test(path))
  assert.deepEqual(legacyJavaScript, [], 'src should not contain .js files')

  const appSource = readFileSync(new URL('app/App.jsx', sourceRoot), 'utf8')
  assert.ok(appSource.split(/\r?\n/).length < 3200, 'App.jsx should only contain application orchestration')
})

test('authentication uses the TaskEdge split-panel design without legacy notebook or carousel markup', () => {
  const appSource = readFileSync(new URL('app/App.jsx', sourceRoot), 'utf8')
  const styles = readFileSync(new URL('styles/App.css', sourceRoot), 'utf8')
  const globalStyles = readFileSync(new URL('styles/index.css', sourceRoot), 'utf8')

  assert.match(appSource, /auth-brand-panel/)
  assert.match(appSource, /Your work,\s*<br\s*\/>\s*all in one place\./)
  assert.match(appSource, /New here\?/)
  assert.doesNotMatch(appSource, /authSlides|auth-slides|activeAuthSlide/)
  assert.doesNotMatch(appSource, /auth-team-preview|UsersRound/)
  assert.doesNotMatch(styles, /repeating-linear-gradient\(#fffefa/)
  assert.match(styles, /\.auth-page\s*\{[^}]*background:\s*#020d27/s)
  assert.match(styles, /\.auth-panel\s*\{[^}]*height:\s*clamp\(/s)
  assert.match(styles, /\.auth-panel\s*\{[^}]*border:\s*0/s)
  assert.match(styles, /\.auth-card\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(styles, /\.sidebar\s*\{[^}]*background:\s*#122957/s)
  assert.match(globalStyles, /--accent:\s*#3158c9/)
})

test('checkboxes use shared unclipped geometry across the interface', () => {
  const styles = readFileSync(new URL('styles/App.css', sourceRoot), 'utf8')

  assert.match(styles, /input\[type=['"]checkbox['"]\]\s*\{[^}]*appearance:\s*none/s)
  assert.match(styles, /input\[type=['"]checkbox['"]\]\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/s)
  assert.match(styles, /input\[type=['"]checkbox['"]\]::before/)
  assert.match(styles, /input\[type=['"]checkbox['"]\]:checked/)
})

test('project board cards expose the current TaskEdge information hierarchy', () => {
  const pageSource = readFileSync(new URL('pages/ProjectPages.jsx', sourceRoot), 'utf8')
  const styles = readFileSync(new URL('styles/App.css', sourceRoot), 'utf8')

  assert.match(pageSource, /project-card-header/)
  assert.match(pageSource, /project-card-progress-copy/)
  assert.match(pageSource, /project-card-footer/)
  assert.match(pageSource, /<Pencil[^>]*aria-hidden="true"/)
  assert.match(pageSource, /<Archive[^>]*aria-hidden="true"/)
  assert.match(styles, /\.project-card-description\s*\{[^}]*-webkit-line-clamp:\s*2/s)
})

test('task details use the shared project toolbar and compact summary layout', () => {
  const pageSource = readFileSync(new URL('pages/TaskDetailsPage.jsx', sourceRoot), 'utf8')

  assert.match(pageSource, /className="project-detail-toolbar task-detail-toolbar"/)
  assert.match(pageSource, /className="project-back-button"/)
  assert.match(pageSource, /className="project-detail-primary-actions"/)
  assert.match(pageSource, /className="panel task-detail-summary"/)
})
