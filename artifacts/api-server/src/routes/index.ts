import adminLearnersRouter from "./admin-learners";
import globalRbacRouter from "./global-rbac";
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import authRouter from "./auth";
import questionsRouter from "./questions";
import practiceRouter from "./practice";
import adminTopicsRouter from "./admin-topics";
import adminQuestionsRouter from "./admin-questions";
import adminContentRouter from "./admin-content";
import curriculumRouter from "./curriculum";
import nexusRouter from './nexus';
import examsRouter from './exams';
import lessonsRouter from './lessons';
import studyRouter from './study';
import lessonMediaRouter from './lesson-media';

const router: IRouter = Router();

router.use(healthRouter);
router.use(learningRouter);
router.use(authRouter);
router.use(adminLearnersRouter);
router.use(globalRbacRouter);
router.use(questionsRouter);
router.use(practiceRouter);
router.use(adminTopicsRouter);
router.use(adminQuestionsRouter);
router.use(adminContentRouter);
router.use(curriculumRouter);
router.use(nexusRouter);
router.use(examsRouter);
router.use(lessonsRouter);
router.use(studyRouter);
router.use(lessonMediaRouter);

export default router;
