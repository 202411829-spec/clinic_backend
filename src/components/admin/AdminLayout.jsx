import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export default function AdminLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex-1 h-screen overflow-y-auto">
        <TopBar />
        <main className="px-4 pb-10 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
