"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import type { HelpNavGroup, HelpNavPage } from "@/lib/help/types";

function isActiveHref(currentPath: string, href: string): boolean {
  return currentPath === href;
}

function groupHasActiveDescendant(
  currentPath: string,
  group: HelpNavGroup,
): boolean {
  for (const item of group.items) {
    if (item.kind === "page") {
      if (isActiveHref(currentPath, item.href)) return true;
    } else {
      if (groupHasActiveDescendant(currentPath, item)) return true;
    }
  }
  return false;
}

function PageLink({
  page,
  depth,
  currentPath,
}: {
  page: HelpNavPage;
  depth: number;
  currentPath: string;
}) {
  const active = isActiveHref(currentPath, page.href);
  return (
    <Link
      href={page.href}
      className={[
        "block rounded px-2 py-1 text-base",
        active
          ? "bg-gray-900 text-white"
          : "text-gray-300 hover:bg-gray-900/60 hover:text-white",
      ].join(" ")}
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      {page.title}
    </Link>
  );
}

function Group({
  group,
  depth,
  currentPath,
}: {
  group: HelpNavGroup;
  depth: number;
  currentPath: string;
}) {
  const defaultOpen = useMemo(() => {
    return groupHasActiveDescendant(currentPath, group);
  }, [currentPath, group]);

  const [open, setOpen] = useState(defaultOpen);
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen);

  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen);
    if (defaultOpen) {
      setOpen(true);
    }
  }

  if (
    group.href &&
    group.items.length === 1 &&
    group.items[0]?.kind === "page" &&
    group.items[0].href === group.href
  ) {
    return (
      <PageLink
        page={{
          kind: "page",
          title: group.title,
          href: group.href,
          slug: group.slug ?? [],
          order: group.order,
        }}
        depth={depth}
        currentPath={currentPath}
      />
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded px-2 py-1 text-base text-gray-200 hover:bg-gray-900/60 flex items-center gap-2"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <ChevronRight
          className={[
            "h-4 w-4 text-gray-400 transition-transform",
            open ? "rotate-90" : "rotate-0",
          ].join(" ")}
        />
        <span className="truncate">{group.title}</span>
      </button>

      {open && (
        <div className="mt-1">
          {group.items.map((item) => {
            if (item.kind === "page") {
              return (
                <PageLink
                  key={item.href}
                  page={item}
                  depth={depth + 1}
                  currentPath={currentPath}
                />
              );
            }
            return (
              <Group
                key={item.slug?.join("/") ?? item.title}
                group={item}
                depth={depth + 1}
                currentPath={currentPath}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HelpNavClient({ nav }: { nav: HelpNavGroup }) {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Help Center Navigation">
      <Link
        href="/help"
        className={[
          "block rounded px-2 py-1 text-base font-medium",
          pathname === "/help"
            ? "bg-gray-900 text-white"
            : "text-gray-200 hover:bg-gray-900/60",
        ].join(" ")}
      >
        Overview
      </Link>
      <div className="mt-2">
        {nav.items.map((item) => {
          if (item.kind === "page") {
            return (
              <PageLink
                key={item.href}
                page={item}
                depth={0}
                currentPath={pathname}
              />
            );
          }
          return (
            <Group
              key={item.slug?.join("/") ?? item.title}
              group={item}
              depth={0}
              currentPath={pathname}
            />
          );
        })}
      </div>
    </nav>
  );
}
