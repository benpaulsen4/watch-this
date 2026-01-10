"use client";

import { Archive,Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import ListSettingsModal from "@/components/lists/ListSettingsModal";
import { Button } from "@/components/ui/Button";
import { ListListsResponse } from "@/lib/lists/types";

import { PageHeader } from "../ui/PageHeader";
import { ListCard } from "./ListCard";

export default function ListsClient({
  initialLists,
  title = "My Lists",
  isArchivedView = false,
}: {
  initialLists: ListListsResponse[];
  title?: string;
  isArchivedView?: boolean;
}) {
  const router = useRouter();
  const [lists, setLists] = useState<ListListsResponse[]>(initialLists);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader
        title={title}
        backLinkHref={isArchivedView ? "/lists" : "/dashboard"}
      >
        {!isArchivedView && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/lists/archived">
                <Archive className="h-5 w-5" />
                <span className="ml-2 hidden sm:block">Archive</span>
              </Link>
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-5 w-5" />
              <span className="ml-2 hidden sm:block">Create List</span>
            </Button>
          </>
        )}
      </PageHeader>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ListSettingsModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          mode="create"
          isOwner
          onListCreate={(created) => {
            setLists((prev) => [created as any, ...prev]);
          }}
        />

        {/* Lists Grid */}
        {lists.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              {isArchivedView ? (
                <Archive className="h-8 w-8 text-gray-600" />
              ) : (
                <Plus className="h-8 w-8 text-gray-600" />
              )}
            </div>
            <h3 className="text-xl font-medium text-gray-300 mb-2">
              No {isArchivedView ? "archived lists" : "lists"} yet
            </h3>
            <p className="text-gray-500 mb-6">
              {isArchivedView
                ? "Lists you archive in list settings will appear here"
                : "Create your first list to start organizing your favorite content"}
            </p>
            {!isArchivedView && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First List
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lists.map((list) => {
              return (
                <ListCard
                  key={list.id}
                  list={list}
                  onClick={() => router.push(`/lists/${list.id}`)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
