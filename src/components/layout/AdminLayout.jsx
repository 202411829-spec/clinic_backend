import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <div className="flex-1">
        <TopBar />
        <main className="px-4 pb-10 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
