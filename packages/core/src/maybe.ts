/**
 * The two ways a value can be absent, each with a name.
 *
 * `Undef<T>` is the domain's absence: `undefined`, spelled once where a `?` cannot say it — a
 * return type, a generic argument, an element of a collection, a parameter the caller has to pass
 * either way. An optional property or an omittable parameter keeps its `?`, which already means
 * this and lets the caller leave the name out instead of writing `undefined` into the call.
 *
 * `Null<T>` is the boundary's absence: the one a foreign system speaks — a parsed JSON payload, a
 * vendor return, `document.querySelector`, a React ref. It is named so the boundary is visible, and
 * the module that received it converts the value to `undefined` before it travels any further
 * (C1.2). Neither alias is ever spelled as a bare union at a use site: the name is the point.
 */
export type Undef<T> = T | undefined // constraints-ignore 01-typescript: the alias is where the union is spelled
export type Null<T> = T | null // constraints-ignore 01-typescript: the alias is where the union is spelled
