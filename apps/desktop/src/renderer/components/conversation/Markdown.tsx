import { For, type JSX, Show } from 'solid-js'
import {
  childrenOf,
  endsHere,
  isLoose,
  isTaskItem,
  listClassOf,
  type MdNode,
  safeUrl,
  treeOf,
} from '../../lib/markdown-tree.ts'

/**
 * Message text renders as markdown, built from elements rather than injected HTML, so a model that
 * writes a script tag gets a script tag rendered rather than a script tag run: the tree is walked
 * here, each node becomes a real element, and raw HTML is one of the things rendered. The text voice
 * owns everything the model wrote (C5.3); the measuring voice is only the code in it.
 */
const CARET = () => <span class="caret ml-0.5" aria-hidden="true" />

/** The caret, when this node is where the text stops. */
const Tail = (props: { node: MdNode; caret: boolean; end: number; children?: JSX.Element }) => (
  <>
    {props.children}
    <Show when={endsHere(props.node, props.caret, props.end)}>{CARET()}</Show>
  </>
)

/** Inline content: the marks inside a line of prose. */
function Inline(props: { node: MdNode }): JSX.Element {
  const children = () => <For each={props.node.children ?? []}>{(child) => <Inline node={child} />}</For>

  switch (props.node.type) {
    // Raw HTML is text here, never markup: this is the promise the whole file is built on.
    case 'text':
    case 'html':
      return <>{props.node.value ?? ''}</>
    case 'emphasis':
      return <em>{children()}</em>
    case 'strong':
      // Semibold, the heading weight (C5.3): the page has no bold in it.
      return <strong class="font-semibold">{children()}</strong>
    case 'delete':
      return <del>{children()}</del>
    case 'inlineCode':
      return (
        <code class="rounded-sm bg-surface-1 px-1 py-0.5 font-mono text-code text-foreground">
          {props.node.value ?? ''}
        </code>
      )
    case 'link':
      return (
        // A link is accent: it is the one mark of ink that says "there is somewhere else".
        <a
          class="text-accent underline underline-offset-2 transition-colors duration-normal hover:text-accent-hover"
          href={safeUrl(props.node.url ?? '')}
          title={props.node.title}
        >
          {children()}
        </a>
      )
    case 'image':
      return <img src={safeUrl(props.node.url ?? '')} alt={props.node.alt ?? ''} title={props.node.title} />
    case 'break':
      return <br />
    default:
      return children()
  }
}

/** A heading, in the three sizes the window sets prose in — all of them the heading weight. */
const Heading = (props: { children: JSX.Element; depth: number }): JSX.Element => {
  switch (props.depth) {
    case 1:
      return <h1 class="mb-2 mt-4 font-text text-title font-semibold tracking-tight">{props.children}</h1>
    case 2:
      return <h2 class="mb-2 mt-4 font-text text-lg font-semibold tracking-tight">{props.children}</h2>
    case 3:
      return <h3 class="mb-1.5 mt-3 font-text text-body font-semibold">{props.children}</h3>
    case 4:
      return <h4>{props.children}</h4>
    case 5:
      return <h5>{props.children}</h5>
    default:
      return <h6>{props.children}</h6>
  }
}

/**
 * A list. A list of checkboxes is not a bulleted list: the pipeline that drew these before named it
 * `contains-task-list`, and that name took the place of the list's own styling (as did the item's
 * `task-list-item`), which is what the window has always shown.
 */
function List(props: { node: MdNode; caret: boolean; end: number }): JSX.Element {
  const rows = () => (
    <For each={childrenOf(props.node)}>
      {(item) => <Item node={item} caret={props.caret} end={props.end} loose={isLoose(props.node)} />}
    </For>
  )

  return (
    <Show when={props.node.ordered === true} fallback={<ul class={listClassOf(props.node, false)}>{rows()}</ul>}>
      <ol
        class={listClassOf(props.node, true)}
        start={props.node.start === undefined || props.node.start === 1 ? undefined : props.node.start}
      >
        {rows()}
      </ol>
    </Show>
  )
}

/**
 * What an item holds. A tight item is text and marks, so its paragraph is not drawn — the item is
 * the paragraph; a loose one, or one with a list inside it, holds blocks the way any other place
 * does. That distinction is the markdown's own (the list's `spread`), and it is what keeps a nested
 * list from running together as run-on text.
 */
