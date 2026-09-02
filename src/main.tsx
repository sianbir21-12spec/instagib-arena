import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Landing from './pages/Landing';

const InstagibClient = lazy(() => import('./InstagibClient'));
const PodiumLab = lazy(() => import('./PodiumLab'));
const LockerLab = lazy(() => import('./LockerLab'));
const AdminPanel = lazy(() => import('./AdminPanel'));
const AdminCoins = lazy(() => import('./AdminCoins'));
const AimTrainingLab = lazy(() => import('./AimTrainingLab'));

const Loading = () => (
  <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0b', color: '#6b7280', fontFamily: 'system-ui, sans-serif' }}>
    Loading…
  </div>
);

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path='/' element={<Landing />} />
      <Route path='/play' element={<Suspense fallback={<Loading />}><InstagibClient /></Suspense>} />
      <Route path='/podiumlab' element={<Suspense fallback={<Loading />}><PodiumLab /></Suspense>} />
      <Route path='/lockerlab' element={<Suspense fallback={<Loading />}><LockerLab /></Suspense>} />
      <Route path='/admin' element={<Suspense fallback={<Loading />}><AdminPanel /></Suspense>} />
      <Route path='/admin/coins' element={<Suspense fallback={<Loading />}><AdminCoins /></Suspense>} />
      <Route path='/aim-lab' element={<Suspense fallback={<Loading />}><AimTrainingLab /></Suspense>} />
    </Routes>
  </BrowserRouter>,
);
