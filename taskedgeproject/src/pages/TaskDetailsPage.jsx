import { useRef } from 'react'
import { Archive, ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { STATUSES, getTaskAttachmentDisplay, getTaskDetailFacts } from '../utils/taskLogic.jsx'
import { getTaskCommentPermissions } from '../utils/taskPermissions.jsx'
import { formatDate, formatNotificationDate, getCommentAuthor } from '../utils/display.jsx'
import { StatusBadge, PriorityBadge } from '../components/common/WorkspaceUi.jsx'
import { API_BASE_URL } from '../config/runtime.jsx'

export function TaskDetailsPage({
  task,
  currentUser,
  permissions,
  comments,
  commentText,
  editingComment,
  taskMessage,
  onBack,
  onCommentTextChange,
  onAddComment,
  onStartEditComment,
  onCancelEditComment,
  onUpdateComment,
  onDeleteComment,
  onStatusChange,
  onToggleSubtask,
  onUploadAttachment,
  onDeleteAttachment,
  onOpenProgress,
  onEditTask,
  onArchiveTask,
  onDeleteTask,
}) {
  const attachmentInputRef = useRef(null)
  const detailFacts = getTaskDetailFacts(task)
  const dependencies = task.dependencies || []
  const subtasks = task.subtasks || []
  const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length
  const subtaskProgress = subtasks.length ? Math.round((completedSubtasks / subtasks.length) * 100) : 0
  const assigneeName = task.owner || 'Unassigned'
  const assigneeInitials = assigneeName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'NA'

  function handleAttachmentChange(event) {
    const file = event.target.files?.[0]
    if (file) {
      onUploadAttachment(file)
    }
    event.target.value = ''
  }

  return (
    <section className="task-detail-page task-work-detail">
      <header className="project-detail-toolbar task-detail-toolbar">
        <button type="button" className="project-back-button" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to tasks
        </button>
        <div className="project-detail-primary-actions">
          {permissions.canManage && (
            <>
              <button type="button" className="project-action-button" onClick={() => onEditTask(task)}>
                <Pencil size={16} aria-hidden="true" />
                Edit task
              </button>
              <button type="button" className="project-action-button" onClick={() => onArchiveTask(task.id)}>
                <Archive size={16} aria-hidden="true" />
                Archive
              </button>
              {permissions.canDelete && onDeleteTask && (
                <button type="button" className="project-action-button danger-action" onClick={() => onDeleteTask(task.id)}>
                  <Trash2 size={16} aria-hidden="true" />
                  Delete
                </button>
              )}
            </>
          )}
          {permissions.canUpdateProgress && (
            <button type="button" className="project-new-task-button" onClick={() => onOpenProgress(task)}>Update progress</button>
          )}
        </div>
      </header>

      <article className="panel task-detail-summary">
        <div className="task-detail-summary-copy">
          <p className="eyebrow">{task.project}</p>
          <h2>{task.title}</h2>
          <p className="task-work-summary">{task.description || 'No description has been added to this task.'}</p>
          <div className="task-work-badges">
            <StatusBadge value={task.status} />
            <PriorityBadge value={task.priority} />
            <span className="task-work-date">Due {formatDate(task.dueDate)}</span>
          </div>
        </div>
        <div className="task-work-assignee">
          <span>Assigned to</span>
          <div>
            <strong className="task-work-avatar">{assigneeInitials}</strong>
            <div>
              <b>{assigneeName}</b>
              <small>{permissions.isAssignee ? 'You are responsible for this task' : 'Responsible assignee'}</small>
            </div>
          </div>
        </div>
      </article>

      <div className="task-work-toolbar">
        <div className="task-work-status-control">
          <span>Status</span>
          {permissions.canManage ? (
            <select value={task.status} onChange={(event) => onStatusChange(event.target.value)}>
              {STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          ) : (
            <StatusBadge value={task.status} />
          )}
        </div>
        {!permissions.canManage && !permissions.canUpdateProgress && (
          <div className="task-work-actions"><span className="task-read-only-badge">View only</span></div>
        )}
      </div>

      {taskMessage && <p className="form-message task-work-message">{taskMessage}</p>}

      <div className="task-work-layout">
        <div className="task-work-main">
          {dependencies.length > 0 && (
            <article className="panel task-work-card task-work-dependencies">
              <div className="task-work-section-heading">
                <div><p className="eyebrow">Dependencies</p><h3>Blocked by</h3></div>
                <span>{dependencies.length}</span>
              </div>
              <div className="dependency-list">
                {dependencies.map((dependency) => (
                  <div className="dependency-row" key={dependency.id}>
                    <span className={dependency.status === 'completed' ? 'dependency-done' : 'dependency-open'} />
                    <div><strong>{dependency.title}</strong><p>{dependency.status || 'todo'}</p></div>
                  </div>
                ))}
              </div>
            </article>
          )}

          <article className="panel task-work-card task-work-subtasks">
            <div className="task-work-section-heading">
              <div><p className="eyebrow">Subtasks</p><h3>Break down the work</h3></div>
              <span>{completedSubtasks}/{subtasks.length}</span>
            </div>
            <div className="task-work-progress" aria-label={`${subtaskProgress}% of subtasks complete`}>
              <span style={{ width: `${subtaskProgress}%` }} />
            </div>
            {subtasks.length ? (
              <div className="subtask-list task-work-subtask-list">
                {subtasks.map((subtask, index) => (
                  <div key={`${subtask.title}-${index}`} className={`subtask-row ${subtask.completed ? 'is-complete' : ''}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(subtask.completed)}
                        disabled={!permissions.canCompleteSubtasks}
                        onChange={() => onToggleSubtask(index)}
                      />
                      <span>{subtask.title}</span>
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-copy">No subtasks have been added.</p>
            )}
          </article>

          <article className="panel task-work-card task-work-comments">
            <div className="task-work-section-heading">
              <div><p className="eyebrow">Team discussion</p><h3>Updates and comments</h3></div>
              <span>{comments.length}</span>
            </div>
            <div className="comment-list task-work-comment-list">
              {comments.length ? comments.map((comment) => {
                const commentId = comment._id || comment.id
                const isEditing = editingComment?.id === commentId
                const commentPermissions = getTaskCommentPermissions(currentUser, comment)
                const authorName = comment.author ? getCommentAuthor(comment.author) : 'Team member'

                return (
                  <div className="comment-row task-work-comment" key={commentId}>
                    <span className="task-work-comment-avatar">{authorName.charAt(0).toUpperCase()}</span>
                    <div className="task-work-comment-body">
                      <div className="comment-row-header">
                        <div>
                          <strong>{authorName}</strong>
                          <span>{formatNotificationDate(comment.updatedAt || comment.createdAt)}</span>
                        </div>
                        {(commentPermissions.canEdit || commentPermissions.canDelete) && (
                          <div className="row-actions">
                            {commentPermissions.canEdit && <button type="button" className="ghost-button compact" onClick={() => onStartEditComment(comment)}>Edit</button>}
                            {commentPermissions.canDelete && <button type="button" className="ghost-button compact danger-action" onClick={() => onDeleteComment(commentId)}>Delete</button>}
                          </div>
                        )}
                      </div>
                      {isEditing ? (
                        <form className="comment-edit-form" onSubmit={(event) => {
                          event.preventDefault()
                          const formData = new FormData(event.currentTarget)
                          onUpdateComment(commentId, String(formData.get('body') || ''))
                        }}>
                          <input key={commentId} name="body" defaultValue={editingComment?.body || ''} placeholder="Edit comment" />
                          <button type="submit" className="primary-button compact">Save</button>
                          <button type="button" className="ghost-button compact" onClick={onCancelEditComment}>Cancel</button>
                        </form>
                      ) : <p>{comment.body}</p>}
                    </div>
                  </div>
                )
              }) : <p className="muted-copy">No comments yet. Start the conversation below.</p>}
            </div>
            <form className="task-work-comment-form" onSubmit={onAddComment}>
              <textarea value={commentText} onChange={(event) => onCommentTextChange(event.target.value)} placeholder="Write an update for everyone on this task" rows="3" />
              <div><span>Visible to everyone with access</span><button type="submit" className="primary-button compact">Send comment</button></div>
            </form>
          </article>
        </div>

        <aside className="task-work-side">
          <article className="panel task-work-card task-work-information">
            <div className="task-work-section-heading"><div><p className="eyebrow">Details</p><h3>Task information</h3></div></div>
            <dl>
              <div><dt>Status</dt><dd><StatusBadge value={task.status} /></dd></div>
              <div><dt>Priority</dt><dd><PriorityBadge value={task.priority} /></dd></div>
              <div><dt>Deadline</dt><dd>{formatDate(task.dueDate)}</dd></div>
              <div><dt>Project</dt><dd>{task.project}</dd></div>
              <div><dt>Assignee</dt><dd>{assigneeName}</dd></div>
              <div><dt>Reporter</dt><dd>{task.reporter || 'Not recorded'}</dd></div>
              {detailFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
            </dl>
          </article>

          <article className="panel task-work-card task-work-attachments">
            <div className="attachment-heading">
              <div><p className="eyebrow">Attachments</p><h3>Supporting files</h3></div>
              <input ref={attachmentInputRef} className="hidden-file-input" type="file" onChange={handleAttachmentChange} />
              {permissions.canManageAttachments && (
                <button type="button" className="ghost-button compact" onClick={() => attachmentInputRef.current?.click()}>Upload file</button>
              )}
            </div>
            {task.attachments.length ? (
              <div className="attachment-list">
                {task.attachments.map((attachment) => {
                  const attachmentDisplay = getTaskAttachmentDisplay(attachment, API_BASE_URL)
                  return (
                    <div className="attachment-row task-attachment-row" key={attachmentDisplay.id || attachmentDisplay.url || attachmentDisplay.name}>
                      <div className="attachment-file-summary">
                        <span className="attachment-type-pill">{attachmentDisplay.typeLabel}</span>
                        <div><strong>{attachmentDisplay.name}</strong><span>{attachmentDisplay.sizeLabel}</span></div>
                      </div>
                      <div className="row-actions attachment-actions">
                        <a className={`ghost-button compact ${attachmentDisplay.canOpen ? '' : 'is-disabled'}`} href={attachmentDisplay.url || undefined} target="_blank" rel="noreferrer" aria-disabled={!attachmentDisplay.canOpen}>Open</a>
                        <a className={`ghost-button compact ${attachmentDisplay.canOpen ? '' : 'is-disabled'}`} href={attachmentDisplay.url || undefined} download={attachmentDisplay.name} aria-disabled={!attachmentDisplay.canOpen}>Download</a>
                        {permissions.canManageAttachments && (
                          <button type="button" className="ghost-button compact danger-action" onClick={() => onDeleteAttachment(attachmentDisplay.id)} disabled={!attachmentDisplay.canRemove}>Remove</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <p className="muted-copy">No files attached.</p>}
            {permissions.canManageAttachments && (
              <button type="button" className="task-work-upload-zone" onClick={() => attachmentInputRef.current?.click()}>Choose a file to upload</button>
            )}
            {!permissions.canManageAttachments && <p className="task-work-readonly-note">Attachments are read-only for your role on this task.</p>}
          </article>
        </aside>
      </div>
    </section>
  )
}