const Contents = (props: { node: MdNode; caret: boolean; end: number; loose: boolean }): JSX.Element => (
  <For each={childrenOf(props.node)}>
    {(child) =>
      props.loose || child.type !== 'paragraph' ? (
        <Block node={child} caret={props.caret} end={props.end} />
      ) : (
        <For each={childrenOf(child)}>{(part) => <Inline node={part} />}</For>
      )
    }
  </For>
)

const Item = (props: { node: MdNode; caret: boolean; end: number; loose: boolean }): JSX.Element => (
  <Show
    when={isTaskItem(props.node)}
    fallback={
      <li class="leading-[1.6]">
        <Tail node={props.node} caret={props.caret} end={props.end}>
          <Contents node={props.node} caret={props.caret} end={props.end} loose={props.loose} />
        </Tail>
      </li>
    }
  >
    <li class="task-list-item">
      <input type="checkbox" disabled checked={props.node.checked === true} />{' '}
      <Tail node={props.node} caret={props.caret} end={props.end}>
        <Contents node={props.node} caret={props.caret} end={props.end} loose={props.loose} />
      </Tail>
    </li>
  </Show>
)

/** A table, with the header row as headers and each column's alignment carried from the source. */
function Table(props: { node: MdNode }): JSX.Element {
  const styleOf = (column: number) => {
    const align = props.node.align?.[column]
    return align === undefined ? undefined : `text-align: ${align}`
  }

  return (
    <div class="mb-3 overflow-x-auto">
      <table class="w-full border-collapse font-text text-name">
        <For each={props.node.children ?? []}>
          {(row, index) => (
            <tr>
              <For each={row.children ?? []}>
                {(cell, column) => (
                  <Show
                    when={index() === 0}
                    fallback={
                      <td class="border border-line px-2 py-1 align-top" style={styleOf(column())}>
                        <For each={cell.children ?? []}>{(child) => <Inline node={child} />}</For>
                      </td>
                    }
                  >
                    <th class="border border-line px-2 py-1 text-left font-semibold" style={styleOf(column())}>
                      <For each={cell.children ?? []}>{(child) => <Inline node={child} />}</For>
                    </th>
                  </Show>
                )}
              </For>
            </tr>
          )}
        </For>
      </table>
    </div>
  )
}

/** A block: the shapes prose is set in, and the wells the machine's parts sit in (C5.4). */
function Block(props: { node: MdNode; caret: boolean; end: number }): JSX.Element {
  const children = () => <For each={props.node.children ?? []}>{(child) => <Inline node={child} />}</For>
  switch (props.node.type) {
    case 'paragraph':
      return (
        <p class="mb-3 last:mb-0 whitespace-pre-wrap">
          <Tail node={props.node} caret={props.caret} end={props.end}>
            {children()}
          </Tail>
        </p>
      )
    case 'blockquote':
      return (
        <blockquote class="mb-3 border-l-2 border-line pl-3 text-muted">
          <Tail node={props.node} caret={props.caret} end={props.end}>
            {children()}
          </Tail>
        </blockquote>
      )
    case 'code':
      return (
        <pre class="mb-3 overflow-x-auto rounded-md border border-line-subtle bg-surface-1 p-3 font-mono text-code text-muted">
          {/* The block's code is set plain: the well around it is the frame, and a pill inside a
              well was the inline mark wearing two coats. */}
          <code>{props.node.value ?? ''}</code>
          <Show when={endsHere(props.node, props.caret, props.end)}>{CARET()}</Show>
        </pre>
      )
    case 'heading':
      return <Heading depth={props.node.depth ?? 1}>{children()}</Heading>
    case 'list':
      return <List node={props.node} caret={props.caret} end={props.end} />
    case 'table':
      return <Table node={props.node} />
    case 'thematicBreak':
      return <hr class="my-4 border-line" />
    // A block of raw HTML, rendered the way an inline one is.
    case 'html':
      return <p class="mb-3 last:mb-0 whitespace-pre-wrap">{props.node.value ?? ''}</p>
    default:
      return children()
  }
}

export function Markdown(props: { text: string; caret?: boolean }) {
  const tree = () => treeOf(props.text)
  const end = () => props.text.trimEnd().length
  const caret = () => props.caret === true

  return (
    // `wrap-anywhere` inherits down the tree: prose keeps its line breaks, and a token too long
    // for either breaks instead of carrying the column away with it. The page fills the window —
    // the answer's own prose is the room the reader asked for (C5.3).
    <div class="wrap-anywhere font-text text-body text-foreground">
      <For each={tree().children ?? []}>{(one) => <Block node={one} caret={caret()} end={end()} />}</For>
    </div>
  )
}
