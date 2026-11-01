import { createRoot } from 'react-dom/client'
import Panel from './Panel'

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(<Panel />)
}
