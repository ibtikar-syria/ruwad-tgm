import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell, RequireAuth } from './components/AppShell'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ChatsPage } from './pages/ChatsPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/chats" element={<ChatsPage />} />
            <Route path="/groups" element={<Navigate to="/chats" replace />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
