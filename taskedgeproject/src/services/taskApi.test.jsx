import assert from 'node:assert/strict'
import test from 'node:test'

import { createTaskApi } from './taskApi.jsx'

test('createTaskApi sends bearer token and normalizes listed tasks', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              _id: 'task-1',
              title: 'Shared task',
              status: 'todo',
              priority: 'medium',
              project: { _id: 'project-1', name: 'Web' },
              assignee: { _id: 'user-1', firstName: 'Jason', lastName: 'Raine' },
            },
          ],
        }),
      }
    },
  })

  const tasks = await api.listTasks()

  assert.equal(calls[0].url, 'http://localhost:8000/api/tasks?type=standard')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1')
  assert.equal(tasks[0].id, 'task-1')
  assert.equal(tasks[0].status, 'Todo')
})

test('createTaskApi throws backend messages when requests fail', async () => {
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ message: 'Project not found.' }),
    }),
  })

  await assert.rejects(
    () => api.createTask({ title: 'Bad task' }),
    /Project not found/,
  )
})

test('createTaskApi reports unauthorized responses without expiring forbidden sessions', async () => {
  const statuses = [401, 403]
  let unauthorizedCount = 0
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    onUnauthorized: () => { unauthorizedCount += 1 },
    fetchImpl: async () => {
      const status = statuses.shift()
      return {
        ok: false,
        status,
        json: async () => ({ message: status === 401 ? 'Invalid or expired token.' : 'Permission denied.' }),
      }
    },
  })

  await assert.rejects(() => api.listTasks(), /expired token/)
  await assert.rejects(() => api.listTasks(), /Permission denied/)
  assert.equal(unauthorizedCount, 1)
})

test('createTaskApi reports unauthorized Axios responses', async () => {
  let unauthorizedCount = 0
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    onUnauthorized: () => { unauthorizedCount += 1 },
    httpClient: async () => {
      const error = new Error('Unauthorized')
      error.response = { status: 401, data: { message: 'Invalid or expired token.' } }
      throw error
    },
  })

  await assert.rejects(() => api.listTasks(), /expired token/)
  assert.equal(unauthorizedCount, 1)
})

test('createTaskApi uses the configured Axios-style client by default', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    httpClient: async (config) => {
      calls.push(config)
      return {
        data: {
          items: [
            {
              _id: 'task-1',
              title: 'Shared task',
              status: 'todo',
              priority: 'medium',
              project: { _id: 'project-1', name: 'Web' },
            },
          ],
        },
      }
    },
  })

  const tasks = await api.listTasks()

  assert.equal(tasks[0].id, 'task-1')
  assert.equal(calls[0].url, 'http://localhost:8000/api/tasks?type=standard')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers.Authorization, 'Bearer token-1')
})

test('createTaskApi creates and archives projects through the shared API', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          item: {
            _id: 'project-1',
            name: 'Capstone',
            manager: { _id: 'user-1', firstName: 'Jason' },
            members: [],
          },
        }),
      }
    },
  })

  const created = await api.createProject({ name: 'Capstone' })
  await api.archiveProject('project-1')

  assert.equal(created.id, 'project-1')
  assert.equal(calls[0].url, 'http://localhost:8000/api/projects')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[1].url, 'http://localhost:8000/api/projects/project-1')
  assert.equal(calls[1].options.method, 'PATCH')
  assert.equal(JSON.parse(calls[1].options.body).isArchived, true)
})

test('createTaskApi lists creates and updates teams through the shared API', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              _id: 'team-1',
              name: 'Frontend',
              manager: { _id: 'user-1', firstName: 'Mika' },
              members: [{ _id: 'user-2', firstName: 'Jason' }],
            },
          ],
          item: {
            _id: 'team-1',
            name: 'Frontend',
            manager: { _id: 'user-1', firstName: 'Mika' },
            members: [{ _id: 'user-2', firstName: 'Jason' }],
          },
        }),
      }
    },
  })

  const teams = await api.listTeams()
  const created = await api.createTeam({ name: 'Frontend', members: ['user-2'] })
  await api.updateTeam('team-1', { name: 'Frontend Web', members: ['user-2', 'user-3'] })

  assert.equal(teams[0].id, 'team-1')
  assert.equal(created.managerName, 'Mika')
  assert.equal(calls[0].url, 'http://localhost:8000/api/teams')
  assert.equal(calls[1].options.method, 'POST')
  assert.equal(calls[2].url, 'http://localhost:8000/api/teams/team-1')
  assert.equal(calls[2].options.method, 'PATCH')
  assert.equal(calls[3].url, 'http://localhost:8000/api/teams/team-1/members')
  assert.deepEqual(JSON.parse(calls[3].options.body).members, ['user-2', 'user-3'])
})

