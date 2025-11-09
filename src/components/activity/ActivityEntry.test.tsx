import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ActivityEntry } from "./ActivityEntry";
import { ActivityType } from "@/lib/db/schema";
import type { Activity } from "./ActivityTimelineClient";

// Make relative time deterministic
vi.mock("date-fns", () => ({
  formatDistanceToNow: () => "just now",
}));

const baseUser = { id: "u1", username: "alice", profilePictureUrl: null };

function makeActivity(
  overrides: Partial<Activity> & { activityType: string }
): Activity {
  return {
    id: "a1",
    user: baseUser,
    tmdbId: 123,
    contentType: "tv",
    listId: undefined,
    metadata: {},
    isCollaborative: false,
    collaborators: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Activity;
}

describe("ActivityEntry", () => {
  it("renders STATUS_CHANGED description with title and status", () => {
    const activity = makeActivity({
      activityType: ActivityType.STATUS_CHANGED,
      metadata: { title: "Star Wars", status: "watched" },
    });
    render(<ActivityEntry activity={activity} currentUsername={"bob"} />);
    expect(screen.getByText(/Star Wars/)).toBeInTheDocument();
    expect(
      screen.getByText(/marked "Star Wars" as watched/)
    ).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("renders EPISODE_PROGRESS watched description", () => {
    const activity = makeActivity({
      activityType: ActivityType.EPISODE_PROGRESS,
      metadata: {
        title: "The Show",
        watched: true,
        seasonNumber: 1,
        episodeNumber: 2,
      } as unknown as Record<string, unknown>,
    });
    render(<ActivityEntry activity={activity} currentUsername={"bob"} />);
    expect(screen.getByText(/watched S1E2 of "The Show"/)).toBeInTheDocument();
  });

  it("renders EPISODE_PROGRESS not watched description", () => {
    const activity = makeActivity({
      activityType: ActivityType.EPISODE_PROGRESS,
      metadata: {
        title: "The Show",
        watched: false,
        seasonNumber: 3,
        episodeNumber: 7,
      } as unknown as Record<string, unknown>,
    });
    render(<ActivityEntry activity={activity} currentUsername={"bob"} />);
    expect(
      screen.getByText(/marked not watched S3E7 of "The Show"/)
    ).toBeInTheDocument();
  });

  it("capitalizes and replaces current user with 'You' when not collaborative", () => {
    const activity = makeActivity({
      activityType: ActivityType.LIST_CREATED,
      metadata: { listName: "Favorites" },
    });
    render(<ActivityEntry activity={activity} currentUsername={"alice"} />);
    // First word (username) should be capitalized "You"
    expect(screen.getByText(/^You/)).toBeInTheDocument();
  });

  it("formats collaborators: one collaborator shows 'You and bob'", () => {
    const activity = makeActivity({
      activityType: ActivityType.LIST_UPDATED,
      isCollaborative: true,
      collaborators: [{ id: "c1", username: "bob", profilePictureUrl: null }],
    });
    render(<ActivityEntry activity={activity} currentUsername={"alice"} />);
    expect(screen.getByText(/You and bob/)).toBeInTheDocument();
  });

  it("formats collaborators: two collaborators 'You, bob, and charlie'", () => {
    const activity = makeActivity({
      activityType: ActivityType.LIST_UPDATED,
      isCollaborative: true,
      collaborators: [
        { id: "c1", username: "bob", profilePictureUrl: null },
        { id: "c2", username: "charlie", profilePictureUrl: null },
      ],
    });
    render(<ActivityEntry activity={activity} currentUsername={"alice"} />);
    expect(screen.getByText(/You, bob, and charlie/)).toBeInTheDocument();
  });

  it("formats collaborators: more than three shows 'and N others'", () => {
    const activity = makeActivity({
      activityType: ActivityType.LIST_UPDATED,
      isCollaborative: true,
      collaborators: [
        { id: "c1", username: "bob", profilePictureUrl: null },
        { id: "c2", username: "charlie", profilePictureUrl: null },
        { id: "c3", username: "dave", profilePictureUrl: null },
        { id: "c4", username: "erin", profilePictureUrl: null },
      ],
    });
    render(<ActivityEntry activity={activity} currentUsername={"alice"} />);
    expect(
      screen.getByText(/You, bob, charlie, and 2 others/)
    ).toBeInTheDocument();
  });

  it("renders PROFILE_IMPORT summary with pluralization and errors", () => {
    const activity = makeActivity({
      activityType: ActivityType.PROFILE_IMPORT,
      metadata: {
        lists: "2",
        contentStatus: "1",
        episodeStatus: "3",
        errors: "1",
      },
    });
    render(<ActivityEntry activity={activity} currentUsername={"bob"} />);
    expect(
      screen.getByText(
        /imported 2 lists, 1 content status, 3 episode statuses \(1 error\)/
      )
    ).toBeInTheDocument();
  });
});
