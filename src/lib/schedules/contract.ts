import { defineContract, schemas, type } from "../api/contract";
import type {
  addScheduleSchemas,
  getSchedulesSchemas,
  removeSchedulesSchemas,
} from "./schemas";
import type {
  DeleteSchedulesResponse,
  GetSchedulesResponse,
  ScheduleItem,
} from "./types";

export const getSchedules = defineContract({
  method: "GET",
  path: "/api/schedules",
  label: "Get show schedules",
  schemas: schemas<typeof getSchedulesSchemas>(),
  response: type<GetSchedulesResponse>(),
});

export const addSchedule = defineContract({
  method: "POST",
  path: "/api/schedules",
  label: "Add show to schedule",
  status: 201,
  schemas: schemas<typeof addScheduleSchemas>(),
  response: type<ScheduleItem>(),
  errors: {
    notFound: {
      status: 404,
      message:
        "TV show not found in your library. Add it to your library first.",
    },
    invalidStatus: {
      status: 400,
      message:
        "Cannot schedule completed or dropped shows. Only shows that are planning, watching, or paused can be scheduled.",
    },
    duplicate: {
      status: 409,
      message: "Show is already scheduled for this day",
    },
  },
});

export const removeSchedules = defineContract({
  method: "DELETE",
  path: "/api/schedules",
  label: "Remove show from schedule",
  schemas: schemas<typeof removeSchedulesSchemas>(),
  response: type<DeleteSchedulesResponse>(),
  errors: {
    notFound: { status: 404, message: "Schedule not found" },
  },
});