test('createTaskApi updates user roles and archive state through the shared API', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          user: {
            _id: 'user-2',
            firstName: 'Mika',
            lastName: 'Tan',
            email: 'mika@example.com',
            role: 'manager',
            isArchived: false,
          },
        }),
      }
    },
  })

  const user = await api.updateUser('user-2', { role: 'manager' })

  assert.equal(user.role, 'manager')
  assert.equal(calls[0].url, 'http://localhost:8000/api/users/user-2')
  assert.equal(calls[0].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[0].options.body), { role: 'manager' })
})

test('createTaskApi handles individual activity records and assignments', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })

      if (url.endsWith('/activities/activity-1/assignments')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                _id: 'assignment-1',
                status: 'submitted',
                recipient: { _id: 'user-1', firstName: 'Jason' },
              },
            ],
            counts: { submitted: 1 },
          }),
        }
      }

      if (url.endsWith('/activities/activity-1/export.csv')) {
        return {
          ok: true,
          headers: {
            get: (header) => header.toLowerCase() === 'content-disposition'
              ? 'attachment; filename="Journal-results.csv"'
              : '',
          },
          text: async () => '"Recipient","Email"\n"Jason","jason@gmail.com"',
        }
      }

      if (url.endsWith('/activity-assignments/assignment-1/start')) {
        return {
          ok: true,
          json: async () => ({
            item: {
              _id: 'assignment-1',
              status: 'in-progress',
              recipient: { _id: 'user-1', firstName: 'Jason' },
            },
          }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          items: [
            {
              _id: 'activity-1',
              title: 'Journal',
              type: 'individual-activity',
              status: 'todo',
              priority: 'medium',
              project: { _id: 'project-1', name: 'Web' },
              reporter: { _id: 'user-2', firstName: 'Mika' },
            },
          ],
          item: {
            _id: 'activity-1',
            title: 'Journal',
            type: 'individual-activity',
              status: 'todo',
            priority: 'medium',
            project: { _id: 'project-1', name: 'Web' },
            reporter: { _id: 'user-2', firstName: 'Mika' },
          },
          reopened: 1,
          added: 1,
          message: 'Recipient removed.',
        }),
      }
    },
  })

  const activities = await api.listActivities()
  const created = await api.createActivity({ title: 'Journal' })
  const updated = await api.updateActivity('activity-1', { title: 'Updated journal' })
  const assignments = await api.listActivityAssignments('activity-1')
  const started = await api.startActivityAssignment('assignment-1')
  await api.submitActivityAssignment('assignment-1', 'Done')
  await api.reviewActivityAssignment('assignment-1', { status: 'accepted', feedback: 'Nice', score: 100 })
  const archived = await api.archiveActivity('activity-1')
  const cancelled = await api.cancelActivity('activity-1', 'Scope changed')
  const reopened = await api.reopenActivity('activity-1', {
    assignmentIds: ['assignment-1'],
    reason: 'Needs another pass',
  })
  const exported = await api.exportActivityResults('activity-1')
  const added = await api.addActivityRecipients('activity-1', ['user-2'])
  const removed = await api.removeActivityRecipient('activity-1', 'user-2')

  assert.equal(activities[0].type, 'individual-activity')
  assert.equal(created.id, 'activity-1')
  assert.equal(updated.id, 'activity-1')
  assert.equal(archived.id, 'activity-1')
  assert.equal(cancelled.id, 'activity-1')
  assert.equal(reopened.activity.id, 'activity-1')
  assert.equal(reopened.count, 1)
  assert.equal(exported.csv, '"Recipient","Email"\n"Jason","jason@gmail.com"')
  assert.equal(exported.filename, 'Journal-results.csv')
  assert.equal(added.count, 1)
  assert.equal(removed.message, 'Recipient removed.')
  assert.equal(assignments.items[0].recipientName, 'Jason')
  assert.equal(started.status, 'in-progress')
  assert.equal(calls[0].url, 'http://localhost:8000/api/tasks?type=individual-activity')
  assert.equal(calls[1].url, 'http://localhost:8000/api/activities')
  assert.equal(calls[2].url, 'http://localhost:8000/api/activities/activity-1')
  assert.equal(calls[2].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[2].options.body), { title: 'Updated journal' })
  assert.equal(calls[3].url, 'http://localhost:8000/api/activities/activity-1/assignments')
  assert.equal(calls[4].url, 'http://localhost:8000/api/activity-assignments/assignment-1/start')
  assert.equal(calls[4].options.method, 'PATCH')
  assert.equal(calls[5].url, 'http://localhost:8000/api/activity-assignments/assignment-1/submit')
  assert.equal(calls[6].url, 'http://localhost:8000/api/activity-assignments/assignment-1/review')
  assert.equal(calls[7].url, 'http://localhost:8000/api/activities/activity-1/archive')
  assert.equal(calls[7].options.method, 'PATCH')
  assert.equal(calls[8].url, 'http://localhost:8000/api/activities/activity-1/cancel')
  assert.equal(calls[8].options.method, 'PATCH')
  assert.equal(calls[9].url, 'http://localhost:8000/api/activities/activity-1/reopen')
  assert.equal(calls[9].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[9].options.body), {
    assignmentIds: ['assignment-1'],
    reason: 'Needs another pass',
  })
  assert.equal(calls[10].url, 'http://localhost:8000/api/activities/activity-1/export.csv')
  assert.equal(calls[10].options.method, 'GET')
  assert.equal(calls[10].options.headers.Authorization, 'Bearer token-1')
  assert.equal(calls[11].url, 'http://localhost:8000/api/activities/activity-1/recipients')
  assert.equal(calls[11].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[11].options.body), { recipients: ['user-2'] })
  assert.equal(calls[12].url, 'http://localhost:8000/api/activities/activity-1/recipients/user-2')
  assert.equal(calls[12].options.method, 'DELETE')
})

