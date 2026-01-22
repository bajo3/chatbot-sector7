import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './LoginPage';
import InboxPage from './InboxPage';
import ChatPage from './ChatPage';

function isAuthed() {
  return !!localStorage.getItem('token');
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={isAuthed() ? <InboxPage /> : <Navigate to="/login" replace />} />
      <Route path="/c/:id" element={isAuthed() ? <ChatPage /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
