import { Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import HomePage from './pages/HomePage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

import BrowseListingsPage from './pages/BrowseListingsPage.jsx';
import ListingDetailsPage from './pages/ListingDetailsPage.jsx';
import CharityDashboard from './pages/CharityDashboard.jsx';
import RequestsPage from './pages/RequestsPage.jsx';

import RestaurantDashboard from './pages/RestaurantDashboard.jsx';
import ListingFormPage from './pages/ListingFormPage.jsx';
import ListingRequestsPage from './pages/ListingRequestsPage.jsx';

import AdminDashboard from './pages/AdminDashboard.jsx';

// Two shells:
//
//   MainLayout  — everything public: home, about, sign in, sign up.
//   AppLayout   — the signed-in product, with navigation limited to the
//                 current role's screens.
//
// ProtectedRoute picks off unauthenticated and wrong-role visits with a
// useful message. It is a courtesy, not a control: the endpoints behind
// each route re-check the token, the role and the organization themselves.

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route element={<AppLayout />}>
        {/* Charity */}
        <Route
          path="/charity"
          element={
            <ProtectedRoute roles={['CHARITY']}>
              <CharityDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/charity/requests"
          element={
            <ProtectedRoute roles={['CHARITY']}>
              <RequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse"
          element={
            <ProtectedRoute roles={['CHARITY']}>
              <BrowseListingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse/:id"
          element={
            <ProtectedRoute roles={['CHARITY']}>
              <ListingDetailsPage />
            </ProtectedRoute>
          }
        />

        {/* Restaurant */}
        <Route
          path="/restaurant"
          element={
            <ProtectedRoute roles={['RESTAURANT']}>
              <RestaurantDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/listings/new"
          element={
            <ProtectedRoute roles={['RESTAURANT']}>
              <ListingFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/listings/:id/edit"
          element={
            <ProtectedRoute roles={['RESTAURANT']}>
              <ListingFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/listings/:id/requests"
          element={
            <ProtectedRoute roles={['RESTAURANT']}>
              <ListingRequestsPage />
            </ProtectedRoute>
          }
        />

        {/* Administrator */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
