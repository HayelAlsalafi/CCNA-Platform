import { Router, type IRouter, type Response } from "express";
import {
  GetPracticeHistoryResponse,
  GetPracticeHistoryWithDetailsResponse,
  GetPracticeQuestionResponse,
  SubmitPracticeAnswerBody,
  SubmitPracticeAnswerResponse,
} from "@workspace/api-zod";
import { requireAuthenticatedUser } from "../middlewares/auth";
import {
  getPracticeHistory,
  getPracticeQuestionForTopic,
  PracticeApiError,
  submitPracticeAnswer,
} from "../lib/practice";

const router: IRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Practice question not found." } });
}

router.get(
  "/practice/history",
  requireAuthenticatedUser,
  async (req, res): Promise<void> => {
    if (!req.dbUser) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Authentication is required." },
      });
      return;
    }

    const rawLimit = req.query["limit"];
    const rawCursor = req.query["cursor"];
    const rawDetails = req.query["includeDetails"];
    if (rawDetails !== undefined && rawDetails !== "true" && rawDetails !== "false") {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "includeDetails must be true or false." },
      });
      return;
    }
    const includeDetails = rawDetails === "true";

    if (
      (rawLimit !== undefined &&
        (typeof rawLimit !== "string" ||
          !/^[1-9]\d*$/.test(rawLimit) ||
          Number(rawLimit) > 100)) ||
      (rawCursor !== undefined &&
        (typeof rawCursor !== "string" ||
          rawCursor.length === 0 ||
          rawCursor.length > 512 ||
          !/^[A-Za-z0-9_-]+$/.test(rawCursor)))
    ) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid pagination parameters." },
      });
      return;
    }

    const limit = rawLimit === undefined ? 20 : Number(rawLimit);

    try {
      const result = await getPracticeHistory(
        req.dbUser.id,
        limit,
        rawCursor as string | undefined,
        undefined,
        includeDetails,
      );

      const schema = includeDetails
        ? GetPracticeHistoryWithDetailsResponse
        : GetPracticeHistoryResponse;
      res.json(schema.parse(result));
    } catch (error) {
      if (error instanceof Error &&
          error.message === "Invalid practice history cursor") {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Invalid pagination cursor." },
        });
        return;
      }

      req.log.error({ err: error }, "Could not fetch practice history");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Practice history could not be fetched." },
      });
    }
  },
);

router.get(
  "/practice/topics/:topicId/question",
  requireAuthenticatedUser,
  async (req, res): Promise<void> => {
    const topicId = String(req.params["topicId"] ?? "");
    if (!UUID.test(topicId)) {
      notFound(res);
      return;
    }

    try {
      if (!req.dbUser) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }); return; }
      const question = await getPracticeQuestionForTopic(topicId, undefined, req.dbUser.id, req.verifiedAuth?.sessionId ?? null);
      if (!question) {
        notFound(res);
        return;
      }

      // Keep the wire response allow-listed even if a service later returns
      // additional internal question or option fields.
      res.json(
        GetPracticeQuestionResponse.parse({
          id: question.id,
          deliveryId: question.deliveryId,
          revisionId: question.revisionId,
          expiresAt: question.expiresAt,
          questionCode: question.questionCode,
          topic: {
            id: question.topic.id,
            slug: question.topic.slug,
            name: question.topic.name,
          },
          text: question.text,
          type: question.type,
          difficulty: question.difficulty,
          options: question.options.map(({ optionKey, text }) => ({ optionKey, text })),
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Could not fetch practice question");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Practice question could not be fetched." },
      });
    }
  },
);

router.post(
  "/practice/questions/:questionId/answer",
  requireAuthenticatedUser,
  async (req, res): Promise<void> => {
    // Fail closed if the authentication middleware did not attach a local user.
    if (!req.dbUser) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Authentication is required." },
      });
      return;
    }
    const questionId = String(req.params["questionId"] ?? "");
    if (!UUID.test(questionId)) {
      notFound(res);
      return;
    }

    if (req.body && typeof req.body === "object" && "optionKey" in req.body && !("deliveryId" in req.body)) {
      res.status(409).json({ error: { code: "DELIVERY_REQUIRED", message: "Load a fresh question before submitting an answer." } }); return;
    }
    const parsedBody = SubmitPracticeAnswerBody.strict().safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "A valid optionKey is required." },
      });
      return;
    }

    try {
      const result = await submitPracticeAnswer(questionId, parsedBody.data.optionKey, req.dbUser.id, undefined, parsedBody.data.deliveryId, req.verifiedAuth?.sessionId ?? null);
      if (!result) {
        notFound(res);
        return;
      }
      res.json(SubmitPracticeAnswerResponse.parse(result));
    } catch (error) {
      if (error instanceof PracticeApiError) {
        res.status(error.status).json({
          error: { code: error.code, message: error.message },
        });
        return;
      }
      req.log.error({ err: error }, "Could not submit practice answer");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Practice answer could not be submitted." },
      });
    }
  },
);

export default router;
