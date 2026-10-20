import { Router, type RequestHandler } from "express";
import { updateNotificationPreferencesSchema } from "@codementor/shared";
import { validateBody } from "../../middleware/validate.js";
import type { NotificationsService } from "./notifications.service.js";

interface NotificationsRouterDeps {
  service: NotificationsService;
  authenticate: RequestHandler;
}

export function createNotificationsRouter({
  service,
  authenticate,
}: NotificationsRouterDeps): Router {
  const router = Router();
  router.use(authenticate);

  /** GET /api/v1/notifications — list notifications */
  router.get("/", async (req, res, next) => {
    try {
      const user = req.user!;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const unreadOnly = req.query.unreadOnly === "true";

      const result = await service.list(user.id, { page, limit, unreadOnly });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /** GET /api/v1/notifications/unread-count — unread badge count */
  router.get("/unread-count", async (req, res, next) => {
    try {
      const user = req.user!;
      const count = await service.getUnreadCount(user.id);
      res.json(count);
    } catch (err) {
      next(err);
    }
  });

  /** PATCH /api/v1/notifications/:id/read — mark as read */
  router.patch("/:id/read", async (req, res, next) => {
    try {
      const user = req.user!;
      const updated = await service.markAsRead(user.id, req.params.id);
      if (!updated) {
        res.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
        return;
      }
      res.json({ notification: updated });
    } catch (err) {
      next(err);
    }
  });

  /** POST /api/v1/notifications/read-all — mark all as read */
  router.post("/read-all", async (req, res, next) => {
    try {
      const user = req.user!;
      const result = await service.markAllAsRead(user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /** GET /api/v1/notifications/preferences — get notification preferences */
  router.get("/preferences", async (req, res, next) => {
    try {
      const user = req.user!;
      const prefs = await service.getPreferences(user.id);
      res.json({ preferences: prefs });
    } catch (err) {
      next(err);
    }
  });

  /** PUT or PATCH /api/v1/notifications/preferences — update notification preferences */
  const handleUpdatePrefs: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user!;
      const updated = await service.updatePreferences(user.id, req.body);
      res.json({ preferences: updated });
    } catch (err) {
      next(err);
    }
  };

  router.put("/preferences", validateBody(updateNotificationPreferencesSchema), handleUpdatePrefs);
  router.patch(
    "/preferences",
    validateBody(updateNotificationPreferencesSchema),
    handleUpdatePrefs,
  );

  return router;
}
