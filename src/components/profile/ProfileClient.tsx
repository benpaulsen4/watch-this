"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Settings,
  Shield,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProfilePictureManager } from "./ProfilePictureManager";
import { UsernameChanger } from "./UsernameChanger";
import { PasskeyDevicesViewer } from "./PasskeyDevicesViewer";
import { DataExportImport } from "./DataExportImport";
import { TimezoneSelector } from "./TimezoneSelector";
import { useAuth } from "../providers/AuthProvider";

export function ProfileClient() {
  const router = useRouter();
  const { user, refreshSession } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "data">(
    "profile",
  );

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
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/dashboard")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold text-gray-100">My Profile</h1>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-red-400 border-red-400 hover:bg-red-400 hover:text-white"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card variant="entertainment">
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
          </div>
        </div>
      </main>
    </div>
  );
}