test('createTaskApi lists and marks notifications as read', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              _id: 'notification-1',
              title: 'Reminder',
              message: 'Submit your activity.',
              isRead: false,
            },
          ],
          item: {
            _id: 'notification-1',
            title: 'Reminder',
            message: 'Submit your activity.',
            isRead: true,
          },
          message: 'Notifications marked as read.',
        }),
      }
    },
  })

  const notifications = await api.listNotifications()
  const read = await api.markNotificationRead('notification-1')
  const message = await api.markAllNotificationsRead()

  assert.equal(notifications[0].id, 'notification-1')
  assert.equal(read.isRead, true)
  assert.equal(message, 'Notifications marked as read.')
  assert.equal(calls[0].url, 'http://localhost:8000/api/notifications')
  assert.equal(calls[1].url, 'http://localhost:8000/api/notifications/notification-1/read')
  assert.equal(calls[1].options.method, 'PATCH')
  assert.equal(calls[2].url, 'http://localhost:8000/api/notifications/read-all')
})

test('createTaskApi lists audit activity log records', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              _id: 'log-1',
              actor: {
                _id: 'admin-1',
                firstName: 'TaskEdge',
                lastName: 'Admin',
                role: 'admin',
              },
              action: 'UPDATE_USER',
              entityType: 'User',
              entityId: 'user-1',
              metadata: { role: 'manager' },
              createdAt: '2026-10-14T10:00:00.000Z',
            },
          ],
          total: 1,
        }),
      }
    },
  })

  const records = await api.listAuditLog()

  assert.deepEqual(records, {
    items: [
      {
        id: 'log-1',
        actorName: 'TaskEdge Admin',
        actorRole: 'admin',
        action: 'UPDATE_USER',
        actionLabel: 'Update user',
        entityType: 'User',
        entityId: 'user-1',
        metadata: { role: 'manager' },
        createdAt: '2026-10-14T10:00:00.000Z',
      },
    ],
    total: 1,
  })
  assert.equal(calls[0].url, 'http://localhost:8000/api/activity-log?limit=50')
})

