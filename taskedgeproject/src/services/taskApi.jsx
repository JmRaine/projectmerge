import axios from 'axios'

import { normalizeTaskFromApi } from '../utils/taskLogic.jsx'
import { normalizeProjectFromApi } from '../utils/projectLogic.jsx'
import { normalizeTeamFromApi } from '../utils/teamLogic.jsx'
import { normalizeActivityAssignmentFromApi } from '../utils/activityLogic.jsx'
import { normalizeNotificationFromApi } from '../utils/notificationLogic.jsx'

function actorName(actor) {
  if (!actor) return 'System'
  if (typeof actor === 'string') return actor
  return [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim()
    || actor.username
    || actor.email
    || 'System'
}

function formatActionLabel(action) {
  const words = String(action || 'ACTIVITY')
    .toLowerCase()
    .split('_')
    .join(' ')

  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function normalizeAuditLogFromApi(record) {
  return {
    id: record._id || record.id || '',
    actorName: actorName(record.actor),
    actorRole: record.actor?.role || '',
    action: record.action || '',
    actionLabel: formatActionLabel(record.action),
    entityType: record.entityType || 'Record',
    entityId: record.entityId || '',
    metadata: record.metadata || {},
    createdAt: record.createdAt || '',
  }
}

export function createTaskApi({
  baseUrl,
  getToken,
  onUnauthorized = () => {},
  fetchImpl = null,
  httpClient = axios,
}) {
  function getDownloadFilename(response, fallback) {
    const disposition = response.headers?.get?.('content-disposition')
      || response.headers?.['content-disposition']
      || ''
    const match = disposition.match(/filename="?(?<filename>[^";]+)"?/i)
    return match?.groups?.filename || fallback
  }

  async function request(path, options = {}) {
    const token = getToken()
    const headers = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    }

    if (!fetchImpl) {
      try {
        const response = await httpClient({
          url: `${baseUrl}${path}`,
          method: options.method || 'GET',
          data: options.body,
          headers,
        })

        return response.data || {}
      } catch (error) {
        if (error.response?.status === 401) onUnauthorized()
        throw new Error(
          error.response?.data?.message
          || (typeof error.response?.data === 'string' ? error.response.data : '')
          || 'The server could not complete the request.',
          { cause: error },
        )
      }
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers,
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 401) onUnauthorized()
      throw new Error(data.message || 'The server could not complete the request.')
    }

    return data
  }

  return {
    async listTasks() {
      const data = await request('/tasks?type=standard')
      return (data.items || []).map(normalizeTaskFromApi)
    },
    async listActivities() {
      const data = await request('/tasks?type=individual-activity')
      return (data.items || []).map(normalizeTaskFromApi)
    },
    async getTask(id) {
      const data = await request(`/tasks/${id}`)
      return normalizeTaskFromApi(data.item)
    },
    async createTask(payload) {
      const data = await request('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return normalizeTaskFromApi(data.item)
    },
    async updateTask(id, payload) {
      const data = await request(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      return normalizeTaskFromApi(data.item)
    },
    async deleteTask(id) {
      await request(`/tasks/${id}`, { method: 'DELETE' })
    },
    async uploadTaskAttachment(id, file) {
      const formData = new FormData()
      formData.append('file', file)

      const data = await request(`/tasks/${id}/attachments`, {
        method: 'POST',
        body: formData,
      })

      return {
        attachment: data.item,
        task: data.task ? normalizeTaskFromApi(data.task) : null,
      }
    },
    async deleteTaskAttachment(taskId, attachmentId) {
      const data = await request(`/tasks/${taskId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })

      return data.task ? normalizeTaskFromApi(data.task) : null
    },
    async uploadActivityAssignmentAttachment(assignmentId, file) {
      const formData = new FormData()
      formData.append('file', file)

      const data = await request(`/activity-assignments/${assignmentId}/attachments`, {
        method: 'POST',
        body: formData,
      })

      return data.item
    },
    async deleteActivityAssignmentAttachment(assignmentId, attachmentId) {
      await request(`/activity-assignments/${assignmentId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })
    },
    async listProjects() {
      const data = await request('/projects')
      return (data.items || []).map(normalizeProjectFromApi)
    },
    async listTeams() {
      const data = await request('/teams')
      return (data.items || []).map(normalizeTeamFromApi)
    },
    async createTeam(payload) {
      const data = await request('/teams', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return normalizeTeamFromApi(data.item)
    },
    async updateTeam(id, payload) {
      const { members, ...teamPayload } = payload
      const data = await request(`/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(teamPayload),
      })

      if (Array.isArray(members)) {
        const memberData = await request(`/teams/${id}/members`, {
          method: 'PATCH',
          body: JSON.stringify({ members }),
        })
        return normalizeTeamFromApi(memberData.item)
      }

      return normalizeTeamFromApi(data.item)
    },
    async archiveTeam(id) {
      const data = await request(`/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: true }),
      })
      return normalizeTeamFromApi(data.item)
    },
    async createProject(payload) {
      const data = await request('/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return normalizeProjectFromApi(data.item)
    },
    async updateProject(id, payload) {
      const data = await request(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      return normalizeProjectFromApi(data.item)
    },
    async archiveProject(id) {
      const data = await request(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: true }),
      })
      return normalizeProjectFromApi(data.item)
    },
    async listArchivedRecords({ includeUsers = true } = {}) {
      const [projectData, taskData, activityData, teamData, userData] = await Promise.all([
        request('/projects?archived=true'),
        request('/tasks?archived=true'),
        request('/tasks?type=individual-activity&archived=true'),
        request('/teams?archived=true'),
        includeUsers ? request('/users?archived=true') : Promise.resolve({ items: [] }),
      ])

      return {
        projects: (projectData.items || []).map(normalizeProjectFromApi),
        tasks: (taskData.items || []).map(normalizeTaskFromApi),
        activities: (activityData.items || []).map(normalizeTaskFromApi),
        teams: (teamData.items || []).map(normalizeTeamFromApi),
        users: userData.items || [],
      }
    },
    async restoreArchivedRecord(type, id) {
      if (type === 'users') {
        const data = await request(`/users/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isArchived: false }),
        })

        return data.user
      }

      if (type === 'activities') {
        const data = await request(`/activities/${id}/archive`, {
          method: 'PATCH',
          body: JSON.stringify({ archived: false }),
        })

        return normalizeTaskFromApi(data.item)
      }

      if (type === 'teams') {
        const data = await request(`/teams/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isArchived: false }),
        })

        return normalizeTeamFromApi(data.item)
      }

      const path = type === 'projects' ? `/projects/${id}` : `/tasks/${id}`
      const data = await request(path, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: false }),
      })

      return type === 'projects'
        ? normalizeProjectFromApi(data.item)
        : normalizeTaskFromApi(data.item)
    },
    async deleteArchivedRecord(type, id) {
      const paths = {
        projects: `/projects/${id}`,
        tasks: `/tasks/${id}`,
        activities: `/tasks/${id}`,
        teams: `/teams/${id}`,
        users: `/users/${id}`,
      }

      await request(paths[type] || `/tasks/${id}`, { method: 'DELETE' })
    },
    async listUsers() {
      const data = await request('/users')
      return data.items || []
    },
    async updateUser(id, changes) {
      const data = await request(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })
      return data.user
    },
    async createActivity(payload) {
      const data = await request('/activities', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return normalizeTaskFromApi(data.item)
    },
    async updateActivity(activityId, payload) {
      const data = await request(`/activities/${activityId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      return normalizeTaskFromApi(data.item)
    },
    async archiveActivity(activityId, archived = true) {
      const data = await request(`/activities/${activityId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      })
      return normalizeTaskFromApi(data.item)
    },
    async cancelActivity(activityId, reason = '') {
      const data = await request(`/activities/${activityId}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      })
      return normalizeTaskFromApi(data.item)
    },
    async reopenActivity(activityId, payload = {}) {
      const data = await request(`/activities/${activityId}/reopen`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return {
        activity: normalizeTaskFromApi(data.item),
        count: data.reopened || 0,
      }
    },
    async exportActivityResults(activityId) {
      const token = getToken()
      const headers = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }

      if (!fetchImpl) {
        try {
          const response = await httpClient({
            url: `${baseUrl}/activities/${activityId}/export.csv`,
            method: 'GET',
            headers,
            responseType: 'text',
          })

          return {
            csv: response.data || '',
            filename: getDownloadFilename(response, 'activity-results.csv'),
          }
        } catch (error) {
          if (error.response?.status === 401) onUnauthorized()
          throw new Error(
            error.response?.data?.message
            || (typeof error.response?.data === 'string' ? error.response.data : '')
            || 'The server could not export activity results.',
            { cause: error },
          )
        }
      }

      const response = await fetchImpl(`${baseUrl}/activities/${activityId}/export.csv`, {
        method: 'GET',
        headers,
      })
      const csv = await response.text().catch(() => '')

      if (!response.ok) {
        if (response.status === 401) onUnauthorized()
        throw new Error(csv || 'The server could not export activity results.')
      }

      return {
        csv,
        filename: getDownloadFilename(response, 'activity-results.csv'),
      }
    },
    async addActivityRecipients(activityId, recipients) {
      const data = await request(`/activities/${activityId}/recipients`, {
        method: 'POST',
        body: JSON.stringify({ recipients }),
      })
      return {
        items: data.items || [],
        count: data.added || 0,
      }
    },
    async removeActivityRecipient(activityId, userId) {
      const data = await request(`/activities/${activityId}/recipients/${userId}`, {
        method: 'DELETE',
      })
      return {
        message: data.message || 'Recipient removed.',
      }
    },
    async listActivityAssignments(activityId) {
      const data = await request(`/activities/${activityId}/assignments`)
      return {
        items: (data.items || []).map(normalizeActivityAssignmentFromApi),
        counts: data.counts || {},
        total: data.total || 0,
      }
    },
    async getMyActivityAssignment(activityId) {
      const data = await request(`/activities/${activityId}/my-assignment`)
      return normalizeActivityAssignmentFromApi(data.item)
    },
    async startActivityAssignment(assignmentId) {
      const data = await request(`/activity-assignments/${assignmentId}/start`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      return normalizeActivityAssignmentFromApi(data.item)
    },
    async submitActivityAssignment(assignmentId, textResponse) {
      const data = await request(`/activity-assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ textResponse }),
      })
      return normalizeActivityAssignmentFromApi(data.item)
    },
    async reviewActivityAssignment(assignmentId, payload) {
      const data = await request(`/activity-assignments/${assignmentId}/review`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      return normalizeActivityAssignmentFromApi(data.item)
    },
    async remindActivity(activityId) {
      const data = await request(`/activities/${activityId}/remind`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return {
        message: data.message || 'Reminder sent.',
        count: data.count || 0,
      }
    },
    async listNotifications() {
      const data = await request('/notifications')
      return (data.items || []).map(normalizeNotificationFromApi)
    },
    async markNotificationRead(id) {
      const data = await request(`/notifications/${id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      return normalizeNotificationFromApi(data.item)
    },
    async markAllNotificationsRead() {
      const data = await request('/notifications/read-all', {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      return data.message || 'Notifications marked as read.'
    },
    async listAuditLog({ limit = 50 } = {}) {
      const data = await request(`/activity-log?limit=${limit}`)
      return {
        items: (data.items || []).map(normalizeAuditLogFromApi),
        total: data.total || 0,
      }
    },
    async deleteNotification(id) {
      await request(`/notifications/${id}`, { method: 'DELETE' })
    },
    async listComments(taskId) {
      const data = await request(`/comments/task/${taskId}`)
      return data.items || []
    },
    async createComment(taskId, body) {
      const data = await request(`/comments/task/${taskId}`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      return data.item
    },
    async updateComment(id, body) {
      const data = await request(`/comments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      })
      return data.item
    },
    async deleteComment(id) {
      await request(`/comments/${id}`, { method: 'DELETE' })
    },
  }
}
