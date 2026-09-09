import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell, RequireAuth } from './components/AppShell'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ChatsPage } from './pages/ChatsPage'
import { LoginPage } from './pages/LoginPage'
import { GeneralSettings } from './pages/settings/GeneralSettings'
import { ImportSettings } from './pages/settings/ImportSettings'
import { MembersSettings } from './pages/settings/MembersSettings'
import { SettingsLayout } from './pages/settings/SettingsLayout'
import { TelegramSettings } from './pages/settings/TelegramSettings'
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
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="general" replace />} />
              <Route path="general" element={<GeneralSettings />} />
              <Route path="telegram" element={<TelegramSettings />} />
              <Route path="members" element={<MembersSettings />} />
              <Route path="import" element={<ImportSettings />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
