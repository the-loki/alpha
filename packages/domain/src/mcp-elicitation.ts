/** The flat, primitive form that MCP 2025-06-18 elicitation permits. */
import type { Undef } from './maybe.ts'

export type McpElicitationValue = string | number | boolean
export type McpElicitationContent = Record<string, McpElicitationValue>

export interface McpElicitationField {
  name: string
  title: string
  type: 'string' | 'number' | 'integer' | 'boolean'
  required: boolean
  description?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  format?: 'email' | 'uri' | 'date' | 'date-time'
  enum?: string[]
  enumNames?: string[]
  default?: boolean
}

export interface McpElicitation {
  message: string
  fields: McpElicitationField[]
}

const objectOf = (input: unknown): Undef<Record<string, unknown>> =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined

const boundedText = (input: unknown, maximum: number): Undef<string> =>
  typeof input === 'string' && input.length <= maximum ? input : undefined

const nonnegativeInteger = (input: unknown): Undef<number> =>
  typeof input === 'number' && Number.isInteger(input) && input >= 0 && input <= 10_000 ? input : undefined

const finiteNumber = (input: unknown): Undef<number> =>
  typeof input === 'number' && Number.isFinite(input) ? input : undefined

function readStringField(raw: Record<string, unknown>, field: McpElicitationField): Undef<McpElicitationField> {
  const minLength = raw.minLength === undefined ? undefined : nonnegativeInteger(raw.minLength)
  const maxLength = raw.maxLength === undefined ? undefined : nonnegativeInteger(raw.maxLength)
  if (
    (raw.minLength !== undefined && minLength === undefined) ||
    (raw.maxLength !== undefined && maxLength === undefined) ||
    (minLength !== undefined && maxLength !== undefined && minLength > maxLength)
  )
    return undefined
  const format = raw.format
  if (format !== undefined && format !== 'email' && format !== 'uri' && format !== 'date' && format !== 'date-time') {
    return undefined
  }
  if (
    raw.enum !== undefined &&
    (!Array.isArray(raw.enum) ||
      raw.enum.length === 0 ||
      raw.enum.length > 50 ||
      raw.enum.some((value: unknown) => typeof value !== 'string'))
  )
    return undefined
  if (
    raw.enumNames !== undefined &&
    (!Array.isArray(raw.enumNames) ||
      raw.enumNames.length !== raw.enum?.length ||
      raw.enumNames.some((value: unknown) => typeof value !== 'string'))
  )
    return undefined
  return {
    ...field,
    minLength,
    maxLength,
    format,
    enum: raw.enum as Undef<string[]>,
    enumNames: raw.enumNames as Undef<string[]>,
  }
}

function readField(name: string, input: unknown, required: boolean): Undef<McpElicitationField> {
  const raw = objectOf(input)
  if (raw === undefined || name === '' || name.length > 100) return undefined
  const type = raw.type
  if (type !== 'string' && type !== 'number' && type !== 'integer' && type !== 'boolean') return undefined
  const title = boundedText(raw.title, 200) ?? name
  const description = boundedText(raw.description, 1_000)
  const field: McpElicitationField = {
    name,
    title,
    type,
    required,
    ...(description === undefined ? {} : { description }),
  }
  if (type === 'string') return readStringField(raw, field)
  if (type === 'number' || type === 'integer') {
    const minimum = raw.minimum === undefined ? undefined : finiteNumber(raw.minimum)
    const maximum = raw.maximum === undefined ? undefined : finiteNumber(raw.maximum)
    if (
      (raw.minimum !== undefined && minimum === undefined) ||
      (raw.maximum !== undefined && maximum === undefined) ||
      (minimum !== undefined && maximum !== undefined && minimum > maximum)
    )
      return undefined
    return { ...field, minimum, maximum }
  }
  if (raw.default !== undefined && typeof raw.default !== 'boolean') return undefined
  return { ...field, default: raw.default as Undef<boolean> }
}

/** Reads only the schema shape Alpha can show and validate; an unsupported request is refused. */
export function readMcpElicitation(input: unknown): Undef<McpElicitation> {
  const params = objectOf(input)
  const schema = objectOf(params?.requestedSchema)
  const properties = objectOf(schema?.properties)
  const message = boundedText(params?.message, 4_000)
  if (message === undefined || message.trim() === '' || schema?.type !== 'object' || properties === undefined) {
    return undefined
  }
  const names = Object.keys(properties)
  if (names.length > 24) return undefined
  const listed = schema.required === undefined ? [] : schema.required
  if (!Array.isArray(listed) || listed.some((name: unknown) => typeof name !== 'string' || !names.includes(name))) {
    return undefined
  }
  const fields = names.map((name) => readField(name, properties[name], listed.includes(name)))
  if (fields.some((field) => field === undefined)) return undefined
  return { message, fields: fields as McpElicitationField[] }
}

function validFormat(format: Undef<McpElicitationField['format']>, value: string): boolean {
  if (format === undefined) return true
  if (format === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  if (format === 'uri') {
    try {
      return new URL(value).protocol !== ''
    } catch {
      return false
    }
  }
  if (format === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

function validValue(field: McpElicitationField, value: unknown): boolean {
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'number' || field.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    if (field.type === 'integer' && !Number.isInteger(value)) return false
    return (
      (field.minimum === undefined || value >= field.minimum) && (field.maximum === undefined || value <= field.maximum)
    )
  }
  if (typeof value !== 'string') return false
  return (
    (field.minLength === undefined || value.length >= field.minLength) &&
    (field.maxLength === undefined || value.length <= field.maxLength) &&
    (field.enum === undefined || field.enum.includes(value)) &&
    validFormat(field.format, value)
  )
}

/** The main-process check on a form answer, regardless of what the window validated. */
export function validMcpElicitationContent(form: McpElicitation, input: unknown): input is McpElicitationContent {
  const content = objectOf(input)
  if (content === undefined) return false
  const fields = new Map(form.fields.map((field) => [field.name, field]))
  for (const [name, value] of Object.entries(content)) {
    const field = fields.get(name)
    if (field === undefined || !validValue(field, value)) return false
  }
  return form.fields.every((field) => !field.required || Object.hasOwn(content, field.name))
}
