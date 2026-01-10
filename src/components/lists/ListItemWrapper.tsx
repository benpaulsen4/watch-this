"use client";

import { useRouter } from "next/navigation";

import {
  ContentCard,
  ContentCardProps,
} from "@/components/content/ContentCard";

export function ListItemWrapper(props: ContentCardProps) {
  const router = useRouter();

  return (
    <ContentCard
      {...props}
      onRemoveFromList={() => {
        router.refresh();
        props.onRemoveFromList?.();
      }}
    />
  );
}
