"use client";

import {
  ContentCard,
  ContentCardProps,
} from "@/components/content/ContentCard";
import { useProgressRouter } from "@/hooks/useProgressRouter";

export function ListItemWrapper(props: ContentCardProps) {
  const router = useProgressRouter();

  return (
    <ContentCard
      {...props}
      onListInclusionChanged={() => {
        router.refresh();
        props.onListInclusionChanged?.();
      }}
    />
  );
}
