import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { AppRoutes } from './routes'
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider><AppRoutes /></AuthProvider>
    </BrowserRouter>
  )
}
