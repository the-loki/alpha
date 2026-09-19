/**
 * A value that is not there. `undefined` is the absence value (C1.2), and this is how absence is
 * named where a `?` cannot say it: a return type, a generic argument, an element of a collection,
 * a parameter the caller has to pass either way.
 *
 * An optional property or an omittable parameter keeps its `?` — `foo?: T` already means this, and
 * it lets the caller leave the name out rather than spell `undefined` into it, which is the whole
 * point. Where a value is passed to a call that cannot omit it, `Absent<T>` says "pass the absence
 * deliberately" rather than leaving a bare union for the reader to parse.
 */
export type Absent<T> = T | undefined // constraints-ignore 01-typescript: the alias is where the union is spelled
