import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WorkspaceChangeLog } from './workspace-changes.ts'

const fixture = () => ({
  dataDirectory: mkdtempSync(join(tmpdir(), 'alpha-changes-data-')),
  workspace: mkdtempSync(join(tmpdir(), 'alpha-changes-ws-')),
})

describe('[sessions] changes during one workspace run', () => {
  it('reports only the net added, modified and deleted files in a folder without Git', () => {
    const { dataDirectory, workspace } = fixture()
    writeFileSync(join(workspace, 'edit.txt'), 'before\n')
    writeFileSync(join(workspace, 'delete.txt'), 'removed\n')
    writeFileSync(join(workspace, 'unchanged.txt'), 'same\n')
    const log = new WorkspaceChangeLog(dataDirectory)
    try {
      log.begin('c1', workspace, 10)
      writeFileSync(join(workspace, 'add.txt'), 'new\n')
      writeFileSync(join(workspace, 'edit.txt'), 'after\n')
      rmSync(join(workspace, 'delete.txt'))
      writeFileSync(join(workspace, 'unchanged.txt'), 'temporary\n')
      writeFileSync(join(workspace, 'unchanged.txt'), 'same\n')

      const changes = log.finish('c1', 20)

      expect(changes).toMatchObject({ startedAt: 10, endedAt: 20, recovered: false, incomplete: false })
      expect(changes?.files).toEqual([
        { path: 'add.txt', kind: 'added', afterText: 'new\n' },
        { path: 'delete.txt', kind: 'deleted', beforeText: 'removed\n' },
        { path: 'edit.txt', kind: 'modified', beforeText: 'before\n', afterText: 'after\n' },
      ])
      expect(new WorkspaceChangeLog(dataDirectory).list('c1')).toEqual([changes])
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('records binary and large text changes without a text preview', () => {
    const { dataDirectory, workspace } = fixture()
    writeFileSync(join(workspace, 'image.bin'), Buffer.from([0, 1, 2]))
    writeFileSync(join(workspace, 'large.txt'), 'a'.repeat(70_000))
    const log = new WorkspaceChangeLog(dataDirectory)
    try {
      log.begin('c1', workspace, 10)
      writeFileSync(join(workspace, 'image.bin'), Buffer.from([0, 1, 3]))
      writeFileSync(join(workspace, 'large.txt'), 'b'.repeat(70_000))

      expect(log.finish('c1', 20)?.files).toEqual([
        { path: 'image.bin', kind: 'modified' },
        { path: 'large.txt', kind: 'modified' },
      ])
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('does not follow a symlink outside the workspace, but notices its target changing', () => {
    const { dataDirectory, workspace } = fixture()
    const outside = mkdtempSync(join(tmpdir(), 'alpha-changes-outside-'))
    const first = join(outside, 'first.txt')
    const second = join(outside, 'second.txt')
    writeFileSync(first, 'private before')
    writeFileSync(second, 'private after')
    symlinkSync(first, join(workspace, 'linked'))
    const log = new WorkspaceChangeLog(dataDirectory)
    try {
      log.begin('c1', workspace, 10)
      writeFileSync(first, 'changed outside')
      expect(log.finish('c1', 20)?.files).toEqual([])

      log.begin('c1', workspace, 30)
      rmSync(join(workspace, 'linked'))
      symlinkSync(second, join(workspace, 'linked'))
      expect(log.finish('c1', 40)?.files).toEqual([{ path: 'linked', kind: 'modified' }])
      expect(readFileSync(first, 'utf8')).toBe('changed outside')
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('marks a scan beyond its byte budget incomplete without claiming a deletion', () => {
    const { dataDirectory, workspace } = fixture()
    writeFileSync(join(workspace, 'huge.dat'), '')
    truncateSync(join(workspace, 'huge.dat'), 70 * 1024 * 1024)
    const log = new WorkspaceChangeLog(dataDirectory)
    try {
      log.begin('c1', workspace, 10)
      expect(log.finish('c1', 20)).toMatchObject({ incomplete: true, files: [] })
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('still reports source changes when dependencies and an oversized file are outside coverage', () => {
    const { dataDirectory, workspace } = fixture()
    mkdirSync(join(workspace, 'node_modules'))
    writeFileSync(join(workspace, 'node_modules', 'package.js'), 'dependency')
    writeFileSync(join(workspace, 'huge.dat'), '')
    truncateSync(join(workspace, 'huge.dat'), 70 * 1024 * 1024)
    const log = new WorkspaceChangeLog(dataDirectory)
    try {
      log.begin('c1', workspace, 10)
      writeFileSync(join(workspace, 'source.ts'), 'export const value = 1\n')

      expect(log.finish('c1', 20)).toMatchObject({
        incomplete: true,
        files: [{ path: 'source.ts', kind: 'added' }],
      })
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('recovers a pending baseline after process exit and deletes it with its conversation', () => {
    const { dataDirectory, workspace } = fixture()
    const first = new WorkspaceChangeLog(dataDirectory)
    try {
      first.begin('c1', workspace, 10)
      writeFileSync(join(workspace, 'made.txt'), 'during the run')
      const reopened = new WorkspaceChangeLog(dataDirectory)
      const recovered = reopened.recover('c1', 20)

      expect(recovered).toMatchObject({ recovered: true, files: [{ path: 'made.txt', kind: 'added' }] })
      expect(reopened.recover('c1', 30)).toBeUndefined()
      expect(reopened.list('c1')).toEqual([recovered])
      reopened.forget('c1')
      expect(new WorkspaceChangeLog(dataDirectory).list('c1')).toEqual([])
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
