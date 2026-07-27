import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { AppQueryProvider } from './lib/queryClient'
import { AppRoutes } from './routes'
import { UpdatePrompt } from './components/UpdatePrompt'
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <UpdatePrompt />
      <AuthProvider>
        <AppQueryProvider><AppRoutes /></AppQueryProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
