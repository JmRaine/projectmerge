import assert from 'node:assert/strict'
import test from 'node:test'

import { getAppConfig } from './appConfig.jsx'

test('getAppConfig keeps localhost defaults for development', () => {
  assert.deepEqual(getAppConfig({}), {
    apiBaseUrl: 'http://localhost:8000/api',
    serverBaseUrl: 'http://localhost:8000',
  })
})

test('getAppConfig normalizes configured production URLs', () => {
  assert.deepEqual(getAppConfig({
    VITE_API_BASE_URL: 'https://api.taskedge.example/api/',
    VITE_SERVER_BASE_URL: 'https://realtime.taskedge.example/',
  }), {
    apiBaseUrl: 'https://api.taskedge.example/api',
    serverBaseUrl: 'https://api.taskedge.example',
  })
})

test('getAppConfig derives the realtime server from the API URL', () => {
  assert.equal(
    getAppConfig({ VITE_API_BASE_URL: 'https://taskedge-api.example/api/' }).serverBaseUrl,
    'https://taskedge-api.example',
  )
})
