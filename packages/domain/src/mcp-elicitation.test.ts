import { describe, expect, it } from 'vitest'
import { readMcpElicitation, validMcpElicitationContent } from './mcp-elicitation.ts'

const request = {
  message: 'Who should receive this?',
  requestedSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name', minLength: 2, maxLength: 30 },
      email: { type: 'string', format: 'email' },
      count: { type: 'integer', minimum: 1, maximum: 5 },
      urgent: { type: 'boolean', default: false },
      channel: { type: 'string', enum: ['email', 'chat'], enumNames: ['Email', 'Chat'] },
    },
    required: ['name', 'count'],
  },
}

describe('[domain] MCP elicitation', () => {
  it('reads a flat primitive schema for an editable form', () => {
    expect(readMcpElicitation(request)).toEqual({
      message: 'Who should receive this?',
      fields: [
        { name: 'name', title: 'Name', type: 'string', required: true, minLength: 2, maxLength: 30 },
        { name: 'email', title: 'email', type: 'string', required: false, format: 'email' },
        { name: 'count', title: 'count', type: 'integer', required: true, minimum: 1, maximum: 5 },
        { name: 'urgent', title: 'urgent', type: 'boolean', required: false, default: false },
        {
          name: 'channel',
          title: 'channel',
          type: 'string',
          required: false,
          enum: ['email', 'chat'],
          enumNames: ['Email', 'Chat'],
        },
      ],
    })
  })

  it('rejects nested, contradictory and oversized schemas', () => {
    expect(
      readMcpElicitation({
        ...request,
        requestedSchema: {
          type: 'object',
          properties: {
            nested: { type: 'object', properties: {} },
          },
        },
      }),
    ).toBeUndefined()
    expect(
      readMcpElicitation({
        ...request,
        requestedSchema: {
          type: 'object',
          properties: {
            count: { type: 'number', minimum: 8, maximum: 2 },
          },
        },
      }),
    ).toBeUndefined()
    expect(
      readMcpElicitation({
        ...request,
        requestedSchema: {
          type: 'object',
          properties: {},
          required: ['absent'],
        },
      }),
    ).toBeUndefined()
    expect(readMcpElicitation({ ...request, message: 'a'.repeat(4_001) })).toBeUndefined()
    expect(
      readMcpElicitation({
        ...request,
        requestedSchema: {
          type: 'object',
          properties: {
            choice: { type: 'string', enum: [] },
          },
          required: ['choice'],
        },
      }),
    ).toBeUndefined()
  })

  it('checks the response before any content is sent back to the server', () => {
    const form = readMcpElicitation(request)
    if (form === undefined) throw new Error('test schema was not read')
    expect(validMcpElicitationContent(form, { name: 'Ada', count: 2, urgent: false })).toBe(true)
    expect(validMcpElicitationContent(form, { name: 'A', count: 2 })).toBe(false)
    expect(validMcpElicitationContent(form, { name: 'Ada', count: 2.5 })).toBe(false)
    expect(validMcpElicitationContent(form, { name: 'Ada', count: 6 })).toBe(false)
    expect(validMcpElicitationContent(form, { name: 'Ada', count: 2, email: 'invalid' })).toBe(false)
    expect(validMcpElicitationContent(form, { name: 'Ada', count: 2, channel: 'sms' })).toBe(false)
    expect(validMcpElicitationContent(form, { name: 'Ada', count: 2, secret: 'injected' })).toBe(false)
    expect(validMcpElicitationContent(form, { name: 'Ada' })).toBe(false)
  })
})
