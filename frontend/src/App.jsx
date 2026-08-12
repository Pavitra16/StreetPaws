import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/common/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';
import Spinner from './components/common/Spinner';

import Home from './pages/Home';

/**
 * Everything below the landing page is loaded on demand.
 *
 * Statically importing all of it meant one bundle containing the map, both
 * staff consoles and every form — so a visitor arriving on a phone downloaded
 * the admin console before they could read the home page. The people this is
 * built for are standing on a street next to an injured animal, often on mobile
 * data, and the first screen has to arrive fast.
 *
 * Home stays static: it is the most common entry point and lazy-loading it
 * would only add a spinner between the HTML and the first paint.
 *
 * Leaflet is the single biggest dependency and is reached only from Report,
 * Find and the two detail pages, so it now travels with those chunks instead of
 * with every page load.
 */
const ReportDog = lazy(() => import('./pages/ReportDog'));
const FindDog = lazy(() => import('./pages/FindDog'));
const ReportDetail = lazy(() => import('./pages/ReportDetail'));
const Adopt = lazy(() => import('./pages/Adopt'));
const AdoptionDetail = lazy(() => import('./pages/AdoptionDetail'));
const Donate = lazy(() => import('./pages/Donate'));
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const OrgRegister = lazy(() => import('./pages/OrgRegister'));
const NotFound = lazy(() => import('./pages/NotFound'));

const RescuerLayout = lazy(() => import('./components/rescuer/RescuerLayout'));
const RescuerCases = lazy(() => import('./pages/rescuer/RescuerCases'));
const RescuerListings = lazy(() => import('./pages/rescuer/RescuerListings'));
const RescuerEnquiries = lazy(() => import('./pages/rescuer/RescuerEnquiries'));
const ListingCreate = lazy(() => import('./pages/ListingCreate'));

const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminApplications = lazy(() => import('./pages/admin/AdminApplications'));
const AdminOrganizations = lazy(() => import('./pages/admin/AdminOrganizations'));
const AdminOrgDetail = lazy(() => import('./pages/admin/AdminOrgDetail'));

export default function App() {
  return (
    /**
     * One boundary around the whole tree rather than one per route.
     *
     * Per-route boundaries would let the shell stay mounted while a chunk
     * loads, but the shells themselves are lazy here, so there would be
     * nothing left to hold. A single fallback also means a visitor never sees
     * two spinners stacked when a layout and its child both need fetching.
     */
    <Suspense fallback={<Spinner label="Loading…" />}>
      <Routes>
        {/* Public site. */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/report" element={<ReportDog />} />
          <Route path="/find" element={<FindDog />} />
          <Route path="/reports/:id" element={<ReportDetail />} />
          <Route path="/adopt" element={<Adopt />} />
          <Route path="/adopt/:id" element={<AdoptionDetail />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/organizations/apply" element={<OrgRegister />} />

          <Route
            path="/account/password"
            element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            }
          />
          <Route path="/reports" element={<Navigate to="/find" replace />} />
          <Route path="/organizations/new" element={<Navigate to="/organizations/apply" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/*
          Rescuer workspace — its own shell, outside the public Layout, for the
          same reason as the admin console: triaging injured dogs is a job, not
          browsing the site.
        */}
        <Route
          path="/rescuer"
          element={
            <ProtectedRoute roles={['ngo', 'helper']}>
              <RescuerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<RescuerCases />} />
          <Route path="listings" element={<RescuerListings />} />
          <Route path="listings/new" element={<ListingCreate />} />
          <Route path="enquiries" element={<RescuerEnquiries />} />
        </Route>

        {/*
          Admin console — its own shell, outside the public Layout. An administrator
          reviewing applications is not browsing the website, and putting
          "Report a Dog / Adopt / Donate" above a review queue made the console read
          as just another page of the site.
        */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminOverview />} />
          <Route path="applications" element={<AdminApplications />} />
          <Route
            path="ngos"
            element={
              <AdminOrganizations
                kind="ngo"
                title="NGOs"
                blurb="Approved organisations receiving reports and listing dogs for adoption."
              />
            }
          />
          <Route
            path="rescuers"
            element={
              <AdminOrganizations
                kind="private_helper"
                title="Independent rescuers"
                blurb="Approved individuals responding to reports in their area."
              />
            }
          />
          <Route path="organizations/:id" element={<AdminOrgDetail />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
