"use client";

import dynamic from "next/dynamic";
import AppShell from "../../components/AppShell";
import ProtectedRoute from "../../components/ProtectedRoute";
import PageLoading from "../../components/PageLoading";

const CompanionChat = dynamic(() => import("../../components/CompanionChat"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <PageLoading />
    </div>
  ),
});

export default function CompanionPage() {
  return (
    <ProtectedRoute>
      <AppShell layout="companion">
        <CompanionChat />
      </AppShell>
    </ProtectedRoute>
  );
}
