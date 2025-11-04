"use client";

import { useState, useEffect, useCallback } from "react";

interface UseFragmentNavigationOptions<T extends string> {
  defaultTab: T;
  validTabs: T[];
}

interface UseFragmentNavigationReturn<T extends string> {
  activeTab: T;
  setActiveTab: (tab: T) => void;
}

export function useFragmentNavigation<T extends string>({
  defaultTab,
  validTabs,
}: UseFragmentNavigationOptions<T>): UseFragmentNavigationReturn<T> {
  const [activeTab, setActiveTabState] = useState<T>(defaultTab);

  // Function to get tab from fragment
  const getTabFromFragment = useCallback((): T => {
    if (typeof window === "undefined") return defaultTab;
    
    const hash = window.location.hash.slice(1); // Remove the '#'
    return validTabs.includes(hash as T) ? (hash as T) : defaultTab;
  }, [defaultTab, validTabs]);

  // Function to update URL fragment without using Next.js router
  const updateFragment = useCallback((tab: T) => {
    if (typeof window === "undefined") return;
    
    const newUrl = tab === defaultTab 
      ? window.location.pathname + window.location.search
      : `${window.location.pathname}${window.location.search}#${tab}`;
    
    // Use history.replaceState to avoid triggering hashchange
    window.history.replaceState(null, '', newUrl);
  }, [defaultTab]);

  // Initialize tab from URL fragment on mount
  useEffect(() => {
    const tabFromFragment = getTabFromFragment();
    setActiveTabState(tabFromFragment);
  }, [getTabFromFragment]);

  // Listen for hash changes (back/forward navigation only)
  useEffect(() => {
    const handleHashChange = () => {
      const tabFromFragment = getTabFromFragment();
      setActiveTabState(tabFromFragment);
    };

    // Listen for popstate events (back/forward navigation)
    window.addEventListener("popstate", handleHashChange);
    return () => window.removeEventListener("popstate", handleHashChange);
  }, [getTabFromFragment]);

  // Custom setActiveTab that updates both state and URL
  const setActiveTab = useCallback((tab: T) => {
    setActiveTabState(tab);
    updateFragment(tab);
  }, [updateFragment]);

  return {
    activeTab,
    setActiveTab,
  };
}