import { Router, type Request, type RequestHandler } from "express";
import multer from "multer";
import { MAX_RESUME_FILE_BYTES } from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import { createLimiter, type Limits } from "../../middleware/rateLimit.js";
import type { ResumeService } from "./resumes.service.js";

interface Deps {
  service: ResumeService;
  authenticate: RequestHandler;
  limits: Limits;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RESUME_FILE_BYTES,
    files: 1,
  },
});

export function createResumesRouter({ service, authenticate, limits }: Deps): Router {
  const router = Router();
  router.use(authenticate);

  const uploadLimit = createLimiter({ ...limits.resumeUpload, keyBy: "user" });
  const me = (req: Request) => (req.user as NonNullable<Request["user"]>).id;
  const paramId = (req: Request) => String(req.params["id"]);

  router.get("/", async (req, res) => {
    const resumes = await service.list(me(req));
    res.json({ resumes });
  });

  router.post(
    "/upload",
    uploadLimit,
    (req, res, next) => {
      upload.single("resume")(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return next(
              AppError.badRequest(
                `File exceeds size limit of ${MAX_RESUME_FILE_BYTES / (1024 * 1024)}MB`,
                "FILE_TOO_LARGE",
              ),
            );
          }
          return next(AppError.badRequest("File upload failed", "UPLOAD_FAILED"));
        }
        next();
      });
    },
    async (req, res) => {
      if (!req.file) {
        throw AppError.badRequest(
          "No file uploaded. Please select a PDF or DOCX resume.",
          "NO_FILE",
        );
      }

      const resume = await service.uploadAndParse(
        me(req),
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
      res.status(201).json({ resume });
    },
  );

  router.get("/:id", async (req, res) => {
    const resume = await service.get(me(req), paramId(req));
    res.json({ resume });
  });

  router.delete("/:id", async (req, res) => {
    await service.delete(me(req), paramId(req));
    res.status(204).end();
  });

  return router;
}
