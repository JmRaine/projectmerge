const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Task = require('../models/taskModel');

test('task schema supports team population used by task list queries', () => {
  assert.equal(Task.schema.path('team').options.ref, 'Team');
});

test('personal tasks do not require a project, while project tasks still do', () => {
  const reporter = new mongoose.Types.ObjectId();
  const personalTask = new Task({ scope: 'personal', title: 'Personal task', reporter });
  const projectTask = new Task({ scope: 'project', title: 'Project task', reporter });

  assert.equal(personalTask.validateSync(), undefined);
  assert.equal(projectTask.validateSync().errors.project.kind, 'required');
});
