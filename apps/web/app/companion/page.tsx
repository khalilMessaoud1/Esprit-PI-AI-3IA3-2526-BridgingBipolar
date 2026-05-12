"use client";

import AppShell from "../../components/AppShell";
import CompanionChat from "../../components/CompanionChat";
import ProtectedRoute from "../../components/ProtectedRoute";

export default function CompanionPage() {
  return (
    <ProtectedRoute>
      <AppShell layout="companion">
        <CompanionChat />
      </AppShell>
    </ProtectedRoute>
  );
}
