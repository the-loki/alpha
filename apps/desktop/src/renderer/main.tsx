import { HashRouter, Route } from '@solidjs/router'
import { render } from 'solid-js/web'
import { TasksPage } from './components/tasks/TasksPage.tsx'
import { RootLayout } from './routes/__root.tsx'
import { ConversationRoute } from './routes/conversation.tsx'
import { NewConversation } from './routes/index.tsx'
import { Settings } from './routes/settings.tsx'
import './styles/app.css'

const container = document.getElementById('root')
if (container === null) throw new Error('index.html is missing #root')

// The window loads the built renderer from `file://`, where a path-based history has no route to
// match on first paint. Hash routing keeps every screen addressable — which is what the E2E suite
// drives — without pretending a file URL is a server. The paths are listed once, here, so the
// addresses the window answers on are readable in one screen.
render(
  () => (
    <HashRouter root={RootLayout}>
      <Route path="/" component={NewConversation} />
      <Route path="/c/:conversationId" component={ConversationRoute} />
      <Route path="/settings" component={Settings} />
      <Route path="/tasks" component={TasksPage} />
    </HashRouter>
  ),
  container,
)