test('createTaskApi lists and restores archived records', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })

      if (url.endsWith('/projects?archived=true')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                _id: 'project-1',
                name: 'Archived project',
                isArchived: true,
              },
            ],
          }),
        }
      }

      if (url.endsWith('/tasks?type=individual-activity&archived=true')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                _id: 'activity-1',
                title: 'Archived activity',
                status: 'for-review',
                priority: 'high',
                isArchived: true,
              },
            ],
          }),
        }
      }

      if (url.endsWith('/teams?archived=true')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                _id: 'team-1',
                name: 'Archived team',
                isArchived: true,
              },
            ],
          }),
        }
      }

      if (url.endsWith('/users?archived=true')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                _id: 'user-1',
                firstName: 'Archived',
                lastName: 'User',
                email: 'archived@example.com',
                role: 'member',
                isArchived: true,
              },
            ],
          }),
        }
      }

      if (url.endsWith('/activities/activity-1/archive')) {
        return {
          ok: true,
          json: async () => ({
            item: {
              _id: 'activity-1',
              title: 'Archived activity',
              status: 'for-review',
              priority: 'high',
              isArchived: false,
            },
          }),
        }
      }

      if (url.endsWith('/teams/team-1')) {
        return {
          ok: true,
          json: async () => ({
            item: {
              _id: 'team-1',
              name: 'Archived team',
              isArchived: false,
            },
          }),
        }
      }

      if (url.endsWith('/users/user-1')) {
        return {
          ok: true,
          json: async () => ({
            user: {
              _id: 'user-1',
              firstName: 'Archived',
              lastName: 'User',
              email: 'archived@example.com',
              role: 'member',
              isArchived: false,
            },
          }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          items: [
            {
              _id: 'task-1',
              title: 'Archived task',
              status: 'todo',
              priority: 'medium',
              isArchived: true,
            },
          ],
          item: {
            _id: 'task-1',
            title: 'Archived task',
            status: 'todo',
            priority: 'medium',
            isArchived: false,
          },
        }),
      }
    },
  })

  const records = await api.listArchivedRecords()
  const restoredTask = await api.restoreArchivedRecord('tasks', 'task-1')
  await api.restoreArchivedRecord('projects', 'project-1')
  const restoredActivity = await api.restoreArchivedRecord('activities', 'activity-1')
  const restoredTeam = await api.restoreArchivedRecord('teams', 'team-1')
  const restoredUser = await api.restoreArchivedRecord('users', 'user-1')

  assert.equal(records.projects[0].id, 'project-1')
  assert.equal(records.tasks[0].id, 'task-1')
  assert.equal(records.activities[0].id, 'activity-1')
  assert.equal(records.teams[0].id, 'team-1')
  assert.equal(records.users[0]._id, 'user-1')
  assert.equal(restoredTask.id, 'task-1')
  assert.equal(restoredActivity.id, 'activity-1')
  assert.equal(restoredTeam.id, 'team-1')
  assert.equal(restoredUser._id, 'user-1')
  assert.equal(calls[0].url, 'http://localhost:8000/api/projects?archived=true')
  assert.equal(calls[1].url, 'http://localhost:8000/api/tasks?archived=true')
  assert.equal(calls[2].url, 'http://localhost:8000/api/tasks?type=individual-activity&archived=true')
  assert.equal(calls[3].url, 'http://localhost:8000/api/teams?archived=true')
  assert.equal(calls[4].url, 'http://localhost:8000/api/users?archived=true')
  assert.equal(calls[5].url, 'http://localhost:8000/api/tasks/task-1')
  assert.equal(calls[5].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[5].options.body), { isArchived: false })
  assert.equal(calls[6].url, 'http://localhost:8000/api/projects/project-1')
  assert.equal(calls[7].url, 'http://localhost:8000/api/activities/activity-1/archive')
  assert.equal(calls[7].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[7].options.body), { archived: false })
  assert.equal(calls[8].url, 'http://localhost:8000/api/teams/team-1')
  assert.equal(calls[8].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[8].options.body), { isArchived: false })
  assert.equal(calls[9].url, 'http://localhost:8000/api/users/user-1')
  assert.equal(calls[9].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[9].options.body), { isArchived: false })
})

test('createTaskApi can omit archived users for non-admin archive views', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({ items: [] }),
      }
    },
  })

  const records = await api.listArchivedRecords({ includeUsers: false })

  assert.deepEqual(records.users, [])
  assert.equal(calls.some((call) => call.url.endsWith('/users?archived=true')), false)
})

