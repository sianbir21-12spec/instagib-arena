import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import './firebase';
import './game/mobile-patch';
import Landing from './pages/Landing';

const InstagibClient = lazy(() => import('./InstagibClient'));
const PodiumLab = lazy(() => import('./PodiumLab'));
const LockerLab = lazy(() => import('./LockerLab'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const Loading = () => <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#0a0a0b',color:'#6b7280'}}>Loading...</div>;

createRoot(document.getElementById('root')!).render(
  <BrowserRouter><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/play" element={<Suspense fallback={<Loading />}><InstagibClient /></Suspense>} />
    <Route path="/podiumlab" element={<Suspense fallback={<Loading />}><PodiumLab /></Suspense>} />
    <Route path="/lockerlab" element={<Suspense fallback={<Loading />}><LockerLab /></Suspense>} />
    <Route path="/admin" element={<Suspense fallback={<Loading />}><AdminDashboard /></Suspense>} />
  </Routes></BrowserRouter>,
);
