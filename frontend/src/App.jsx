import { Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/common/Layout';
import AdminLayout from './components/admin/AdminLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

import Home from './pages/Home';
import ReportDog from './pages/ReportDog';
import FindDog from './pages/FindDog';
import ReportDetail from './pages/ReportDetail';
import Adopt from './pages/Adopt';
import AdoptionDetail from './pages/AdoptionDetail';
import Donate from './pages/Donate';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';
import OrgRegister from './pages/OrgRegister';
import ListingCreate from './pages/ListingCreate';
import NotFound from './pages/NotFound';

import RescuerLayout from './components/rescuer/RescuerLayout';
import RescuerCases from './pages/rescuer/RescuerCases';
import RescuerListings from './pages/rescuer/RescuerListings';
import RescuerEnquiries from './pages/rescuer/RescuerEnquiries';

import AdminOverview from './pages/admin/AdminOverview';
import AdminApplications from './pages/admin/AdminApplications';
import AdminOrganizations from './pages/admin/AdminOrganizations';
import AdminOrgDetail from './pages/admin/AdminOrgDetail';

export default function App() {
  return (
    <Routes>
      {/* Public site + rescuer workspace — shares the public header. */}
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
  );
}
