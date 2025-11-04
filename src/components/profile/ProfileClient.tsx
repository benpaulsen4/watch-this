"use client";

import { useRouter } from "next/navigation";
import { User as UserIcon, Settings, Shield, LogOut, Tv } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProfilePictureManager } from "./ProfilePictureManager";
import { UsernameChanger } from "./UsernameChanger";
import { PasskeyDevicesViewer } from "./PasskeyDevicesViewer";
import { DataExportImport } from "./DataExportImport";
import { TimezoneSelector } from "./TimezoneSelector";
import { PageHeader } from "../ui/PageHeader";
import { useAuth } from "../providers/AuthProvider";
import { StreamingPreferences } from "./StreamingPreferences";
import { useFragmentNavigation } from "@/hooks/useFragmentNavigation";

type ProfileTab = "profile" | "security" | "data" | "streaming";

export function ProfileClient() {
  const router = useRouter();
  const { user, refreshSession } = useAuth();

  const { activeTab, setActiveTab } = useFragmentNavigation<ProfileTab>({
    defaultTab: "profile",
    validTabs: ["profile", "security", "data", "streaming"],
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/auth");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleUserUpdate = async () => await refreshSession();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader title="My Profile" backLinkHref="/dashboard">
        <Button variant="destructive" onClick={handleLogout}>
          <LogOut className="h-5 w-5 mr-2" />
          Logout
        </Button>
      </PageHeader>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card size="sm">
              <CardContent>
                <nav className="space-y-2">
                  <button
                    onClick={() => setActiveTab("profile")}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "profile"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
                    }`}
                  >
                    <UserIcon className="h-4 w-4" />
                    Profile
                  </button>
                  <button
                    onClick={() => setActiveTab("security")}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "security"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
                    }`}
                  >
                    <Shield className="h-4 w-4" />
                    Security
                  </button>
                  <button
                    onClick={() => setActiveTab("streaming")}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "streaming"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
                    }`}
                  >
                    <Tv className="h-4 w-4" />
                    Streaming
                  </button>
                  <button
                    onClick={() => setActiveTab("data")}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "data"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                    Data Management
                  </button>
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === "profile" && (
              <div className="space-y-6">
                <Card variant="entertainment">
                  <CardHeader>
                    <CardTitle className="text-gray-100">
                      Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <ProfilePictureManager
                      user={user}
                      onUserUpdate={handleUserUpdate}
                    />
                    <UsernameChanger
                      user={user}
                      onUserUpdate={handleUserUpdate}
                    />
                    <TimezoneSelector
                      user={user}
                      onUserUpdate={handleUserUpdate}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                <Card variant="entertainment">
                  <CardHeader>
                    <CardTitle className="text-gray-100">
                      Security Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PasskeyDevicesViewer />
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "data" && (
              <div className="space-y-6">
                <Card variant="entertainment">
                  <CardHeader>
                    <CardTitle className="text-gray-100">
                      Data Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataExportImport />
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "streaming" && (
              <div className="space-y-6">
                <Card variant="entertainment">
                  <CardHeader>
                    <CardTitle className="text-gray-100">
                      Streaming Preferences
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <StreamingPreferences />
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