test('createTaskApi permanently deletes archived records by type', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({ message: 'Deleted.' }),
      }
    },
  })

  await api.deleteArchivedRecord('projects', 'project-1')
  await api.deleteArchivedRecord('tasks', 'task-1')
  await api.deleteArchivedRecord('activities', 'activity-1')
  await api.deleteArchivedRecord('teams', 'team-1')
  await api.deleteArchivedRecord('users', 'user-1')

  assert.equal(calls[0].url, 'http://localhost:8000/api/projects/project-1')
  assert.equal(calls[0].options.method, 'DELETE')
  assert.equal(calls[1].url, 'http://localhost:8000/api/tasks/task-1')
  assert.equal(calls[1].options.method, 'DELETE')
  assert.equal(calls[2].url, 'http://localhost:8000/api/tasks/activity-1')
  assert.equal(calls[2].options.method, 'DELETE')
  assert.equal(calls[3].url, 'http://localhost:8000/api/teams/team-1')
  assert.equal(calls[3].options.method, 'DELETE')
  assert.equal(calls[4].url, 'http://localhost:8000/api/users/user-1')
  assert.equal(calls[4].options.method, 'DELETE')
})

test('createTaskApi sends activity reminders and returns the reminder count', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          message: 'Reminder sent to 3 recipient(s).',
          count: 3,
        }),
      }
    },
  })

  const result = await api.remindActivity('activity-1')

  assert.deepEqual(result, {
    message: 'Reminder sent to 3 recipient(s).',
    count: 3,
  })
  assert.equal(calls[0].url, 'http://localhost:8000/api/activities/activity-1/remind')
  assert.equal(calls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].options.body), {})
})

test('createTaskApi updates and deletes task comments', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          item: {
            _id: 'comment-1',
            body: 'Updated comment',
          },
        }),
      }
    },
  })

  const updated = await api.updateComment('comment-1', 'Updated comment')
  await api.deleteComment('comment-1')

  assert.equal(updated._id, 'comment-1')
  assert.equal(updated.body, 'Updated comment')
  assert.equal(calls[0].url, 'http://localhost:8000/api/comments/comment-1')
  assert.equal(calls[0].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[0].options.body), { body: 'Updated comment' })
  assert.equal(calls[1].url, 'http://localhost:8000/api/comments/comment-1')
  assert.equal(calls[1].options.method, 'DELETE')
})

test('createTaskApi uploads and deletes task attachments', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          item: {
            _id: 'attachment-1',
            name: 'brief.pdf',
            url: '/uploads/brief.pdf',
            size: 2048,
          },
          task: {
            _id: 'task-1',
            title: 'Read brief',
            status: 'todo',
            priority: 'medium',
            attachments: [
              {
                _id: 'attachment-1',
                name: 'brief.pdf',
                url: '/uploads/brief.pdf',
                size: 2048,
              },
            ],
          },
        }),
      }
    },
  })

  const file = new File(['task attachment'], 'brief.pdf', { type: 'application/pdf' })
  const uploaded = await api.uploadTaskAttachment('task-1', file)
  await api.deleteTaskAttachment('task-1', 'attachment-1')

  assert.equal(uploaded.attachment.name, 'brief.pdf')
  assert.equal(uploaded.task.id, 'task-1')
  assert.equal(calls[0].url, 'http://localhost:8000/api/tasks/task-1/attachments')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.body instanceof FormData, true)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1')
  assert.equal(calls[0].options.headers['Content-Type'], undefined)
  assert.equal(calls[1].url, 'http://localhost:8000/api/tasks/task-1/attachments/attachment-1')
  assert.equal(calls[1].options.method, 'DELETE')
})

test('createTaskApi uploads and deletes activity assignment attachments', async () => {
  const calls = []
  const api = createTaskApi({
    baseUrl: 'http://localhost:8000/api',
    getToken: () => 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          item: {
            _id: 'attachment-1',
            name: 'submission.pdf',
            url: '/uploads/submission.pdf',
            size: 4096,
          },
        }),
      }
    },
  })

  const file = new File(['activity submission'], 'submission.pdf', { type: 'application/pdf' })
  const uploaded = await api.uploadActivityAssignmentAttachment('assignment-1', file)
  await api.deleteActivityAssignmentAttachment('assignment-1', 'attachment-1')

  assert.equal(uploaded.name, 'submission.pdf')
  assert.equal(calls[0].url, 'http://localhost:8000/api/activity-assignments/assignment-1/attachments')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.body instanceof FormData, true)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1')
  assert.equal(calls[0].options.headers['Content-Type'], undefined)
  assert.equal(calls[1].url, 'http://localhost:8000/api/activity-assignments/assignment-1/attachments/attachment-1')
  assert.equal(calls[1].options.method, 'DELETE')
})
